export type SelectedFile = { uri: string; filename: string; mimeType: string; size: number }
export const MIME_TYPES: string[]
export function selectionOf(asset: unknown): SelectedFile
export function fileSize(size: number): string
export function fileType(mimeType: string): string
