import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { File } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { createCopyGate } from './copy-gate'
import { MIME_TYPES, selectionOf } from './attachment-selection'
import type { SelectedFile } from './attachment-selection'
import type { Attachment } from '../shared/protocol'
import { getWorkerSession } from './worker/runtime'

let serial = 0
const copyFile = createCopyGate(async (from, to) => {
  try {
    await FileSystem.copyAsync({ from, to })
  } catch {
    throw new Error('Could not copy this file. Check document access and available storage.')
  }
}, removeCached)
async function ensureDirectory(uri: string) {
  try {
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true })
  } catch {
    throw new Error('Could not prepare private file storage. Check available space and try again.')
  }
}
function cacheRoot() {
  if (!FileSystem.cacheDirectory) throw new Error('Private file storage is unavailable.')
  return FileSystem.cacheDirectory + 'relay-files/'
}
export async function removeCached(uri: string) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true })
  } catch {
    console.warn('[relay] Temporary file cleanup failed; the private cache may retain a copy.')
  }
}
export async function cleanupAttachmentCache() {
  const root = cacheRoot()
  await ensureDirectory(root)
  for (const name of await FileSystem.readDirectoryAsync(root)) {
    if (!/^(selection-[0-9-]+\.bin|share-([a-f0-9]{32}|[0-9-]+))$/.test(name)) continue
    const info = await FileSystem.getInfoAsync(root + name)
    if (
      info.exists &&
      info.modificationTime &&
      info.modificationTime * 1000 < Date.now() - 86400000
    ) {
      await removeCached(root + name)
    }
  }
}
export async function selectAttachment(): Promise<SelectedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: MIME_TYPES,
    multiple: false,
    copyToCacheDirectory: false
  })
  if (result.canceled) return null
  const selected = selectionOf(result.assets[0])
  const root = cacheRoot()
  await ensureDirectory(root)
  const uri = `${root}selection-${Date.now()}-${++serial}.bin`
  try {
    await copyFile(selected.uri, uri)
    if (new File(uri).size !== selected.size) {
      throw new Error('The file size changed while copying. Select it again.')
    }
    return { ...selected, uri }
  } catch (error) {
    await removeCached(uri)
    if (
      error instanceof Error &&
      (error.message.startsWith('The file size changed') ||
        error.message.startsWith('File copy timed out') ||
        error.message.startsWith('A previous file copy'))
    ) {
      throw error
    }
    throw new Error(
      'Could not read the selected document. Choose a local file or check provider access.'
    )
  }
}
export async function releaseAttachment(handle: string) {
  try {
    await getWorkerSession().client.request('attachments.release', { handle })
  } catch {
    console.warn('[relay] Temporary attachment release failed; worker expiry will retry cleanup.')
  }
}
export async function prepareAttachment(selected: SelectedFile) {
  const source = new File(selected.uri)
  if (!source.exists || source.size !== selected.size || selected.size > 1048576) {
    throw new Error('The selected file changed or is unavailable. Select it again.')
  }
  const { filename, mimeType, size } = selected
  const stage = await getWorkerSession().client.request('attachments.stage', {
    filename,
    mimeType,
    size
  })
  try {
    await copyFile(selected.uri, stage.uri)
    await getWorkerSession().client.request('attachments.seal', { handle: stage.handle })
    return stage
  } catch (error) {
    void releaseAttachment(stage.handle)
    throw error
  }
}

// Keep a separate share copy because a receiver can read after the chooser closes.
// The short worker export can then be released without revoking the recipient URI.
export async function shareAttachment(
  entryId: string,
  attachment: Attachment,
  active: () => boolean,
  prepared: () => void
) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device.')
  }
  const client = getWorkerSession().client
  const retrieved = await client.request('attachments.get', { entryId })
  let directory: string | null = null
  let handedToSystem = false
  try {
    if (!active()) return
    if (
      retrieved.attachment.digest !== attachment.digest ||
      retrieved.attachment.key !== attachment.key
    ) {
      throw new Error('Attachment changed. Refresh the entry before opening it.')
    }
    directory = `${cacheRoot()}share-${retrieved.handle}/`
    await ensureDirectory(directory)
    const uri = directory + encodeURIComponent(attachment.filename)
    await copyFile(retrieved.uri, uri)
    if (!active()) return
    prepared()
    handedToSystem = true
    try {
      await Sharing.shareAsync(uri, {
        mimeType: attachment.mimeType,
        dialogTitle: 'Open or share attachment'
      })
    } catch {
      throw new Error('The sharing sheet could not open. Check available apps and try again.')
    }
  } finally {
    void releaseAttachment(retrieved.handle)
    if (directory && !handedToSystem) await removeCached(directory)
  }
}
