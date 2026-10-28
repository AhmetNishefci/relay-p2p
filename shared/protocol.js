const VERSION = 1
const MAX_MESSAGE_LENGTH = 2_000_000
const MAX_ENTRIES = 200
const ID = /^[a-f0-9]{32}$/

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

function parseJSON(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_LENGTH) {
    throw new Fault('INVALID_MESSAGE', 'Message is too large or is not text.')
  }
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
      if (fields(payload, []) && Object.keys(payload).length === 0) return value
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
    value.createdAt >= 0
  )
}

function isStatus(value) {
  return (
    object(value) &&
    ['starting', 'ready', 'failed', 'closed'].includes(value.state) &&
    typeof value.writable === 'boolean'
  )
}

function isResult(op, value) {
  if (op === 'status') return isStatus(value)
  if (op === 'entries.add') return isEntry(value)
  if (op === 'entries.remove') return object(value) && entryId(value.id) && value.removed === true
  return (
    op === 'entries.list' &&
    object(value) &&
    Array.isArray(value.entries) &&
    value.entries.length <= MAX_ENTRIES &&
    value.entries.every(isEntry) &&
    Number.isSafeInteger(value.skipped) &&
    value.skipped >= 0
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
  MAX_ENTRIES,
  Fault,
  parseJSON,
  validateRequest,
  requestId,
  isEntry,
  isResult,
  validateServerMessage,
  publicError
}
