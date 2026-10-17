import { sql, type SQL } from 'drizzle-orm'
import { firstPartyAgents } from '@marque/db'
import { network, type ChainId } from './config.js'

/** Feedback must name the exact prepared job, identity and amount of stars.
 * Caller alias r is indexed ERC-8004 feedback. A shared provider wallet alone
 * never binds feedback to an identity. Reads only; no historical row rewrite. */
export function buyerFeedbackBinding(provider: SQL, identity: SQL): SQL {
  return sql`exists (
    select 1 from rating_comment proof
    join commerce_job j on j.chain_id = proof.chain_id and j.job_id = proof.job_id
    join hire_intent i on i.id = j.intent_id
    where lower(proof.feedback_hash) = lower(r.feedback_hash)
      and proof.chain_id = r.chain_id and proof.agent_token_id = r.agent_token_id
      and lower(proof.client) = lower(r.client)
      and proof.stars between 1 and 5 and r.value_decimals = 0
      and r.value = (proof.stars * 20)::text and r.tag1 = 'starred' and not r.revoked
      and i.agent_id = ${identity} and i.chain_id = j.chain_id and i.job_id = j.job_id
      and lower(i.wallet) = lower(j.client) and lower(i.provider) = lower(j.provider)
      and lower(i.token) = lower(j.token) and i.price_raw = j.funded_raw
      and lower(j.client) = lower(r.client) and lower(j.provider) = lower(${provider})
      and lower(r.client) <> lower(j.provider)
      and j.funded_raw ~ '^[0-9]+$' and j.funded_raw::numeric > 0
      and j.state in ('SUBMITTED','DISPUTED','COMPLETED','PAID')
      and exists (select 1 from commerce_event submitted
        where submitted.chain_id = j.chain_id and submitted.job_id = j.job_id
          and submitted.name = 'JobSubmitted' and submitted.block_number <= r.block_number)
  )`
}

/** Existing first-party testnet alias, never a guess across unrelated identities. */
export function feedbackIdentity(chainId: ChainId, tokenId: string): string | null {
  if (!/^\d{1,30}$/.test(tokenId)) return null
  if (chainId === 56) return `56:${network(56).identityRegistry.toLowerCase()}:${tokenId}`
  const first = firstPartyAgents().find(f => f.testnet?.chainId === chainId && String(f.testnet.tokenId) === tokenId)
  return first ? `56:${network(56).identityRegistry.toLowerCase()}:${first.tokenId}` : null
}

export interface FeedbackObservation {
  client: string; verified: boolean; jobId: string | null
  feedbackIndex: string; blockNumber: string; at: string | null; tx: string
}

/** Counts records, distinct addresses and exact job keys separately. The input
 * is a complete indexed identity subset, not a capped marketplace result page. */
export function feedbackEvidence(chainId: ChainId, agentId: string, observations: readonly FeedbackObservation[], teamWallets: readonly string[]) {
  const team = new Set(teamWallets.map(w => w.toLowerCase()))
  const linked = observations.filter(r => r.verified && r.jobId !== null && !team.has(r.client.toLowerCase()))
  const wallets = new Map<string, { records: number; jobs: Set<string> }>()
  for (const r of linked) {
    const key = r.client.toLowerCase(), row = wallets.get(key) ?? { records: 0, jobs: new Set<string>() }
    row.records++; row.jobs.add(`${chainId}:${r.jobId}`); wallets.set(key, row)
  }
  const graph = [...wallets].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([wallet, row]) => ({
    wallet, feedbackRecords: row.records, distinctJobs: row.jobs.size,
    jobKeys: [...row.jobs].sort(), repeatedWallet: row.records > 1,
    repeatedJobFeedback: row.records > row.jobs.size,
    relation: 'NON_TEAM_BY_PUBLISHED_CONFIG' as const,
    operatorOverlap: 'UNKNOWN' as const, humanIndependence: 'UNKNOWN' as const,
    review: row.records > 1 ? 'REPEATED_WALLET_PENDING_REVIEW' as const : 'NO_REPETITION_IN_THIS_SUBSET' as const,
  }))
  const blocks = observations.map(r => r.blockNumber).filter(b => /^\d+$/.test(b)).map(BigInt)
  const times = observations.map(r => r.at).filter((s): s is string => s !== null && Number.isFinite(Date.parse(s))).sort()
  const refs = observations.map(r => ({ client: r.client.toLowerCase(), feedbackIndex: r.feedbackIndex,
    tx: r.tx.toLowerCase(), block: r.blockNumber, at: r.at,
    buyerLinkedJob: r.verified && r.jobId !== null && !team.has(r.client.toLowerCase()) ? `${chainId}:${r.jobId}` : null,
  })).sort((a,b) => { const x=JSON.stringify(a), y=JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0 })
  return {
    schema: 'marque.rating-evidence.v1' as const, chainId, agentId,
    provenance: 'INDEXED_EVENTS_AND_PREPARED_FEEDBACK_COMMITMENT' as const,
    confidence: 'EXACT_JOB_LINK_NOT_OPERATOR_OR_QUALITY_ATTESTATION' as const,
    scope: { feedbackRecords: observations.length, blockFrom: blocks.length ? blocks.reduce((a,b) => a < b ? a : b).toString() : null,
      blockTo: blocks.length ? blocks.reduce((a,b) => a > b ? a : b).toString() : null, timeFrom: times[0] ?? null, timeTo: times.at(-1) ?? null },
    buyerLinked: { feedbackRecords: linked.length, distinctWallets: wallets.size,
      distinctJobs: new Set(linked.map(r => `${chainId}:${r.jobId}`)).size,
      repeatedWallets: graph.filter(r => r.repeatedWallet).length,
      repeatedJobFeedbackRecords: graph.reduce((n,r) => n + r.feedbackRecords - r.distinctJobs, 0),
      graph: graph.slice(0,200), graphMoreAvailable: graph.length > 200 },
    feedbackReferences: refs.slice(0,100), feedbackReferencesMoreAvailable: refs.length > 100,
    teamFeedbackRecords: observations.filter(r => team.has(r.client.toLowerCase())).length,
    independentHumans: null, commonFunding: 'NOT_CHECKED' as const, counterfeitEndorsements: 'NOT_CHECKED' as const,
    limits: ['Review records, wallets and jobs are different units. Addresses do not establish independent people.',
      'Repeated wallets are a review signal, not an accusation of abuse.',
      'A funded delivered job does not establish payment release, quality, ROI or current provider control.',
      'Indexed evidence can lag or reorganize; use the existing job bundle and read-only chain inspector for confirmation.'],
  }
}
