import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'
import { marqueWallets, network, statsFrom, type ChainId, type QuestHire, type WalletQuest } from '@marque/commerce'
import { jobLens } from './lens'

/**
 * The independent-commerce scorecard (/proof, /api/v1/proof): one row per job hired through Marque on BSC mainnet and
 * testnet, read from the same per-wallet projection as /api/v1/phase2/stats, with who paid, what happened, what the
 * chain checks said and whether anyone acted on the answer. Team jobs are rows like any other, labelled, and never
 * counted. "Outside" means absent from the published team list; it does not prove the buyer is unrelated.
 */
export type FunderClass = 'outside' | 'team' | 'operator'
export interface ProofRow {
  chainId: ChainId
  jobId: string
  escrow: string
  agent: { name: string | null; agentKey: string | null; tokenId: string | null; category: string | null }
  operatorClass: 'reference' | 'third_party'
  funderClass: FunderClass
  client: string
  /** Counted by /api/v1/phase2/stats (outside, Marque-bound, funded, first hire of its category). */
  counted: boolean
  state: string
  funded: boolean
  delivered: boolean
  settled: boolean
  refunded: boolean
  rated: boolean
  /** When the escrow paid out (JobCompleted), for the weekly series. */
  completedAt: string | null
  checks: { decided: number; agreed: number } | null
  terms: { met: number; of: number; source: 'signed' | 'buyer' | 'standard' } | null
  act: { action: string; tx: string | null } | null
  hireTx: string | null
  verifyUrl: string
}
export interface ProofTotals { jobs: number; wallets: number; funded: number; delivered: number; settled: number; refunded: number; rated: number; checksDecided: number; checksAgreed: number }
export interface Proof {
  measuredAt: string
  rows: ProofRow[]
  totals: Record<string, Record<FunderClass, ProofTotals>>
  /** Exactly /api/v1/phase2/stats's counted figures per network, from the same projection. */
  stats: Record<string, ReturnType<typeof statsFrom>>
}

const DELIVERED = new Set(['SUBMITTED', 'COMPLETED', 'PAID', 'DISPUTED'])
const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

export function funderOf(h: Pick<QuestHire, 'reasons'>): FunderClass {
  return h.reasons.includes('team_wallet') ? 'team' : h.reasons.includes('self_hire') ? 'operator' : 'outside'
}

/** Per network and funder class. `counted` rows reproduce statsFrom; the test checks the two agree. */
export function totalsOf(rows: readonly ProofRow[]): Proof['totals'] {
  const out: Proof['totals'] = {}
  for (const chain of ['56', '97']) {
    out[chain] = {} as Record<FunderClass, ProofTotals>
    for (const f of ['outside', 'team', 'operator'] as const) {
      const r = rows.filter((x) => String(x.chainId) === chain && x.funderClass === f)
      out[chain]![f] = {
        jobs: r.length, wallets: new Set(r.filter((x) => x.funded).map((x) => x.client)).size,
        funded: r.filter((x) => x.funded).length, delivered: r.filter((x) => x.delivered).length, settled: r.filter((x) => x.settled).length,
        refunded: r.filter((x) => x.refunded).length, rated: r.filter((x) => x.rated).length,
        checksDecided: r.reduce((s, x) => s + (x.checks?.decided ?? 0), 0), checksAgreed: r.reduce((s, x) => s + (x.checks?.agreed ?? 0), 0),
      }
    }
  }
  return out
}

export function rowsFrom(chainId: ChainId, per: readonly WalletQuest[]): ProofRow[] {
  const escrow = network(chainId).commerce
  const scan = chainId === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com'
  return per.flatMap((w) => w.hires.map((h): ProofRow => ({
    chainId, jobId: h.jobId, escrow,
    agent: { name: h.agent.name, agentKey: h.agent.agentKey, tokenId: h.agent.agentId, category: h.agent.category },
    operatorClass: h.agent.firstParty ? 'reference' : 'third_party',
    funderClass: funderOf(h), client: w.wallet, counted: h.eligible && w.quest.eligible,
    state: h.state, funded: Boolean(h.tx['funded']), delivered: DELIVERED.has(h.state), settled: Boolean(h.tx['completed']),
    refunded: h.state === 'REFUNDED' || Boolean(h.tx['refunded']), rated: Boolean(h.rating && !h.reasons.includes('rating_unbound')),
    completedAt: h.timestamps['completed'] ?? null,
    checks: null, terms: null, act: null,
    hireTx: h.tx['funded'] ?? h.tx['created'] ?? null,
    verifyUrl: `${scan}/address/${escrow}#readContract`,
  })))
}

