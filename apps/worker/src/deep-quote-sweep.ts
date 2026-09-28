/**
 * Deep quote sweep (28 Sep): ask every live A2A service on BSC for a price once.
 *
 *   set -a; . /root/.marque/secrets.env; set +a
 *   node --import tsx apps/worker/src/deep-quote-sweep.ts [--limit=20000] [--hosts=16]
 *
 * The routine quote probe only asks agents that are classified into a category or
 * advertise the ERC-8183 negotiate skill, so on 28 Sep 14,679 live A2A services had
 * never been asked at all. A price request is harmless: it creates no job and moves no
 * money. Each attempt is stored exactly as the probe stores it (first-party
 * observation), so a seller found here keeps being re-quoted by the worker.
 *
 * Polite by construction: one request at a time per host, `--hosts` hosts in parallel,
 * a 6 s timeout, through safeFetch (SSRF guard, size cap).
 */
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { requestQuote, recordQuote, probeTask } from '@marque/commerce'

const arg = (k: string, d: number): number => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d)
const LIMIT = arg('limit', 20000)
const HOSTS = arg('hosts', 16)

const rowsOf = (r: unknown): Array<Record<string, unknown>> => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

const rows = rowsOf(await db().execute(sql`
  select distinct on (s.id) s.id as service_id, s.agent_id, a.agent_wallet, a.owner_address,
         coalesce(p.executable_endpoint, s.resolved_endpoint, s.endpoint) as endpoint
  from agent_service s
  join agent a on a.id = s.agent_id
  join probe_schedule q on q.service_id = s.id
  join probe p on p.id = q.last_probe_id
  where a.chain_id = 56 and s.kind = 'a2a' and p.liveness in ('live', 'unbound', 'bad_schema')
    and not exists (select 1 from commerce_quote c where c.service_id = s.id)
  limit ${LIMIT}`))

const byHost = new Map<string, Array<Record<string, unknown>>>()
for (const r of rows) {
  let host = 'invalid'
  try { host = new URL(String(r['endpoint'])).host } catch { continue }
  if (!byHost.has(host)) byHost.set(host, [])
  byHost.get(host)!.push(r)
}
console.log(JSON.stringify({ event: 'start', services: rows.length, hosts: byHost.size }))

const queue = [...byHost.values()]
const tally: Record<string, number> = {}
const found: Array<{ agentId: string; endpoint: string; chainId: number | null }> = []
let done = 0
await Promise.all(Array.from({ length: HOSTS }, async () => {
  for (;;) {
    const group = queue.shift()
    if (!group) return
    for (const r of group) {
      const c = { agentId: String(r['agent_id']), serviceId: Number(r['service_id']), endpoint: String(r['endpoint']) }
      const q = await requestQuote(c.endpoint, probeTask('general'), {
        agentWallet: r['agent_wallet'] ? String(r['agent_wallet']) : null,
        agentOwner: r['owner_address'] ? String(r['owner_address']) : null,
        timeoutMs: 6_000,
      })
      await recordQuote('probe', c, q, { sweep: 'deep-2026-09-28' })
      const k = q.ok ? 'ok' : q.reason
      tally[k] = (tally[k] ?? 0) + 1
      if (q.ok) found.push({ agentId: c.agentId, endpoint: c.endpoint, chainId: q.chainId })
      if (++done % 500 === 0) console.log(JSON.stringify({ event: 'progress', done, tally }))
    }
  }
}))
console.log(JSON.stringify({ event: 'done', done, tally, found }))
await closeDb()
