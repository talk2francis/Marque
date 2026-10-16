import { NextResponse, type NextRequest } from 'next/server'
import { isSupportedChain, type ChainId } from '@marque/commerce'
import { builderIdentities, builderView } from '../../../../../lib/builder'

export const dynamic = 'force-dynamic'

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

/**
 * GET /api/v1/builders/checks?wallet=0x..[&chainId=97&tokenId=2501]
 *
 * The builder checklist (DESIGN-SYSTEM.md 8.8) for one identity, or for every identity
 * the wallet owns or has proved. Each check says pass, fail with the exact fix, or not
 * yet. These checks never publish. The owner publishes through the authenticated claim rail.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const wallet = p.get('wallet') ?? ''
  if (!ADDRESS.test(wallet)) return NextResponse.json({ error: 'bad_request', detail: 'Send the wallet address.' }, { status: 400 })
  const chain = Number(p.get('chainId') ?? '')
  const tokenId = p.get('tokenId')
  try {
    const targets = tokenId
      ? (isSupportedChain(chain) && /^\d{1,12}$/.test(tokenId) ? [{ chainId: chain as ChainId, tokenId }] : null)
      : await builderIdentities(wallet)
    if (!targets) return NextResponse.json({ error: 'bad_request', detail: 'Name the network (56 or 97) and a token id.' }, { status: 400 })
    const views = await Promise.all(targets.slice(0, 8).map(async (t) => {
      const v = await builderView(wallet, t.chainId, t.tokenId)
      return v
    }))
    return NextResponse.json({ wallet: wallet.toLowerCase(), identities: views }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[api/v1/builders/checks]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'checks_unavailable', detail: 'The checks could not be read just now. Try again in a minute.' }, { status: 503 })
  }
}
