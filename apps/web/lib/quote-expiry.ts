import type { MarketRow } from '../app/register/market-model'

/** Pure, shared by the server projection and both browser marketplace views. */
export function expireMarketQuote<T extends MarketRow>(row: T, now = Date.now()): T {
  const c = row.commerce
  if (!['hireable', 'settleable'].includes(c.state) || (c.quoteExpiresAt && Date.parse(c.quoteExpiresAt) > now)) return row
  return { ...row, price: row.priceProvenance === 'MEASURED' ? null : row.price,
    priceProvenance: row.priceProvenance === 'MEASURED' ? null : row.priceProvenance,
    commerce: { ...c, state: 'quoteable', priceRaw: null, token: null, failure: 'expired' } }
}
