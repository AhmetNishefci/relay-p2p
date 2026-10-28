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

test('a finite burst coalesces into one follow-up read started after the explicit request', async () => {
  const loads = []
  const values = []
  const refresher = createListRefresher(
    () => new Promise((resolve) => loads.push(resolve)),
    (value) => values.push(value),
    assert.fail
  )
  refresher.invalidate()
  const completed = refresher.refresh()
  assert.equal(refresher.refresh(), completed, 'callers targeting the same next read coalesce')
  let settled = false
  completed.then(() => {
    settled = true
  })
  for (let i = 0; i < 100; i++) refresher.invalidate()
  assert.equal(loads.length, 1)
  loads[0]('old snapshot')
  await tick()
  assert.equal(settled, false, 'an already-started read cannot satisfy the freshness barrier')
  assert.equal(loads.length, 2)
  loads[1]('fresh snapshot')
  await completed
  assert.deepEqual(values, ['old snapshot', 'fresh snapshot'])
  assert.equal(loads.length, 2)
  refresher.close()
})

test('explicit callers finish during continuous invalidations without concurrent reads', async () => {
  const loads = []
  let active = 0
  let maximumActive = 0
  let values = 0
  let completedAfter = null
  const refresher = createListRefresher(
    () => {
      maximumActive = Math.max(maximumActive, ++active)
      return new Promise((resolve) => loads.push(resolve)).finally(() => active--)
    },
    () => {
      values++
    },
    assert.fail
  )
  refresher.invalidate()
  const completed = refresher.refresh().then(() => {
    completedAfter = values
  })
  for (let i = 0; i < 50; i++) {
    refresher.invalidate()
    loads.shift()(i)
    await tick()
    if (i >= 1) assert.equal(completedAfter, 2)
  }
  assert.equal(maximumActive, 1)
  assert.equal(values, 50)
  await completed
  refresher.close()
  loads.shift()(50)
  await tick()
  assert.equal(values, 50, 'closed consumers never receive the last in-flight result')
})

test('closing rejects waiters immediately and removes callbacks even before a read responds', async () => {
  let resolve
  const refresher = createListRefresher(
    () =>
      new Promise((done) => {
        resolve = done
      }),
    () => assert.fail('closed callback'),
    () => assert.fail('closed error callback')
  )
  const rejected = assert.rejects(refresher.refresh(), { code: 'DISCONNECTED' })
  refresher.close()
  refresher.close()
  await rejected
  await assert.rejects(refresher.refresh(), { code: 'DISCONNECTED' })
  refresher.invalidate()
  resolve('late')
  await tick()
})

test('refresh failures reach both the explicit caller and UI and permit a later retry', async () => {
  let fail = true
  const errors = []
  const values = []
  const refresher = createListRefresher(
    () => (fail ? Promise.reject(new Error('list failed')) : Promise.resolve('recovered')),
    (value) => values.push(value),
    (error) => errors.push(error.message)
  )
  await assert.rejects(refresher.refresh(), { message: 'list failed' })
  fail = false
  await refresher.refresh()
  assert.deepEqual(errors, ['list failed'])
  assert.deepEqual(values, ['recovered'])
  refresher.close()
})

test('an update queued as a read completes is not lost', async () => {
  let reads = 0
  const values = []
  const refresher = createListRefresher(
    () => Promise.resolve(++reads),
    (value) => {
      values.push(value)
      if (value === 1) queueMicrotask(() => refresher.invalidate())
    },
    assert.fail
  )
  await refresher.refresh()
  await tick()
  assert.deepEqual(values, [1, 2])
  refresher.close()
})
