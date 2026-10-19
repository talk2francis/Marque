import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { db, agent, agentCategory, builderListing, conformanceResult, CATEGORIES, SERVICE_KINDS } from '@marque/db'
import { readClaimToken, claimOwnerIsCurrent } from '../../../../../../lib/claim'
import { checkClaimBurst, clientKey } from '../../../../../../lib/limits'
import { withDeadline } from '../../../../../../lib/deadline'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Step 4: publish the listing. No email, no approval queue — a proven owner
 * writes their own row and it is live.
 *
 * What gets written: a first-party `builder_listing` (the proof, the details,
 * the test result) and an `agent_category` so the identity appears under the
 * category it was listed in when indexed. Testnet identities may publish an
 * owner listing using chain proof without a mainnet-index row; no derived
 * registry row is invented, and public storefronts remain mainnet only.
 */

const LISTABLE = CATEGORIES.filter((c) => c !== 'unclassified') as readonly string[]
const LISTABLE_KINDS = ['a2a', 'mcp', 'x402', 'erc8183'] as const

const body = z.object({
  claimToken: z.string().min(1).max(4000),
  category: z.enum(LISTABLE as [string, ...string[]]),
  serviceKind: z.enum(LISTABLE_KINDS),
  endpoint: z.string().url().max(500).refine(v => new URL(v).protocol === 'https:', 'Use an HTTPS service endpoint.'),
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

  const [row] = await db().select({ id: agent.id, tokenId: agent.tokenId, chainId: agent.chainId, registry: agent.contractAddress }).from(agent).where(eq(agent.id, claim.agentId)).limit(1)
  if (!row && claim.chainId !== 97) {
    return NextResponse.json({
      error: 'not_indexed',
      detail: 'This identity is not in the Marque index yet. The chain is swept every few minutes; try publishing again shortly.',
    }, { status: 409 })
  }
  if (row && (row.tokenId !== claim.tokenId || row.chainId !== claim.chainId || row.registry.toLowerCase() !== claim.contract.toLowerCase())) return NextResponse.json({ error: 'identity_mismatch', detail: 'The indexed identity does not match this proof.' }, { status: 409 })

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
  let ownerChanged = false
  try {
    await db().transaction(async tx => {
      // Serialize concurrent publication for this identity. The existing unique key
      // makes retries a single listing; category and listing commit together.
      await tx.execute(sql`set local statement_timeout = '5000ms'`)
      // A preceding publication can spend a bounded ownership read in this lock.
      // Give retries room to serialize, then restore the short write-lock budget.
      await tx.execute(sql`set local lock_timeout = '5000ms'`)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${claim.agentId}, 0))`)
      await tx.execute(sql`set local lock_timeout = '1000ms'`)
      // Check after acquiring the serialization lock, never using claim-time ownership.
      if (!await withDeadline(claimOwnerIsCurrent(claim), 8000)) {
        ownerChanged = true
        throw new Error('owner_changed')
      }
      // Keep older listing-only proofs before refreshing ownership. Existing proof
      // observations are append-only; the mutable listing is just their projection.
      await tx.execute(sql`insert into builder_proof (agent_key, chain_id, token_id, registry, owner_address, message, signature, nonce, verified_at)
        select l.agent_id, l.chain_id, l.token_id, l.contract_address, l.owner_address, l.proof_message, l.proof_signature, l.proof_nonce, l.verified_at
        from builder_listing l where l.agent_id = ${claim.agentId}
          and not exists (select 1 from builder_proof p where p.agent_key = l.agent_id and p.signature = l.proof_signature and p.message = l.proof_message)`)
      await tx.execute(sql`insert into builder_proof (agent_key, chain_id, token_id, registry, owner_address, message, signature, nonce, verified_at)
        select ${claim.agentId}, ${claim.chainId}, ${claim.tokenId}, ${claim.contract.toLowerCase()}, ${claim.owner.toLowerCase()}, ${claim.proofMessage}, ${claim.proofSignature}, ${claim.proofNonce}, ${now.toISOString()}::timestamptz
        where not exists (select 1 from builder_proof where agent_key = ${claim.agentId} and signature = ${claim.proofSignature} and message = ${claim.proofMessage})`)
      await tx.insert(builderListing).values({
        agentId: claim.agentId,
        chainId: claim.chainId,
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
          chainId: claim.chainId, tokenId: claim.tokenId, contractAddress: claim.contract,
          ownerAddress: claim.owner, proofMessage: claim.proofMessage, proofSignature: claim.proofSignature,
          proofNonce: claim.proofNonce, verifiedAt: now,
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
        // Same proof + same payload is a true no-op, including row timestamps.
        setWhere: sql`(builder_listing.owner_address, builder_listing.proof_nonce, builder_listing.proof_signature,
          builder_listing.category, builder_listing.service_kind, builder_listing.endpoint,
          builder_listing.inputs, builder_listing.outputs, builder_listing.price, builder_listing.conformance_result_id,
          builder_listing.status, builder_listing.withdrawn_at)
          is distinct from (excluded.owner_address, excluded.proof_nonce, excluded.proof_signature,
          excluded.category, excluded.service_kind, excluded.endpoint, excluded.inputs, excluded.outputs,
          excluded.price, excluded.conformance_result_id, excluded.status, excluded.withdrawn_at)`,
      })

      if (row) await tx.insert(agentCategory).values({
        agentId: claim.agentId,
        category: input.category as (typeof CATEGORIES)[number],
        confidence: 1,
        method: 'owner_declared',
        rationale: `Listed under ${input.category} by the verified owner ${claim.owner}.`,
      }).onConflictDoUpdate({
        target: [agentCategory.agentId, agentCategory.category],
        set: { confidence: 1, method: 'owner_declared', rationale: sql`excluded.rationale`, assignedAt: now },
        setWhere: sql`(agent_category.confidence, agent_category.method, agent_category.rationale) is distinct from (excluded.confidence, excluded.method, excluded.rationale)`,
      })
    })
  } catch {
    return NextResponse.json(ownerChanged
      ? { error: 'owner_changed', detail: 'Ownership changed. Prove control with the current owner before publishing.' }
      : { error: 'publish_unavailable', detail: 'Ownership or publication could not be confirmed. Retry safely; identical requests do not create another listing.' }, { status: ownerChanged ? 409 : 503 })
  }

  return NextResponse.json({
    published: true,
    agentId: claim.agentId,
    profileUrl: claim.chainId === 56 ? `/agents/56/${claim.tokenId}` : '/builders',
    chainId: claim.chainId, indexStatus: row ? 'indexed' : 'chain_only',
    sourceClaimVersion: 1, listingLevel: 'owner_listed',
    note: `Owner-listed. ${claim.chainId === 97 ? 'BSC testnet listings appear in builder checks; public storefronts currently support BSC mainnet. ' : ''}The stored signature proves identity control, not a Warrant, hireability or official BNB qualification. Read the checklist for current local quality evidence.`,
  })
}
