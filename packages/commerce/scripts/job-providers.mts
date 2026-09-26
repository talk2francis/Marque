/** Read-only: who has actually delivered ERC-8183 jobs recently? Maps providers to ERC-8004 agents. */
import { createPublicClient, http, fallback, type Address } from 'viem'
import { bsc } from 'viem/chains'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { agenticCommerceAbi } from '../src/generated.js'
import { NETWORKS } from '../src/config.js'

const c = createPublicClient({ chain: bsc, batch: { multicall: true }, transport: fallback((process.env.BSC_RPC_URLS ?? '').split(',').filter((u) => !u.includes('1rpc')).map((u) => http(u, { timeout: 20_000 }))) })
const commerce = NETWORKS[56].commerce as Address
const counter = await c.readContract({ address: commerce, abi: agenticCommerceAbi, functionName: 'jobCounter' }) as bigint
const N = Number(process.env.N ?? 3000)
const ids = Array.from({ length: N }, (_, i) => counter - BigInt(i)).filter((x) => x > 0n)
const stats = new Map<string, { jobs: number; delivered: number; completed: number; clients: Set<string>; lastJob: bigint }>()
for (let i = 0; i < ids.length; i += 200) {
  const chunk = ids.slice(i, i + 200)
  const res = await Promise.all(chunk.map((id) => c.readContract({ address: commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [id] }).catch(() => null)))
  res.forEach((j, k) => {
    if (!j) return
    const job = j as { provider: string; client: string; status: number; budget: bigint }
    const p = job.provider.toLowerCase()
    if (/^0x0{40}$/.test(p)) return
    const s = stats.get(p) ?? { jobs: 0, delivered: 0, completed: 0, clients: new Set<string>(), lastJob: 0n }
    s.jobs++
    if (job.status === 2 || job.status === 3) s.delivered++
    if (job.status === 3) s.completed++
    s.clients.add(job.client.toLowerCase())
    if (chunk[k]! > s.lastJob) s.lastJob = chunk[k]!
    stats.set(p, s)
  })
}
const providers = [...stats.keys()]
const rows = ((await db().execute(sql`
  select a.token_id, a.name, lower(coalesce(a.agent_wallet, a.owner_address)) w,
    (select string_agg(category, ',') from agent_category k where k.agent_id = a.id and category <> 'unclassified') cats
  from agent a where a.chain_id = 56 and (lower(a.agent_wallet) in (${sql.join(providers.map((p) => sql`${p}`), sql`, `)}) or lower(a.owner_address) in (${sql.join(providers.map((p) => sql`${p}`), sql`, `)}))`)) as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []
const byW = new Map<string, Array<Record<string, unknown>>>()
for (const r of rows as Array<Record<string, unknown>>) byW.set(String(r['w']), [...(byW.get(String(r['w'])) ?? []), r])
const out = [...stats.entries()].sort((a, b) => b[1].delivered - a[1].delivered).slice(0, 40)
console.log(`jobs scanned ${ids.length} (ids ${ids.at(-1)}..${counter}), providers ${stats.size}`)
for (const [p, s] of out) {
  const ag = byW.get(p) ?? []
  console.log(p, `jobs ${s.jobs} delivered ${s.delivered} completed ${s.completed} clients ${s.clients.size} last ${s.lastJob}`, ag.map((a) => `${a['token_id']}:${a['name']}[${a['cats'] ?? '-'}]`).join(' ; ').slice(0, 200))
}
await closeDb()
