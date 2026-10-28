const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const crypto = require('hypercore-crypto')
const { Notebook } = require('../workers/notebook')
const { validateRequest, isEntry, isResult } = require('../shared/protocol')
const { isAttachment, isFileMetadata } = require('../shared/attachment')
const { handleRequest } = require('../workers/requests')
const { isUnknownMutationError } = require('../src/worker/client')
const metadata = (bytes) => ({
  filename: 'field.txt',
  mimeType: 'text/plain',
  size: bytes.length,
  digest: crypto.hash(bytes).toString('hex')
})
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-attachments-'))
  const opened = []
  t.after(async () => {
    for (const n of opened.reverse()) await n.close()
    await fs.rm(root, { recursive: true, force: true })
  })
  return {
    root,
    async open(name = 'one') {
      const n = new Notebook(path.join(root, name), { replicate: false })
      opened.push(n)
      await n.ready
      return n
    }
  }
}
async function upload(n, bytes, title = 'Attached observation') {
  const stage = await n.run('attachments.stage', metadata(bytes))
  await fs.writeFile(fileURLToPath(stage.uri), bytes)
  const result = await n.run('entries.addAttachment', { handle: stage.handle, title, body: 'Body' })
  return { stage, ...result }
}

test('attachment descriptor and IPC reject malformed, oversized and path-like requests', () => {
  const meta = metadata(Buffer.from('test'))
  const a = { schemaVersion: 1, key: `attachment:${'a'.repeat(32)}:${meta.digest}`, ...meta }
  assert.equal(isAttachment(a, 'a'.repeat(32)), true)
  for (const bad of [
    { ...a, size: 1048577 },
    { ...a, size: -1 },
    { ...a, filename: '../x' },
    { ...a, filename: 'x\\y' },
    { ...a, filename: '\u0000' },
    { ...a, digest: 'bad' },
    { ...a, schemaVersion: 2 },
    { ...a, key: 'attachment:other' },
    { ...a, mimeType: 'application/x-executable' }
  ]) {
    assert.equal(isAttachment(bad, 'a'.repeat(32)), false)
  }
  assert.equal(isFileMetadata({ ...meta, size: 1048576 }), true)
  const req = (op, payload) => ({ v: 1, type: 'request', id: '1', op, payload })
  for (const [op, payload] of [
    ['attachments.stage', meta],
    ['entries.addAttachment', { handle: 'a'.repeat(32), title: 'Test', body: '' }],
    ['attachments.get', { entryId: 'a'.repeat(32) }],
    ['attachments.release', { handle: 'a'.repeat(32) }]
  ]) {
    assert.equal(validateRequest(req(op, payload)).op, op)
  }
  for (const [op, payload] of [
    ['attachments.stage', { ...meta, path: '/etc/passwd' }],
    ['attachments.stage', { ...meta, size: 1048577 }],
    ['entries.addAttachment', { handle: '../escape', title: 'X', body: '' }],
    ['attachments.get', { entryId: '../escape' }]
  ]) {
    assert.throws(() => validateRequest(req(op, payload)), { code: 'INVALID_PAYLOAD' })
  }
  assert.equal(isUnknownMutationError({ code: 'INVALID_ATTACHMENT' }), false)
  assert.equal(isUnknownMutationError({ code: 'ATTACHMENT_UNKNOWN' }), true)
})

