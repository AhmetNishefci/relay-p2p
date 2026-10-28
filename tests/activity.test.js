const test = require('node:test')
const assert = require('node:assert/strict')
const { projectActivity, formatActivityTime, activityEmptyState } = require('../src/activity')
const entry = (id, createdAt = 100) => ({
  schemaVersion: 1,
  kind: 'entry',
  id: id.repeat(32),
  title: `Field entry ${id}`,
  body: '',
  createdAt
})
const ack = (entryId, writer = 'b', acknowledgedAt = 200) => ({
  schemaVersion: 1,
  kind: 'ack',
  entryId,
  writerKey: writer.repeat(64),
  acknowledgedAt
})

test('current projection associates acknowledgments, filters unacknowledged entries and ignores orphans', () => {
  const a = entry('a')
  const b = entry('b', 150)
  const records = [ack(a.id), ack(a.id, 'c', 220), ack(entry('c').id)]
  const result = projectActivity([a, b], records)
  assert.equal(result.all.length, 4)
  assert.equal(result.acknowledgments.length, 2)
  assert.deepEqual(
    result.unacknowledged.map((row) => row.entryId),
    [b.id]
  )
  assert.deepEqual(
    result.all.map((row) => row.recordedAt),
    [220, 200, 150, 100]
  )
  assert.ok(result.acknowledgments.every((row) => row.title === a.title))
})

test('repeated notifications and restart reconstruction never append duplicate activity', () => {
  const a = entry('a')
  const records = [ack(a.id), ack(a.id)]
  const initial = projectActivity([a], records)
  assert.equal(initial.all.length, 2)
  for (let i = 0; i < 50; i++) assert.deepEqual(projectActivity([a], records), initial)
  const restored = JSON.parse(JSON.stringify({ entries: [a], acknowledgments: records }))
  assert.deepEqual(projectActivity(restored.entries, restored.acknowledgments), initial)
  assert.equal(new Set(initial.all.map((row) => row.id)).size, 2)
})

test('entry removal hides its activity without deleting retained acknowledgment input', () => {
  const a = entry('a')
  const records = Object.freeze([Object.freeze(ack(a.id))])
  assert.equal(projectActivity([a], records).all.length, 2)
  assert.deepEqual(projectActivity([], records), {
    all: [],
    acknowledgments: [],
    unacknowledged: []
  })
  assert.equal(records.length, 1)
})

test('overwritten current records update stable rows instead of inventing historical events', () => {
  const a = entry('a')
  const first = projectActivity([a], [ack(a.id)])
  const updated = projectActivity(
    [{ ...a, title: 'Replaced current title' }],
    [ack(a.id, 'b', 300)]
  )
  assert.deepEqual(
    updated.all.map((row) => row.id),
    first.all.map((row) => row.id)
  )
  assert.ok(updated.all.every((row) => row.title === 'Replaced current title'))
  assert.equal(updated.acknowledgments[0].recordedAt, 300)
  assert.equal(updated.all.length, 2)
})

test('device clock skew and equal timestamps do not suppress records or mutate snapshot ordering', () => {
  const a = Object.freeze(entry('a', 500))
  const b = Object.freeze(entry('b', 500))
  const entries = Object.freeze([b, a])
  const records = Object.freeze([Object.freeze(ack(a.id, 'b', 1))])
  const result = projectActivity(entries, records)
  assert.deepEqual(
    result.all.map((row) => row.id),
    [`entry:${a.id}`, `entry:${b.id}`, `ack:${a.id}:${'b'.repeat(64)}`]
  )
  assert.equal(entries[0], b)
  assert.equal(result.acknowledgments.length, 1)
  assert.equal(formatActivityTime(Number.MAX_SAFE_INTEGER), 'Device time unavailable')
  assert.ok(formatActivityTime(0).length > 0)
})

test('projection handles the full supported snapshot with unique stable row IDs', () => {
  const entries = Array.from({ length: 200 }, (_, i) => ({
    ...entry('a'),
    id: i.toString(16).padStart(32, '0')
  }))
  const records = Array.from({ length: 1000 }, (_, i) => ({
    ...ack(entries[i % 100].id),
    writerKey: i.toString(16).padStart(64, '0')
  }))
  const result = projectActivity(entries, records)
  assert.equal(result.all.length, 1200)
  assert.equal(result.acknowledgments.length, 1000)
  assert.equal(result.unacknowledged.length, 100)
  assert.equal(new Set(result.all.map((row) => row.id)).size, 1200)
})

test('empty notebook guidance stays distinct from the all-entries-have-records state', () => {
  const empty = activityEmptyState('all', 0)
  assert.deepEqual(activityEmptyState('unacknowledged', 0), empty)
  assert.deepEqual(activityEmptyState('acknowledgments', 0), empty)
  assert.notEqual(activityEmptyState('unacknowledged', 1).title, empty.title)
  assert.match(activityEmptyState('unacknowledged', 1).body, /does not prove delivery or reading/)
  assert.notEqual(activityEmptyState('acknowledgments', 1).title, empty.title)
})
