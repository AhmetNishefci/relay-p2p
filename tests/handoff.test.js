const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const testnet = require('hyperdht/testnet')
const { Notebook } = require('../workers/notebook')
const { Library } = require('../workers/library')
const { handleRequest } = require('../workers/requests')
const { validateRequest, isAcknowledgment, isResult } = require('../shared/protocol')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check, reason) {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(30)
  }
  assert.fail(reason)
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-handoff-'))
  const opened = []
  t.after(async () => {
    for (const item of opened.reverse()) await item.close()
    await fs.rm(root, { recursive: true, force: true })
  })
  return {
    root,
    open(name = 'local', options = {}) {
      const notebook = new Notebook(path.join(root, name), { replicate: false, ...options })
      opened.push(notebook)
      return notebook
    },
    library(name, options) {
      const library = new Library(path.join(root, name), options)
      opened.push(library)
      return library
    }
  }
}

test('acknowledgment schema and IPC reject invalid fields and UI-supplied identity', () => {
  const ack = {
    schemaVersion: 1,
    kind: 'ack',
    entryId: 'a'.repeat(32),
    writerKey: 'b'.repeat(64),
    acknowledgedAt: 1
  }
  assert.equal(isAcknowledgment(ack), true)
  for (const bad of [
    { ...ack, schemaVersion: 2 },
    { ...ack, kind: 'entry' },
    { ...ack, entryId: '../entry' },
    { ...ack, writerKey: 'short' },
    { ...ack, acknowledgedAt: -1 },
    { ...ack, acknowledgedAt: Infinity }
  ]) {
    assert.equal(isAcknowledgment(bad), false)
  }
  const request = (payload) => ({
    v: 1,
    type: 'request',
    id: '1',
    op: 'entries.acknowledge',
    payload
  })
  assert.equal(validateRequest(request({ entryId: ack.entryId })).op, 'entries.acknowledge')
  for (const payload of [
    {},
    { entryId: 'bad' },
    { entryId: ack.entryId, writerKey: ack.writerKey },
    { entryId: ack.entryId, acknowledgedAt: 1 }
  ]) {
    assert.throws(() => validateRequest(request(payload)), { code: 'INVALID_PAYLOAD' })
  }
  assert.equal(
    isResult('entries.acknowledge', { acknowledgment: ack, alreadyRecorded: false }),
    true
  )
  assert.equal(
    isResult('entries.acknowledge', {
      acknowledgment: { ...ack, writerKey: 'bad' },
      alreadyRecorded: false
    }),
    false
  )
})

test('worker derives identity, serializes concurrent duplicates, and preserves acknowledgment across restart', async (t) => {
  const f = await fixture(t)
  let changes = 0
  const first = f.open('local', {
    onChanged: () => {
      changes++
    }
  })
  await first.ready
  const entry = await first.run('entries.add', { title: 'Handoff', body: 'Observe the field' })
  const request = JSON.stringify({
    v: 1,
    type: 'request',
    id: 'ack:1',
    op: 'entries.acknowledge',
    payload: { entryId: entry.id }
  })
  const [a, b] = await Promise.all([handleRequest(request, first), handleRequest(request, first)])
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  assert.equal(a.result.alreadyRecorded, false)
  assert.equal(b.result.alreadyRecorded, true)
  assert.deepEqual(a.result.acknowledgment, b.result.acknowledgment)
  const writerKey = first.pass.writerKey.toString('hex')
  assert.equal(a.result.acknowledgment.writerKey, writerKey)
  const length = first.pass.base.local.length
  await first.run('entries.acknowledge', { entryId: entry.id })
  assert.equal(first.pass.base.local.length, length, 'a repeated action appends no new operation')
  const list = await first.run('entries.list', {})
  assert.equal(list.localWriterKey, writerKey)
  assert.deepEqual(list.acknowledgments, [a.result.acknowledgment])
  assert.ok(changes >= 2)
  await first.close()
  const reopened = f.open('local')
  await reopened.ready
  assert.deepEqual((await reopened.run('entries.list', {})).acknowledgments, list.acknowledgments)
  assert.equal((await reopened.run('entries.list', {})).localWriterKey, writerKey)
})

test('missing/deleted entries reject new acknowledgments; orphan records stay stored but are hidden', async (t) => {
  const f = await fixture(t)
  const notebook = f.open()
  await notebook.ready
  await assert.rejects(notebook.run('entries.acknowledge', { entryId: 'a'.repeat(32) }), {
    code: 'ENTRY_NOT_FOUND'
  })
  const entry = await notebook.run('entries.add', { title: 'Remove later', body: '' })
  const { acknowledgment } = await notebook.run('entries.acknowledge', { entryId: entry.id })
  const other = await notebook.run('entries.add', { title: 'Unrelated', body: '' })
  assert.deepEqual((await notebook.run('entries.list', {})).acknowledgments, [acknowledgment])
  await notebook.run('entries.remove', { id: entry.id })
  const snapshot = await notebook.run('entries.list', {})
  assert.deepEqual(snapshot.entries, [other])
  assert.deepEqual(snapshot.acknowledgments, [])
  assert.ok(await notebook.pass.get(`ack:${entry.id}:${acknowledgment.writerKey}`))
  await assert.rejects(notebook.run('entries.acknowledge', { entryId: entry.id }), {
    code: 'ENTRY_NOT_FOUND'
  })
})

