const test = require('node:test')
const assert = require('node:assert/strict')
const { WorkerClient, createListRefresher } = require('../src/worker/client')

const status = { state: 'ready', writable: true }
const response = (id, result = status) =>
  JSON.stringify({ v: 1, type: 'response', id, ok: true, result })
const emptySnapshot = {
  entries: [],
  skipped: 0,
  acknowledgments: [],
  skippedAcknowledgments: 0,
  localWriterKey: 'a'.repeat(64)
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('correlates out-of-order responses and ignores duplicate/late responses', async () => {
  const frames = []
  const client = new WorkerClient((raw) => frames.push(JSON.parse(raw)))
  const a = client.request('status', {})
  const b = client.request('entries.list', {})
  assert.notEqual(frames[0].id, frames[1].id)
  client.receive(response(frames[1].id, emptySnapshot))
  client.receive(response(frames[0].id))
  assert.deepEqual(await a, status)
  assert.deepEqual(await b, emptySnapshot)
  client.receive(response(frames[0].id))
  client.close()
})

test('structured failures, invalid results, and malformed messages remain visible', async () => {
  const frames = []
  const events = []
  const client = new WorkerClient((raw) => frames.push(JSON.parse(raw)))
  client.subscribe((event) => events.push(event))
  const failed = client.request('status', {})
  client.receive(
    JSON.stringify({
      v: 1,
      type: 'response',
      id: frames[0].id,
      ok: false,
      error: { code: 'NOT_READY', message: 'Not ready.' }
    })
  )
  await assert.rejects(failed, { code: 'NOT_READY' })
  const invalid = client.request('entries.list', {})
  client.receive(response(frames[1].id, status))
  await assert.rejects(invalid, { code: 'INVALID_RESPONSE' })
  client.receive('{')
  assert.equal(events.at(-1).payload.code, 'INVALID_RESPONSE')
  const unsubscribe = client.subscribe(() => assert.fail('unsubscribed callback'))
  unsubscribe()
  client.receive(JSON.stringify({ v: 1, type: 'event', event: 'changed', payload: null }))
  assert.equal(events.at(-1).event, 'changed')
  client.close()
})

test('bounds waits; disconnect rejects pending requests and blocks future writes', async () => {
  const client = new WorkerClient(() => {})
  await assert.rejects(client.request('status', {}, 5), { code: 'TIMEOUT' })
  const pending = client.request('status', {})
  client.close()
  await assert.rejects(pending, { code: 'DISCONNECTED' })
  await assert.rejects(client.request('status', {}), { code: 'DISCONNECTED' })
  client.close()
  const broken = new WorkerClient(() => {
    throw new Error('closed pipe')
  })
  await assert.rejects(broken.request('status', {}), { code: 'DISCONNECTED' })
  broken.close()
})

test('coalesces bursts and refreshes again if updates arrive during a list', async () => {
  const resolve = []
  const values = []
  const refresher = createListRefresher(
    () => new Promise((done) => resolve.push(done)),
    (value) => values.push(value),
    assert.fail
  )
  const completed = refresher.refresh()
  for (let i = 0; i < 20; i++) refresher.refresh()
  assert.equal(resolve.length, 1)
  resolve[0]('first snapshot')
  await tick()
  assert.equal(resolve.length, 2)
  resolve[1]('latest snapshot')
  await completed
  assert.deepEqual(values, ['first snapshot', 'latest snapshot'])
  assert.equal(resolve.length, 2)
  const closing = refresher.refresh()
  refresher.close()
  resolve[2]('must not render after unmount')
  await closing
  assert.equal(values.length, 2)
})

test('refresh failures reach the UI and permit a later retry', async () => {
  let fail = true
  const errors = []
  const values = []
  const refresher = createListRefresher(
    () => (fail ? Promise.reject(new Error('list failed')) : Promise.resolve('recovered')),
    (value) => values.push(value),
    (error) => errors.push(error.message)
  )
  await refresher.refresh()
  fail = false
  await refresher.refresh()
  assert.deepEqual(errors, ['list failed'])
  assert.deepEqual(values, ['recovered'])
  refresher.close()
})
