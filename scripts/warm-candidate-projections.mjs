import { warmCandidateProjections } from './lib/warm-projections.mjs'
const base = process.argv[2] ?? 'http://127.0.0.1:3299'
console.log(JSON.stringify(await warmCandidateProjections(base), null, 2))
