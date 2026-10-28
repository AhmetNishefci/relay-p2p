const test = require('node:test')
const assert = require('node:assert/strict')
const { parseJSON, validateRequest, isEntry, publicError } = require('../shared/protocol')
const { handleRequest } = require('../workers/requests')

const request = (op, payload = {}) => ({ v: 1, type: 'request', id: 'test:1', op, payload })

test('validates all supported operation payloads', () => {
  for (const [op, payload] of [
    ['status', {}],
    ['entries.list', {}],
    ['entries.add', { title: 'Observation', body: '' }],
    ['entries.remove', { id: 'a'.repeat(32) }]
  ]) {
    assert.equal(validateRequest(request(op, payload)).op, op)
  }
})

test('rejects invalid versions, IDs, operations, and payloads before dispatch', () => {
  const cases = [
    [null, 'INVALID_MESSAGE'],
    [{ ...request('status'), id: {} }, 'INVALID_MESSAGE'],
    [{ ...request('status'), v: 2 }, 'UNSUPPORTED_VERSION'],
    [request('pair.unsupported'), 'UNKNOWN_OPERATION'],
    [request('status', { unexpected: true }), 'INVALID_PAYLOAD'],
    [request('entries.add', { title: '  ', body: '' }), 'INVALID_PAYLOAD'],
    [request('entries.add', { title: 'x', body: 'x'.repeat(8001) }), 'INVALID_PAYLOAD'],
    [request('entries.add', { title: 'x', body: '', createdAt: 123 }), 'INVALID_PAYLOAD'],
    [request('entries.remove', { id: '../store' }), 'INVALID_PAYLOAD']
  ]
  for (const [value, code] of cases) assert.throws(() => validateRequest(value), { code })
  for (const raw of ['{', 'null trailing', 'x'.repeat(2_000_001)]) {
    assert.throws(() => parseJSON(raw), { code: 'INVALID_MESSAGE' })
  }
})

test('malformed frames return safe structured failures and do not call storage', async () => {
  let calls = 0
  const notebook = {
    run() {
      calls++
      throw new Error('must not run')
    }
  }
  for (const raw of ['{', 'null', JSON.stringify(request('unknown'))]) {
    const response = await handleRequest(raw, notebook)
    assert.equal(response.ok, false)
    assert.equal(response.v, 1)
    assert.equal(typeof response.error.code, 'string')
  }
  assert.equal(calls, 0)
  assert.equal((await handleRequest('{', notebook)).id, null)
  assert.equal((await handleRequest(JSON.stringify(request('unknown')), notebook)).id, 'test:1')
})

test('unknown internal errors do not cross the worker boundary', () => {
  const error = publicError(new Error('/private/internal/storage: sensitive diagnostic'))
  assert.equal(error.code, 'STORAGE_ERROR')
  assert.ok(!error.message.includes('/private'))
})

test('storage rejection becomes a correlated sanitized response and is logged internally', async (t) => {
  const log = t.mock.method(console, 'error', () => {})
  const response = await handleRequest(JSON.stringify(request('entries.list')), {
    run() {
      return Promise.reject(new Error('/private/internal/storage'))
    }
  })
  assert.equal(response.id, 'test:1')
  assert.equal(response.ok, false)
  assert.equal(response.error.code, 'STORAGE_ERROR')
  assert.ok(!JSON.stringify(response).includes('/private'))
  assert.equal(log.mock.callCount(), 1)
})

test('entry schema tolerates future fields but rejects unsupported schema/kind', () => {
  const entry = {
    schemaVersion: 1,
    kind: 'entry',
    id: 'a'.repeat(32),
    title: 'x',
    body: '',
    createdAt: 0
  }
  assert.equal(isEntry({ ...entry, future: true }), true)
  for (const value of [
    { ...entry, schemaVersion: 2 },
    { ...entry, kind: 'ack' },
    { ...entry, createdAt: NaN }
  ]) {
    assert.equal(isEntry(value), false)
  }
})