test('1 MiB upload persists, lists metadata only, retrieves exact bytes and deduplicates', async (t) => {
  const f = await fixture(t)
  const n = await f.open()
  const bytes = Buffer.alloc(1048576, 0x93)
  const { entry, stage } = await upload(n, bytes)
  assert.equal(isEntry(entry), true)
  assert.equal(isResult('entries.addAttachment', { entry, alreadyRecorded: false }), true)
  const length = n.pass.base.local.length
  const repeated = await n.run('entries.addAttachment', {
    handle: stage.handle,
    title: 'Changed retry',
    body: 'Retry'
  })
  assert.equal(repeated.alreadyRecorded, true)
  assert.deepEqual(repeated.entry, entry)
  assert.equal(n.pass.base.local.length, length)
  const list = await n.run('entries.list', {})
  assert.deepEqual(list.entries, [entry])
  assert.ok(JSON.stringify(list).length < 3000)
  await assert.rejects(fs.stat(fileURLToPath(stage.uri)), { code: 'ENOENT' })
  const retrieved = await n.run('attachments.get', { entryId: entry.id })
  assert.equal(isResult('attachments.get', retrieved), true)
  assert.deepEqual(await fs.readFile(fileURLToPath(retrieved.uri)), bytes)
  await n.run('attachments.release', { handle: retrieved.handle })
  await assert.rejects(fs.stat(fileURLToPath(retrieved.uri)), { code: 'ENOENT' })
  await n.close()
  const stale = path.join(f.root, 'one', '.attachment-staging', 'f'.repeat(32))
  await fs.mkdir(stale)
  await fs.writeFile(path.join(stale, 'input.bin'), 'crash residue')
  const reopened = await f.open()
  await assert.rejects(fs.stat(stale), { code: 'ENOENT' })
  await assert.rejects(
    reopened.run('entries.addAttachment', { handle: stage.handle, title: 'Retry', body: '' }),
    { code: 'INVALID_TRANSFER' }
  )
  const again = await reopened.run('attachments.get', { entryId: entry.id })
  assert.deepEqual(await fs.readFile(fileURLToPath(again.uri)), bytes)
})

test('staging ownership, expiration, size/digest validation and Viewer permissions remain worker-enforced', async (t) => {
  const f = await fixture(t)
  const n = await f.open()
  const other = await f.open('other')
  const bytes = Buffer.from('valid')
  const slot = await n.run('attachments.stage', metadata(bytes))
  await assert.rejects(
    other.run('entries.addAttachment', { handle: slot.handle, title: 'X', body: '' }),
    { code: 'INVALID_TRANSFER' }
  )
  await fs.writeFile(fileURLToPath(slot.uri), Buffer.alloc(1048577))
  const length = n.pass.base.local.length
  await assert.rejects(
    n.run('entries.addAttachment', { handle: slot.handle, title: 'X', body: '' }),
    { code: 'INVALID_ATTACHMENT' }
  )
  assert.equal(n.pass.base.local.length, length)
  await fs.writeFile(fileURLToPath(slot.uri), 'wrong')
  await assert.rejects(
    n.run('entries.addAttachment', { handle: slot.handle, title: 'X', body: '' }),
    { code: 'INVALID_ATTACHMENT' }
  )
  n.attachments.now = () => Date.now() + 180000
  await n.attachments.sweep()
  await assert.rejects(
    n.run('entries.addAttachment', { handle: slot.handle, title: 'X', body: '' }),
    { code: 'INVALID_TRANSFER' }
  )
  n.attachments.now = Date.now
  const { entry } = await upload(n, bytes)
  Object.defineProperty(n.pass, 'writable', { get: () => false, configurable: true })
  for (const [op, payload] of [
    ['attachments.stage', metadata(bytes)],
    ['entries.addAttachment', { handle: 'a'.repeat(32), title: 'X', body: '' }]
  ]) {
    const response = await handleRequest(
      JSON.stringify({ v: 1, type: 'request', id: 'view', op, payload }),
      n
    )
    assert.equal(response.error.code, 'READ_ONLY')
  }
  const file = await n.run('attachments.get', { entryId: entry.id })
  assert.deepEqual(await fs.readFile(fileURLToPath(file.uri)), bytes)
})

test('partial writes retain orphans, never publish premature entries and reject ambiguous replay', async (t) => {
  const f = await fixture(t)
  const n = await f.open()
  const bytes = Buffer.from('orphan')
  const stage = await n.run('attachments.stage', metadata(bytes))
  await fs.writeFile(fileURLToPath(stage.uri), bytes)
  const add = n.pass.add.bind(n.pass)
  n.pass.add = (...args) => {
    if (args[0].startsWith('entry:')) throw new Error('Interrupted entry publication')
    return add(...args)
  }
  const payload = { handle: stage.handle, title: 'Unknown', body: '' }
  await assert.rejects(n.run('entries.addAttachment', payload), { code: 'ATTACHMENT_UNKNOWN' })
  assert.equal(await n.pass.get('entry:' + stage.entryId), null)
  const key = `attachment:${stage.entryId}:${metadata(bytes).digest}`
  assert.ok(await n.pass.get(key), 'orphan retained')
  const length = n.pass.base.local.length
  await assert.rejects(n.run('entries.addAttachment', payload), { code: 'ATTACHMENT_UNKNOWN' })
  assert.equal(n.pass.base.local.length, length)
})

