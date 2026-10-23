/**
 * Supply diagnosis: why can a classified, answering agent not be priced?
 *
 *   pnpm --filter @marque/commerce exec tsx scripts/supply-diagnose.mts <out.json> [--concurrency=10]
 *
 * Read-only. One free `negotiate` price check per agent (the same harmless probe task the
 * quotes worker sends), plus a read of the agent's published card and registration
 * services. Nothing is funded, nothing is written to the database, nobody is contacted.
 * Every row gets one failure class and an owner for the fix (marque, operator or none).
 */
import { writeFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { safeFetch } from '@marque/probe'
import { sellerCandidates, type SellerCandidate } from '../src/supply.js'
import { requestQuote, probeTask, negotiateBody, type QuoteResult } from '../src/quote.js'

const out = process.argv[2]
if (!out) { console.error('usage: supply-diagnose.mts <out.json> [--concurrency=N]'); process.exit(2) }
const CONC = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 10)
const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

type FailureClass =
  | 'ok' | 'no_card' | 'invalid_card' | 'no_work_skill' | 'no_quote_endpoint' | 'unknown_quote_protocol'
  | 'quote_error' | 'quote_wrong_token' | 'quote_wrong_chain' | 'quote_expired_cadence' | 'provider_mismatch'
  | 'refuses_task_format' | 'timeout'

interface Row {
  agentKey: string; tokenId: string; name: string; category: string | null; lane: 'mainnet' | 'practice'
  host: string; cardValid: boolean | null; skills: string[]; registrationServices: string[]; quoteUrlDeclared: string | null
  quoteAttempted: boolean; quoteProtocol: string | null; quoteResult: string; failureClass: FailureClass; failureDetail: string
  providerWallet: string | null; registeredWallet: string | null; providerMatches: boolean | null
  fixable: boolean; fixOwner: 'marque' | 'operator' | 'none'; responseSample: string | null; owner: string | null
}

const all = await sellerCandidates()
// One row per agent: prefer the service whose card advertises commerce.
const byAgent = new Map<string, SellerCandidate>()
for (const c of all) {
  const prev = byAgent.get(c.agentId)
  if (!prev || (c.advertisesCommerce && !prev.advertisesCommerce)) byAgent.set(c.agentId, c)
}
const candidates = [...byAgent.values()].filter((c) => c.category && c.category !== 'unclassified')
console.error(`candidates: ${candidates.length} classified agents (${all.length} services)`)

// What each agent publishes about itself: card skills and registration services.
const meta = new Map<string, { skills: string[]; services: string[]; quoteUrl: string | null; cardValid: boolean | null }>()
const ids = candidates.map((c) => c.agentId)
for (let i = 0; i < ids.length; i += 400) {
  const chunk = ids.slice(i, i + 400)
  const rows = rowsOf(await db().execute(sql`
    select a.id, p.manifest, a.raw_metadata #> '{offchain_content,services}' as svc, a.raw_metadata -> 'services' as svc2
    from agent a
    left join lateral (select p.manifest from probe_schedule ps join probe p on p.id = ps.last_probe_id
                       where ps.agent_id = a.id and p.manifest is not null order by p.checked_at desc limit 1) p on true
    where a.id in (${sql.join(chunk.map((x) => sql`${x}`), sql`, `)})`))
  for (const r of rows) {
    const m = (r['manifest'] ?? null) as Record<string, unknown> | null
    const skills = Array.isArray(m?.['skills']) ? (m!['skills'] as Array<Record<string, unknown>>).map((s) => String(s['id'] ?? s['name'] ?? '?')) : []
    const svcs = [r['svc'], r['svc2']].flatMap((v) => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as object) : [])
    const services = svcs.map((s) => {
      const o = (s ?? {}) as Record<string, unknown>
      return `${String(o['name'] ?? o['type'] ?? o['kind'] ?? '?')}:${String(o['endpoint'] ?? o['url'] ?? '').slice(0, 120)}`
    })
    const quoteUrl = services.map((s) => s.split(':').slice(1).join(':')).find((u) => /quote|price|negotiat/i.test(u)) ?? null
    meta.set(String(r['id']), { skills, services, quoteUrl, cardValid: m ? typeof m['name'] === 'string' && (typeof m['url'] === 'string' || Array.isArray(m['skills'])) : null })
  }
}

