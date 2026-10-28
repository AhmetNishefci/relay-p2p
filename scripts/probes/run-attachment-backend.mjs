// Requires three already-paired debug Android peers, Metro and the README toolchain.
// Creates/removes only its own test entries. Binary records are intentionally retained.
import assert from 'node:assert/strict'
import { connect } from './inspector.mjs'
import crypto from 'hypercore-crypto'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check) {
  const end = Date.now() + 30000
  while (Date.now() < end) {
    const value = await check()
    if (value) return value
    await sleep(100)
  }
  throw new Error('Peer check timed out')
}
const ascii = (text) =>
  text.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
const response = await fetch(
  'http://localhost:8081/scripts/probes/attachment-backend-rn.bundle?platform=android&dev=true&minify=false&modulesOnly=true&runModule=true'
)
assert.equal(response.status, 200)
const diagnostic = ascii(await response.text())
const targets = await until(async () => {
  const found = await (await fetch('http://localhost:8081/json/list')).json()
  return found.length === 3 && found
})
assert.equal(targets.length, 3, 'Exactly three independent debug peers required')
const peers = []
try {
  for (const target of targets) {
    const p = await connect(target)
    peers.push(p)
    await p.evaluate(diagnostic)
    p.request = async (op, payload = {}) => {
      await p.evaluate(
        `globalThis.__attachmentReply=null;__relaySession.client.request(${JSON.stringify(op)},${JSON.stringify(payload)}).then(value=>{globalThis.__attachmentReply={value}},error=>{globalThis.__attachmentReply={error:{code:error.code,message:error.message}}});true`
      )
      const reply = await until(async () =>
        JSON.parse(await p.evaluate('JSON.stringify(globalThis.__attachmentReply)'))
      )
      if (reply.error) {
        throw Object.assign(new Error(reply.error.message), { code: reply.error.code })
      }
      return reply.value
    }
    p.status = await until(async () => {
      const s = await p.request('status')
      return s.state === 'ready' && s
    })
    p.before = await p.request('entries.list')
  }
  const contributors = peers.filter((p) => p.status.writable),
    viewers = peers.filter((p) => !p.status.writable)
  assert.equal(contributors.length, 2)
  assert.equal(viewers.length, 1)
  const [a, b] = contributors,
    c = viewers[0]
  const size = 1048576,
    bytes = Buffer.alloc(size)
  for (let i = 0; i < size; i++) bytes[i] = i % 251
  const meta = {
    filename: 'field-proof.txt',
    mimeType: 'text/plain',
    size,
    digest: crypto.hash(bytes).toString('hex')
  }
  const slot = await a.request('attachments.stage', meta)
  await a.evaluate(`__relayAttachmentFiles.write(${JSON.stringify(slot.uri)},${size})`)
  await assert.rejects(
    b.request('entries.addAttachment', { handle: slot.handle, title: 'Wrong owner', body: '' }),
    { code: 'INVALID_TRANSFER' }
  )
  const payload = {
    handle: slot.handle,
    title: 'Backend attachment verification',
    body: 'Temporary Phase 11B.1 test entry.'
  }
  const saved = await a.request('entries.addAttachment', payload)
  assert.equal((await a.request('entries.addAttachment', payload)).alreadyRecorded, true)
  for (const p of peers) {
    await until(async () =>
      (await p.request('entries.list')).entries.some((e) => e.id === saved.entry.id)
    )
    const file = await p.request('attachments.get', { entryId: saved.entry.id })
    assert.equal(file.attachment.digest, meta.digest)
    await p.evaluate(
      `globalThis.__fileCheck=null;__relayAttachmentFiles.verify(${JSON.stringify(file.uri)},${size}).then(value=>{globalThis.__fileCheck={value}},error=>{globalThis.__fileCheck={error:String(error)}});true`
    )
    const check = await until(async () =>
      JSON.parse(await p.evaluate('JSON.stringify(globalThis.__fileCheck)'))
    )
    assert.equal(check.value?.matched, true)
    await p.request('attachments.release', { handle: file.handle })
  }
  await assert.rejects(c.request('attachments.stage', meta), { code: 'READ_ONLY' })
  await assert.rejects(c.request('entries.addAttachment', payload), { code: 'READ_ONLY' })
  const plain = await b.request('entries.add', {
    title: 'Concurrent backend observation',
    body: ''
  })
  await b.request('entries.acknowledge', { entryId: saved.entry.id })
  await until(async () =>
    (await c.request('entries.list')).acknowledgments.some((x) => x.entryId === saved.entry.id)
  )
  await b.request('entries.remove', { id: plain.id })
  await a.request('entries.remove', { id: saved.entry.id })
  for (const p of peers) {
    await until(async () => {
      const s = await p.request('entries.list')
      return !s.entries.some((e) => e.id === saved.entry.id || e.id === plain.id)
    })
    const after = await p.request('entries.list')
    assert.deepEqual(after.entries, p.before.entries)
    assert.deepEqual(after.acknowledgments, p.before.acknowledgments)
  }
  console.log(
    JSON.stringify(
      {
        passed: true,
        scope:
          'three independent Android debug peers; 1MiB content compared byte-for-byte on each device',
        checks: [
          'controlled staging',
          'cross-peer handle rejection',
          'duplicate creation',
          'binary retrieval on A/B/Viewer C',
          'Viewer worker rejection',
          'entry/ack operations',
          'deletion and original snapshot restoration'
        ],
        digest: meta.digest,
        originalEntryCounts: peers.map((p) => p.before.entries.length)
      },
      null,
      2
    )
  )
} finally {
  for (const p of peers) p.close()
}
