const fs = require('fs').promises
const path = require('path')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')
const { FileStaging } = require('./file-staging')
const { Fault, parseJSON, isEntry } = require('../shared/protocol')
const { isSelectionMetadata, isAttachment, MAX_ATTACHMENT_BYTES } = require('../shared/attachment')
const fail = (code, message) => new Fault(code, message)

class Attachments {
  constructor(pass, root, { ttlMs = 120000, retrievalMs = 8000, now = Date.now } = {}) {
    this.pass = pass
    this.stage = new FileStaging(root)
    this.ttlMs = ttlMs
    this.retrievalMs = retrievalMs
    this.now = now
    this.handles = new Map()
    this.closed = false
    this.retrieving = null
    this.failed = false
    this.ready = this.open().catch((error) => {
      this.failed = true
      throw error
    })
  }

  async open() {
    await fs.mkdir(this.stage.root, { recursive: true, mode: 0o700 })
    const stat = await fs.lstat(this.stage.root)
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077) {
      throw fail('STAGING_ERROR', 'Private attachment staging is unavailable.')
    }
    // Only our fixed staging namespace is cleaned. No notebook records are deleted.
    for (const name of await fs.readdir(this.stage.root)) {
      if (/^[a-f0-9]{32}$/.test(name)) {
        await fs.rm(path.join(this.stage.root, name), { recursive: true, force: true })
      }
    }
    this.timer = setInterval(() => {
      this.sweep().catch((error) => console.error('[relay] Staging cleanup failed:', error))
    }, 30000)
    this.timer.unref?.()
  }

  async sweep() {
    for (const [handle, slot] of this.handles) {
      if (slot.expiresAt <= this.now() && !slot.busy) {
        if (this.stage.slots.has(handle)) await this.stage.remove(handle)
        this.handles.delete(handle)
      }
    }
  }

  available() {
    if (this.failed) {
      throw fail(
        'STAGING_ERROR',
        'Attachment staging is unavailable. Notebook entries remain available.'
      )
    }
    if (this.closed) throw fail('CLOSED', 'Attachment service is closed.')
  }

  slot(handle, purpose) {
    this.available()
    const slot = this.handles.get(handle)
    if (this.closed || !slot || slot.purpose !== purpose || slot.expiresAt <= this.now()) {
      throw fail(
        'INVALID_TRANSFER',
        'Attachment handle expired or is unavailable. Select the file again.'
      )
    }
    return slot
  }

  async reserve(metadata) {
    this.available()
    if (!this.pass.writable) throw fail('READ_ONLY', 'This notebook does not allow writes.')
    if (!isSelectionMetadata(metadata)) {
      throw fail('INVALID_ATTACHMENT', 'Attachment metadata is unsupported.')
    }
    await this.sweep()
    if (this.closed || this.handles.size >= 64) {
      throw fail('STAGING_BUSY', 'Attachment staging is busy.')
    }
    let file
    try {
      file = await this.stage.reserve()
    } catch (error) {
      throw fail(
        error.code === 'STAGING_BUSY' ? 'STAGING_BUSY' : 'STAGING_ERROR',
        'Private attachment staging is unavailable or busy.'
      )
    }
    const slot = {
      purpose: 'upload',
      entryId: crypto.randomBytes(16).toString('hex'),
      metadata: { ...metadata },
      expiresAt: this.now() + this.ttlMs,
      state: 'staged',
      busy: false
    }
    this.handles.set(file.token, slot)
    return {
      handle: file.token,
      entryId: slot.entryId,
      uri: 'file://' + file.input,
      expiresAt: slot.expiresAt
    }
  }

  async seal(handle) {
    if (!this.pass.writable) throw fail('READ_ONLY', 'This notebook does not allow writes.')
    const slot = this.slot(handle, 'upload')
    if (slot.state !== 'staged' || slot.busy) {
      throw fail('INVALID_TRANSFER', 'Attachment is no longer awaiting preparation.')
    }
    slot.busy = true
    try {
      const bytes =
        slot.metadata.digest === undefined
          ? await this.stage.readBytes(handle)
          : await this.stage.read(handle, slot.metadata.digest)
      if (bytes.length !== slot.metadata.size) throw new Error('Size changed')
      slot.metadata.digest = crypto.hash(bytes).toString('hex')
      return { ...slot.metadata }
    } catch {
      throw fail(
        'INVALID_ATTACHMENT',
        'Selected file is missing, oversized or changed. Select it again.'
      )
    } finally {
      slot.busy = false
    }
  }

  async release(handle) {
    const slot = this.handles.get(handle)
    if (!slot || this.closed) throw fail('INVALID_TRANSFER', 'Attachment handle is unavailable.')
    if (slot.busy) throw fail('BUSY', 'Attachment operation is still running.')
    if (this.stage.slots.has(handle)) await this.stage.remove(handle)
    this.handles.delete(handle)
    return { released: true }
  }

  async create(payload) {
    if (!this.pass.writable) throw fail('READ_ONLY', 'This notebook does not allow writes.')
    const slot = this.slot(payload.handle, 'upload')
    if (slot.state === 'done') {
      const saved = await this.pass.get('entry:' + slot.entry.id)
      if (!saved || saved.value !== JSON.stringify(slot.entry)) {
        throw fail(
          'ENTRY_NOT_FOUND',
          'The previously saved entry changed or was removed. Refresh the notebook.'
        )
      }
      return { entry: slot.entry, alreadyRecorded: true }
    }
    if (slot.state !== 'staged') {
      throw fail(
        'ATTACHMENT_UNKNOWN',
        'Earlier save outcome is unknown. Refresh; do not replay the upload.'
      )
    }
    slot.busy = true
    try {
      let bytes
      try {
        bytes = await this.stage.read(payload.handle, slot.metadata.digest)
      } catch {
        throw fail(
          'INVALID_ATTACHMENT',
          'Staged file is missing, changed, oversized or failed integrity validation.'
        )
      }
      if (bytes.length !== slot.metadata.size) {
        throw fail('INVALID_ATTACHMENT', 'Attachment size does not match its descriptor.')
      }
      const attachment = {
        schemaVersion: 1,
        key: `attachment:${slot.entryId}:${slot.metadata.digest}`,
        ...slot.metadata
      }
      const entry = {
        schemaVersion: 1,
        kind: 'entry',
        id: slot.entryId,
        title: payload.title.trim(),
        body: payload.body,
        createdAt: this.now(),
        attachment
      }
      slot.state = 'writing'
      try {
        await this.pass.add(
          attachment.key,
          JSON.stringify({ schemaVersion: 1, kind: 'attachment', entryId: entry.id, attachment }),
          bytes
        )
        await this.pass.add('entry:' + entry.id, JSON.stringify(entry))
      } catch {
        slot.state = 'unknown'
        throw fail(
          'ATTACHMENT_UNKNOWN',
          'Save outcome is unknown; an unreferenced file may remain. Refresh before any further action.'
        )
      }
      slot.state = 'done'
      slot.entry = entry
      return { entry, alreadyRecorded: false }
    } finally {
      slot.busy = false
      // A cleanup failure must not turn a completed write into an apparent failure.
      if (slot.state !== 'staged' && this.stage.slots.has(payload.handle)) {
        await this.stage
          .remove(payload.handle)
          .catch((error) => console.error('[relay] Staging cleanup failed:', error))
      }
    }
  }

  get(entryId) {
    try {
      this.available()
    } catch (error) {
      return Promise.reject(error)
    }
    if (this.closed) return Promise.reject(fail('CLOSED', 'Attachment service is closed.'))
    if (this.retrieving) {
      return Promise.reject(fail('BUSY', 'Another attachment retrieval is still running.'))
    }
    const operation = { expired: false, deadlineAt: this.now() + this.retrievalMs }
    const task = this.retrieve(entryId, operation)
    this.retrieving = task
    let timer
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        operation.expired = true
        reject(
          fail(
            'ATTACHMENT_TIMEOUT',
            'Retrieval timed out. Underlying storage may still be reading; try later.'
          )
        )
      }, this.retrievalMs)
    })
    task
      .finally(() => {
        clearTimeout(timer)
        if (this.retrieving === task) this.retrieving = null
      })
      .catch(() => {})
    return Promise.race([task, deadline])
  }

  async retrieve(entryId, operation) {
    let file
    const active = () => {
      if (this.closed || operation.expired || this.now() >= operation.deadlineAt) {
        throw fail('ATTACHMENT_TIMEOUT', 'Attachment retrieval ended. Try again.')
      }
    }
    try {
      const record = await this.pass.get('entry:' + entryId)
      const entry = record && parseJSON(record.value)
      if (!isEntry(entry) || entry.id !== entryId || !entry.attachment) {
        throw fail('ATTACHMENT_MISSING', 'Entry has no available attachment.')
      }
      const a = entry.attachment
      const binary = await this.pass.get(a.key)
      active()
      if (
        !binary ||
        !b4a.isBuffer(binary.file) ||
        binary.file.length > MAX_ATTACHMENT_BYTES ||
        binary.file.length !== a.size ||
        crypto.hash(binary.file).toString('hex') !== a.digest
      ) {
        throw fail(
          'ATTACHMENT_CORRUPT',
          'Attachment is missing or failed integrity validation. Try again after peer updates.'
        )
      }
      const metadata = parseJSON(binary.value)
      if (
        metadata.schemaVersion !== 1 ||
        metadata.kind !== 'attachment' ||
        metadata.entryId !== entryId ||
        !isAttachment(metadata.attachment, entryId) ||
        Object.keys(a).some((key) => metadata.attachment[key] !== a[key])
      ) {
        throw fail('ATTACHMENT_CORRUPT', 'Attachment association is invalid.')
      }
      // Recheck the entry after the separate read; concurrent deletion must not publish a stale export.
      const current = await this.pass.get('entry:' + entryId)
      if (!current || current.value !== record.value) {
        throw fail('ENTRY_NOT_FOUND', 'Entry changed or was removed. Refresh the notebook.')
      }
      active()
      await this.sweep()
      active()
      if (this.handles.size >= 64) {
        throw fail('BUSY', 'Release an earlier attachment before retrieving another.')
      }
      file = await this.stage.reserve()
      active()
      const output = await this.stage.write(file.token, binary.file)
      active()
      const expiresAt = this.now() + this.ttlMs
      this.handles.set(file.token, { purpose: 'download', expiresAt, busy: false })
      return { handle: file.token, entryId, uri: 'file://' + output, expiresAt, attachment: a }
    } catch (error) {
      if (file && this.stage.slots.has(file.token)) {
        await this.stage
          .remove(file.token)
          .catch((error) => console.error('[relay] Attachment export cleanup failed:', error))
      }
      if (error instanceof Fault) throw error
      throw fail(
        'ATTACHMENT_ERROR',
        'Attachment could not be prepared. Try again after refreshing.'
      )
    }
  }

  async close() {
    this.closed = true
    clearInterval(this.timer)
    // Do not await uncancelable Autopass reads here. Their completion checks closed
    // before reserving/output, and retains the lane until it actually settles.
    await this.stage.close()
    this.handles.clear()
  }
}
module.exports = { Attachments }
