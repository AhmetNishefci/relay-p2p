// Explicit diagnostic entry, loaded through Metro only by the Android probe driver.
// Never imported by the product. Uses an already installed Expo native module.
import { requireNativeModule } from 'expo-modules-core'
import { Worklet } from 'react-native-bare-kit'
import FramedStream from 'framed-stream'
import b4a from 'b4a'

export async function runStagingProof(bundle, cases) {
  const native = requireNativeModule('FileSystem')
  const worklet = new Worklet()
  const pending = new Map()
  let id = 0
  worklet.start('/staging-probe.bundle', bundle)
  const pipe = new FramedStream(worklet.IPC)
  const request = (op, payload = {}) =>
    new Promise((resolve, reject) => {
      const seq = ++id
      const timer = setTimeout(() => {
        pending.delete(seq)
        reject(new Error('PROBE_TIMEOUT'))
      }, 10000)
      pending.set(seq, { resolve, reject, timer })
      pipe.write(JSON.stringify({ id: seq, op, ...payload }))
    })
  pipe.on('data', (raw) => {
    const message = JSON.parse(b4a.toString(raw))
    const waiting = pending.get(message.id)
    if (!waiting) return
    pending.delete(message.id)
    clearTimeout(waiting.timer)
    if (message.error) waiting.reject(new Error(message.error))
    else waiting.resolve(message.result)
  })
  pipe.on('error', () => {
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timer)
      waiting.reject(new Error('PROBE_DISCONNECTED'))
    }
    pending.clear()
  })
  const results = []
  try {
    for (const { size, digest } of cases) {
      const slot = await request('reserve')
      try {
        const file = new native.FileSystemFile('file://' + slot.input)
        file.create({ overwrite: false })
        const bytes = new Uint8Array(size)
        for (let i = 0; i < size; i++) bytes[i] = i % 251
        file.write(bytes)
        const result = await request('inspect', { token: slot.token, digest })
        const output = new native.FileSystemFile('file://' + result.output)
        const returned = await output.bytes()
        if (returned.length !== size) throw new Error('SIZE_MISMATCH')
        for (let i = 0; i < size; i++) {
          if (returned[i] !== bytes[i]) throw new Error('BYTE_MISMATCH')
        }
        results.push({ size, digest: result.digest, input: slot.input, output: result.output })
      } catch (error) {
        if (size !== 1048577 || error.message !== 'FILE_TOO_LARGE') throw error
        results.push({ size, rejected: error.message, input: slot.input })
      } finally {
        await request('remove', { token: slot.token })
        if (new native.FileSystemFile('file://' + slot.input).exists) {
          throw new Error('CLEANUP_FAILED')
        }
      }
    }
    for (const token of ['../escape', '/etc/passwd']) {
      let rejected = false
      try {
        await request('inspect', { token, digest: 'a'.repeat(64) })
      } catch (error) {
        if (error.message !== 'INVALID_TRANSFER') throw error
        rejected = true
      }
      if (!rejected) throw new Error('UNSAFE_PATH_ACCEPTED')
    }
    return { passed: true, results, pathValidation: true, cleanup: true }
  } finally {
    try {
      await request('close')
    } finally {
      pipe.destroy()
      worklet.terminate()
    }
  }
}

globalThis.__relayStagingProof = runStagingProof