test('missing/corrupt/foreign attachments and removed entries fail without exporting files', async (t) => {
  const f = await fixture(t)
  const n = await f.open()
  const bytes = Buffer.from('checked')
  const { entry } = await upload(n, bytes)
  await n.pass.remove(entry.attachment.key)
  await assert.rejects(n.run('attachments.get', { entryId: entry.id }), {
    code: 'ATTACHMENT_CORRUPT'
  })
  await n.pass.add(entry.attachment.key, '{}', bytes)
  await assert.rejects(n.run('attachments.get', { entryId: entry.id }), {
    code: 'ATTACHMENT_CORRUPT'
  })
  await n.pass.add(
    entry.attachment.key,
    JSON.stringify({
      schemaVersion: 1,
      kind: 'attachment',
      entryId: 'a'.repeat(32),
      attachment: entry.attachment
    }),
    bytes
  )
  await assert.rejects(n.run('attachments.get', { entryId: entry.id }), {
    code: 'ATTACHMENT_CORRUPT'
  })
  await n.run('entries.remove', { id: entry.id })
  await assert.rejects(n.run('attachments.get', { entryId: entry.id }), {
    code: 'ATTACHMENT_MISSING'
  })
})

test('timed-out retrieval retains its concurrency lane but does not block entry or acknowledgment writes', async (t) => {
  const f = await fixture(t)
  const n = await f.open()
  const { entry } = await upload(n, Buffer.from('slow'))
  const get = n.pass.get.bind(n.pass)
  let unblock
  const gate = new Promise((resolve) => {
    unblock = resolve
  })
  n.pass.get = async (key) => {
    if (key === entry.attachment.key) await gate
    return get(key)
  }
  n.attachments.retrievalMs = 5
  await assert.rejects(n.run('attachments.get', { entryId: entry.id }), {
    code: 'ATTACHMENT_TIMEOUT'
  })
  await assert.rejects(n.run('attachments.get', { entryId: entry.id }), { code: 'BUSY' })
  const operations = await Promise.all([
    n.run('entries.add', { title: 'Concurrent', body: '' }),
    n.run('entries.acknowledge', { entryId: entry.id })
  ])
  assert.equal(operations.length, 2)
  const active = n.attachments.retrieving
  unblock()
  await assert.rejects(active, { code: 'ATTACHMENT_TIMEOUT' })
  n.pass.get = get
  n.attachments.retrievalMs = 8000
  const result = await n.run('attachments.get', { entryId: entry.id })
  assert.ok(result.handle)
})

test('shutdown during delayed retrieval never exports a late file and cleanup failure still closes storage', async (t) => {
  const f = await fixture(t)
  const n = await f.open()
  const { entry } = await upload(n, Buffer.from('closing'))
  const get = n.pass.get.bind(n.pass)
  let unblock
  const gate = new Promise((resolve) => {
    unblock = resolve
  })
  n.pass.get = async (key) => {
    if (key === entry.attachment.key) await gate
    return get(key)
  }
  const requested = n.run('attachments.get', { entryId: entry.id })
  requested.catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 5))
  await n.attachments.close()
  unblock()
  await assert.rejects(requested, { code: 'ATTACHMENT_TIMEOUT' })
  assert.equal(n.attachments.stage.slots.size, 0)
  assert.equal(n.attachments.handles.size, 0)
  const close = n.attachments.close.bind(n.attachments)
  n.attachments.close = async () => {
    await close()
    throw new Error('Injected staging cleanup failure')
  }
  await n.close()
  assert.equal(n.state, 'closed')
  assert.equal(n.pass.closed, true)
})

