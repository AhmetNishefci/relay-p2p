const {
  VERSION,
  parseJSON,
  validateRequest,
  requestId,
  publicError
} = require('../shared/protocol')

// Handles application frames only. Pear controls are routed by main.js first.
async function handleRequest(raw, notebook) {
  let id = null
  try {
    const value = parseJSON(raw)
    if (value && requestId(value.id)) id = value.id
    const request = validateRequest(value)
    const result = await notebook.run(request.op, request.payload)
    return { v: VERSION, type: 'response', id, ok: true, result }
  } catch (error) {
    const safe = publicError(error)
    if (safe.code === 'STORAGE_ERROR') console.error('[relay] Request failed:', error)
    return { v: VERSION, type: 'response', id, ok: false, error: safe }
  }
}

module.exports = { handleRequest }
