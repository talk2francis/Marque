import { open } from 'node:fs/promises'
import { replayTrial } from '../packages/ledger/src/trial-replay.js'

// Local bounded file only. Never interpret input as a URL or provider operation.
try {
  if (process.argv.length !== 3) throw new Error('Usage: node --import tsx scripts/replay-trial.mts LOCAL_FILE.json')
  const file = await open(process.argv[2]!, 'r')
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
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  console.log(JSON.stringify(replayTrial(value), null, 2))
} catch {
  console.error('Trial replay rejected: require a bounded local JSON file matching marque.trial-replay.v1. No task was executed.')
  process.exitCode = 1
}
