const test = require('node:test')
const assert = require('node:assert/strict')
const { createCopyGate } = require('../src/copy-gate')

test('native copy deadline retains one lane and removes late output without pretending cancellation', async () => {
  let finish
  let started = 0
  const removed = []
  const gate = createCopyGate(
    () => {
      started++
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    (uri) => {
      removed.push(uri)
      return Promise.resolve()
    },
    5
  )
  await assert.rejects(gate('content://provider/one', 'file:///private/one'), /timed out/)
  await assert.rejects(gate('content://provider/two', 'file:///private/two'), /previous file copy/)
  assert.equal(started, 1)
  assert.deepEqual(removed, [])
  finish()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(removed, ['file:///private/one'])
})
test('successful and failed native operations release the lane and preserve errors', async () => {
  let fail = true
  const copied = []
  const gate = createCopyGate(
    (from, to) => {
      copied.push([from, to])
      if (fail) return Promise.reject(new Error('Provider permission denied'))
      return Promise.resolve()
    },
    () => Promise.resolve(),
    100
  )
  await assert.rejects(gate('a', 'b'), /permission denied/)
  fail = false
  await gate('c', 'd')
  await gate('e', 'f')
  assert.equal(copied.length, 3)
})
