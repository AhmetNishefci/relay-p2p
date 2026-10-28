const fs = require('fs')
const path = require('path')
const Corestore = require('corestore')
const Autopass = require('autopass')
const crypto = require('hypercore-crypto')
const { Notebook } = require('./notebook')
const { validateInvite } = require('./invites')
const { Fault, publicError } = require('../shared/protocol')

class Library {
  constructor(
    root,
    {
      bootstrap,
      replicate = true,
      timeoutMs = 60_000,
      onChanged = () => {},
      onState = () => {},
      onError = () => {}
    } = {}
  ) {
    this.root = root
    this.options = {
      bootstrap,
      replicate,
      onChanged,
      onError: () =>
        onError({ code: 'STORAGE_ERROR', message: 'Notebook storage failed. Restart the app.' })
    }
    this.timeoutMs = timeoutMs
    this.onState = onState
    this.onError = onError
    this.notebook = null
    this.attempt = null
    this.state = 'starting'
    this.pairing = 'idle'
    this.creating = false
    this.creatingNotebook = null
    this.closing = null
    this.closed = false
    this.ready = this.open()
  }

  async open() {
    try {
      fs.mkdirSync(this.root, { recursive: true })
      const manifest = path.join(this.root, 'active.json')
      let directory = null
      if (fs.existsSync(manifest)) {
        const data = JSON.parse(fs.readFileSync(manifest, 'utf8'))
        if (
          data.version !== 1 ||
          !/^(notebook|notebooks\/[a-f0-9]{32}|joins\/[a-f0-9]{32})$/.test(data.directory)
        ) {
          throw new Error('Invalid manifest')
        }
        directory = data.directory
        if (!fs.existsSync(path.join(this.root, directory))) throw new Error('Missing active store')
      } else if (fs.existsSync(path.join(this.root, 'notebook'))) directory = 'notebook'
      if (directory) {
        const notebook = new Notebook(path.join(this.root, directory), this.options)
        this.notebook = notebook
        await notebook.ready
        this.activate(directory, notebook)
      } else this.state = 'idle'
    } catch (error) {
      console.error('[relay] Library initialization failed:', error)
      this.state = 'failed'
      throw new Fault(
        'INIT_FAILED',
        'Cannot open notebook storage. Data is retained; restart or inspect logs.'
      )
    }
  }

