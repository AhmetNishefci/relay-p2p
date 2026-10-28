const test = require('node:test')
const assert = require('node:assert/strict')
const {
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGE_BYTES,
  parseJSON,
  serializeMessage,
  isResult
} = require('../shared/protocol')
const { WorkerClient } = require('../src/worker/client')
const { handleRequest, encodeResponse } = require('../workers/requests')
const { Notebook } = require('../workers/notebook')

const id = (n, size = 32) => n.toString(16).padStart(size, '0')
const entry = (n, body = '') => ({
  schemaVersion: 1,
  kind: 'entry',
  id: id(n),
  title: 'Synthetic field note',
  body,
  createdAt: 1793192400000
})
const acknowledgment = (n) => ({
  schemaVersion: 1,
  kind: 'ack',
  entryId: id((n % 200) + 1),
  writerKey: id(Math.floor(n / 200) + 1, 64),
  acknowledgedAt: 1793192400000
})
function snapshot(entries, acknowledgments = []) {
  const records = [
    ...entries.map((value) => ({ key: 'entry:' + value.id, value: JSON.stringify(value) })),
    ...acknowledgments.map((value) => ({
      key: `ack:${value.entryId}:${value.writerKey}`,
      value: JSON.stringify(value)
    }))
  ]
  const pass = {
    writerKey: Buffer.alloc(32, 1),
    async *list() {
      yield* records
    }
  }
  return Notebook.prototype.perform.call({ pass }, 'entries.list', {})
}

test('the existing character ceiling still accepts its boundary and rejects the next character', () => {
  const raw = '"' + 'x'.repeat(MAX_MESSAGE_LENGTH - 2) + '"'
  assert.equal(serializeMessage(parseJSON(raw)), raw)
  assert.throws(() => parseJSON(raw.slice(0, -1) + 'x"'), { code: 'INVALID_MESSAGE' })
})

test('serialized UTF-8 bytes are bounded independently of character count', () => {
  const available = MAX_MESSAGE_BYTES - 2
  const raw = '"' + '漢'.repeat(Math.floor(available / 3)) + 'a'.repeat(available % 3) + '"'
  assert.equal(Buffer.byteLength(raw), MAX_MESSAGE_BYTES)
  assert.ok(raw.length < MAX_MESSAGE_LENGTH)
  assert.equal(serializeMessage(parseJSON(raw)), raw)
  const oversized = raw.slice(0, -1) + 'x"'
  assert.equal(Buffer.byteLength(oversized), MAX_MESSAGE_BYTES + 1)
  assert.throws(() => parseJSON(oversized), { code: 'INVALID_MESSAGE' })
  assert.throws(() => serializeMessage(JSON.parse(oversized)), { code: 'INVALID_MESSAGE' })
})

test('Unicode surrogate pairs, unpaired surrogates and escaped characters round-trip', () => {
  const value = { text: '漢😀\ud800\udfff\n"\\' }
  const raw = serializeMessage(value)
  assert.ok(Buffer.byteLength(raw) <= raw.length * 3)
  assert.deepEqual(parseJSON(raw), value)
})

test('a legitimate near-limit multibyte notebook is not rejected or truncated', async () => {
  const entries = Array.from({ length: 200 }, (_, i) => entry(i + 1, '漢'.repeat(6000)))
  const acknowledgments = Array.from({ length: 1000 }, (_, i) => acknowledgment(i))
  const result = await snapshot(entries, acknowledgments)
  const raw = encodeResponse({ v: 1, type: 'response', id: 'limit', ok: true, result })
  assert.ok(Buffer.byteLength(raw) > 3_800_000)
  const decoded = parseJSON(raw)
  assert.equal(decoded.ok, true)
  assert.equal(isResult('entries.list', decoded.result), true)
  assert.equal(decoded.result.entries.length, 200)
  assert.equal(decoded.result.acknowledgments.length, 1000)
  assert.equal(decoded.result.entries[0].body, entries[0].body)
})

test('entry, acknowledgment and aggregate limits fail explicitly rather than returning partial data', async () => {
  await assert.rejects(snapshot(Array.from({ length: 201 }, (_, i) => entry(i + 1))), {
    code: 'LIST_LIMIT'
  })
  await assert.rejects(
    snapshot(
      [entry(1)],
      Array.from({ length: 1001 }, (_, i) => acknowledgment(i))
    ),
    { code: 'LIST_LIMIT' }
  )
  await assert.rejects(
    snapshot(Array.from({ length: 200 }, (_, i) => entry(i + 1, 'x'.repeat(8000)))),
    { code: 'LIST_LIMIT' }
  )
})

test('unencodable or oversized requests are rejected before transport and allocate no pending request', async () => {
  const frames = []
  const client = new WorkerClient((raw) => frames.push(raw))
  await assert.rejects(
    client.request('entries.add', { title: 'No send', body: '漢'.repeat(1_600_000) }),
    { code: 'INVALID_MESSAGE' }
  )
  const circular = {}
  circular.self = circular
  await assert.rejects(client.request('entries.add', circular), { code: 'INVALID_MESSAGE' })
  assert.equal(frames.length, 0)
  assert.equal(client.pending.size, 0)
  client.close()
})

test('oversized foreign stored values are retained but skipped before parsing', async () => {
  const result = await snapshot([
    { ...entry(1), future: '漢'.repeat(1_600_000) },
    entry(2, 'Valid data remains available')
  ])
  assert.equal(result.skipped, 1)
  assert.deepEqual(
    result.entries.map((value) => value.id),
    [id(2)]
  )
})

test('a result too large for IPC becomes a correlated unknown-outcome response without replay', async () => {
  let operations = 0
  const response = await handleRequest(
    JSON.stringify({
      v: 1,
      type: 'request',
      id: 'once',
      op: 'entries.add',
      payload: { title: 'Once', body: '' }
    }),
    {
      run() {
        operations++
        return Promise.resolve({ text: '漢'.repeat(1_600_000) })
      }
    }
  )
  const decoded = parseJSON(encodeResponse(response))
  assert.equal(operations, 1)
  assert.equal(decoded.id, 'once')
  assert.equal(decoded.ok, false)
  assert.equal(decoded.error.code, 'RESPONSE_UNAVAILABLE')
  assert.ok(Buffer.byteLength(encodeResponse(response)) < 400)
})
