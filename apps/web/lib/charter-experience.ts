import 'server-only'
import { sql } from 'drizzle-orm'
import { chartersDb } from '@marque/db'
import { DECLARED_EXECUTORS, KIND_BY_CODE, type CharterKind } from '@marque/charters'
export type CharterExecution = { chainId: number; kind: CharterKind; actions: number; lastAction: string }
let memo: { at: number; value: Map<string, CharterExecution[]> } | null = null
/** Only agent-declared executor accounts can earn an Executed chip (C8). No inference from category or name. */
export async function charterExperience(): Promise<Map<string, CharterExecution[]>> {
  if (memo && Date.now() - memo.at < 60_000) return memo.value
  const executors = [...new Set(Object.values(DECLARED_EXECUTORS).flat().map(a => a.toLowerCase()))]
  const result = await chartersDb().execute(sql`select caller, chain_id, kind, count(*)::int as actions, max(block_time) as last
    from charter_v2_event where caller in (${sql.join(executors.map(a => sql`${a}`), sql`, `)})
    and event in ('Repaid','Supplied','Withdrew','Traded','Rebalanced','Exited') group by caller, chain_id, kind`)
  const rows = ((result as { rows?: unknown[] }).rows ?? result) as Array<{ caller: string; chain_id: number; kind: number; actions: number; last: string }>
  const value = new Map<string, CharterExecution[]>()
  for (const [id, accounts] of Object.entries(DECLARED_EXECUTORS)) {
    const chain = Number(id.split(':')[0])
    value.set(id, rows.filter(r => r.chain_id === chain && accounts.some(a => a.toLowerCase() === r.caller.toLowerCase()) && KIND_BY_CODE[r.kind] && r.actions > 0)
      .map(r => ({ chainId:r.chain_id, kind:KIND_BY_CODE[r.kind]!, actions:r.actions, lastAction:new Date(r.last).toISOString() })))
  }
  memo = { at:Date.now(), value }; return value
}
