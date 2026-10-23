import { NextResponse, type NextRequest } from 'next/server'
import { parseTransaction, type Hex } from 'viem'
import { z } from 'zod'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/pass/relay: a same-origin pass-through to BNB Chain's MegaFuel paymaster for Marque
 * Pass, BSC testnet only (G-P1 keeps mainnet off). It forwards exactly two calls: the sponsorship
 * check for an unsigned transaction, and an already signed, zero-gas-price testnet transaction.
 * Both are public data; no key, PRF output or secret ever reaches Marque.
 */
const MEGAFUEL_TESTNET = 'https://bsc-megafuel-testnet.nodereal.io'
const Hex = z.string().regex(/^0x[0-9a-fA-F]*$/)
const Body = z.discriminatedUnion('method', [
  z.object({ method: z.literal('pm_isSponsorable'), params: z.tuple([z.object({ to: Hex, from: Hex, value: Hex, data: Hex, gas: Hex })]) }),
  z.object({ method: z.literal('eth_sendRawTransaction'), params: z.tuple([Hex]) }),
])

export async function POST(req: NextRequest) {
  const limit = checkWindow('pass-relay', clientKey(req.headers), 40, 60_000, 'The relay allows 40 calls a minute.')
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited', detail: limit.detail }, { status: 429 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (parsed.data.method === 'eth_sendRawTransaction') {
    let tx
    try { tx = parseTransaction(parsed.data.params[0] as Hex) } catch { return NextResponse.json({ error: 'bad_request', detail: 'Not a signed transaction.' }, { status: 400 }) }
    if (tx.chainId !== 97) return NextResponse.json({ error: 'testnet_only', detail: 'Sponsorship is used on BSC testnet only.' }, { status: 403 })
    // viem omits a zero gas price when it parses, so absent means zero here.
    if (tx.gasPrice !== undefined && tx.gasPrice !== 0n) return NextResponse.json({ error: 'not_sponsored', detail: 'Only zero-gas-price transactions go to the paymaster.' }, { status: 400 })
  }
  try {
    const r = await fetch(MEGAFUEL_TESTNET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...parsed.data }), signal: AbortSignal.timeout(15_000) })
    const j = await r.json() as { result?: unknown; error?: { message?: string } }
    if (j.error) return NextResponse.json({ error: 'relay_rejected', detail: (j.error.message ?? 'rejected').slice(0, 200) }, { status: 502 })
    return NextResponse.json({ result: j.result ?? null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'relay_unavailable' }, { status: 503 })
  }
}
