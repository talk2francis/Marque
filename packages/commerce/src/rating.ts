import { sql } from 'drizzle-orm'
import { keccak256, parseAbi, toBytes, type Abi } from 'viem'
import { db, ratingComment, firstPartyAgents } from '@marque/db'
import { network, type ChainId } from './config.js'
import { chainClient } from './chain.js'
import { REPUTATION_REGISTRY, reputationAbi } from './indexer.js'
import { DELIVERED, type JobState } from './state.js'
import { HireError } from './hire.js'
import type { Call } from './calls.js'
import { teamWallets } from './quest.js'

/**
 * Ratings (SPEC-TRACKING 8, P2-04). The server never signs: it checks the guards, stores
 * the optional comment behind the feedbackURI, and returns the exact giveFeedback call
 * for the buyer's own wallet. The indexer then reads NewFeedback back from chain.
 */

const identityAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
])

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

export interface RatingTarget { chainId: ChainId; jobId: string; client: string; state: JobState; agentTokenId: string; category: string | null; endpoint: string; slug: string | null }

/** The job, and the ERC-8004 token id its agent has on THIS chain's registry. */
export async function ratingTarget(chainId: ChainId, jobId: string): Promise<RatingTarget> {
  const [j] = rowsOf(await db().execute(sql`
    select j.client, j.state, j.provider, i.agent_id, i.category,
           (select a.token_id from agent a where a.id = i.agent_id or (i.agent_id is null and a.agent_wallet = j.provider and a.chain_id = 56) limit 1) as token_id,
           (select coalesce(p.manifest->>'url', s.resolved_endpoint, s.endpoint) from agent_service s left join probe_schedule ps on ps.service_id = s.id left join probe p on p.id = ps.last_probe_id
              where s.id = i.service_id limit 1) as endpoint
    from commerce_job j left join hire_intent i on i.id = j.intent_id
    where j.chain_id = ${chainId} and j.job_id = ${jobId}`))
  if (!j) throw new HireError('unknown_job', 'Marque has not indexed that job yet. Give it a few seconds.', 404)
  const mainnetToken = j['token_id'] ? String(j['token_id']) : null
  if (!mainnetToken) throw new HireError('unknown_agent', 'That job pays an address with no ERC-8004 identity Marque knows.', 422)
  const first = firstPartyAgents().find((f) => String(f.tokenId) === mainnetToken) ?? null
  // Testnet: first-party agents carry a separate testnet registration.
  const agentTokenId = chainId === 56 ? mainnetToken : first?.testnet?.chainId === chainId ? String(first.testnet.tokenId) : null
  if (!agentTokenId) throw new HireError('no_identity_on_chain', 'This agent has no ERC-8004 identity on this network to rate.', 422)
  return {
    chainId, jobId, client: String(j['client']), state: String(j['state']) as JobState, agentTokenId,
    category: j['category'] ? String(j['category']) : first?.category ?? null,
    endpoint: j['endpoint'] ? String(j['endpoint']) : first ? `https://marque.trade/agents/${first.slug}/a2a` : '',
    slug: first?.slug ?? null,
  }
}

/** The canonical JSON a rating's feedbackHash commits to (SPEC-TRACKING 8). Key order is fixed. */
export function canonicalFeedback(x: { chainId: number; jobId: string; agentId: string; client: string; stars: number; comment: string | null }): string {
  return JSON.stringify({ chainId: x.chainId, jobId: x.jobId, agentId: x.agentId, client: x.client.toLowerCase(), stars: x.stars, comment: x.comment ?? '' })
}

export interface PreparedRating { call: Call; feedbackHash: `0x${string}`; feedbackURI: string; canonical: string; agentId: string }

