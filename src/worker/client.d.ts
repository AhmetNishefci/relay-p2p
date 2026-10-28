import type { Operation, Operations, WorkerEvent } from '../../shared/protocol'
export class WorkerClient {
  constructor(write: (raw: string) => void)
  readonly closed: boolean
  subscribe(listener: (event: WorkerEvent) => void): () => void
  request<K extends Operation>(
    op: K,
    payload: Operations[K]['payload'],
    timeoutMs?: number
  ): Promise<Operations[K]['result']>
  receive(raw: string): void
  close(): void
}
export function createListRefresher<T>(
  load: () => Promise<T>,
  onValue: (value: T) => void,
  onError: (error: unknown) => void
): { refresh(): Promise<void>; invalidate(): void; close(): void }

export function isUnknownMutationError(error: unknown): boolean