async function build(): Promise<Proof> {
  const rows: ProofRow[] = []
  const stats: Proof['stats'] = {}
  for (const chainId of [56, 97] as const) {
    const per = await marqueWallets(chainId)
    stats[String(chainId)] = statsFrom(per)
    rows.push(...rowsFrom(chainId, per))
  }
  // Chain checks and terms: the same cached Result Lens as each Job Room, a few at a time.
  const delivered = rows.filter((r) => r.delivered)
  for (let i = 0; i < delivered.length; i += 6) {
    const batch = delivered.slice(i, i + 6)
    const lenses = await Promise.all(batch.map((r) => jobLens(r.chainId, r.jobId).then((p) => p.value).catch(() => null)))
    batch.forEach((r, k) => {
      const l = lenses[k]
      if (!l) return
      r.checks = { decided: l.summary.checked, agreed: l.summary.agreed }
      r.terms = l.terms ? { met: l.terms.met, of: l.terms.of, source: l.terms.source } : null
    })
  }
  const acts = rowsOf(await db().execute(sql`select job_key, action, tx_hashes from outcome order by created_at`).catch(() => []))
  for (const a of acts) {
    const r = rows.find((x) => `${x.chainId}:${x.jobId}` === String(a['job_key']))
    const txs = (a['tx_hashes'] as string[] | null) ?? []
    if (r) r.act = { action: String(a['action']), tx: txs[txs.length - 1] ?? null }
  }
  rows.sort((a, b) => b.chainId - a.chainId || Number(b.jobId) - Number(a.jobId))
  return { measuredAt: new Date().toISOString(), rows, totals: totalsOf(rows), stats }
}

/** Outside buyers' completed jobs per ISO week (Monday, UTC) and network: the figure BNB Chain can report. */
export function weeklyOutside(rows: readonly ProofRow[]): Array<{ week: string; '56': number; '97': number }> {
  const weeks = new Map<string, { '56': number; '97': number }>()
  for (const r of rows) {
    if (r.funderClass !== 'outside' || !r.settled || !r.completedAt) continue
    const d = new Date(r.completedAt)
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))
    const k = monday.toISOString().slice(0, 10)
    const w = weeks.get(k) ?? { '56': 0, '97': 0 }
    w[String(r.chainId) as '56' | '97'] += 1
    weeks.set(k, w)
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v }))
}

export function proofProjection() {
  return cachedProjection('proof:v2', build, { freshMs: 10 * 60_000, timeoutMs: 180_000 })
}

const CSV_COLS = ['chain', 'job_id', 'escrow', 'agent', 'agent_key', 'operator_class', 'funder_class', 'client', 'counted', 'state', 'funded', 'delivered', 'settled', 'refunded', 'rated', 'checks_decided', 'checks_agreed', 'terms_met', 'terms_of', 'terms_source', 'act', 'act_tx', 'hire_tx', 'verify_url'] as const
const cell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s }

export function proofCsv(rows: readonly ProofRow[]): string {
  const lines = rows.map((r) => [r.chainId, r.jobId, r.escrow, r.agent.name, r.agent.agentKey, r.operatorClass, r.funderClass, r.client, r.counted, r.state, r.funded, r.delivered, r.settled, r.refunded, r.rated,
    r.checks?.decided, r.checks?.agreed, r.terms?.met, r.terms?.of, r.terms?.source, r.act?.action, r.act?.tx, r.hireTx, r.verifyUrl].map(cell).join(','))
  return [CSV_COLS.join(','), ...lines].join('\n') + '\n'
}
