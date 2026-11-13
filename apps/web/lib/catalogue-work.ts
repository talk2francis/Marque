import { setImmediate as yieldTurn } from 'node:timers/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

const BATCH = 128

/** Keep the complete ordered projection while allowing ready requests between batches. */
export async function mapCatalogue<T, U>(rows: readonly T[], project: (row: T) => U): Promise<U[]> {
  const result: U[] = []
  for (let start = 0; start < rows.length; start += BATCH) {
    result.push(...rows.slice(start, start + BATCH).map(project))
    if (start + BATCH < rows.length) await yieldTurn()
  }
  return result
}

/** Existing snapshot format, streamed into gzip without one giant temporary JSON string. */
export async function encodeCatalogue<T>(entry: { at: number; rows: readonly T[] }): Promise<Buffer> {
  async function* chunks() {
    yield `{"at":${JSON.stringify(entry.at)},"rows":[`
    for (let start = 0; start < entry.rows.length; start += BATCH) {
      if (start) yield ','
      yield JSON.stringify(entry.rows.slice(start, start + BATCH)).slice(1, -1)
      await yieldTurn()
    }
    yield ']}'
  }
  const output: Buffer[] = []
  await pipeline(Readable.from(chunks()), createGzip(), async (source: AsyncIterable<Uint8Array>) => {
    for await (const chunk of source) output.push(Buffer.from(chunk))
  })
  return Buffer.concat(output)
}
