export function createCopyGate(
  copy: (from: string, to: string) => Promise<void>,
  remove: (uri: string) => Promise<void>,
  timeoutMs?: number
): (from: string, to: string) => Promise<void>
