const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const testnet = require('hyperdht/testnet')
const { Library } = require('../workers/library')
const { Notebook } = require('../workers/notebook')
const { validateInvite } = require('../workers/invites')
const { validateRequest } = require('../shared/protocol')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check, message) {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(30)
  }
  assert.fail(message)
}

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-library-'))
  const libraries = []
  t.after(async () => {
    for (const library of libraries.reverse()) await library.close()
    await fs.rm(root, { recursive: true, force: true })
  })
  return {
    root,
    open(name = 'local', extra = {}) {
      const library = new Library(path.join(root, name), { replicate: false, ...options, ...extra })
      libraries.push(library)
      return library
    }
  }
}

test('new installs choose create/join; legacy storage migrates in place; existing stores cannot be replaced', async (t) => {
  const f = await fixture(t)
  const legacyRoot = path.join(f.root, 'legacy')
  const notebook = new Notebook(path.join(legacyRoot, 'notebook'), { replicate: false })
  await notebook.ready
  const entry = await notebook.run('entries.add', {
    title: 'Legacy retained',
    body: 'Original data'
  })
  await notebook.close()
  const legacy = f.open('legacy')
  await legacy.ready
  assert.deepEqual((await legacy.run('entries.list', {})).entries, [entry])
  assert.equal(
    JSON.parse(await fs.readFile(path.join(legacyRoot, 'active.json'), 'utf8')).directory,
    'notebook'
  )
  await assert.rejects(legacy.run('notebook.create', {}), { code: 'ALREADY_OPEN' })
  await assert.rejects(legacy.run('pair.start', { invite: 'invalid' }), { code: 'ALREADY_OPEN' })
  const fresh = f.open('fresh')
  await fresh.ready
  assert.equal(fresh.status().state, 'idle')
  await fresh.run('notebook.create', {})
  assert.equal(fresh.status().writable, true)
  await fresh.close()
  const reopened = f.open('fresh')
  await reopened.ready
  assert.equal(reopened.status().state, 'ready')
})

test('validates invitation format and operation payloads without logging capability material', () => {
  for (const value of ['', 'invalid', 'a'.repeat(106), {}, 'y'.repeat(513)]) {
    assert.throws(() => validateInvite(value), { code: 'INVALID_INVITE' })
  }
  for (const [op, payload] of [
    ['pair.start', { invite: 'x', name: 'Device' }],
    ['pair.cancel', {}],
    ['notebook.create', {}],
    ['invite.create', { readOnly: true }],
    ['invite.cancel', {}],
    ['participants.list', {}]
  ]) {
    assert.equal(validateRequest({ v: 1, type: 'request', id: '1', op, payload }).op, op)
  }
  assert.throws(
    () =>
      validateRequest({
        v: 1,
        type: 'request',
        id: '1',
        op: 'invite.create',
        payload: { readOnly: 'yes' }
      }),
    { code: 'INVALID_PAYLOAD' }
  )
})

test('a corrupt active manifest fails visibly without deleting or replacing stored data', async (t) => {
  t.mock.method(console, 'error', () => {})
  const f = await fixture(t)
  const directory = path.join(f.root, 'broken')
  await fs.mkdir(directory)
  await fs.writeFile(path.join(directory, 'active.json'), '{invalid')
  await fs.writeFile(path.join(directory, 'retained-data'), 'keep')
  const library = f.open('broken')
  await assert.rejects(library.ready, { code: 'INIT_FAILED' })
  assert.equal(library.status().state, 'failed')
  assert.equal(await fs.readFile(path.join(directory, 'retained-data'), 'utf8'), 'keep')
  assert.equal(await fs.readFile(path.join(directory, 'active.json'), 'utf8'), '{invalid')
})

test('shutdown waits for in-flight creation and never activates it afterward', async (t) => {
  const f = await fixture(t)
  const library = f.open('closing')
  await library.ready
  const creation = library.run('notebook.create', {})
  const rejected = assert.rejects(creation, { code: 'CLOSED' })
  const closing = library.close()
  assert.equal(library.close(), closing, 'concurrent shutdowns share cleanup completion')
  await Promise.all([closing, rejected])
  assert.equal(library.status().state, 'closed')
  assert.equal(library.notebook, null)
  assert.equal(library.creatingNotebook, null)
  await assert.rejects(fs.stat(path.join(f.root, 'closing', 'active.json')))
  assert.equal((await fs.readdir(path.join(f.root, 'closing', 'notebooks'))).length, 1)
})

