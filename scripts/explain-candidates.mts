import { readLocalJson } from './lib/local-json.mjs'
import { explainCandidates } from '../packages/commerce/src/routing-diagnostics.js'

try {
  if (process.argv.length !== 3) throw new Error('Usage: node --import tsx scripts/explain-candidates.mts LOCAL_FILE.json')
  console.log(JSON.stringify(explainCandidates(await readLocalJson(process.argv[2]!)), null, 2))
} catch {
  console.error('Candidate inspection rejected: require bounded local JSON matching marque.routing-input.v1. No task or hire was executed.')
  process.exitCode = 1
}
