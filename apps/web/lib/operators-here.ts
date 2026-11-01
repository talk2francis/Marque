import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'

/**
 * Wallets that own, or are the agent wallet of, an agent listed on Marque with a live price in the last 30 days (2 Nov).
 * An outside payer in this set is "an outside wallet, also an operator here": a builder hiring another builder's agent.
 * It is still outside Marque's team; the label only says what a reader would find on BscScan in two clicks.
 */
let memo: { at: number; v: Promise<Set<string>> } | null = null
export function operatorWalletsHere(): Promise<Set<string>> {
  if (memo && Date.now() - memo.at < 600_000) return memo.v
  const v = db().execute(sql`
    with listed as (select distinct agent_id from commerce_quote where ok and created_at > now() - interval '30 days')
    select lower(a.owner_address) as w from agent a join listed l on l.agent_id = a.id where a.owner_address is not null
    union
    select lower(a.agent_wallet) from agent a join listed l on l.agent_id = a.id where a.agent_wallet is not null`)
    .then((r) => new Set((((r as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as Array<Record<string, unknown>>).map((x) => String(x['w']))))
  memo = { at: Date.now(), v }
  v.catch(() => { memo = null })
  return v
}
