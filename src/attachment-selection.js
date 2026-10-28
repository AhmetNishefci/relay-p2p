const { isSelectionMetadata, MAX_ATTACHMENT_BYTES } = require('../shared/attachment')
const MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain']
const extensions = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  txt: 'text/plain'
}
function selectionOf(asset) {
  if (!asset || typeof asset.uri !== 'string' || !/^(file|content):\/\//.test(asset.uri)) {
    throw new Error('The selected document cannot be accessed. Choose a local file.')
  }
  if (!Number.isSafeInteger(asset.size) || asset.size < 0) {
    throw new Error('File size is unavailable. Choose a file whose size can be checked.')
  }
  if (asset.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Choose a file no larger than 1 MiB (1,048,576 bytes).')
  }
  const filename = asset.name
  if (
    typeof filename !== 'string' ||
    (asset.mimeType !== null && asset.mimeType !== undefined && typeof asset.mimeType !== 'string')
  ) {
    throw new Error('The file information is invalid. Choose another document.')
  }
  let mimeType = asset.mimeType?.toLowerCase()
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg'
  if (!mimeType || mimeType === 'application/octet-stream') {
    mimeType = extensions[filename?.split('.').pop()?.toLowerCase()]
  }
  const selected = { uri: asset.uri, filename, mimeType, size: asset.size }
  if (!isSelectionMetadata(selected)) {
    throw new Error('Choose a JPEG, PNG, PDF or plain-text file with a valid filename.')
  }
  return selected
}
function fileSize(size) {
  return size < 1024
    ? `${size} B`
    : size < 1048576
      ? `${(size / 1024).toFixed(size % 1024 ? 1 : 0)} KiB`
      : '1 MiB'
}
function fileType(mimeType) {
  return (
    {
      'image/jpeg': 'JPEG image',
      'image/png': 'PNG image',
      'application/pdf': 'PDF document',
      'text/plain': 'Plain text'
    }[mimeType] || mimeType
  )
}
module.exports = { selectionOf, fileSize, fileType, MIME_TYPES }
