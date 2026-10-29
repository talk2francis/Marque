import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { sellerIdentity } from '@marque/commerce'
import type { BuilderView } from './builder'
import { sellerServicesQuery } from './seller-services'

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>
const iso = (v: unknown): string | null => v == null ? null : new Date(String(v)).toISOString()
const n = (v: unknown) => Number(v ?? 0)

/** Versioned, observational projection. No provider request and no task/private raw data. */
export async function sellerProjection(view: BuilderView, diagnosticOwner: string | null = null) {
  const { agentKey, chainId, tokenId } = view.identity
  const observedAt = new Date().toISOString()
  const since = new Date(Date.parse(observedAt) - 30 * 86400_000).toISOString()
  const current = await sellerIdentity({ agentId: agentKey, chainId, tokenId }).catch(() => null)
  if (diagnosticOwner && (!current || current.agentOwner.toLowerCase() !== diagnosticOwner.toLowerCase())) throw new Error('seller_owner_unverified')
  const provider = current?.agentWallet?.toLowerCase() ?? null
  return db().transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout = '4000ms'`)
    await tx.execute(sql`set local lock_timeout = '500ms'`)
    const services = rowsOf(await tx.execute(sellerServicesQuery(agentKey)))
    // Exact Marque intent binding, not every job sharing a mutable provider wallet.
    const cohort = sql`select j.*, i.service_id, i.price_raw as quoted_raw, i.token as quoted_token,
        i.provider as quoted_provider from commerce_job j join hire_intent i on i.id = j.intent_id
      where i.agent_id = ${agentKey} and i.chain_id = ${chainId} and j.chain_id = i.chain_id
        and i.job_id = j.job_id and j.created_at >= ${since}::timestamptz`
    const [counts] = rowsOf(await tx.execute(sql`with cohort as (${cohort})
      select count(*)::int as received,
        count(*) filter (where funded_raw is not null)::int as funded,
        count(*) filter (where deliverable is not null)::int as submitted,
        count(*) filter (where state in ('COMPLETED','PAID'))::int as completed,
        count(*) filter (where state = 'PAID')::int as paid,
        count(*) filter (where state = 'REFUNDED')::int as refunded,
        count(*) filter (where lower(provider) <> lower(quoted_provider) or
          (funded_raw is not null and (funded_raw <> quoted_raw or lower(token) <> lower(quoted_token))))::int as mismatch,
        max(updated_block)::text as last_block from cohort`))
    const money = rowsOf(await tx.execute(sql`with cohort as (${cohort}), releases as (
      select j.chain_id, j.job_id, j.token, e.name, e.args, e.block_number, e.tx_hash,
        row_number() over (partition by j.chain_id, j.job_id, e.name order by e.block_number desc, e.log_index desc) as rn
      from cohort j join commerce_event e on e.chain_id = j.chain_id and e.job_id = j.job_id
      where ((j.state = 'PAID' and e.name = 'PaymentReleased') or (j.state = 'REFUNDED' and e.name = 'Refunded'))
        and lower(j.provider) = lower(j.quoted_provider) and lower(j.token) = lower(j.quoted_token)
        and j.token is not null)
      select token, name, sum((args->>'amount')::numeric)::text as amount_raw, count(*)::int as jobs,
        max(block_number)::text as last_block from releases
      where rn = 1 and (args->>'amount') ~ '^[0-9]{1,78}$' group by token, name order by token, name`))
    let diagnostics = null
    if (diagnosticOwner) {
      const [q] = rowsOf(await tx.execute(sql`select count(*)::int as attempted,
        count(*) filter (where ok)::int as accepted, count(*) filter (where not ok)::int as rejected,
        count(*) filter (where ok and signed)::int as signed,
        count(*) filter (where ok and signed = false)::int as unsigned
        from commerce_quote where agent_id = ${agentKey} and source = 'user' and created_at >= ${since}::timestamptz`))
      const failures = rowsOf(await tx.execute(sql`select failure, count(*)::int as n from commerce_quote
        where agent_id = ${agentKey} and source = 'user' and not ok and created_at >= ${since}::timestamptz
        group by failure order by count(*) desc limit 8`))
      const [conversion] = rowsOf(await tx.execute(sql`select count(distinct q.id)::int as accepted_quotes,
        count(distinct q.id) filter (where exists (select 1 from hire_intent i join commerce_job j on j.intent_id = i.id
          and j.chain_id = i.chain_id and j.job_id = i.job_id where i.quote_id = q.id and i.agent_id = q.agent_id and j.funded_raw is not null))::int as funded_quotes
        from commerce_quote q where q.agent_id = ${agentKey} and q.source = 'user' and q.ok and q.created_at >= ${since}::timestamptz`))
      const notify = rowsOf(await tx.execute(sql`select distinct on (a.chain_id, a.job_id) a.status, a.ok
        from notify_attempt a join hire_intent i on i.id = a.intent_id and i.chain_id = a.chain_id and i.job_id = a.job_id
        where i.agent_id = ${agentKey} and a.created_at >= ${since}::timestamptz
        order by a.chain_id, a.job_id, a.created_at desc, a.id desc`))
      diagnostics = {
        scope: 'Owner-only user quote attempts in this 30-day window. Protocol acceptance is not human consent or payment. Conversion uses accepted user quotes created in this window; funding may follow later.',
        quotes: { attempted: n(q?.attempted), accepted: n(q?.accepted), rejected: n(q?.rejected), providerSigned: n(q?.signed), identityMatchedUnsigned: n(q?.unsigned), signatureUnknown: n(q?.accepted) - n(q?.signed) - n(q?.unsigned) },
        conversion: { acceptedQuotes: n(conversion?.accepted_quotes), fundedQuotes: n(conversion?.funded_quotes) },
        failures: failures.map(f => ({ code: String(f.failure ?? 'unknown'), count: n(f.n), nextStep: quoteRemedy(String(f.failure ?? 'unknown')) })),
        notification: { scope: 'Latest recorded notification per job observed in this window; historical parsing rules may differ.', accepted: notify.filter(x => x.ok === true && x.status === 'accepted').length, rejected: notify.filter(x => x.status === 'rejected').length, pendingOrUnknown: notify.filter(x => x.status !== 'accepted' && x.status !== 'rejected').length },
      }
    }
    // Include fresh declarations immediately, even before the background index catches up.
    // Retained indexed rows remain visible after current declarations, without borrowing their observations.
    const currentServices: Array<Record<string, unknown>> = view.identity.services.filter(d => d.kind !== 'other').map(d => services.find(s => s.kind === d.kind && (s.endpoint === d.endpoint || s.resolved_endpoint === d.endpoint))
      ?? { id: null, kind: d.kind, endpoint: d.endpoint })
    const projectedServices = [...currentServices, ...services.filter(s => !currentServices.includes(s))]
    return {
      version: 1 as const, agentKey, chainId, observedAt, window: { since, until: observedAt, days: 30 },
      provenance: 'INDEXED_ONCHAIN_AND_MEASURED' as const,
      identity: { current: current !== null, blockNumber: current?.blockNumber ?? null, owner: current?.agentOwner ?? null, provider, independence: 'UNKNOWN' as const },
      qualification: { ownerListed: view.listingEvidence.ownerListed && current !== null && current.agentOwner.toLowerCase() === view.identity.owner, qualityListed: view.listingEvidence.qualityListed && current !== null && current.agentOwner.toLowerCase() === view.identity.owner,
        warrant: 'UNKNOWN_EXACT_SERVICE_BINDING' as const, marqueStretch: 'LOCAL_FOUR_CATEGORY_GOAL' as const, officialCampaign: 'BNB_REVIEW_REQUIRED' as const },
      services: projectedServices.slice(0,16).map(s => {
        const declared = view.identity.services.some(x => x.kind === s.kind && (x.endpoint === s.endpoint || x.endpoint === s.resolved_endpoint))
        const expiry = iso(s.quote_expires_at)
        // A historical accepted probe is only a sample. Final hire repeats all exact-task checks.
        const endpointMatches = s.quote_endpoint === s.runtime_endpoint || s.quote_endpoint === s.executable_endpoint || s.quote_endpoint === s.endpoint || s.quote_endpoint === s.resolved_endpoint
        const currentQuote = s.kind === 'a2a' && declared && endpointMatches && current !== null && s.ok === true && Number(s.chain_id) === chainId && [current.agentWallet, current.agentOwner].some(a => a?.toLowerCase() === String(s.provider).toLowerCase())
          && expiry !== null && Date.parse(expiry) > Date.parse(observedAt)
        return { serviceId: s.id == null ? null : n(s.id), kind: String(s.kind), endpoint: String(s.endpoint), declaredNow: declared,
          probe: { liveness: s.liveness == null ? 'UNKNOWN' : String(s.liveness), observedAt: iso(s.checked_at), lastGoodAt: iso(s.last_good_at), lastBadAt: iso(s.last_bad_at), historyLimit: 100, scope: 'Latest discovery sample, not continuous uptime or task acceptance.' },
          quote: { state: s.kind !== 'a2a' ? 'UNSUPPORTED_HIRE_ADAPTER' : currentQuote ? 'CURRENT_PROBE_SAMPLE' : s.quote_at == null ? 'NO_SAMPLE' : expiry !== null && Date.parse(expiry) <= Date.parse(observedAt) ? 'EXPIRED' : 'NOT_HIREABLE', observedAt: iso(s.quote_at), expiresAt: expiry,
            mode: s.ok !== true ? 'UNKNOWN' : s.signed === true ? 'PROVIDER_SIGNED' : s.signed === false ? 'IDENTITY_MATCHED_UNSIGNED' : 'UNKNOWN',
            nextStep: s.kind !== 'a2a' ? 'The current paid hire adapter requires an A2A ERC-8183 service. MCP discovery alone does not enable escrowed hiring.' : currentQuote ? 'Buyer must request a fresh exact-task quote; this sample is not a reservation.' : !declared ? 'Recheck the current ERC-8004 service metadata and indexing; this endpoint binding is not established.' : !current ? 'Current registry proof is unavailable; retry after RPC recovery.' : quoteRemedy(String(s.failure ?? (expiry ? 'expired' : 'no_quote'))) },
        }
      }), servicesTruncated: projectedServices.length > 16,
      jobs: { scope: 'Exact Marque-intent jobs created in this 30-day cohort; lifecycle outcomes as indexed at observation. Counts can overlap. No claim of independent buyers.', received: n(counts?.received), funded: n(counts?.funded), submitted: n(counts?.submitted), completed: n(counts?.completed), paid: n(counts?.paid), refunded: n(counts?.refunded), fundingMismatch: n(counts?.mismatch), lastIndexedJobBlock: counts?.last_block == null ? null : String(counts.last_block), headLagBlocks: null },
      earnings: money.map(m => ({ chainId, token: String(m.token), amountRaw: String(m.amount_raw), kind: m.name === 'PaymentReleased' ? 'PAYMENT_RELEASED' : 'REFUNDED_TO_BUYER', jobs: n(m.jobs), lastBlock: String(m.last_block), decimals: null, scope: 'Indexed event amount, raw token units; no token metadata or USD valuation inferred.' })),
      diagnostics,
    }
  })
}

export function quoteRemedy(code: string): string {
  if (/expired|stale/.test(code)) return 'Serve a new quote with a valid expiry; buyers must review the new price.'
  if (/token|asset|currency/.test(code)) return 'Quote an asset supported by the selected chain and escrow, with correct decimals.'
  if (/sign|provider|owner/.test(code)) return 'Match the current registered provider and signing domain; recheck identity after transfers.'
  if (/chain|network|escrow/.test(code)) return 'Use the selected chain and its pinned escrow contracts.'
  if (/timeout|http|unreachable/.test(code)) return 'Restore the endpoint and inspect transport logs before retrying.'
  return 'Check the declared A2A service and ERC-8183 quote schema. No paid task is sent by this view.'
}
export type SellerProjection = Awaited<ReturnType<typeof sellerProjection>>
