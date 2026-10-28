// A projection of the CURRENT validated snapshot, never an append-only event log.
const formatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

function formatActivityTime(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? formatter.format(date) : 'Device time unavailable'
}

function projectActivity(entries, acknowledgments) {
  const current = new Map(entries.map((entry) => [entry.id, entry]))
  const records = new Map()
  const acknowledged = new Set()
  for (const record of acknowledgments) {
    const entry = current.get(record.entryId)
    if (!entry) continue // Retained orphans do not describe a current entry.
    const id = `ack:${record.entryId}:${record.writerKey}`
    records.set(id, {
      id,
      entryId: record.entryId,
      title: entry.title,
      type: 'ack',
      recordedAt: record.acknowledgedAt,
      writerKey: record.writerKey
    })
    acknowledged.add(record.entryId)
  }
  const ackRows = [...records.values()]
  const entryRows = [...current.values()].map((entry) => ({
    id: `entry:${entry.id}`,
    entryId: entry.id,
    title: entry.title,
    type: 'entry',
    recordedAt: entry.createdAt
  }))
  // Display order only. Device clocks neither establish causality nor resolve conflicts.
  const order = (a, b) => b.recordedAt - a.recordedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return {
    all: [...entryRows, ...ackRows].sort(order),
    acknowledgments: ackRows.sort(order),
    unacknowledged: entryRows.filter((row) => !acknowledged.has(row.entryId)).sort(order)
  }
}

function activityEmptyState(filter, entryCount) {
  if (!entryCount) {
    return {
      title: 'A quiet beginning.',
      body: 'Current entries and their acknowledgment records will appear here. Return to the notebook to get started.'
    }
  }
  if (filter === 'acknowledgments') {
    return {
      title: 'No acknowledgment records yet.',
      body: 'Contributors can open an entry and choose Acknowledge. Records appear here when available on this device.'
    }
  }
  return {
    title: 'Every current entry has a record.',
    body: 'This device has an acknowledgment record for each current entry. That does not prove delivery or reading.'
  }
}

module.exports = { projectActivity, formatActivityTime, activityEmptyState }
