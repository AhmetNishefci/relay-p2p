// Pinned Autopass 3.4.1 / HyperDB 4.22.3 internal integration.
// Autopass.list(opts) ignores opts and decodes inline files. Never fall back to it.
async function* notebookRecords(pass) {
  const snapshot = pass.base.view.snapshot()
  try {
    for (const prefix of ['ack:', 'entry:']) {
      const stream = snapshot.find('@autopass/records', {
        gte: { key: prefix },
        lt: { key: prefix.slice(0, -1) + ';' }
      })
      for await (const record of stream) yield record
    }
  } finally {
    await snapshot.close()
  }
}

module.exports = { notebookRecords }
