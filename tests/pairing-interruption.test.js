// Controlled resource barriers exercise cancellation ordering deterministically.
// Real Autopass/DHT integration remains in pairing.test.js and handoff.test.js.
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { Library } = require('../workers/library')

const tick = () => new Promise((resolve) => setImmediate(resolve))
function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  promise.catch(() => {})
  return { promise, resolve, reject }
}

async function controlled(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-pair-barrier-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const directory = 'joins/' + 'a'.repeat(32)
  await fs.mkdir(path.join(root, directory), { recursive: true })
  await fs.writeFile(path.join(root, directory, 'retained'), 'partial data')
  const finished = deferred()
  const readable = deferred()
  const store = Object.assign(new EventEmitter(), {
    closed: false,
    close() {
      this.closed = true
      return Promise.resolve()
    }
  })
  const pass = Object.assign(new EventEmitter(), {
    store,
    writerKey: Buffer.alloc(32, 1),
    writable: true,
    closed: false,
    ready() {
      return readable.promise
    },
    close() {
      this.closed = true
      return Promise.resolve()
    }
  })
  const pair = {
    pass: null,
    closed: false,
    ready() {
      return Promise.resolve()
    },
    close() {
      this.closed = true
      finished.reject(new Error('Pairing closed'))
      return Promise.resolve()
    }
  }
  const library = Object.assign(Object.create(Library.prototype), {
    root,
    options: { replicate: false },
    state: 'joining',
    pairing: 'joining',
    ready: Promise.resolve(),
    closed: false,
    closing: null,
    notebook: null,
    creatingNotebook: null,
    onState() {},
    onError: assert.fail
  })
  const attempt = { pair, store, directory, cancelled: false, stopping: null, notebook: null }
  library.attempt = attempt
  attempt.task = library.complete(attempt, finished.promise)
  async function retained() {
    await assert.rejects(fs.stat(path.join(root, 'active.json')))
    assert.equal(await fs.readFile(path.join(root, directory, 'retained'), 'utf8'), 'partial data')
    assert.equal(library.notebook, null)
    assert.equal(store.closed, true)
    assert.equal(pair.closed, true)
  }
  return { library, attempt, pair, pass, finished, readable, retained }
}

test('cancellation before acceptance rejects the pairer and keeps the partial directory inactive', async (t) => {
  const c = await controlled(t)
  await c.library.cancel(c.attempt, 'cancelled')
  assert.equal(c.library.status().state, 'idle')
  assert.equal(c.library.status().pairing, 'cancelled')
  await c.retained()
})

test('cancellation after acceptance cannot activate a notebook whose readiness completes later', async (t) => {
  const c = await controlled(t)
  c.pair.pass = c.pass
  c.finished.resolve(c.pass)
  await tick()
  assert.ok(c.attempt.notebook, 'acceptance reached notebook initialization')
  const cancelled = c.library.cancel(c.attempt, 'cancelled')
  await tick()
  assert.equal(c.attempt.cancelled, true)
  c.readable.resolve()
  await cancelled
  assert.equal(c.pass.closed, true)
  assert.equal(c.library.status().state, 'idle')
  await c.retained()
})

test('shutdown during accepted-notebook initialization never promotes it after close', async (t) => {
  const c = await controlled(t)
  c.pair.pass = c.pass
  c.finished.resolve(c.pass)
  await tick()
  assert.ok(c.attempt.notebook)
  const closed = c.library.close()
  assert.equal(c.library.close(), closed)
  await tick()
  c.readable.resolve()
  await closed
  assert.equal(c.library.status().state, 'closed')
  assert.equal(c.pass.closed, true)
  await c.retained()
})
