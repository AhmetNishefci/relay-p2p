/* global __DEV__ */
import PearRuntime from 'pear-mobile'
import FramedStream from 'framed-stream'
import b4a from 'b4a'
import bundle from '../worker.bundle.js'
import { version, upgrade, name, productName } from '../../package.json'
import { WorkerClient } from './client'

type Session = {
  client: WorkerClient
  writeControl: (message: string) => void
  subscribeControl: (fn: (message: string) => void) => () => void
}
const lifetime = globalThis as typeof globalThis & { __relaySession?: Session }

export function getWorkerSession(): Session {
  if (lifetime.__relaySession) return lifetime.__relaySession
  const ipc = PearRuntime.run('/worker.bundle', bundle, [
    (!__DEV__).toString(),
    version,
    upgrade,
    productName ?? name
  ])
  const pipe = new FramedStream(ipc)
  const controls = new Set<(message: string) => void>()
  const client = new WorkerClient((raw) => pipe.write(raw))
  pipe.on('data', (data) => {
    const raw = b4a.toString(data)
    if (
      raw === 'Hello from worker' ||
      raw === 'updating' ||
      raw === 'updated' ||
      raw === 'minver-required' ||
      raw.startsWith('pear:')
    ) {
      for (const fn of controls) fn(raw)
    } else client.receive(raw)
  })
  pipe.on('error', () => client.close())
  pipe.on('close', () => client.close())
  lifetime.__relaySession = {
    client,
    writeControl: (message) => pipe.write(message),
    subscribeControl(fn) {
      controls.add(fn)
      return () => {
        controls.delete(fn)
      }
    }
  }
  return lifetime.__relaySession
}
