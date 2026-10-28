// Explicit debug diagnostic entry; never imported by the product.
import { requireNativeModule } from 'expo-modules-core'
const native = requireNativeModule('FileSystem')
globalThis.__relayAttachmentFiles = {
  write(uri, size) {
    const file = new native.FileSystemFile(uri)
    file.create({ overwrite: false })
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i++) bytes[i] = i % 251
    file.write(bytes)
    return { size: file.size }
  },
  async verify(uri, size) {
    const file = new native.FileSystemFile(uri)
    const bytes = await file.bytes()
    if (bytes.length !== size) throw new Error('SIZE_MISMATCH')
    for (let i = 0; i < size; i++) {
      if (bytes[i] !== i % 251) throw new Error('BYTE_MISMATCH')
    }
    return { size, matched: true }
  }
}
