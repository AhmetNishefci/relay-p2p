async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Inspector connection timeout')), 8000)
    ws.onopen = () => {
      clearTimeout(timer)
      resolve()
    }
    ws.onerror = () => {
      clearTimeout(timer)
      reject(Error('Inspector connection failed'))
    }
  })
  let id = 0
  const pending = new Map()
  ws.onclose = () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.resolve({ error: 'Debugger socket closed' })
    }
    pending.clear()
  }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    const p = pending.get(m.id)
    if (p) {
      pending.delete(m.id)
      clearTimeout(p.timer)
      p.resolve(m)
    }
  }
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const seq = ++id
      const timer = setTimeout(() => {
        pending.delete(seq)
        reject(
          Error(
            'Inspector response timeout: ' + method + ' ' + (params.expression || '').slice(0, 70)
          )
        )
      }, 30000)
      pending.set(seq, { resolve, reject, timer })
      ws.send(JSON.stringify({ id: seq, method, params }))
    })
  async function evaluate(expression) {
    const m = await call('Runtime.evaluate', { expression, returnByValue: true })
    if (m.error || m.result?.exceptionDetails) {
      throw Error(
        'Inspector evaluation failed: ' + JSON.stringify(m.error || m.result.exceptionDetails)
      )
    }
    return m.result?.result?.value
  }
  return { evaluate, close: () => ws.close() }
}
export { connect }
