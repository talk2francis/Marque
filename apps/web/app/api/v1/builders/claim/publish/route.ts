import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { db, agent, agentCategory, builderListing, conformanceResult, CATEGORIES, SERVICE_KINDS } from '@marque/db'
import { readClaimToken } from '../../../../../../lib/claim'
import { checkClaimBurst, clientKey } from '../../../../../../lib/limits'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Step 4: publish the listing. No email, no approval queue — a proven owner
 * writes their own row and it is live.
 *
 * What gets written: a first-party `builder_listing` (the proof, the details,
 * the test result) and an `agent_category` so the identity appears under the
 * category it was listed in. The `agent` row itself is derived state and must
 * already exist from ingest; if it does not yet, we say so rather than invent
 * one.
 */

const LISTABLE = CATEGORIES.filter((c) => c !== 'unclassified') as readonly string[]
const LISTABLE_KINDS = ['a2a', 'mcp', 'x402', 'erc8183'] as const

const body = z.object({
  claimToken: z.string().min(1).max(4000),
  category: z.enum(LISTABLE as [string, ...string[]]),
  serviceKind: z.enum(LISTABLE_KINDS),
  endpoint: z.string().url().max(500),
  inputs: z.string().max(2000).optional(),
  outputs: z.string().max(2000).optional(),
  price: z.string().max(120).optional(),
  conformanceResultId: z.number().int().positive().nullable().optional(),
})

export async function POST(request: Request) {
  const burst = checkClaimBurst(clientKey(request.headers))
  if (!burst.ok) return NextResponse.json({ error: burst.detail }, { status: 429 })

  let input: z.infer<typeof body>
  try {
    input = body.parse(await request.json())
  } catch (err) {
    const detail = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'check the listing fields'
    return NextResponse.json({ error: 'bad_request', detail }, { status: 400 })
  }

  if (!SERVICE_KINDS.includes(input.serviceKind)) {
    return NextResponse.json({ error: 'bad_request', detail: 'unknown interface kind' }, { status: 400 })
  }

  const claim = readClaimToken(input.claimToken)
  if (!claim) return NextResponse.json({ error: 'claim_expired', detail: 'Prove control again — the claim window closed.' }, { status: 401 })

  const [row] = await db().select({ id: agent.id, tokenId: agent.tokenId }).from(agent).where(eq(agent.id, claim.agentId)).limit(1)
  if (!row) {
    return NextResponse.json({
      error: 'not_indexed',
      detail: 'This identity is not in the Marque index yet. The chain is swept every few minutes; try publishing again shortly.',
    }, { status: 409 })
  }

  // A conformance result, if cited, must belong to this identity.
  const conformanceResultId: number | null = input.conformanceResultId ?? null
  if (conformanceResultId != null) {
    const [cr] = await db()
      .select({ id: conformanceResult.id, agentId: conformanceResult.agentId })
      .from(conformanceResult).where(eq(conformanceResult.id, conformanceResultId)).limit(1)
    if (!cr || cr.agentId !== claim.agentId) {
      return NextResponse.json({ error: 'bad_request', detail: 'The cited test result is not for this identity.' }, { status: 400 })
    }
  }

  if (!claim.proofSignature || !claim.proofMessage) {
    return NextResponse.json({ error: 'claim_expired', detail: 'Prove control again — the proof did not carry through.' }, { status: 401 })
  }

  const now = new Date()
  await db().insert(builderListing).values({
    agentId: claim.agentId,
    chainId: 56,
    tokenId: claim.tokenId,
    contractAddress: claim.contract,
    ownerAddress: claim.owner,
    proofMessage: claim.proofMessage,
    proofSignature: claim.proofSignature,
    proofNonce: claim.proofNonce,
    verifiedAt: now,
    category: input.category as (typeof CATEGORIES)[number],
    serviceKind: input.serviceKind,
    endpoint: input.endpoint,
    inputs: input.inputs ?? null,
    outputs: input.outputs ?? null,
    price: input.price?.trim() ? input.price.trim() : null,
    conformanceResultId,
    status: 'published',
    publishedAt: now,
    withdrawnAt: null,
  }).onConflictDoUpdate({
    target: builderListing.agentId,
    set: {
      category: input.category as (typeof CATEGORIES)[number],
      serviceKind: input.serviceKind,
      endpoint: input.endpoint,
      inputs: input.inputs ?? null,
      outputs: input.outputs ?? null,
      price: input.price?.trim() ? input.price.trim() : null,
      conformanceResultId,
      status: 'published',
      publishedAt: now,
      withdrawnAt: null,
    },
  })

  await db().insert(agentCategory).values({
    agentId: claim.agentId,
    category: input.category as (typeof CATEGORIES)[number],
    confidence: 1,
    method: 'owner_declared',
    rationale: `Listed under ${input.category} by the verified owner ${claim.owner}.`,
  }).onConflictDoUpdate({
    target: [agentCategory.agentId, agentCategory.category],
    set: { confidence: 1, method: 'owner_declared', rationale: sql`excluded.rationale`, assignedAt: now },
  })

  return NextResponse.json({
    published: true,
    agentId: claim.agentId,
    profileUrl: `/agents/56/${row.tokenId}`,
    note: 'Live now. No email, no queue. The listing is signed by the owner and the signature is on the record.',
  })
}