export async function prepareRating(input: { chainId: ChainId; jobId: string; wallet: string; stars: number; comment?: string | null }): Promise<PreparedRating> {
  const wallet = input.wallet.toLowerCase()
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) throw new HireError('bad_stars', 'Choose between 1 and 5 stars.')
  const comment = input.comment?.trim() ? input.comment.trim().slice(0, 280) : null
  const t = await ratingTarget(input.chainId, input.jobId)
  if (t.client !== wallet) throw new HireError('not_client', 'Only the wallet that paid for this job can rate it.', 403)
  if (!DELIVERED.has(t.state)) throw new HireError('not_delivered', 'You can rate the agent once it has delivered.', 409)
  // The contract refuses self-feedback too; checking first gives a clear sentence and no wasted gas.
  const reg = network(input.chainId).identityRegistry
  const c = chainClient(input.chainId)
  const id = BigInt(t.agentTokenId)
  const owner = String(await c.readContract({ address: reg, abi: identityAbi, functionName: 'ownerOf', args: [id] })).toLowerCase()
  const approved = String(await c.readContract({ address: reg, abi: identityAbi, functionName: 'getApproved', args: [id] }).catch(() => '0x')).toLowerCase()
  const operator = await c.readContract({ address: reg, abi: identityAbi, functionName: 'isApprovedForAll', args: [owner as `0x${string}`, wallet as `0x${string}`] }).catch(() => false)
  if (wallet === owner || wallet === approved || operator === true) throw new HireError('self_feedback', 'You cannot rate an agent you own or operate. Ratings must come from a buyer.', 403)

  const canonical = canonicalFeedback({ chainId: input.chainId, jobId: input.jobId, agentId: t.agentTokenId, client: wallet, stars: input.stars, comment })
  const feedbackHash = keccak256(toBytes(canonical))
  const feedbackURI = `https://marque.trade/api/v1/phase2/job/${input.chainId}/${input.jobId}`
  await db().insert(ratingComment).values({
    feedbackHash, chainId: input.chainId, jobId: input.jobId, agentTokenId: t.agentTokenId, client: wallet, stars: input.stars, comment, canonical,
  }).onConflictDoNothing()
  return {
    feedbackHash, feedbackURI, canonical, agentId: t.agentTokenId,
    call: {
      step: 'rate', chainId: input.chainId, to: REPUTATION_REGISTRY[input.chainId], abi: reputationAbi as Abi, functionName: 'giveFeedback',
      args: [id, BigInt(input.stars * 20), 0, 'starred', `marque:${t.category ?? 'agent'}`, t.endpoint, feedbackURI, feedbackHash],
      label: `Rate ${input.stars} of 5`,
      detail: 'Writes your rating to the ERC-8004 reputation registry, where any marketplace can read it.',
    },
  }
}

/**
 * Storefront averages (SPEC-TRACKING 8): verified buyers (raters with a Marque-bound,
 * delivered job for this agent) and every ERC-8004 rating, kept apart, never mixed.
 */
export async function agentRatings(chainId: ChainId, agentTokenId: string, providerWallet: string) {
  const rows = rowsOf(await db().execute(sql`
    select r.client, r.value, r.value_decimals, r.tag1,
      exists (select 1 from commerce_job j join hire_intent i on i.id = j.intent_id
              where j.chain_id = r.chain_id and j.client = r.client and j.provider = ${providerWallet.toLowerCase()}
                and j.state in ('SUBMITTED','DISPUTED','COMPLETED','PAID')) as verified
    from rating r where r.chain_id = ${chainId} and r.agent_token_id = ${agentTokenId} and not r.revoked`))
  const score = (r: Record<string, unknown>) => Number(r['value']) / 10 ** Number(r['value_decimals'] ?? 0)
  const avg = (xs: Array<Record<string, unknown>>) => (xs.length ? Number((xs.reduce((a, r) => a + score(r), 0) / xs.length / 20).toFixed(2)) : null)
  // Team wallets (config/team-wallets.json) test the product; their ratings are real but never
  // count as a verified buyer's (SPEC-TRACKING anti-wash, invariant 27).
  const team = new Set(teamWallets())
  const verified = rows.filter((r) => r['verified'] === true && String(r['tag1']) === 'starred' && !team.has(String(r['client']).toLowerCase()))
  return {
    chainId, agentId: agentTokenId,
    verifiedBuyers: { count: verified.length, averageStars: avg(verified) },
    // Registry-wide includes feedback not on the 0-100 "starred" scale; its average is shown only over starred entries.
    allFeedback: { count: rows.length, starredCount: rows.filter((r) => String(r['tag1']) === 'starred').length, averageStars: avg(rows.filter((r) => String(r['tag1']) === 'starred')) },
  }
}
