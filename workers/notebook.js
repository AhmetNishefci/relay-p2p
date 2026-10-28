const Corestore = require('corestore')
const Autopass = require('autopass')
const crypto = require('hypercore-crypto')
const { Fault, MAX_ENTRIES, isEntry } = require('../shared/protocol')

class Notebook {
  constructor(directory, { replicate = true, onChanged = () => {}, onError = () => {} } = {}) {
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
    this.ready = this.open(directory, replicate)
  }

  async open(directory, replicate) {
    try {
      this.store = new Corestore(directory)
      this.store.on('error', this.onError)
      this.pass = new Autopass(this.store, { replicate })
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
    if (op === 'entries.list') {
      const entries = []
      let skipped = 0
      let snapshotLength = 0
      for await (const record of this.pass.list()) {
        if (!record.key.startsWith('entry:')) continue
        let entry
        try {
          entry = JSON.parse(record.value)
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
      return { entries, skipped }
    }
    if (!this.pass.writable) throw new Fault('READ_ONLY', 'This notebook does not allow writes.')
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
