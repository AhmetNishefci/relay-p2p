const MAX_ATTACHMENT_BYTES = 1048576
const MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain']
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const handle = (value) => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
function isFileMetadata(value) {
  return (
    object(value) &&
    typeof value.filename === 'string' &&
    value.filename.length > 0 &&
    value.filename.length <= 120 &&
    value.filename === value.filename.trim() &&
    !/[/\\\u0000-\u001f\u007f]/.test(value.filename) &&
    !['.', '..'].includes(value.filename) &&
    MIME_TYPES.includes(value.mimeType) &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0 &&
    value.size <= MAX_ATTACHMENT_BYTES &&
    digest(value.digest)
  )
}
function isSelectionMetadata(value) {
  return (
    object(value) &&
    isFileMetadata({ ...value, digest: value.digest === undefined ? '0'.repeat(64) : value.digest })
  )
}
function isAttachment(value, entryId) {
  return (
    isFileMetadata(value) &&
    value.schemaVersion === 1 &&
    handle(entryId) &&
    value.key === `attachment:${entryId}:${value.digest}` &&
    Object.keys(value).every((key) =>
      ['schemaVersion', 'key', 'filename', 'mimeType', 'size', 'digest'].includes(key)
    )
  )
}
module.exports = {
  MAX_ATTACHMENT_BYTES,
  isFileMetadata,
  isSelectionMetadata,
  isAttachment,
  isHandle: handle
}
