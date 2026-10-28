const {
  VERSION,
  Fault,
  parseJSON,
  validateServerMessage,
  isResult
} = require('../../shared/protocol')

class WorkerClient {
  constructor(write) {
    this.write = write
    this.nextId = 0
    this.pending = new Map()
    this.listeners = new Set()
    this.closed = false
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(event) {
    for (const listener of this.listeners) listener(event)
  }

  request(op, payload, timeoutMs = 10_000) {
    if (this.closed) {
      return Promise.reject(new Fault('DISCONNECTED', 'Worker disconnected. Restart the app.'))
    }
    const id = String(++this.nextId)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Fault('TIMEOUT', 'Worker timed out. Outcome unknown; refresh before retrying.'))
      }, timeoutMs)
      this.pending.set(id, { op, resolve, reject, timer })
      try {
        this.write(JSON.stringify({ v: VERSION, type: 'request', id, op, payload }))
      } catch {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new Fault('DISCONNECTED', 'Could not send to worker. Restart the app.'))
      }
    })
  }

  receive(raw) {
    let message
    try {
      message = parseJSON(raw)
      if (!validateServerMessage(message)) throw new Error('Invalid response')
    } catch {
      this.notify({
        v: VERSION,
        type: 'event',
        event: 'error',
        payload: {
          code: 'INVALID_RESPONSE',
          message: 'Worker sent an invalid response.'
        }
      })
      return
    }
    if (message.type === 'event') return this.notify(message)
    if (message.id === null) {
      if (!message.ok) {
        this.notify({ v: VERSION, type: 'event', event: 'error', payload: message.error })
      }
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return // Late or duplicate response; never resolve another request.
    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    if (!message.ok) pending.reject(new Fault(message.error.code, message.error.message))
    else if (!isResult(pending.op, message.result)) {
      pending.reject(new Fault('INVALID_RESPONSE', 'Worker returned an invalid operation result.'))
    } else pending.resolve(message.result)
  }

  close() {
    if (this.closed) return
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Fault('DISCONNECTED', 'Worker disconnected. Restart the app.'))
    }
    this.pending.clear()
    this.notify({
      v: VERSION,
      type: 'event',
      event: 'error',
      payload: {
        code: 'DISCONNECTED',
        message: 'Worker disconnected. Restart the app.'
      }
    })
    this.listeners.clear()
  }
}

// One in-flight list, plus one dirty bit. An update during a read schedules another
// read after completion; an older response can never replace a newer response.
function createListRefresher(load, onValue, onError) {
  let running = false
  let dirty = false
  let closed = false
  async function refresh() {
    if (closed) return
    if (running) {
      dirty = true
      return
    }
    running = true
    do {
      dirty = false
      try {
        const value = await load()
        if (!closed) onValue(value)
      } catch (error) {
        if (!closed) onError(error)
      }
    } while (dirty && !closed)
    running = false
  }
  return {
    refresh,
    close() {
      closed = true
    }
  }
}

module.exports = { WorkerClient, createListRefresher }