test('malformed acknowledgments are counted and normalized; invalid local records are not silently replaced', async (t) => {
  const f = await fixture(t)
  const notebook = f.open()
  await notebook.ready
  const entry = await notebook.run('entries.add', { title: 'Validation', body: '' })
  const writer = notebook.pass.writerKey.toString('hex')
  const key = `ack:${entry.id}:${writer}`
  await notebook.pass.add(key, '{')
  await assert.rejects(notebook.run('entries.acknowledge', { entryId: entry.id }), {
    code: 'INVALID_ACK'
  })
  assert.equal((await notebook.pass.get(key)).value, '{')
  assert.equal((await notebook.run('entries.list', {})).skippedAcknowledgments, 1)
  const ack = {
    schemaVersion: 1,
    kind: 'ack',
    entryId: entry.id,
    writerKey: writer,
    acknowledgedAt: 1
  }
  await notebook.pass.add(key, JSON.stringify({ ...ack, future: { internal: true } }))
  assert.deepEqual((await notebook.run('entries.list', {})).acknowledgments, [ack])
  await notebook.pass.add(`ack:${entry.id}:${'c'.repeat(64)}`, JSON.stringify(ack))
  assert.equal(
    (await notebook.run('entries.list', {})).skippedAcknowledgments,
    1,
    'value must agree with record key'
  )
})

test(
  'real peer handoff replicates, survives reconnect, enforces Viewer permissions, and demonstrates shared-key trust limits',
  { timeout: 45_000 },
  async (t) => {
    const net = await testnet(10)
    t.after(() => net.destroy())
    const f = await fixture(t)
    const options = { bootstrap: net.bootstrap }
    const a = f.library('a', options)
    await a.ready
    await a.run('notebook.create', {})
    const b = f.library('b', options)
    await b.ready
    await b.run('pair.start', {
      invite: (await a.run('invite.create', { readOnly: false })).invite
    })
    await until(() => b.status().state === 'ready', 'Contributor pairing')
    const c = f.library('c', options)
    await c.ready
    await c.run('pair.start', { invite: (await a.run('invite.create', { readOnly: true })).invite })
    await until(() => c.status().state === 'ready', 'Viewer pairing')
    const entry = await a.run('entries.add', {
      title: 'Shared handoff',
      body: 'No delivery claims'
    })
    await until(
      async () => (await b.run('entries.list', {})).entries.some((x) => x.id === entry.id),
      'Entry replication'
    )
    const { acknowledgment } = await b.run('entries.acknowledge', { entryId: entry.id })
    for (const peer of [a, c]) {
      await until(
        async () =>
          (await peer.run('entries.list', {})).acknowledgments.some((x) => x.entryId === entry.id),
        'Acknowledgment replication'
      )
    }
    assert.equal(acknowledgment.writerKey, b.status().writerKey)
    await assert.rejects(c.run('entries.acknowledge', { entryId: entry.id }), { code: 'READ_ONLY' })
    await a.close()
    const offlineEntry = await b.run('entries.add', { title: 'While A disconnected', body: '' })
    await b.run('entries.acknowledge', { entryId: offlineEntry.id })
    const resumed = f.library('a', options)
    await resumed.ready
    await until(
      async () =>
        (await resumed.run('entries.list', {})).acknowledgments.some(
          (x) => x.entryId === offlineEntry.id
        ),
      'Reconnect acknowledgment'
    )
    const concurrentEntry = await resumed.run('entries.add', {
      title: 'Concurrent device acknowledgments',
      body: ''
    })
    await until(
      async () =>
        (await b.run('entries.list', {})).entries.some((x) => x.id === concurrentEntry.id),
      'Concurrent entry replication'
    )
    const concurrent = await Promise.all([
      resumed.run('entries.acknowledge', { entryId: concurrentEntry.id }),
      b.run('entries.acknowledge', { entryId: concurrentEntry.id })
    ])
    assert.notEqual(concurrent[0].acknowledgment.writerKey, concurrent[1].acknowledgment.writerKey)
    await until(
      async () =>
        (await c.run('entries.list', {})).acknowledgments.filter(
          (x) => x.entryId === concurrentEntry.id
        ).length === 2,
      'Distinct concurrent device records survive'
    )
    // Autopass's public API permits a writer to overwrite another writer's record key.
    const own = (await resumed.run('entries.acknowledge', { entryId: entry.id })).acknowledgment
    // Make this a causally later overwrite, not two competing concurrent values.
    await until(
      async () =>
        (await b.run('entries.list', {})).acknowledgments.some(
          (x) =>
            x.entryId === entry.id &&
            x.writerKey === own.writerKey &&
            x.acknowledgedAt === own.acknowledgedAt
        ),
      'A acknowledgment reached B before overwrite'
    )
    const forged = { ...own, acknowledgedAt: 123 }
    await b.notebook.pass.add(`ack:${entry.id}:${own.writerKey}`, JSON.stringify(forged))
    await until(
      async () =>
        (await resumed.run('entries.list', {})).acknowledgments.some(
          (x) => x.writerKey === own.writerKey && x.acknowledgedAt === 123
        ),
      'Shared-key overwrite observation'
    )
    assert.deepEqual(
      (await resumed.run('entries.acknowledge', { entryId: entry.id })).acknowledgment,
      forged
    )
    await b.run('entries.remove', { id: entry.id })
    await until(
      async () => !(await c.run('entries.list', {})).entries.some((x) => x.id === entry.id),
      'Deletion propagation'
    )
    assert.ok(
      !(await c.run('entries.list', {})).acknowledgments.some((x) => x.entryId === entry.id)
    )
  }
)
