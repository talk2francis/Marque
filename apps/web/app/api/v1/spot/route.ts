import { NextResponse, type NextRequest } from 'next/server'
import { publicClient } from '@marque/chain'
import { cachedProjection } from '@marque/db'
import { priceInUsdt, BSC_ADDRESSES } from '@marque/positions'
import type { Address } from 'viem'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/spot?symbol=BNB: the mid price in USDT from the deepest PancakeSwap V3
 * pool on BSC mainnet, with its block (ONCHAIN). The hire sheet uses it to offer a
 * grid band around the current price; it is never used as a quote.
 */
const TOKENS: Record<string, { address: Address; decimals: number }> = {
  BNB: { address: BSC_ADDRESSES.wbnb as Address, decimals: 18 },
  BTCB: { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 },
  ETH: { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
  CAKE: { address: BSC_ADDRESSES.cake as Address, decimals: 18 },
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').toUpperCase()
  const t = TOKENS[symbol]
  if (!t) return NextResponse.json({ error: 'bad_request', detail: `symbol is one of ${Object.keys(TOKENS).join(', ')}.` }, { status: 400 })
  try {
    const p = await cachedProjection(`spot:${symbol}`, async () => {
      const client = publicClient()
      const block = await client.getBlockNumber()
      const price = await priceInUsdt(client, t.address, t.decimals, block)
      return { symbol, quote: 'USDT', price, blockNumber: block.toString(), provenance: 'ONCHAIN', source: 'PancakeSwap V3 pool mid price', readAt: new Date().toISOString() }
    }, { freshMs: 20_000, timeoutMs: 8_000 })
    return NextResponse.json(p.value, { headers: { 'Cache-Control': 'public, max-age=15' } })
  } catch {
    return NextResponse.json({ error: 'spot_unavailable', detail: 'The price could not be read from PancakeSwap just now.' }, { status: 503 })
  }
}