  activate(directory, notebook) {
    // Same-directory rename atomically promotes only a fully initialized store.
    const temporary = path.join(this.root, 'active.json.next')
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, directory }))
    fs.renameSync(temporary, path.join(this.root, 'active.json'))
    this.notebook = notebook
    this.state = 'ready'
  }

  status() {
    return {
      state: this.notebook?.state === 'failed' ? 'failed' : this.state,
      writable: this.state === 'ready' && !!this.notebook?.pass?.writable,
      hasNotebook: !!this.notebook,
      pairing: this.pairing,
      writerKey: this.state === 'ready' ? this.notebook.pass.writerKey.toString('hex') : null
    }
  }

  available() {
    if (this.closed || this.state !== 'idle' || this.attempt || this.creating || this.notebook) {
      throw new Fault(
        'ALREADY_OPEN',
        'A notebook or join is already open. Existing data will not be replaced.'
      )
    }
  }

  async run(op, payload) {
    if (op === 'status') return this.status()
    if (op === 'pair.cancel') {
      if (this.attempt) await this.cancel(this.attempt, 'cancelled')
      return { cancelled: true }
    }
    if (op === 'notebook.create') {
      this.available()
      this.creating = true
      const directory = 'notebooks/' + crypto.randomBytes(16).toString('hex')
      const notebook = new Notebook(path.join(this.root, directory), this.options)
      this.creatingNotebook = notebook
      try {
        await notebook.ready
        if (this.closed) {
          throw new Fault('CLOSED', 'Notebook creation was closed. Data is retained.')
        }
        this.activate(directory, notebook)
        this.onState(this.status())
        return this.status()
      } catch (error) {
        await notebook.close()
        throw error
      } finally {
        this.creatingNotebook = null
        this.creating = false
      }
    }
    if (op === 'pair.start') {
      this.available()
      const invite = validateInvite(payload.invite)
      const directory = 'joins/' + crypto.randomBytes(16).toString('hex')
      const store = new Corestore(path.join(this.root, directory))
      const pair = Autopass.pair(store, invite, {
        bootstrap: this.options.bootstrap,
        name: payload.name || null
      })
      const finished = pair.finished() // Register immediately, before awaiting readiness.
      finished.catch(() => {}) // The workflow below observes rejection after pair.ready().
      const attempt = { pair, store, directory, cancelled: false, stopping: null, notebook: null }
      this.attempt = attempt
      this.state = 'joining'
      this.pairing = 'joining'
      attempt.timer = setTimeout(() => {
        this.cancel(attempt, 'failed').catch(() => {})
      }, this.timeoutMs)
      attempt.task = this.complete(attempt, finished).catch(() => {
        this.state = 'failed'
        this.onError({
          code: 'PAIR_FAILED',
          message: 'Pairing cleanup failed. Restart the app; data is retained.'
        })
        this.onState(this.status())
      })
      this.onState(this.status())
      return this.status()
    }
    if (!this.notebook || this.state !== 'ready') {
      throw new Fault('NOT_READY', 'Create or join a notebook first.')
    }
    return this.notebook.run(op, payload)
  }

  async complete(attempt, finished) {
    try {
      await attempt.pair.ready()
      const pass = await finished
      if (attempt.cancelled || this.closed) return
      attempt.notebook = new Notebook(path.join(this.root, attempt.directory), {
        ...this.options,
        pass
      })
      await attempt.notebook.ready
      if (attempt.cancelled || this.closed) return
      this.activate(attempt.directory, attempt.notebook)
      this.pairing = 'idle'
      clearTimeout(attempt.timer)
      this.attempt = null
      this.onState(this.status())
    } catch {
      if (!attempt.cancelled) {
        await this.stop(attempt)
        this.attempt = null
        this.state = 'idle'
        this.pairing = 'failed'
        this.onError({
          code: 'PAIR_FAILED',
          message:
            'Join failed. Check connectivity and ask for a fresh invite. Existing data is retained.'
        })
        this.onState(this.status())
      }
    }
  }

  stop(attempt) {
    if (attempt.stopping) return attempt.stopping
    attempt.cancelled = true
    clearTimeout(attempt.timer)
    attempt.stopping = (async () => {
      try {
        await attempt.pair.close()
      } finally {
        try {
          if (attempt.notebook) await attempt.notebook.close()
          else if (attempt.pair.pass) await attempt.pair.pass.close()
        } finally {
          await attempt.store.close()
        }
      }
    })()
    return attempt.stopping
  }

  async cancel(attempt, outcome) {
    this.pairing = 'cancelling'
    this.onState(this.status())
    try {
      await this.stop(attempt)
      await attempt.task
      if (this.attempt === attempt) this.attempt = null
      this.state = 'idle'
      this.pairing = outcome
      if (outcome === 'failed') {
        this.onError({
          code: 'PAIR_TIMEOUT',
          message:
            'Join timed out and local pairing was closed. Remote access may already have been granted; ask for a fresh invite.'
        })
      }
    } catch (error) {
      this.state = 'failed'
      this.onError(publicError(error))
    }
    this.onState(this.status())
  }

  close() {
    if (this.closing) return this.closing
    this.closed = true
    this.closing = this.cleanup()
    return this.closing
  }

  async cleanup() {
    await this.ready.catch(() => {})
    if (this.creatingNotebook) await this.creatingNotebook.close()
    if (this.attempt) await this.cancel(this.attempt, 'cancelled')
    if (this.notebook) await this.notebook.close()
    this.state = 'closed'
  }
}

module.exports = { Library }
