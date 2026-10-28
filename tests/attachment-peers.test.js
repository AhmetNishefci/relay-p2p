const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const testnet = require('hyperdht/testnet')
const crypto = require('hypercore-crypto')
const { Library } = require('../workers/library')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(30)
  }
  assert.fail('Peer state did not converge within bounded wait')
}

test(
  'real three-peer attachment bytes replicate to Contributor/Viewer, persist and reconnect',
  { timeout: 120000 },
  async (t) => {
    const net = await testnet(10)
    t.after(() => net.destroy())
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-file-peers-'))
    const opened = []
    t.after(async () => {
      for (const p of opened.reverse()) await p.close()
      await fs.rm(root, { recursive: true, force: true })
    })
    async function open(name) {
      const p = new Library(path.join(root, name), { bootstrap: net.bootstrap })
      opened.push(p)
      await p.ready
      return p
    }
    const a = await open('a')
    await a.run('notebook.create', {})
    const b = await open('b')
    await b.run('pair.start', {
      invite: (await a.run('invite.create', { readOnly: false })).invite
    })
    await until(() => b.status().state === 'ready')
    const bytes = Buffer.alloc(1048576, 0x73)
    async function add() {
      const stage = await a.run('attachments.stage', {
        filename: 'replicated.txt',
        mimeType: 'text/plain',
        size: bytes.length,
        digest: crypto.hash(bytes).toString('hex')
      })
      await fs.writeFile(fileURLToPath(stage.uri), bytes)
      return (
        await a.run('entries.addAttachment', {
          handle: stage.handle,
          title: 'Replicated file',
          body: ''
        })
      ).entry
    }
    async function verify(peer, entry) {
      await until(async () =>
        (await peer.run('entries.list', {})).entries.some((x) => x.id === entry.id)
      )
      const result = await peer.run('attachments.get', { entryId: entry.id })
      assert.deepEqual(await fs.readFile(fileURLToPath(result.uri)), bytes)
      await peer.run('attachments.release', { handle: result.handle })
    }
    const entry = await add()
    await verify(b, entry)
    const c = await open('c')
    await c.run('pair.start', { invite: (await a.run('invite.create', { readOnly: true })).invite })
    await until(() => c.status().state === 'ready')
    await verify(c, entry)
    await assert.rejects(
      c.run('attachments.stage', {
        filename: 'blocked.txt',
        mimeType: 'text/plain',
        size: 0,
        digest: crypto.hash(Buffer.alloc(0)).toString('hex')
      }),
      { code: 'READ_ONLY' }
    )
    await assert.rejects(
      c.run('entries.addAttachment', { handle: 'f'.repeat(32), title: 'Blocked', body: '' }),
      { code: 'READ_ONLY' }
    )
    await b.close()
    const offline = await add()
    await verify(c, offline)
    const resumed = await open('b')
    await verify(resumed, entry)
    await verify(resumed, offline)
    await a.run('entries.remove', { id: entry.id })
    await until(
      async () => !(await resumed.run('entries.list', {})).entries.some((x) => x.id === entry.id)
    )
    await assert.rejects(resumed.run('attachments.get', { entryId: entry.id }), {
      code: 'ATTACHMENT_MISSING'
    })
    assert.ok(
      await a.notebook.pass.get(entry.attachment.key),
      'binary retained after entry removal'
    )
  }
)
