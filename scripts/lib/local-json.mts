import { open } from 'node:fs/promises'

/** Local regular UTF-8 JSON only, bounded while reading, including growing files. */
export async function readLocalJson(path: string): Promise<unknown> {
  const file = await open(path, 'r')
  let bytes: Buffer
  try {
    if (!(await file.stat()).isFile()) throw new Error('Regular local file required')
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null)
      if (!bytesRead) break
      size += bytesRead
    }
    if (size === buffer.length) throw new Error('Input exceeds 2 MiB')
    bytes = buffer.subarray(0, size)
  } finally { await file.close() }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
}
