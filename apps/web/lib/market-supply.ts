import type { MarketRow } from './marketplace'

export interface MarketSupplyCategory {
  category: string
  hireable: number
  operators: number
  thirdPartyOperators: number
  firstParty: number
  cheapest: { priceRaw: string; token: string; decimals: number; chainId: number; agentKey: string } | null
}

/** Aggregate the complete filtered listing set before pagination, at one expiry boundary. */
export function marketSupply(rows: readonly MarketRow[], now = Date.now()): MarketSupplyCategory[] {
  return ['yield', 'grid', 'rebalancing', 'health_factor', 'security'].map(category => {
    const hire = rows.filter(r => r.category === category && ['hireable', 'settleable'].includes(r.commerce.state)
      && r.commerce.quoteExpiresAt && Date.parse(r.commerce.quoteExpiresAt) > now)
    const owners = (list: readonly MarketRow[]) => new Set(list.map(r => (r.owner ?? r.agentId).toLowerCase())).size
    const priced = hire.filter(r => r.commerce.priceRaw && r.commerce.token && r.commerce.chainId)
    const units = new Set(priced.map(r => `${r.commerce.chainId}:${r.commerce.token!.address.toLowerCase()}:${r.commerce.token!.decimals}`))
    const cheapest = units.size === 1 ? priced.reduce<MarketRow | null>((best, row) =>
      !best || BigInt(row.commerce.priceRaw!) < BigInt(best.commerce.priceRaw!) ? row : best, null) : null
    const c = cheapest?.commerce
    return {
      category, hireable: hire.length, operators: owners(hire), thirdPartyOperators: owners(hire.filter(r => !r.isReference)),
      firstParty: hire.filter(r => r.isReference).length,
      cheapest: c?.priceRaw && c.token && c.chainId ? { priceRaw: c.priceRaw, token: c.token.symbol, decimals: c.token.decimals, chainId: c.chainId, agentKey: cheapest!.agentId } : null,
    }
  })
}
