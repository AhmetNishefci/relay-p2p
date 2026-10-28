const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { Notebook } = require('../workers/notebook')
const { notebookRecords } = require('../workers/record-snapshot')

test('range snapshot excludes binary namespaces and preserves validation, updates, ordering and deletion', async (t) => {
  assert.equal(require('autopass/package.json').version, '3.4.1')
  assert.equal(require('hyperdb/package').version, '4.22.3')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-range-'))
  const n = new Notebook(root, { replicate: false })
  t.after(async () => {
    await n.close()
    await fs.rm(root, { recursive: true, force: true })
  })
  await n.ready
  const a = await n.run('entries.add', { title: 'A', body: '' })
  const b = await n.run('entries.add', { title: 'B', body: '' })
  await n.run('entries.acknowledge', { entryId: a.id })
  await n.pass.add('attachment:one', 'binary', Buffer.alloc(1024 * 1024, 42))
  await n.pass.add('entry:' + 'f'.repeat(32), '{')
  await n.pass.add('ack:invalid', '{')
  await n.pass.add('entry;', 'outside range', Buffer.alloc(100))
  const collection = n.pass.base.view.definition.resolveCollection('@autopass/records')
  const original = collection.reconstruct
  let decodedFileBytes = 0
  collection.reconstruct = (...args) => {
    const row = original(...args)
    decodedFileBytes += row.file ? row.file.length : 0
    return row
  }
  t.after(() => {
    collection.reconstruct = original
  })
  n.pass.list = () => {
    throw new Error('Unrestricted list must never be used')
  }
  const result = await n.run('entries.list', {})
  assert.equal(decodedFileBytes, 0)
  assert.deepEqual(
    result.entries,
    [a, b].sort((x, y) => y.createdAt - x.createdAt || x.id.localeCompare(y.id))
  )
  assert.equal(result.skipped, 1)
  assert.equal(result.skippedAcknowledgments, 1)
  assert.equal(result.acknowledgments.length, 1)
  const iterator = notebookRecords(n.pass)
  const first = await iterator.next()
  const later = await n.run('entries.add', { title: 'After snapshot', body: '' })
  const frozen = [first.value]
  for await (const row of iterator) frozen.push(row)
  assert.equal(
    frozen.some((row) => row.key === 'entry:' + later.id),
    false
  )
  await n.run('entries.remove', { id: later.id })
  await n.pass.add('entry:' + b.id, JSON.stringify({ ...b, title: 'Updated' }))
  assert.equal(
    (await n.run('entries.list', {})).entries.find((x) => x.id === b.id).title,
    'Updated'
  )
  await n.run('entries.remove', { id: a.id })
  const removed = await n.run('entries.list', {})
  assert.deepEqual(
    removed.entries.map((x) => x.id),
    [b.id]
  )
  assert.equal(removed.acknowledgments.length, 0)
  assert.ok(await n.pass.get('attachment:one'))
})

test('a single internal snapshot spans both ranges and closes on early termination or failure', async () => {
  let closed = 0
  const calls = []
  const pass = {
    base: {
      view: {
        snapshot() {
          return {
            find(name, query) {
              calls.push([name, query])
              return (function* () {
                yield { key: query.gte.key }
                throw new Error('decode failed')
              })()
            },
            close() {
              closed++
            }
          }
        }
      }
    }
  }
  for await (const record of notebookRecords(pass)) {
    assert.equal(record.key, 'ack:')
    break
  }
  assert.equal(closed, 1)
  await assert.rejects(async () => {
    for await (const record of notebookRecords(pass)) void record
  }, /decode failed/)
  assert.equal(closed, 2)
  assert.deepEqual(calls[0], ['@autopass/records', { gte: { key: 'ack:' }, lt: { key: 'ack;' } }])
})
