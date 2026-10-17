import { readLocalJson } from './lib/local-json.mjs'
import { replayTrial } from '../packages/ledger/src/trial-replay.js'

// Local bounded file only. Never interpret input as a URL or provider operation.
try {
  if (process.argv.length !== 3) throw new Error('Usage: node --import tsx scripts/replay-trial.mts LOCAL_FILE.json')
  console.log(JSON.stringify(replayTrial(await readLocalJson(process.argv[2]!)), null, 2))
} catch {
  console.error('Trial replay rejected: require a bounded local JSON file matching marque.trial-replay.v1. No task was executed.')
  process.exitCode = 1
}