test(
  'real Contributor and Viewer pairing replicate and enforce permissions through the worker service',
  { timeout: 40_000 },
  async (t) => {
    const net = await testnet(10)
    t.after(() => net.destroy())
    const f = await fixture(t, { replicate: true, bootstrap: net.bootstrap })
    const a = f.open('a')
    await a.ready
    await a.run('notebook.create', {})
    const b = f.open('b')
    await b.ready
    const contributor = await a.run('invite.create', { readOnly: false })
    assert.equal(validateInvite(contributor.invite), contributor.invite)
    await b.run('pair.start', { invite: contributor.invite, name: 'B' })
    await assert.rejects(b.run('pair.start', { invite: contributor.invite }), {
      code: 'ALREADY_OPEN'
    })
    await until(() => b.status().state === 'ready', 'Contributor join did not complete')
    assert.equal(b.status().writable, true)
    const entry = await a.run('entries.add', { title: 'From A', body: 'Replicated' })
    await until(
      async () => (await b.run('entries.list', {})).entries.some((x) => x.id === entry.id),
      'A to B'
    )
    const reply = await b.run('entries.add', { title: 'From B', body: 'Reply' })
    await until(
      async () => (await a.run('entries.list', {})).entries.some((x) => x.id === reply.id),
      'B to A'
    )
    await b.run('entries.remove', { id: entry.id })
    await until(
      async () => !(await a.run('entries.list', {})).entries.some((x) => x.id === entry.id),
      'B deletion to A'
    )
    const c = f.open('c')
    await c.ready
    const viewer = await a.run('invite.create', { readOnly: true })
    await c.run('pair.start', { invite: viewer.invite, name: 'Viewer' })
    await until(() => c.status().state === 'ready', 'Viewer join did not complete')
    assert.equal(c.status().writable, false)
    await until(
      async () => (await c.run('entries.list', {})).entries.some((x) => x.id === reply.id),
      'Viewer read replication'
    )
    for (const [op, payload] of [
      ['entries.add', { title: 'Forbidden', body: '' }],
      ['entries.remove', { id: reply.id }],
      ['invite.create', { readOnly: false }]
    ]) {
      await assert.rejects(c.run(op, payload), { code: 'READ_ONLY' })
    }
    assert.ok(
      (await a.run('participants.list', {})).participants.some(
        (x) => x.name === 'Viewer' && x.readOnly
      )
    )
    await b.close()
    const offline = await a.run('entries.add', { title: 'While B closed', body: 'Reconnection' })
    const resumed = f.open('b')
    await resumed.ready
    await until(
      async () => (await resumed.run('entries.list', {})).entries.some((x) => x.id === offline.id),
      'Reconnection replication'
    )
  }
)

test(
  'cancel/timeout close the local pairer, preserve partial directories, and permit a fresh attempt',
  { timeout: 20_000 },
  async (t) => {
    const net = await testnet(10)
    t.after(() => net.destroy())
    const errors = []
    const f = await fixture(t, { replicate: true, bootstrap: net.bootstrap })
    const host = f.open('host')
    await host.ready
    await host.run('notebook.create', {})
    const { invite } = await host.run('invite.create', { readOnly: false })
    await host.close() // Valid capability, but its host is unavailable.
    const peer = f.open('peer', { timeoutMs: 200, onError: (error) => errors.push(error) })
    await peer.ready
    await assert.rejects(peer.run('pair.start', { invite: 'invalid' }), { code: 'INVALID_INVITE' })
    await peer.run('pair.start', { invite })
    await peer.run('pair.cancel', {})
    assert.equal(peer.status().state, 'idle')
    assert.equal(peer.status().pairing, 'cancelled')
    await peer.run('pair.start', { invite })
    await until(() => peer.status().pairing === 'failed', 'Timeout did not close pairing')
    assert.ok(errors.some((x) => x.code === 'PAIR_TIMEOUT'))
    assert.equal((await fs.readdir(path.join(f.root, 'peer', 'joins'))).length, 2)
    await assert.rejects(fs.stat(path.join(f.root, 'peer', 'active.json')))
  }
)
