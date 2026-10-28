const Corestore = require('corestore')
const Autopass = require('autopass')
const crypto = require('hypercore-crypto')
const {
  Fault,
  parseJSON,
  MAX_ENTRIES,
  MAX_ACKNOWLEDGMENTS,
  isEntry,
  isAcknowledgment
} = require('../shared/protocol')

class Notebook {
  constructor(
    directory,
    { replicate = true, bootstrap, pass = null, onChanged = () => {}, onError = () => {} } = {}
  ) {
    this.state = 'starting'
    this.store = null
    this.pass = null
    this.queue = Promise.resolve()
    this.queued = 0
    this.closing = null
    this.onChanged = () => {
      if (this.state === 'ready') onChanged()
    }
    this.onError = (error) => {
      console.error('[relay] Storage failure:', error)
      this.state = 'failed'
      onError()
    }
    this.ready = this.open(directory, replicate, bootstrap, pass)
  }

  async open(directory, replicate, bootstrap, pass) {
    try {
      this.store = pass ? pass.store : new Corestore(directory)
      this.store.on('error', this.onError)
      this.pass = pass || new Autopass(this.store, { replicate, bootstrap })
      this.pass.on('error', this.onError)
      this.pass.on('update', this.onChanged)
      await this.pass.ready()
      if (this.state === 'failed') throw new Error('Storage failed during initialization')
      this.state = 'ready'
      console.log('[relay] Autopass ready')
    } catch (error) {
      this.state = 'failed'
      console.error('[relay] Initialization failed:', error)
      throw new Fault(
        'INIT_FAILED',
        'Notebook could not start. Restart the app; stored data is retained.'
      )
    }
  }

  status() {
    return { state: this.state, writable: this.state === 'ready' && this.pass.writable }
  }

  run(op, payload) {
    if (op === 'status') return Promise.resolve(this.status())
    if (this.state !== 'ready') {
      return Promise.reject(new Fault('NOT_READY', 'Notebook is not ready. Check worker status.'))
    }
    if (this.queued >= 32) return Promise.reject(new Fault('BUSY', 'Too many pending operations.'))
    this.queued++
    const task = this.queue.then(() => this.perform(op, payload))
    this.queue = task.catch(() => {})
    return task.finally(() => {
      this.queued--
    })
  }

