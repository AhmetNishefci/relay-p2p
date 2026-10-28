declare module 'b4a' {
  export function toString(data: Uint8Array): string
}

declare module 'framed-stream' {
  export default class FramedStream {
    constructor(stream: unknown)
    on(event: 'data', listener: (data: Uint8Array) => void): this
    on(event: 'error', listener: (err: Error) => void): this
    write(data: string): void
    destroy(): void
  }
}
