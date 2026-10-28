const fs = require('fs').promises
const path = require('path')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')

const MAX_FILE_BYTES = 1024 * 1024
const TOKEN = /^[a-f0-9]{32}$/
const DIGEST = /^[a-f0-9]{64}$/

function failure(code) {
  return Object.assign(new Error(code), { code })
}

// Root is trusted application configuration, never a request-supplied path.
// Product IPC exposes only service-owned handles, never a caller-supplied root.
class FileStaging {
  constructor(root) {
    this.root = path.resolve(root)
    this.slots = new Set()
    this.reserving = 0
  }

  async reserve() {
    if (this.slots.size + this.reserving >= 2) throw failure('STAGING_BUSY')
    this.reserving++
    try {
      await fs.mkdir(this.root, { recursive: true, mode: 0o700 })
      const rootStat = await fs.lstat(this.root)
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw failure('UNSAFE_STAGING')
      const token = crypto.randomBytes(16).toString('hex')
      const directory = path.join(this.root, token)
      await fs.mkdir(directory, { mode: 0o700 })
      this.slots.add(token)
      return { token, input: path.join(directory, 'input.bin') }
    } finally {
      this.reserving--
    }
  }

  directory(token) {
    if (typeof token !== 'string' || !TOKEN.test(token) || !this.slots.has(token)) {
      throw failure('INVALID_TRANSFER')
    }
    return path.join(this.root, token)
  }

  async read(token, expectedDigest) {
    if (typeof expectedDigest !== 'string' || !DIGEST.test(expectedDigest)) {
      throw failure('INVALID_DIGEST')
    }
    const directory = this.directory(token)
    if ((await fs.lstat(directory)).isSymbolicLink()) throw failure('UNSAFE_STAGING')
    const filename = path.join(directory, 'input.bin')
    const stat = await fs.lstat(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) throw failure('UNSAFE_FILE')
    if (stat.size > MAX_FILE_BYTES) throw failure('FILE_TOO_LARGE')
    const handle = await fs.open(filename, 'r')
    let bytes
    try {
      const opened = await handle.stat()
      if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev) {
        throw failure('UNSAFE_FILE')
      }
      if (opened.size > MAX_FILE_BYTES) throw failure('FILE_TOO_LARGE')
      // A fixed upper bound also detects growth without an unbounded readFile().
      const buffer = b4a.alloc(opened.size + 1)
      let length = 0
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
        if (!bytesRead) break
        length += bytesRead
      }
      if (length !== opened.size) throw failure('FILE_CHANGED')
      bytes = buffer.subarray(0, length)
    } finally {
      await handle.close()
    }
    const digest = crypto.hash(bytes).toString('hex')
    if (digest !== expectedDigest) throw failure('INTEGRITY_MISMATCH')
    return bytes
  }

  async write(token, bytes) {
    if (bytes.length > MAX_FILE_BYTES) throw failure('FILE_TOO_LARGE')
    const output = path.join(this.directory(token), 'output.bin')
    await fs.writeFile(output, bytes, { flag: 'wx', mode: 0o600 })
    return output
  }

  async inspect(token, expectedDigest) {
    const bytes = await this.read(token, expectedDigest)
    const output = await this.write(token, bytes)
    return { size: bytes.length, digest: expectedDigest, output }
  }

  async remove(token) {
    const directory = this.directory(token)
    await fs.rm(directory, { recursive: true, force: true })
    this.slots.delete(token)
  }

  async close() {
    for (const token of [...this.slots]) await this.remove(token)
  }
}

module.exports = { FileStaging, MAX_FILE_BYTES }
