import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'
import { chainClient } from '@marque/commerce'

/**
 * Network fees actually paid, from receipts of jobs hired through Marque on BSC mainnet: the buyer's transactions for
 * one hire (create, register, budget, approve if needed, fund) and the settlement (JobCompleted). Medians, with the
 * number of jobs measured. Recomputed once a day.
 */
export interface GasCosts { measuredAt: string; hires: number; settlements: number; hireGasMedian: number | null; hireBnbMedian: number | null; hireTxsMedian: number | null; settleGasMedian: number | null; settleBnbMedian: number | null; sponsoredSettlements: number }

const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : null }

async function build(): Promise<GasCosts> {
  const rows = (await db().execute(sql`
    select e.job_id, e.name, e.tx_hash from commerce_event e join commerce_job j on j.chain_id = e.chain_id and j.job_id = e.job_id
    where e.chain_id = 56 and j.intent_id is not null and e.name in ('JobCreated', 'JobRegistered', 'BudgetSet', 'JobFunded', 'JobCompleted')
    order by e.job_id`)) as unknown as Array<{ job_id: string; name: string; tx_hash: string }>
  const c = chainClient(56)
  const receipts = new Map<string, { gas: bigint; price: bigint }>()
  for (const tx of [...new Set(rows.map((r) => r.tx_hash))]) {
    const rc = await c.getTransactionReceipt({ hash: tx as `0x${string}` }).catch(() => null)
    if (rc) receipts.set(tx, { gas: rc.gasUsed, price: rc.effectiveGasPrice })
  }
  const jobs = new Map<string, { hire: Set<string>; settle: string | null }>()
  for (const r of rows) {
    const j = jobs.get(r.job_id) ?? { hire: new Set<string>(), settle: null }
    if (r.name === 'JobCompleted') j.settle = r.tx_hash; else j.hire.add(r.tx_hash)
    jobs.set(r.job_id, j)
  }
  const hires: Array<{ gas: number; bnb: number; txs: number }> = []
  const settles: Array<{ gas: number; bnb: number }> = []
  for (const j of jobs.values()) {
    const h = [...j.hire].map((t) => receipts.get(t)).filter((x): x is { gas: bigint; price: bigint } => Boolean(x))
    if (h.length >= 3) hires.push({ gas: Number(h.reduce((s, x) => s + x.gas, 0n)), bnb: h.reduce((s, x) => s + Number(x.gas * x.price) / 1e18, 0), txs: h.length })
    const s = j.settle ? receipts.get(j.settle) : null
    if (s) settles.push({ gas: Number(s.gas), bnb: Number(s.gas * s.price) / 1e18 })
  }
  return {
    measuredAt: new Date().toISOString(), hires: hires.length, settlements: settles.length,
    hireGasMedian: med(hires.map((h) => h.gas)), hireBnbMedian: med(hires.map((h) => h.bnb)), hireTxsMedian: med(hires.map((h) => h.txs)),
    settleGasMedian: med(settles.map((s) => s.gas)), settleBnbMedian: med(settles.map((s) => s.bnb)), sponsoredSettlements: settles.filter((s) => s.bnb === 0).length,
  }
}

export function gasCosts() {
  return cachedProjection('adopt:gas:v1', build, { freshMs: 24 * 3600_000, timeoutMs: 20_000, staleWhileRevalidate: true })
}
