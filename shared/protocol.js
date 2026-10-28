const b4a = require('b4a')
const { isFileMetadata, isAttachment, isHandle } = require('./attachment')

const VERSION = 1
const MAX_MESSAGE_LENGTH = 2_000_000
// Preserve the existing 1.5M-character snapshot budget, including worst-case
// three-byte UTF-8 code units, with room for the response envelope/array separators.
const MAX_MESSAGE_BYTES = 4_600_000
const MAX_ENTRIES = 200
const MAX_ACKNOWLEDGMENTS = 1000
const ID = /^[a-f0-9]{32}$/
const WRITER_KEY = /^[a-f0-9]{64}$/

class Fault extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const requestId = (value) => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,80}$/.test(value)
const entryId = (value) => typeof value === 'string' && ID.test(value)
const fields = (value, names) =>
  object(value) && Object.keys(value).every((key) => names.includes(key))
const text = (value, max) => typeof value === 'string' && value.length <= max

function validateSerialized(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_LENGTH) {
    throw new Fault('INVALID_MESSAGE', 'Message is too large or is not text.')
  }
  // Every UTF-16 code unit needs at most three UTF-8 bytes. Normal-sized frames
  // can skip a second linear scan; near the ceiling we measure the actual bytes.
  if (raw.length * 3 > MAX_MESSAGE_BYTES && b4a.byteLength(raw) > MAX_MESSAGE_BYTES) {
    throw new Fault('INVALID_MESSAGE', 'Message exceeds the serialized byte budget.')
  }
}

function serializeMessage(value) {
  let raw
  try {
    raw = JSON.stringify(value)
  } catch {
    throw new Fault('INVALID_MESSAGE', 'Message must be serializable JSON.')
  }
  validateSerialized(raw)
  return raw
}

function parseJSON(raw) {
  validateSerialized(raw)
  try {
    return JSON.parse(raw)
  } catch {
    throw new Fault('INVALID_MESSAGE', 'Message must be valid JSON.')
  }
}

function validateRequest(value) {
  if (!object(value) || value.type !== 'request' || !requestId(value.id)) {
    throw new Fault('INVALID_MESSAGE', 'A request needs a valid type and request ID.')
  }
  if (value.v !== VERSION) throw new Fault('UNSUPPORTED_VERSION', 'Unsupported protocol version.')
  const payload = value.payload
  switch (value.op) {
    case 'status':
    case 'entries.list':
    case 'participants.list':
    case 'notebook.create':
    case 'invite.cancel':
    case 'pair.cancel':
      if (fields(payload, []) && Object.keys(payload).length === 0) return value
      break
    case 'invite.create':
      if (fields(payload, ['readOnly']) && typeof payload.readOnly === 'boolean') return value
      break
    case 'pair.start':
      if (
        fields(payload, ['invite', 'name']) &&
        text(payload.invite, 512) &&
        payload.invite.length > 0 &&
        (payload.name === undefined || text(payload.name, 80))
      ) {
        return value
      }
      break
    case 'attachments.stage':
      if (fields(payload, ['filename', 'mimeType', 'size', 'digest']) && isFileMetadata(payload)) {
        return value
      }
      break
    case 'attachments.release':
      if (fields(payload, ['handle']) && isHandle(payload.handle)) return value
      break
    case 'attachments.get':
      if (fields(payload, ['entryId']) && entryId(payload.entryId)) return value
      break
    case 'entries.addAttachment':
      if (
        fields(payload, ['handle', 'title', 'body']) &&
        isHandle(payload.handle) &&
        text(payload.title, 120) &&
        payload.title.trim().length > 0 &&
        text(payload.body, 8000)
      ) {
        return value
      }
      break
    case 'entries.add':
      if (
        fields(payload, ['title', 'body']) &&
        text(payload.title, 120) &&
        payload.title.trim().length > 0 &&
        text(payload.body, 8000)
      ) {
        return value
      }
      break
    case 'entries.remove':
      if (fields(payload, ['id']) && entryId(payload.id)) return value
      break
    case 'entries.acknowledge':
      if (fields(payload, ['entryId']) && entryId(payload.entryId)) return value
      break
    default:
      throw new Fault('UNKNOWN_OPERATION', 'Unknown operation.')
  }
  throw new Fault('INVALID_PAYLOAD', 'Invalid operation payload.')
}

function isEntry(value) {
  return (
    object(value) &&
    value.schemaVersion === 1 &&
    value.kind === 'entry' &&
    entryId(value.id) &&
    text(value.title, 120) &&
    value.title.trim().length > 0 &&
    text(value.body, 8000) &&
    Number.isSafeInteger(value.createdAt) &&
    value.createdAt >= 0 &&
    (value.attachment === undefined || isAttachment(value.attachment, value.id))
  )
}