  async perform(op, payload) {
    if (op === 'participants.list') {
      const localKey = this.pass.writerKey.toString('hex')
      const participants = new Map()
      for await (const writer of this.pass.listWriters()) {
        const key = writer.key.toString('hex')
        participants.set(key, {
          key,
          name: typeof writer.name === 'string' ? writer.name.slice(0, 80) : null,
          readOnly: !!writer.readOnly,
          isLocal: key === localKey
        })
        if (participants.size > 100) throw new Fault('LIST_LIMIT', 'Too many participant records.')
      }
      participants.set(localKey, {
        key: localKey,
        name: null,
        readOnly: !this.pass.writable,
        isLocal: true
      })
      return { participants: [...participants.values()] }
    }
    if (op === 'entries.list') {
      const entries = []
      const acknowledgments = []
      let skipped = 0
      let skippedAcknowledgments = 0
      let snapshotLength = 0
      for await (const record of this.pass.list()) {
        if (record.key.startsWith('ack:')) {
          let acknowledgment
          try {
            acknowledgment = parseJSON(record.value)
          } catch {
            skippedAcknowledgments++
            continue
          }
          if (
            !isAcknowledgment(acknowledgment) ||
            record.key !== `ack:${acknowledgment.entryId}:${acknowledgment.writerKey}`
          ) {
            skippedAcknowledgments++
            continue
          }
          const { schemaVersion, kind, entryId, writerKey, acknowledgedAt } = acknowledgment
          const normalized = { schemaVersion, kind, entryId, writerKey, acknowledgedAt }
          // Bound all decoded acknowledgment data, including hidden orphans.
          if (acknowledgments.length >= MAX_ACKNOWLEDGMENTS) {
            throw new Fault('LIST_LIMIT', 'Notebook exceeds the acknowledgment snapshot limit.')
          }
          snapshotLength += JSON.stringify(normalized).length
          if (snapshotLength > 1_500_000) {
            throw new Fault('LIST_LIMIT', 'Notebook exceeds the foundation snapshot size limit.')
          }
          acknowledgments.push(normalized)
          continue
        }
        if (!record.key.startsWith('entry:')) continue
        let entry
        try {
          entry = parseJSON(record.value)
        } catch {
          skipped++
          continue
        }
        if (!isEntry(entry) || record.key !== 'entry:' + entry.id) {
          skipped++
          continue
        }
        if (entries.length >= MAX_ENTRIES) {
          throw new Fault(
            'LIST_LIMIT',
            'Notebook exceeds the foundation list limit of 200 entries.'
          )
        }
        const { schemaVersion, kind, id, title, body, createdAt } = entry
        const normalized = { schemaVersion, kind, id, title, body, createdAt }
        snapshotLength += JSON.stringify(normalized).length
        if (snapshotLength > 1_500_000) {
          throw new Fault('LIST_LIMIT', 'Notebook exceeds the foundation snapshot size limit.')
        }
        entries.push(normalized)
      }
      // Local presentation order only; timestamps are not distributed ordering evidence.
      entries.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      const visibleIds = new Set(entries.map((entry) => entry.id))
      const associated = acknowledgments.filter((ack) => visibleIds.has(ack.entryId))
      // Stable display order; acknowledgment timestamps do not resolve conflicts.
      associated.sort(
        (a, b) => a.entryId.localeCompare(b.entryId) || a.writerKey.localeCompare(b.writerKey)
      )
      return {
        entries,
        skipped,
        acknowledgments: associated,
        skippedAcknowledgments,
        localWriterKey: this.pass.writerKey.toString('hex')
      }
    }
    if (!this.pass.writable) throw new Fault('READ_ONLY', 'This notebook does not allow writes.')
    if (op === 'entries.acknowledge') {
      const record = await this.pass.get('entry:' + payload.entryId)
      let entry
      try {
        entry = record && parseJSON(record.value)
      } catch {
        entry = null
      }
      if (!isEntry(entry) || entry.id !== payload.entryId) {
        throw new Fault(
          'ENTRY_NOT_FOUND',
          'Entry is unavailable or unsupported. Refresh the notebook.'
        )
      }
      const writerKey = this.pass.writerKey.toString('hex')
      const key = `ack:${payload.entryId}:${writerKey}`
      const existing = await this.pass.get(key)
      if (existing) {
        let acknowledgment
        try {
          acknowledgment = parseJSON(existing.value)
        } catch {
          acknowledgment = null
        }
        if (
          !isAcknowledgment(acknowledgment) ||
          acknowledgment.entryId !== payload.entryId ||
          acknowledgment.writerKey !== writerKey
        ) {
          throw new Fault(
            'INVALID_ACK',
            'Existing acknowledgment is invalid. Refresh before retrying.'
          )
        }
        const { schemaVersion, kind, entryId, acknowledgedAt } = acknowledgment
        return {
          acknowledgment: { schemaVersion, kind, entryId, writerKey, acknowledgedAt },
          alreadyRecorded: true
        }
      }
      const acknowledgment = {
        schemaVersion: 1,
        kind: 'ack',
        entryId: payload.entryId,
        writerKey,
        acknowledgedAt: Date.now()
      }
      await this.pass.add(key, JSON.stringify(acknowledgment))
      return { acknowledgment, alreadyRecorded: false }
    }
    if (op === 'invite.create') {
      return {
        invite: await this.pass.createInvite({ readOnly: payload.readOnly }),
        readOnly: payload.readOnly
      }
    }
    if (op === 'invite.cancel') {
      await this.pass.deleteInvite()
      return { cancelled: true }
    }
    if (op === 'entries.add') {
      const entry = {
        schemaVersion: 1,
        kind: 'entry',
        id: crypto.randomBytes(16).toString('hex'),
        title: payload.title.trim(),
        body: payload.body,
        createdAt: Date.now()
      }
      await this.pass.add('entry:' + entry.id, JSON.stringify(entry))
      return entry
    }
    if (op === 'entries.remove') {
      // Idempotent removal; this changes the replicated view, not retained copies.
      await this.pass.remove('entry:' + payload.id)
      return { id: payload.id, removed: true }
    }
    throw new Fault('UNKNOWN_OPERATION', 'Unknown operation.')
  }

  close() {
    if (this.closing) return this.closing
    this.closing = this.cleanup()
    return this.closing
  }

  async cleanup() {
    this.state = 'closed'
    await this.ready.catch(() => {})
    this.state = 'closed'
    await this.queue
    if (this.pass) this.pass.off('update', this.onChanged)
    try {
      if (this.pass) await this.pass.close()
    } finally {
      if (this.store) await this.store.close()
    }
  }
}

module.exports = { Notebook }
