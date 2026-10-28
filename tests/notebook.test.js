const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { Notebook } = require('../workers/notebook')
const { handleRequest } = require('../workers/requests')
const { WorkerClient } = require('../src/worker/client')

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-foundation-'))
  const notebooks = []
  t.after(async () => {
    for (const notebook of notebooks) await notebook.close()
    await fs.rm(directory, { recursive: true, force: true })
  })
  return {
    directory,
    open(options = {}) {
      const notebook = new Notebook(directory, { replicate: false, ...options })
      notebooks.push(notebook)
      return notebook
    }
  }
}

test('real Autopass performs add/list/remove through correlated application messages', async (t) => {
  const f = await fixture(t)
  let updates = 0
  const notebook = f.open({
    onChanged: () => {
      updates++
    }
  })
  await notebook.ready
  const client = new WorkerClient((raw) => {
    handleRequest(raw, notebook).then((result) => client.receive(JSON.stringify(result)))
  })
  t.after(() => client.close())
  assert.deepEqual(await client.request('status', {}), { state: 'ready', writable: true })
  const [a, b] = await Promise.all([
    client.request('entries.add', { title: ' Observation A ', body: 'Body A' }),
    client.request('entries.add', { title: 'Observation B', body: 'Body B' })
  ])
  assert.notEqual(a.id, b.id)
  assert.equal(a.title, 'Observation A')
  const record = await notebook.pass.get('entry:' + a.id)
  assert.equal(JSON.parse(record.value).body, 'Body A')
  assert.ok('file' in record)
  assert.equal((await client.request('entries.list', {})).entries.length, 2)
  await client.request('entries.remove', { id: a.id })
  await client.request('entries.remove', { id: a.id })
  assert.equal(await notebook.pass.get('entry:' + a.id), null)
  assert.deepEqual(
    (await client.request('entries.list', {})).entries.map((x) => x.id),
    [b.id]
  )
  assert.ok(updates > 0, 'actual Autopass updates reached the service callback')
})

test('reopening the same Corestore preserves IDs/values and does not resurrect removals', async (t) => {
  const f = await fixture(t)
  const first = f.open()
  await first.ready
  const keep = await first.run('entries.add', {
    title: 'Keep across restart',
    body: 'Persistent body'
  })
  const remove = await first.run('entries.add', { title: 'Remove', body: '' })
  await first.run('entries.remove', { id: remove.id })
  const writer = first.pass.writerKey.toString('hex')
  await first.close()
  const second = f.open()
  await second.ready
  assert.equal(second.pass.writerKey.toString('hex'), writer)
  assert.deepEqual((await second.run('entries.list', {})).entries, [keep])
})

test('foreign/invalid records are isolated; read-only writes and closed service are rejected', async (t) => {
  const f = await fixture(t)
  const notebook = f.open()
  await notebook.ready
  await notebook.pass.add('entry:' + 'a'.repeat(32), '{')
  await notebook.pass.add(
    'entry:' + 'b'.repeat(32),
    JSON.stringify({ schemaVersion: 2, kind: 'entry' })
  )
  await notebook.pass.add('ack:reserved-future-record', '{}')
  const entry = await notebook.run('entries.add', { title: 'Known entry', body: '' })
  await notebook.pass.add(
    'entry:' + entry.id,
    JSON.stringify({ ...entry, future: { internal: true } })
  )
  assert.deepEqual(await notebook.run('entries.list', {}), {
    entries: [entry],
    skipped: 2,
    acknowledgments: [],
    skippedAcknowledgments: 1,
    localWriterKey: notebook.pass.writerKey.toString('hex')
  })
  const writable = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(notebook.pass), 'writable')
  assert.ok(writable.get)
  Object.defineProperty(notebook.pass, 'writable', { value: false, configurable: true })
  await assert.rejects(notebook.run('entries.add', { title: 'No', body: '' }), {
    code: 'READ_ONLY'
  })
  delete notebook.pass.writable
  await notebook.close()
  await assert.rejects(notebook.run('entries.list', {}), { code: 'NOT_READY' })
})

test('requests before readiness receive NOT_READY without blocking status', async (t) => {
  const f = await fixture(t)
  const notebook = f.open()
  assert.equal((await notebook.run('status', {})).state, 'starting')
  await assert.rejects(notebook.run('entries.list', {}), { code: 'NOT_READY' })
  await notebook.ready
})
