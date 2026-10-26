import 'server-only'
import { createHash } from 'node:crypto'
import { teamWallets } from '@marque/commerce'
import { marketplaceAgents, type MarketRow } from './marketplace'

/**
 * The practice-hire picker (Set and Earn next step): agents hireable on BSC testnet right now that this wallet has not
 * hired yet, outside builds first, then Marque's reference agents. Inside each group the order rotates every ten
 * minutes by a hash of the agent id, so no outside builder is always first or always last. Nothing here is paid for
 * or arranged by Marque: the buyer's own wallet hires through BNB Chain's escrow with free test tokens.
 */
export interface PracticePick {
  agentId: string
  tokenId: string | null
  name: string
  category: string | null
  price: string | null
  outside: boolean
  /** Listed on Marque by its outside builder (signed claim). */
  listed: boolean
  reference: boolean
  imageUrl: string | null
  passed: boolean
}

const ROTATE_MS = 10 * 60_000
const rank = (agentId: string, slot: number) => createHash('sha256').update(`${slot}:${agentId}`).digest().readUInt32BE(0)

/** Listed on Marque by an outside builder first, then other outside agents, then Marque's own; fair rotation inside each. */
export function orderPicks<T extends { agentId: string; outside: boolean; listed?: boolean }>(rows: T[], now = Date.now()): T[] {
  const slot = Math.floor(now / ROTATE_MS)
  const tier = (r: T) => (r.listed ? 2 : r.outside ? 1 : 0)
  return [...rows].sort((a, b) => tier(b) - tier(a) || rank(a.agentId, slot) - rank(b.agentId, slot))
}

export async function practicePicks(hiredKeys: readonly string[], n = 3): Promise<{ picks: PracticePick[]; available: number }> {
  const { rows } = await marketplaceAgents({ lane: 'practice', tab: 'ready', failed: 'group', limit: 300 })
  const team = new Set(teamWallets())
  const hired = new Set(hiredKeys)
  const open = rows
    .filter((r: MarketRow) => r.tokenId && !hired.has(`97:${r.tokenId}`))
    .map((r): PracticePick => ({
      agentId: r.agentId, tokenId: r.tokenId, name: r.name, category: r.category, price: r.price,
      outside: !r.isReference && !(r.owner && team.has(r.owner.toLowerCase())), listed: Boolean(r.builtOutside),
      reference: r.isReference, imageUrl: r.identity.imageUrl, passed: r.warrant.status === 'warranted',
    }))
  return { picks: orderPicks(open).slice(0, n), available: open.length }
}
