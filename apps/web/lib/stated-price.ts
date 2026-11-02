/**
 * Price truth (2 Nov): what an agent's own registry description says it charges, read only from the one phrasing
 * operators use ("over x402 for 0.05 USD1", "over ERC-8183 for 0.10 $U"). Free text is never guessed at: anything
 * else returns null. Marque's listed price is always the live quote the hire will charge, on BNB Chain's ERC-8183
 * escrow; when the agent's own words differ, both are shown, labelled.
 */
export interface StatedPrice { amount: string; token: string; rail: string }

const RAIL: Record<string, string> = { x402: 'x402', 'erc-8183': 'ERC-8183', erc8183: 'ERC-8183', a2a: 'A2A', mcp: 'MCP' }

export function statedPrice(description: string | null | undefined): StatedPrice | null {
  const m = description?.match(/\bover\s+(x402|ERC-?8183|A2A|MCP)\s+for\s+\$?(\d+(?:\.\d+)?)\s*\$?(U|USD1|USDT|USDC|BNB)\b/i)
  if (!m) return null
  return { rail: RAIL[m[1]!.toLowerCase()] ?? m[1]!, amount: m[2]!, token: m[3]!.toUpperCase() === 'U' ? 'U' : m[3]!.toUpperCase() }
}

/** The agent's own stated price when it differs from Marque's quote ("0.01 U"), else null. */
export function statedPriceDiffers(description: string | null | undefined, quoted: string | null | undefined): StatedPrice | null {
  const s = statedPrice(description)
  if (!s || !quoted) return s && !quoted ? s : null
  const q = quoted.match(/(\d+(?:\.\d+)?)\s*([A-Za-z0-9]+)/)
  if (!q) return s
  const same = Number(q[1]) === Number(s.amount) && q[2]!.toUpperCase() === s.token.toUpperCase() && s.rail === 'ERC-8183'
  return same ? null : s
}

export const statedPriceWords = (s: StatedPrice) => `${s.amount} ${s.token} over ${s.rail}`
