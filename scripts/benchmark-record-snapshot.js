// Node/V8 storage diagnostic, not Android latency or a peak-memory measurement.
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { Notebook } = require('../workers/notebook')
const { notebookRecords } = require('../workers/record-snapshot')

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-range-benchmark-'))
  const n = new Notebook(root, { replicate: false })
  try {
    await n.ready
    for (let i = 0; i < 100; i++) {
      await n.run('entries.add', { title: 'Observation ' + i, body: 'Field notes' })
    }
    for (let i = 0; i < 16; i++) {
      await n.pass.add('attachment:' + i, 'fixture', Buffer.alloc(1024 * 1024, i))
    }
    const collection = n.pass.base.view.definition.resolveCollection('@autopass/records')
    const original = collection.reconstruct
    let decodedFileBytes = 0
    collection.reconstruct = (...args) => {
      const row = original(...args)
      decodedFileBytes += row.file ? row.file.length : 0
      return row
    }
    const results = []
    for (const [label, read] of [
      ['unrestricted', () => n.pass.list()],
      ['range-snapshot', () => notebookRecords(n.pass)],
      [
        'normalized-snapshot',
        async function* () {
          yield await n.run('entries.list', {})
        }
      ]
    ]) {
      const timings = []
      const bytes = []
      for (let i = 0; i < 11; i++) {
        decodedFileBytes = 0
        const start = performance.now()
        for await (const row of read()) void row
        const elapsed = performance.now() - start
        if (i > 0) {
          timings.push(elapsed)
          bytes.push(decodedFileBytes)
        }
      }
      timings.sort((a, b) => a - b)
      results.push({
        label,
        runs: 10,
        medianMs: (timings[4] + timings[5]) / 2,
        minMs: timings[0],
        maxMs: timings[9],
        decodedFileBytesPerRead: bytes
      })
    }
    collection.reconstruct = original
    console.log(
      JSON.stringify(
        {
          scope:
            'Node 22, warm storage, 100 entries and sixteen 1MiB files; one warm-up excluded; raw scans and normalized snapshot timing',
          results
        },
        null,
        2
      )
    )
  } finally {
    await n.close()
    await fs.rm(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
