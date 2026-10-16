import { NextResponse, type NextRequest } from 'next/server'
import { isSupportedChain, type ChainId } from '@marque/commerce'
import { readClaimToken } from '../../../../../lib/claim'
import { sellerProjection } from '../../../../../lib/seller'
import { builderIdentities, builderView } from '../../../../../lib/builder'

export const dynamic = 'force-dynamic'

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const PRIVATE_HEADERS = { 'Cache-Control': 'no-store', Vary: 'Authorization' }

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
  const auth = req.headers.get('authorization')
  let claim: ReturnType<typeof readClaimToken> = null
  try { claim = auth?.startsWith('Bearer ') ? readClaimToken(auth.slice(7)) : null }
  catch { return NextResponse.json({ error: 'diagnostics_unavailable', detail: 'Private owner diagnostics are unavailable. Public status can still be read without authorization.' }, { status: 503, headers: PRIVATE_HEADERS }) }
  if (auth && !claim) return NextResponse.json({ error: 'claim_expired', detail: 'Sign the ownership proof again to read private diagnostics.' }, { status: 401, headers: PRIVATE_HEADERS })
  try {
    const targets = tokenId
      ? (isSupportedChain(chain) && /^\d{1,12}$/.test(tokenId) ? [{ chainId: chain as ChainId, tokenId }] : null)
      : await builderIdentities(wallet)
    if (!targets) return NextResponse.json({ error: 'bad_request', detail: 'Name the network (56 or 97) and a token id.' }, { status: 400 })
    if (claim && (targets.length !== 1 || targets[0]?.chainId !== claim.chainId || targets[0]?.tokenId !== claim.tokenId || wallet.toLowerCase() !== claim.owner.toLowerCase())) return NextResponse.json({ error: 'claim_mismatch', detail: 'This proof belongs to a different owner or identity.' }, { status: 403, headers: PRIVATE_HEADERS })
    const views = await Promise.all(targets.slice(0, 8).map(async (t) => {
      const v = await builderView(wallet, t.chainId, t.tokenId)
      return { ...v, seller: await sellerProjection(v, claim?.owner ?? null) }
    }))
    return NextResponse.json({ wallet: wallet.toLowerCase(), identities: views }, { headers: PRIVATE_HEADERS })
  } catch (err) {
    if (err instanceof Error && err.message === 'seller_owner_unverified') return NextResponse.json({ error: 'owner_unverified', detail: 'Ownership changed or current chain proof is unavailable. Private diagnostics were not read.' }, { status: 403, headers: PRIVATE_HEADERS })
    console.error('[api/v1/builders/checks]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'checks_unavailable', detail: 'The checks could not be read just now. Try again in a minute.' }, { status: 503 })
  }
}
