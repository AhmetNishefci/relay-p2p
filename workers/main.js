const PearRuntime = require('pear-mobile') // pear-runtime on desktop; pear-mobile on mobile
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const path = require('bare-path')
const dir = require('bare-storage')
const { isBareKit } = require('which-runtime')
const { Library } = require('./library')
const { handleRequest } = require('./requests')
const { publicError } = require('../shared/protocol')

// mobile doesn't have the executable path (argv[0])
// and the worker entry path (argv[1]) in the workers argv‘s
// ... to reuse the same worker in all platforms this logic is needed
const argv = (index) => Bare.argv[index + (isBareKit ? 0 : 2)]

const updaterConfig = {
  updates: argv(0) !== 'false',
  version: argv(1),
  upgrade: argv(2),
  name: argv(3),
  dir: argv(4) || dir.persistent(), // argv[4] is undefined in mobile
  app: argv(5) // argv[5] is undefined in mobile
}

const pipe = new FramedStream(Bare.IPC)
const store = new Corestore(path.join(updaterConfig.dir, 'pear-runtime', 'corestore'))
const swarm = new Hyperswarm()
const pear = new PearRuntime({ ...updaterConfig, swarm, store })

pear.updater.on('error', console.error)
if (updaterConfig.updates !== false) {
  swarm.on('connection', (connection) => store.replicate(connection))
  swarm.join(pear.updater.drive.core.discoveryKey, {
    client: true,
    server: false
  })
}

console.log('Application storage:', pear.storage)

pear.updater.on('updating', () => pipe.write('updating'))
pear.updater.on('updated', () => pipe.write('updated'))
pear.on('minver-required', () => pipe.write('minver-required')) // for mobile store update notification

const send = (message) => {
  if (!pipe.destroying) pipe.write(JSON.stringify(message))
}
const notebook = new Library(path.join(pear.storage, 'relay'), {
  onChanged: () => send({ v: 1, type: 'event', event: 'changed', payload: null }),
  onState: (status) => send({ v: 1, type: 'event', event: 'ready', payload: status }),
  onError: (error) =>
    send({
      v: 1,
      type: 'event',
      event: 'error',
      payload: error
    })
})
notebook.ready
  .then(() => {
    send({ v: 1, type: 'event', event: 'ready', payload: notebook.status() })
  })
  .catch((error) => {
    send({
      v: 1,
      type: 'event',
      event: 'error',
      payload: publicError(error)
    })
  })

let shutdown = null
function cleanup() {
  if (shutdown) return shutdown
  shutdown = (async () => {
    // Attempt every cleanup even if one resource fails; retain the template resources.
    for (const close of [
      () => notebook.close(),
      () => swarm.destroy(),
      () => pear.close(),
      () => store.close()
    ]) {
      try {
        await close()
      } catch (error) {
        console.error('[relay] Cleanup failed:', error)
      }
    }
  })()
  return shutdown
}
goodbye(cleanup)
pipe.on('close', () => {
  cleanup().catch(console.error)
})
pipe.on('error', (error) => {
  console.error('[relay] IPC failed:', error)
})

pipe.on('data', async (data) => {
  const message = data.toString()
  if (message === 'pear:applyUpdate') {
    try {
      await pear.ready()
      await pear.updater.applyUpdate()
      pipe.write('pear:updateApplied')
    } catch (error) {
      console.error('[relay] Pear update failed:', error)
      pipe.write('pear:updateFailed Update failed. Restart the app before retrying.')
    }
  } else {
    send(await handleRequest(message, notebook))
  }
})

pipe.write('Hello from worker')
