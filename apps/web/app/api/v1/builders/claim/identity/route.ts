import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveIdentity } from '../../../../../../lib/identity'
import { issueNonce, buildClaimMessage } from '../../../../../../lib/claim'
import { checkClaimBurst, clientKey } from '../../../../../../lib/limits'
import { readIdentity } from '../../../../../../lib/builder'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Step 1 of the claim rail (P10a): paste a token id or owner address, get the
 * on-chain identity back plus the exact message to sign. No wallet yet.
 */

const body = z.object({ input: z.string().min(1).max(200), chainId: z.union([z.literal(56), z.literal(97)]).optional() })

export async function POST(request: Request) {
  const burst = checkClaimBurst(clientKey(request.headers))
  if (!burst.ok) return NextResponse.json({ error: burst.detail }, { status: 429 })

  let input: z.infer<typeof body>
  try {
    input = body.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'bad_request', detail: 'Provide an ERC-8004 token id or the owner address.' }, { status: 400 })
  }

  // BSC testnet identities are not in Marque's index: read them straight from the registry.
  if (input.chainId === 97) {
    const tokenId = input.input.trim()
    if (!/^\d{1,12}$/.test(tokenId)) return NextResponse.json({ error: 'bad_request', detail: 'On BSC testnet, give the token id.' }, { status: 400 })
    const id = await readIdentity(97, tokenId)
    if (id.readFailed) return NextResponse.json({ error: 'lookup_failed', detail: 'The BSC testnet identity registry did not answer. Try again in a minute.' }, { status: 502 })
    if (!id.owner) return NextResponse.json({ error: 'not_found', detail: `No identity #${tokenId} exists on BSC testnet.` }, { status: 404 })
    const { nonce, token } = issueNonce(tokenId, id.registry, id.owner, 97)
    const message = buildClaimMessage({ tokenId, contract: id.registry, owner: id.owner, nonce, issuedAt: new Date().toISOString(), chainId: 97 })
    return NextResponse.json({
      identity: {
        agentId: id.agentKey, chainId: 97, tokenId, contract: id.registry, owner: id.owner, ownerProvenance: 'ONCHAIN',
        indexerOwner: null, indexerLag: false, name: id.name, description: id.description, imageUrl: null,
        cardUrl: id.services[0]?.endpoint ?? null, declaredProtocols: id.services.map((x) => x.kind),
      },
      nonce, nonceToken: token, message,
      note: 'Sign this message with the wallet that owns the identity. It authorises nothing on chain.',
    })
  }

  const lookup = await resolveIdentity(input.input)
  if (lookup.status === 'not_found') return NextResponse.json({ error: 'not_found', detail: lookup.detail }, { status: 404 })
  if (lookup.status === 'ambiguous') return NextResponse.json({ error: 'ambiguous', detail: lookup.detail, candidates: lookup.candidates }, { status: 409 })
  if (lookup.status === 'error') return NextResponse.json({ error: 'lookup_failed', detail: lookup.detail }, { status: 502 })

  const id = lookup.identity
  const { nonce, token } = issueNonce(id.tokenId, id.contract, id.owner)
  const issuedAt = new Date().toISOString()
  const message = buildClaimMessage({ tokenId: id.tokenId, contract: id.contract, owner: id.owner, nonce, issuedAt })

  return NextResponse.json({
    identity: {
      agentId: id.agentId,
      chainId: id.chainId,
      tokenId: id.tokenId,
      contract: id.contract,
      owner: id.owner,
      ownerProvenance: id.ownerProvenance,
      indexerOwner: id.indexerOwner,
      indexerLag: id.indexerOwner != null && id.indexerOwner.toLowerCase() !== id.owner.toLowerCase(),
      name: id.name,
      description: id.description,
      imageUrl: id.imageUrl,
      cardUrl: id.cardUrl,
      declaredProtocols: id.declaredProtocols,
    },
    nonce,
    nonceToken: token,
    message,
    note: 'Sign this message with the wallet that owns the identity. It authorises nothing on chain.',
  })
}
