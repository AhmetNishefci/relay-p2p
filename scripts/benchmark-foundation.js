// Node/V8 diagnostic, not a Hermes or Android frame-time benchmark.
// Optional first argument: an alternate client module for a before/after comparison.
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { createListRefresher } = require(path.resolve(process.argv[2] || 'src/worker/client.js'))
const protocol = require(path.resolve(process.argv[3] || 'shared/protocol.js'))

const tick = () => new Promise((resolve) => setImmediate(resolve))

async function refreshProbe() {
  const loads = []
  let active = 0
  let maximumActive = 0
  let completedReads = 0
  let callerSettledAfterRead = null
  const refresher = createListRefresher(
    () => {
      maximumActive = Math.max(maximumActive, ++active)
      return new Promise((resolve) => loads.push(resolve)).finally(() => active--)
    },
    () => {},
    (error) => {
      throw error
    }
  )
  const invalidate = () => {
    if (refresher.invalidate) refresher.invalidate()
    else refresher.refresh().catch(() => {})
  }
  invalidate()
  const caller = refresher.refresh().then(() => {
    callerSettledAfterRead = completedReads
  })
  for (let i = 0; i < 100; i++) {
    invalidate()
    completedReads++
    loads.shift()(i)
    await tick()
  }
  const settledDuringContinuousUpdates = callerSettledAfterRead
  refresher.close()
  if (loads.length) loads.shift()(100)
  await caller
  return { completedReads, settledDuringContinuousUpdates, maximumActive }
}

function snapshotProbe(character) {
  const entries = Array.from({ length: 200 }, (_, i) => ({
    schemaVersion: 1,
    kind: 'entry',
    id: (i + 1).toString(16).padStart(32, '0'),
    title: 'Synthetic field note',
    body: character.repeat(6000),
    createdAt: 1793192400000
  }))
  const acknowledgments = entries.flatMap((entry) =>
    Array.from({ length: 5 }, (_, i) => ({
      schemaVersion: 1,
      kind: 'ack',
      entryId: entry.id,
      writerKey: (i + 1).toString(16).padStart(64, '0'),
      acknowledgedAt: 1793192400000
    }))
  )
  const result = {
    entries,
    acknowledgments,
    skipped: 0,
    skippedAcknowledgments: 0,
    localWriterKey: '1'.padStart(64, '0')
  }
  const raw = JSON.stringify({ v: 1, type: 'response', id: '1', ok: true, result })
  const samples = []
  for (let i = 0; i < 55; i++) {
    const start = performance.now()
    const decoded = protocol.parseJSON(raw)
    if (
      !protocol.validateServerMessage(decoded) ||
      !protocol.isResult('entries.list', decoded.result)
    ) {
      throw new Error('Invalid benchmark fixture')
    }
    if (i >= 5) samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return {
    character,
    entries: entries.length,
    acknowledgments: acknowledgments.length,
    characters: raw.length,
    bytes: Buffer.byteLength(raw),
    samples: samples.length,
    nodeParseAndValidationMs: { median: samples[25], p95: samples[47] }
  }
}

async function main() {
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        scope: 'Node/V8 only; synthetic records, no storage or network',
        refresh: await refreshProbe(),
        snapshots: [snapshotProbe('x'), snapshotProbe('漢')]
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
