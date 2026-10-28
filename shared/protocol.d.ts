export type Attachment = {
  schemaVersion: 1
  key: string
  filename: string
  mimeType: string
  size: number
  digest: string
}
export type FileMetadata = Omit<Attachment, 'schemaVersion' | 'key'>
export type Entry = {
  schemaVersion: 1
  kind: 'entry'
  id: string
  title: string
  body: string
  createdAt: number
  attachment?: Attachment
}
export type Acknowledgment = {
  schemaVersion: 1
  kind: 'ack'
  entryId: string
  writerKey: string
  acknowledgedAt: number
}
export type EntrySnapshot = {
  entries: Entry[]
  skipped: number
  acknowledgments: Acknowledgment[]
  localWriterKey: string
  skippedAcknowledgments: number
}
export type WorkerStatus = {
  state: 'starting' | 'idle' | 'joining' | 'ready' | 'failed' | 'closed'
  writable: boolean
  hasNotebook?: boolean
  pairing?: 'idle' | 'joining' | 'cancelling' | 'cancelled' | 'failed'
  writerKey?: string | null
}
export type Participant = { key: string; name: string | null; readOnly: boolean; isLocal: boolean }
export type Operations = {
  'attachments.stage': {
    payload: Omit<FileMetadata, 'digest'> & { digest?: string }
    result: { handle: string; entryId: string; uri: string; expiresAt: number }
  }
  'attachments.seal': { payload: { handle: string }; result: FileMetadata }
  'attachments.release': { payload: { handle: string }; result: { released: true } }
  'attachments.get': {
    payload: { entryId: string }
    result: {
      handle: string
      entryId: string
      uri: string
      expiresAt: number
      attachment: Attachment
    }
  }
  'entries.addAttachment': {
    payload: { handle: string; title: string; body: string }
    result: { entry: Entry; alreadyRecorded: boolean }
  }
  status: { payload: Record<string, never>; result: WorkerStatus }
  'notebook.create': { payload: Record<string, never>; result: WorkerStatus }
  'pair.start': { payload: { invite: string; name?: string }; result: WorkerStatus }
  'pair.cancel': { payload: Record<string, never>; result: { cancelled: true } }
  'invite.create': { payload: { readOnly: boolean }; result: { invite: string; readOnly: boolean } }
  'invite.cancel': { payload: Record<string, never>; result: { cancelled: true } }
  'participants.list': { payload: Record<string, never>; result: { participants: Participant[] } }
  'entries.list': { payload: Record<string, never>; result: EntrySnapshot }
  'entries.acknowledge': {
    payload: { entryId: string }
    result: { acknowledgment: Acknowledgment; alreadyRecorded: boolean }
  }
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
export const MAX_MESSAGE_LENGTH: number
export const MAX_MESSAGE_BYTES: number
export const MAX_ENTRIES: number
export const MAX_ACKNOWLEDGMENTS: number
export class Fault extends Error {
  code: string
  constructor(code: string, message: string)
}
export function parseJSON(raw: string): unknown
export function serializeMessage(value: unknown): string
export function validateRequest(value: unknown): Request
export function requestId(value: unknown): value is string
export function isEntry(value: unknown): value is Entry
export function isAcknowledgment(value: unknown): value is Acknowledgment
export function isResult(op: Operation, value: unknown): boolean
export function validateServerMessage(value: unknown): value is WorkerEvent | Response
export function publicError(error: unknown): PublicError
