import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'
import { teamWallets } from '@marque/commerce'

/**
 * An agent's record as a seller, read from the chain index (DESIGN-SYSTEM.md 8.3 and
 * 8.4): verified-buyer rating kept apart from all registry feedback, jobs by outcome,
 * and how long it takes to deliver once paid. Every figure is a COUNT or a median over
 * indexed ERC-8183 and ERC-8004 events on one network; nothing is declared or estimated.
 *
 * A verified buyer is a wallet that paid this agent through a Marque hire that was
 * delivered, and is not on the team list (SPEC-TRACKING anti-wash, invariant 27).
 */
export interface Rating { count: number; averageStars: number | null }
export interface AgentTrack {
  chainId: number
  verified: Rating
  allFeedback: Rating & { total: number }
  jobs: { funded: number; delivered: number; settled: number; refunded: number; disputed: number; fromTeam: number }
  /** Median seconds from payment into escrow to delivery, over `samples` delivered jobs. */
  delivery: { medianSeconds: number | null; samples: number }
}

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const stars = (v: unknown): number | null => { const x = num(v); return x === null ? null : Number((x / 20).toFixed(2)) }

export const EMPTY_TRACK = (chainId: number): AgentTrack => ({
  chainId,
  verified: { count: 0, averageStars: null },
  allFeedback: { count: 0, averageStars: null, total: 0 },
  jobs: { funded: 0, delivered: 0, settled: 0, refunded: 0, disputed: 0, fromTeam: 0 },
  delivery: { medianSeconds: null, samples: 0 },
})

/** Every agent with any rating or any job on this chain, keyed by ERC-8004 token id. */
async function computeTracks(chainId: number): Promise<Record<string, AgentTrack>> {
  const team = teamWallets()
  const teamList = team.length ? sql.join(team.map((w) => sql`${w}`), sql`, `) : sql`''`
  const [ratings, jobs] = await Promise.all([
    db().execute(sql`
      with r as (
        select r.agent_token_id as tid, r.client, r.tag1,
               r.value::numeric / power(10, coalesce(r.value_decimals, 0)) as score,
               exists (
                 select 1 from commerce_job j join hire_intent i on i.id = j.intent_id
                 where j.chain_id = r.chain_id and j.client = r.client and j.provider = lower(a.agent_wallet)
                   and j.state in ('SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID')
               ) as paid
        from rating r
        left join agent a on a.chain_id = r.chain_id and a.token_id = r.agent_token_id
        where r.chain_id = ${chainId} and not r.revoked
      )
      select tid,
             count(*)::int as total,
             count(*) filter (where tag1 = 'starred')::int as starred,
             avg(score) filter (where tag1 = 'starred') as starred_avg,
             count(*) filter (where tag1 = 'starred' and paid and client not in (${teamList}))::int as verified,
             avg(score) filter (where tag1 = 'starred' and paid and client not in (${teamList})) as verified_avg
      from r group by tid`),
    db().execute(sql`
      -- A Marque hire names the exact identity it hired; a job opened elsewhere counts for
      -- every identity that registered the provider wallet (the chain cannot say which).
      select coalesce(nullif(split_part(i.agent_id, ':', 3), ''), a.token_id) as tid,
             count(*) filter (where j.funded_raw is not null and j.funded_raw <> '0')::int as funded,
             count(*) filter (where j.state in ('SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID'))::int as delivered,
             count(*) filter (where j.state in ('COMPLETED', 'PAID'))::int as settled,
             count(*) filter (where j.state = 'REFUNDED')::int as refunded,
             count(*) filter (where exists (select 1 from commerce_event d where d.chain_id = j.chain_id and d.job_id = j.job_id and d.name = 'Disputed'))::int as disputed,
             count(*) filter (where j.funded_raw is not null and j.funded_raw <> '0' and j.client in (${teamList}))::int as from_team,
             percentile_cont(0.5) within group (order by extract(epoch from (s.block_time - f.block_time)))
               filter (where s.block_time is not null and f.block_time is not null) as median_s,
             count(*) filter (where s.block_time is not null and f.block_time is not null)::int as samples
      from commerce_job j
      left join hire_intent i on i.id = j.intent_id
      left join agent a on i.agent_id is null and a.chain_id = 56 and lower(a.agent_wallet) = j.provider
      left join commerce_event f on f.chain_id = j.chain_id and f.job_id = j.job_id and f.name = 'JobFunded'
      left join commerce_event s on s.chain_id = j.chain_id and s.job_id = j.job_id and s.name = 'JobSubmitted'
      where j.chain_id = ${chainId} and (i.agent_id is not null or a.token_id is not null)
      group by 1`),
  ])
  const out: Record<string, AgentTrack> = {}
  const get = (tid: string) => (out[tid] ??= EMPTY_TRACK(chainId))
  for (const r of rowsOf(ratings)) {
    const t = get(String(r['tid']))
    t.verified = { count: Number(r['verified']), averageStars: stars(r['verified_avg']) }
    t.allFeedback = { count: Number(r['starred']), averageStars: stars(r['starred_avg']), total: Number(r['total']) }
  }
  for (const r of rowsOf(jobs)) {
    const t = get(String(r['tid']))
    t.jobs = {
      funded: Number(r['funded']), delivered: Number(r['delivered']), settled: Number(r['settled']),
      refunded: Number(r['refunded']), disputed: Number(r['disputed']), fromTeam: Number(r['from_team']),
    }
    const med = num(r['median_s'])
    t.delivery = { medianSeconds: med === null ? null : Math.round(med), samples: Number(r['samples']) }
  }
  return out
}

/** Cached for a minute: ratings and jobs change on the indexer's pace, not per page view. */
export async function agentTracks(chainId = 56): Promise<Record<string, AgentTrack>> {
  try {
    const p = await cachedProjection(`agent:tracks:v1:${chainId}`, () => computeTracks(chainId), { freshMs: 60_000, timeoutMs: 8_000, staleWhileRevalidate: true })
    return p.value
  } catch {
    return {}
  }
}

export async function agentTrack(tokenId: string | null, chainId = 56): Promise<AgentTrack> {
  if (!tokenId) return EMPTY_TRACK(chainId)
  return (await agentTracks(chainId))[tokenId] ?? EMPTY_TRACK(chainId)
}

/** "about 20 s", "about 3 min": a measured median, worded. */
export function deliveryWords(seconds: number | null): string | null {
  if (seconds === null) return null
  if (seconds < 90) return `about ${Math.max(1, Math.round(seconds))} s`
  if (seconds < 5400) return `about ${Math.round(seconds / 60)} min`
  return `about ${Math.round(seconds / 3600)} h`
}
