import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection } from '@marque/db'
import { boundedCommerceRead } from '@marque/commerce/reads'

/**
 * Wallets that own, or are the agent wallet of, an agent listed on Marque with a live price in the last 30 days (2 Nov).
 * An outside payer in this set is "an outside wallet, also an operator here": a builder hiring another builder's agent.
 * It is still outside Marque's team; the label only says what a reader would find on BscScan in two clicks.
 */
let memo: { at: number; v: Promise<Set<string>> } | null = null
export function operatorWalletsHere(): Promise<Set<string>> {
  if (memo && Date.now() - memo.at < 600_000) return memo.v
  const v = cachedProjection('operator-wallets:v1', async () => {
    const at = Date.now()
    const rows = await boundedCommerceRead(sql`
    with listed as (select distinct agent_id from commerce_quote where ok and created_at > now() - interval '30 days')
    select lower(a.owner_address) as w from agent a join listed l on l.agent_id = a.id where a.owner_address is not null
    union
    select lower(a.agent_wallet) from agent a join listed l on l.agent_id = a.id where a.agent_wallet is not null`)
    return { at, wallets: (((rows as { rows?: unknown[] }).rows ?? rows) as Array<Record<string, unknown>>).map(row => String(row['w'])) }
  }, { freshMs: 600_000, maxStaleMs: 600_000, keepMs: 600_000, timeoutMs: 8_000,
    staleRefreshLeaseMs: 90_000, coordinateCold: true, observedAt: value => value.at })
    .then(projection => {
      if (memo?.v === v) memo.at = Date.parse(projection.computedAt)
      return new Set(projection.value.wallets)
    })
  memo = { at: Date.now(), v }
  v.catch(() => { if (memo?.v === v) memo = null })
  return v
}
