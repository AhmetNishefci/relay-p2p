export type Entry = {
  schemaVersion: 1
  kind: 'entry'
  id: string
  title: string
  body: string
  createdAt: number
}
export type WorkerStatus = { state: 'starting' | 'ready' | 'failed' | 'closed'; writable: boolean }
export type Operations = {
  status: { payload: Record<string, never>; result: WorkerStatus }
  'entries.list': { payload: Record<string, never>; result: { entries: Entry[]; skipped: number } }
  'entries.add': { payload: { title: string; body: string }; result: Entry }
  'entries.remove': { payload: { id: string }; result: { id: string; removed: true } }
}
export type Operation = keyof Operations
export type Request = {
  [K in Operation]: {
    v: 1
    type: 'request'
    id: string
    op: K
    payload: Operations[K]['payload']
  }
}[Operation]
export type PublicError = { code: string; message: string }
export type WorkerEvent =
  | { v: 1; type: 'event'; event: 'ready'; payload: WorkerStatus }
  | { v: 1; type: 'event'; event: 'changed'; payload: null }
  | { v: 1; type: 'event'; event: 'error'; payload: PublicError }
export type Response =
  | { v: 1; type: 'response'; id: string; ok: true; result: unknown }
  | { v: 1; type: 'response'; id: string | null; ok: false; error: PublicError }
export const VERSION: 1
export const MAX_ENTRIES: number
export class Fault extends Error {
  code: string
  constructor(code: string, message: string)
}
export function parseJSON(raw: string): unknown
export function validateRequest(value: unknown): Request
export function requestId(value: unknown): value is string
export function isEntry(value: unknown): value is Entry
export function isResult(op: Operation, value: unknown): boolean
export function validateServerMessage(value: unknown): value is WorkerEvent | Response
export function publicError(error: unknown): PublicError
