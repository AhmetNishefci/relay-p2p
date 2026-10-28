const {
  VERSION,
  parseJSON,
  serializeMessage,
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

// Encode exactly once. If the operation completed but its result cannot cross IPC,
// return a correlated ambiguous-outcome error rather than crashing or replaying it.
function encodeResponse(response) {
  try {
    return serializeMessage(response)
  } catch {
    return serializeMessage({
      v: VERSION,
      type: 'response',
      id: requestId(response.id) ? response.id : null,
      ok: false,
      error: {
        code: 'RESPONSE_UNAVAILABLE',
        message:
          'The response could not be returned. Refresh before retrying; a change may already be recorded.'
      }
    })
  }
}

module.exports = { handleRequest, encodeResponse }