test('descriptor size mismatch rejects before a binary append; early expiry never accepts stale handles', async (t) => {
  const f = await fixture(t)
  const n = await f.open()
  const bytes = Buffer.from('exact size')
  const stage = await n.run('attachments.stage', { ...metadata(bytes), size: bytes.length + 1 })
  await fs.writeFile(fileURLToPath(stage.uri), bytes)
  const length = n.pass.base.local.length
  await assert.rejects(
    n.run('entries.addAttachment', { handle: stage.handle, title: 'Mismatch', body: '' }),
    { code: 'INVALID_ATTACHMENT' }
  )
  assert.equal(n.pass.base.local.length, length)
  await n.run('attachments.release', { handle: stage.handle })
  const slot = await n.run('attachments.stage', metadata(bytes))
  n.attachments.now = () => slot.expiresAt
  await assert.rejects(
    n.run('entries.addAttachment', { handle: slot.handle, title: 'Expired', body: '' }),
    { code: 'INVALID_TRANSFER' }
  )
})

test('unsafe staging initialization fails attachment operations closed while preserving ordinary notebook access', async (t) => {
  const f = await fixture(t)
  const n = await f.open()
  const original = await n.run('entries.add', { title: 'Preserved', body: '' })
  await n.close()
  const root = path.join(f.root, 'one', '.attachment-staging')
  await fs.rm(root, { recursive: true, force: true })
  const outside = path.join(f.root, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'retained'), 'Do not touch')
  await fs.symlink(outside, root)
  const reopened = await f.open()
  assert.equal(reopened.status().state, 'ready')
  assert.deepEqual((await reopened.run('entries.list', {})).entries, [original])
  await reopened.run('entries.add', { title: 'Still writable', body: '' })
  await assert.rejects(reopened.run('attachments.stage', metadata(Buffer.alloc(0))), {
    code: 'STAGING_ERROR'
  })
  await assert.rejects(reopened.run('attachments.get', { entryId: original.id }), {
    code: 'STAGING_ERROR'
  })
  assert.equal(await fs.readFile(path.join(outside, 'retained'), 'utf8'), 'Do not touch')
})

test('Bare seals copied files without a client digest, preserves digest-supplied clients and rejects changed bytes', async (t) => {
  const f = await fixture(t)
  const n = await f.open()
  const bytes = Buffer.from('Worker computes this digest')
  const { digest, ...meta } = metadata(bytes)
  assert.equal(
    validateRequest({ v: 1, type: 'request', id: 'seal', op: 'attachments.stage', payload: meta })
      .op,
    'attachments.stage'
  )
  assert.equal(
    validateRequest({
      v: 1,
      type: 'request',
      id: 'seal',
      op: 'attachments.seal',
      payload: { handle: 'a'.repeat(32) }
    }).op,
    'attachments.seal'
  )
  const slot = await n.run('attachments.stage', meta)
  await fs.writeFile(fileURLToPath(slot.uri), bytes)
  await assert.rejects(
    n.run('entries.addAttachment', { handle: slot.handle, title: 'Not sealed', body: '' }),
    { code: 'INVALID_ATTACHMENT' }
  )
  const sealed = await n.run('attachments.seal', { handle: slot.handle })
  assert.equal(sealed.digest, digest)
  assert.equal(isResult('attachments.seal', sealed), true)
  assert.deepEqual(await n.run('attachments.seal', { handle: slot.handle }), sealed)
  await fs.writeFile(fileURLToPath(slot.uri), Buffer.alloc(bytes.length, 0x41))
  await assert.rejects(
    n.run('entries.addAttachment', { handle: slot.handle, title: 'Changed', body: '' }),
    { code: 'INVALID_ATTACHMENT' }
  )
  await assert.rejects(n.run('attachments.seal', { handle: slot.handle }), {
    code: 'INVALID_ATTACHMENT'
  })
  await fs.writeFile(fileURLToPath(slot.uri), bytes)
  const result = await n.run('entries.addAttachment', {
    handle: slot.handle,
    title: 'Sealed',
    body: ''
  })
  assert.equal(result.entry.attachment.digest, digest)
  Object.defineProperty(n.pass, 'writable', { get: () => false, configurable: true })
  await assert.rejects(n.run('attachments.seal', { handle: slot.handle }), { code: 'READ_ONLY' })
})