function classify(q: QuoteResult, c: SellerCandidate, skills: string[]): { cls: FailureClass; owner: Row['fixOwner'] } {
  if (q.ok) return { cls: 'ok', owner: 'none' }
  const hasNegotiate = skills.some((s) => /negotiat|quote|8183/i.test(s))
  switch (q.reason) {
    case 'unreachable': return { cls: /timeout|timed out|abort/i.test(q.detail) ? 'timeout' : 'no_quote_endpoint', owner: 'operator' }
    case 'not_a2a': return { cls: 'no_quote_endpoint', owner: 'operator' }
    case 'no_quote': return hasNegotiate ? { cls: 'unknown_quote_protocol', owner: 'marque' } : { cls: 'no_work_skill', owner: 'operator' }
    case 'malformed': return { cls: 'unknown_quote_protocol', owner: 'marque' }
    case 'declined': return { cls: 'refuses_task_format', owner: 'marque' }
    case 'provider_mismatch': return { cls: 'provider_mismatch', owner: 'none' }
    case 'currency_unsupported': return { cls: 'quote_wrong_token', owner: 'operator' }
    case 'chain_unsupported': case 'wrong_contract': return { cls: 'quote_wrong_chain', owner: 'operator' }
    case 'expired': return { cls: 'quote_expired_cadence', owner: 'operator' }
    default: return { cls: 'quote_error', owner: c.firstParty ? 'marque' : 'operator' }
  }
}

async function sample(endpoint: string, category: string): Promise<string | null> {
  const res = await safeFetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(negotiateBody(probeTask(category), `marque-diag-${Date.now()}`)), timeoutMs: 8000, maxBytes: 16 * 1024 })
  return res.ok ? `${res.status} ${res.body.replace(/\s+/g, ' ').slice(0, 500)}` : `${res.failure}: ${res.detail}`.slice(0, 200)
}

// Per-host serial, global concurrency CONC: never hammer one operator.
const hostOf = (u: string) => { try { return new URL(u).host } catch { return u } }
const queues = new Map<string, SellerCandidate[]>()
for (const c of candidates) { const h = hostOf(c.endpoint); queues.set(h, [...(queues.get(h) ?? []), c]) }
// Clone farms (one host, hundreds of identities): sample up to 6 per host and project the rest.
const rows: Row[] = []
const hosts = [...queues.entries()]
let done = 0
async function runHost([host, list]: [string, SellerCandidate[]]) {
  const sampled = list.slice(0, 6)
  for (const c of sampled) {
    const m = meta.get(c.agentId) ?? { skills: [], services: [], quoteUrl: null, cardValid: null }
    const q = await requestQuote(c.endpoint, probeTask(c.category!), { agentWallet: c.agentWallet, agentOwner: c.owner, timeoutMs: 8000 })
    const { cls, owner } = classify(q, c, m.skills)
    const resp = !q.ok && (q.reason === 'no_quote' || q.reason === 'malformed') ? await sample(c.endpoint, c.category!) : null
    rows.push({
      agentKey: c.agentId, tokenId: c.tokenId, name: c.name, category: c.category, lane: c.chainId === 97 ? 'practice' : 'mainnet',
      host, cardValid: m.cardValid, skills: m.skills, registrationServices: m.services, quoteUrlDeclared: m.quoteUrl,
      quoteAttempted: true, quoteProtocol: q.ok ? (q.signed ? 'bnb-sdk-negotiate' : 'simple-quote') : null,
      quoteResult: q.ok ? `ok ${q.price} ${q.token.symbol}` : q.reason, failureClass: cls, failureDetail: q.ok ? '' : q.detail.slice(0, 240),
      providerWallet: q.ok ? q.provider : (q.provider ?? null), registeredWallet: c.agentWallet,
      providerMatches: q.ok ? true : q.reason === 'provider_mismatch' ? false : null,
      fixable: cls !== 'ok' && owner !== 'none', fixOwner: owner, responseSample: resp, owner: c.owner,
    })
  }
  for (const c of list.slice(6)) {
    const m = meta.get(c.agentId) ?? { skills: [], services: [], quoteUrl: null, cardValid: null }
    const first = rows.find((r) => r.host === host)
    rows.push({ ...(first as Row), agentKey: c.agentId, tokenId: c.tokenId, name: c.name, category: c.category, quoteAttempted: false,
      skills: m.skills, registrationServices: m.services, quoteResult: `projected from ${first?.agentKey ?? host}`, owner: c.owner, responseSample: null })
  }
  done++
  if (done % 25 === 0) console.error(`hosts ${done}/${hosts.length}, rows ${rows.length}`)
}
const pool: Promise<void>[] = []
let next = 0
for (let w = 0; w < CONC; w++) pool.push((async () => { while (next < hosts.length) await runHost(hosts[next++]!).catch((e) => console.error('host failed', e)) })())
await Promise.all(pool)

writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), candidates: candidates.length, hosts: hosts.length, rows }, null, 2))
const tally: Record<string, Record<string, number>> = {}
for (const r of rows) { tally[r.failureClass] ??= {}; tally[r.failureClass]![r.category ?? 'none'] = (tally[r.failureClass]![r.category ?? 'none'] ?? 0) + 1 }
console.log(JSON.stringify(tally, null, 1))
await closeDb()
