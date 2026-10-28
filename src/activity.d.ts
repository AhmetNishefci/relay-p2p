import type { Entry, Acknowledgment } from '../shared/protocol'

export type ActivityFilter = 'all' | 'acknowledgments' | 'unacknowledged'
export type ActivityItem = {
  id: string
  entryId: string
  title: string
  type: 'entry' | 'ack'
  recordedAt: number
  writerKey?: string
}
export type ActivityProjection = Record<ActivityFilter, ActivityItem[]>
export function projectActivity(
  entries: Entry[],
  acknowledgments: Acknowledgment[]
): ActivityProjection
export function formatActivityTime(value: number): string
export function activityEmptyState(
  filter: ActivityFilter,
  entryCount: number
): {
  title: string
  body: string
}
