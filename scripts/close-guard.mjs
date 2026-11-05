#!/usr/bin/env node
// Set and Earn close guard (5 Nov 2026). Re-reads the quest record of the wallets saved at the close and fails when
// a field that decides eligibility differs: distinct agents, marketplaces, counted hires, team exclusion and the
// build checks bound to the campaign window. Run after every deploy until 20 November 2026.
//   node scripts/close-guard.mjs [https://marque.trade]          compare against the saved records
//   node scripts/close-guard.mjs [base] --save <address>...      save the current records (done once, at the close)
// Three build checks are live reads that move by themselves (listed now, the card's host, probes in the last 24
// hours); a change there is printed as a warning, not a failure, because no deploy causes it.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DIR = new URL('../docs/evidence/set-and-earn-close-2026-11-05/quest/', import.meta.url).pathname
const LIVE_CHECKS = new Set(['listed', 'card', 'probes'])
const args = process.argv.slice(2)
const base = (args[0] && !args[0].startsWith('--') ? args[0] : 'https://marque.trade').replace(/\/$/, '')

async function read(address) {
  const r = await fetch(`${base}/api/v1/quest/${address}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`${address}: HTTP ${r.status}`)
  return r.json()
}

/** The eligibility fields, in a stable shape, so two reads compare as text. */
function fields(q) {
  return {
    excludedTeam: q.excluded?.team ?? null,
    distinctAgents: q.hire?.distinctAgents ?? null,
    hireStatus: q.hire?.status ?? null,
    marketplaces: [...(q.hire?.marketplaces?.named ?? [])].sort(),
    marketplacesNotRecorded: q.hire?.marketplaces?.notRecorded ?? null,
    countedHires: (q.hire?.hires ?? []).filter((h) => h.counts).map((h) => `${h.chainId}:${h.jobId}`).sort(),
    build: Object.fromEntries((q.build?.agents ?? []).map((a) => [`${a.chainId}:${a.tokenId}`,
      Object.fromEntries(Object.entries(a.checks ?? {}).map(([k, v]) => [k, v?.state ?? null]))])),
  }
}

if (args.includes('--save')) {
  await mkdir(DIR, { recursive: true })
  for (const address of args.slice(args.indexOf('--save') + 1)) {
    const q = await read(address)
    await writeFile(join(DIR, `${address.toLowerCase()}.json`), JSON.stringify(q, null, 2) + '\n')
    console.log(`saved ${address.toLowerCase()} (observed ${q.observedAt})`)
  }
  process.exit(0)
}

let failed = 0, warned = 0
const files = (await readdir(DIR)).filter((f) => f.endsWith('.json')).sort()
if (!files.length) { console.error(`No saved records in ${DIR}`); process.exit(2) }
for (const f of files) {
  const saved = fields(JSON.parse(await readFile(join(DIR, f), 'utf8')))
  const address = f.replace(/\.json$/, '')
  let now
  try { now = fields(await read(address)) } catch (e) { console.log(`FAIL ${address}: ${e.message}`); failed++; continue }
  const problems = [], notes = []
  for (const k of ['excludedTeam', 'distinctAgents', 'hireStatus', 'marketplaces', 'marketplacesNotRecorded', 'countedHires'])
    if (JSON.stringify(saved[k]) !== JSON.stringify(now[k])) problems.push(`${k}: ${JSON.stringify(saved[k])} -> ${JSON.stringify(now[k])}`)
  for (const agent of new Set([...Object.keys(saved.build), ...Object.keys(now.build)])) {
    const a = saved.build[agent] ?? {}, b = now.build[agent] ?? {}
    for (const check of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[check] === b[check]) continue
      ;(LIVE_CHECKS.has(check) ? notes : problems).push(`build ${agent} ${check}: ${a[check] ?? 'absent'} -> ${b[check] ?? 'absent'}`)
    }
  }
  if (problems.length) { failed++; console.log(`FAIL ${address}\n  ${problems.join('\n  ')}`) }
  else console.log(`ok   ${address}  agents ${now.distinctAgents}, counted ${now.countedHires.length}, marketplaces ${now.marketplaces.length}, team ${now.excludedTeam}`)
  if (notes.length) { warned++; console.log(`  live reads moved (not a failure):\n  ${notes.join('\n  ')}`) }
}
console.log(`${files.length} wallets, ${failed} failed, ${warned} with live-read changes`)
process.exit(failed ? 1 : 0)
