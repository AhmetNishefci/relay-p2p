const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('hypercore-crypto')
const { FileStaging, MAX_FILE_BYTES } = require('../workers/file-staging')

test('private staging validates handles, bytes, digest and size; cleans success and failure', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-staging-'))
  const stage = new FileStaging(path.join(root, 'private'))
  t.after(async () => {
    await stage.close()
    await fs.rm(root, { recursive: true, force: true })
  })
  for (const size of [0, 37, MAX_FILE_BYTES]) {
    const slot = await stage.reserve()
    const bytes = Buffer.alloc(size, 0x93)
    const digest = crypto.hash(bytes).toString('hex')
    await fs.writeFile(slot.input, bytes)
    const result = await stage.inspect(slot.token, digest)
    assert.equal(result.size, size)
    assert.deepEqual(await fs.readFile(result.output), bytes)
    await stage.remove(slot.token)
    await assert.rejects(fs.stat(slot.input), { code: 'ENOENT' })
    await assert.rejects(stage.inspect(slot.token, digest), { code: 'INVALID_TRANSFER' })
  }
  for (const token of ['../escape', '/etc/passwd', 'a'.repeat(32), '%2e%2e']) {
    await assert.rejects(stage.inspect(token, 'a'.repeat(64)), { code: 'INVALID_TRANSFER' })
  }
  const slot = await stage.reserve()
  await assert.rejects(stage.inspect(slot.token, 'bad'), { code: 'INVALID_DIGEST' })
  await assert.rejects(stage.inspect(slot.token, 'a'.repeat(64)), { code: 'ENOENT' })
  await fs.writeFile(slot.input, Buffer.alloc(MAX_FILE_BYTES + 1))
  await assert.rejects(stage.inspect(slot.token, 'a'.repeat(64)), { code: 'FILE_TOO_LARGE' })
  await fs.writeFile(slot.input, 'wrong digest')
  await assert.rejects(stage.inspect(slot.token, 'a'.repeat(64)), { code: 'INTEGRITY_MISMATCH' })
  await fs.unlink(slot.input)
  await fs.symlink(path.join(root, 'outside'), slot.input)
  await assert.rejects(stage.inspect(slot.token, 'a'.repeat(64)), { code: 'UNSAFE_FILE' })
  await stage.close()
  assert.deepEqual(await fs.readdir(stage.root), [])
})

test('concurrent reservations cannot exceed the staging slot limit', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-slots-'))
  const stage = new FileStaging(root)
  t.after(async () => {
    await stage.close()
    await fs.rm(root, { recursive: true, force: true })
  })
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => stage.reserve()))
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 2)
  assert.equal(
    results.filter((x) => x.status === 'rejected' && x.reason.code === 'STAGING_BUSY').length,
    4
  )
})
