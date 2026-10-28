// Standalone diagnostic worklet: no Autopass, Corestore or product IPC access.
const FramedStream = require('framed-stream')
const path = require('bare-path')
const storage = require('bare-storage')
const { FileStaging } = require('../../workers/file-staging')
const stage = new FileStaging(path.join(storage.ephemeral(), 'relay-staging-probe'))
const pipe = new FramedStream(Bare.IPC)
let queue = Promise.resolve()
pipe.on('data', (raw) => {
  queue = queue
    .then(async () => {
      let id = null
      try {
        if (raw.byteLength > 1024) throw new Error('INVALID_MESSAGE')
        const message = JSON.parse(raw.toString())
        id = message.id
        if (!Number.isSafeInteger(id)) throw new Error('INVALID_MESSAGE')
        const { op, token, digest } = message
        let result
        if (op === 'reserve') result = await stage.reserve()
        else if (op === 'inspect') result = await stage.inspect(token, digest)
        else if (op === 'remove') {
          await stage.remove(token)
          result = { removed: true }
        } else if (op === 'close') {
          await stage.close()
          result = { closed: true }
        } else throw new Error('UNKNOWN_OPERATION')
        pipe.write(JSON.stringify({ id, result }))
      } catch (error) {
        pipe.write(JSON.stringify({ id, error: error.code || 'PROBE_FAILED' }))
      }
    })
    .catch((error) => console.error('[staging-probe]', error))
})
pipe.on('close', () => stage.close().catch(console.error))
pipe.on('error', () => stage.close().catch(console.error))
