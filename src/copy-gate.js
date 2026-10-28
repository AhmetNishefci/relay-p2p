// Timeout bounds the caller, not native I/O. Keep one lane until actual settlement.
function createCopyGate(copy, remove, timeoutMs = 15000) {
  let active = null
  return async function (from, to) {
    if (active) {
      throw new Error('A previous file copy is still running. Try again later or restart Relay.')
    }
    let expired = false
    let timer
    const task = Promise.resolve().then(() => copy(from, to))
    active = task
    const settle = async () => {
      try {
        if (expired) await remove(to)
      } finally {
        if (active === task) active = null
      }
    }
    task.then(settle, settle).catch(() => console.warn('[relay] Late file copy cleanup failed.'))
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        expired = true
        reject(
          new Error(
            'File copy timed out. It may still be running; choose a local document or try again later.'
          )
        )
      }, timeoutMs)
    })
    try {
      return await Promise.race([task, deadline])
    } finally {
      clearTimeout(timer)
    }
  }
}
module.exports = { createCopyGate }