function isAcknowledgment(value) {
  return (
    object(value) &&
    value.schemaVersion === 1 &&
    value.kind === 'ack' &&
    entryId(value.entryId) &&
    typeof value.writerKey === 'string' &&
    WRITER_KEY.test(value.writerKey) &&
    Number.isSafeInteger(value.acknowledgedAt) &&
    value.acknowledgedAt >= 0
  )
}

function isStatus(value) {
  return (
    object(value) &&
    ['starting', 'idle', 'joining', 'ready', 'failed', 'closed'].includes(value.state) &&
    typeof value.writable === 'boolean' &&
    (value.hasNotebook === undefined || typeof value.hasNotebook === 'boolean') &&
    (value.pairing === undefined ||
      ['idle', 'joining', 'cancelling', 'cancelled', 'failed'].includes(value.pairing)) &&
    (value.writerKey === undefined ||
      value.writerKey === null ||
      (typeof value.writerKey === 'string' && /^[a-f0-9]{64}$/.test(value.writerKey)))
  )
}

function isResult(op, value) {
  if (op === 'status' || op === 'notebook.create' || op === 'pair.start') return isStatus(value)
  if (op === 'invite.create') {
    return (
      object(value) &&
      text(value.invite, 512) &&
      value.invite.length > 0 &&
      typeof value.readOnly === 'boolean'
    )
  }
  if (op === 'invite.cancel' || op === 'pair.cancel') {
    return object(value) && value.cancelled === true
  }
  if (op === 'participants.list') {
    return (
      object(value) &&
      Array.isArray(value.participants) &&
      value.participants.length <= 101 &&
      value.participants.every(
        (p) =>
          object(p) &&
          typeof p.key === 'string' &&
          /^[a-f0-9]{64}$/.test(p.key) &&
          (p.name === null || text(p.name, 80)) &&
          typeof p.readOnly === 'boolean' &&
          typeof p.isLocal === 'boolean'
      )
    )
  }
  if (op === 'attachments.stage') {
    return (
      object(value) &&
      isHandle(value.handle) &&
      entryId(value.entryId) &&
      text(value.uri, 1024) &&
      value.uri.startsWith('file:///') &&
      Number.isSafeInteger(value.expiresAt)
    )
  }
  if (op === 'attachments.release') return object(value) && value.released === true
  if (op === 'attachments.get') {
    return (
      object(value) &&
      isHandle(value.handle) &&
      entryId(value.entryId) &&
      isAttachment(value.attachment, value.entryId) &&
      text(value.uri, 1024) &&
      value.uri.startsWith('file:///') &&
      Number.isSafeInteger(value.expiresAt)
    )
  }
  if (op === 'entries.addAttachment') {
    return (
      object(value) &&
      isEntry(value.entry) &&
      !!value.entry.attachment &&
      typeof value.alreadyRecorded === 'boolean'
    )
  }
  if (op === 'entries.add') return isEntry(value)
  if (op === 'entries.acknowledge') {
    return (
      object(value) &&
      isAcknowledgment(value.acknowledgment) &&
      typeof value.alreadyRecorded === 'boolean'
    )
  }
  if (op === 'entries.remove') return object(value) && entryId(value.id) && value.removed === true
  return (
    op === 'entries.list' &&
    object(value) &&
    Array.isArray(value.entries) &&
    value.entries.length <= MAX_ENTRIES &&
    value.entries.every(isEntry) &&
    Number.isSafeInteger(value.skipped) &&
    value.skipped >= 0 &&
    Array.isArray(value.acknowledgments) &&
    value.acknowledgments.length <= MAX_ACKNOWLEDGMENTS &&
    value.acknowledgments.every(isAcknowledgment) &&
    typeof value.localWriterKey === 'string' &&
    WRITER_KEY.test(value.localWriterKey) &&
    Number.isSafeInteger(value.skippedAcknowledgments) &&
    value.skippedAcknowledgments >= 0
  )
}

function isError(value) {
  return (
    object(value) &&
    typeof value.code === 'string' &&
    /^[A-Z_]{1,40}$/.test(value.code) &&
    text(value.message, 240)
  )
}

function validateServerMessage(value) {
  if (!object(value) || value.v !== VERSION) return false
  if (value.type === 'response') {
    return (
      (requestId(value.id) || value.id === null) &&
      (value.ok === true ? requestId(value.id) : value.ok === false && isError(value.error))
    )
  }
  if (value.type !== 'event') return false
  if (value.event === 'ready') return isStatus(value.payload)
  if (value.event === 'changed') return value.payload === null
  return value.event === 'error' && isError(value.payload)
}

function publicError(error) {
  return error instanceof Fault
    ? { code: error.code, message: error.message }
    : { code: 'STORAGE_ERROR', message: 'Storage operation failed. Refresh before retrying.' }
}

module.exports = {
  VERSION,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGE_BYTES,
  MAX_ENTRIES,
  MAX_ACKNOWLEDGMENTS,
  Fault,
  parseJSON,
  serializeMessage,
  validateRequest,
  requestId,
  isEntry,
  isAcknowledgment,
  isResult,
  validateServerMessage,
  publicError
}
