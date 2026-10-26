/**
 * `pnpm marque verify-terms <chainId>:<jobId>`: re-read the job and BNB Chain now, recompute every check at the answer's
 * block, and print the same rows the Job Room shows: Marque's checks, then the terms with each criterion's result.
 * Reads only. It ignores any stored result, so it is an independent replay of what the page says.
 */
import { replayLens } from '../apps/web/lib/lens'

if (!process.env['DATABASE_URL']) {
  console.error('verify-terms reads the job and its answer through a Marque database: set DATABASE_URL (for example by loading the server\'s secrets file) and run again.')
  process.exit(78)
}
const [cmd, ref] = process.argv.slice(2)
if (cmd !== 'verify-terms' || !ref || !/^(56|97):\d{1,12}$/.test(ref)) {
  console.error('usage: pnpm marque verify-terms <56|97>:<jobId>')
  process.exit(64)
}
const [chain, job] = ref.split(':') as [string, string]
const l = await replayLens(Number(chain) as 56 | 97, job)
const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n))
console.log(`Job ${ref} · answer block ${l.checkedAtBlock ?? 'not stated'} · file ${l.manifest?.matches === true ? 'matches the hash on chain' : l.manifest?.matches === false ? 'DIFFERS from the hash on chain' : 'not read'}`)
console.log(`Checks: ${l.summary.agreed} of ${l.summary.checked} agree (${l.state}${l.reason ? `: ${l.reason}` : ''})`)
for (const c of l.checks) console.log(`  ${pad(c.state, 11)} ${pad(c.label, 46)} agent ${pad(c.agent ?? '·', 16)} Marque ${c.marque ?? '·'}`)
if (l.terms) {
  const src = { signed: 'signed by the agent', buyer: 'set by the buyer, not signed by the agent', standard: "no written terms; the Standard's criteria" }[l.terms.source]
  console.log(`Terms met: ${l.terms.met} of ${l.terms.of} (${src})`)
  for (const r of l.terms.rows) console.log(`  ${pad(r.state, 10)} ${pad(r.text, 70)} agent ${pad(r.agent ?? '·', 16)} Marque ${r.marque ?? '·'}`)
}
process.exit(l.terms && l.terms.rows.some((r) => r.state === 'not_met') ? 2 : 0)
