import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { MARQUE_REFERENCE_OWNERS } from './funnel.js'

/**
 * Supply outreach prospects.
 *
 * The measured supply gap makes owner outreach a build-critical activity rather
 * than marketing, so this produces a ranked, actionable list: who to contact,
 * why they matter, and the exact reason their agent is or is not
 * marketplace-ready.
 *
 * A Marque reference agent can never appear here. Prospecting ourselves would
 * make the gap look smaller than it is.
 */

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Prospect {
  agentId: string
  chainId: number
  tokenId: string
  ownerAddress: string | null
  agentWallet: string | null
  name: string | null
  description: string | null
  category: string
  categoryConfidence: number
  /** Every endpoint they declare, with its transport. */
  endpoints: Array<{ kind: string; url: string; isTemplate: boolean }>
  protocols: string[]
  x402Supported: boolean
  liveness: string | null
  latencyMs: number | null
  failureClass: string | null
  skills: string[]
  /** Contact routes found in the registry metadata. */
  contacts: { website?: string; x?: string; github?: string; docs?: string; email?: string }
  /** Plain-English statement of what stands between them and being hireable. */
  readiness: string
  priority: Priority
  /** How many agents this owner controls — a bigger portfolio is a bigger win. */
  ownerAgentCount: number
}

const URL_KEYS = ['website', 'url', 'homepage', 'docs', 'documentation', 'twitter', 'x', 'github', 'repository', 'email', 'contact']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Dig contact routes out of whatever shape the metadata happens to be in. */
export function extractContacts(rawMetadata: unknown): Prospect['contacts'] {
  const out: Prospect['contacts'] = {}
  const seen = new Set<unknown>()

  const walk = (node: unknown, depth: number): void => {
    if (depth > 6 || node === null || node === undefined) return
    if (typeof node === 'string') {
      const s = node.trim()
      // Spec links and machine metadata endpoints are not ways to reach a human.
      const NOISE = /eips\.ethereum\.org|schema\.org|w3\.org|\/agent-metadata\/|\.well-known\/|amazonaws\.com|ipfs\.io|arweave/i
      if (/^https?:\/\//i.test(s) && !NOISE.test(s)) {
        if (/twitter\.com|(^|\/\/)x\.com/i.test(s)) out.x ??= s
        else if (/github\.com/i.test(s)) out.github ??= s
        else if (/docs?\./i.test(s) || /\/docs/i.test(s)) out.docs ??= s
        else out.website ??= s
      } else if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) {
        out.email ??= s
      }
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    if (isRecord(node)) {
      if (seen.has(node)) return
      seen.add(node)
      for (const [k, v] of Object.entries(node)) {
        // Prefer explicitly-named contact keys, but still walk everything:
        // publishers put their X handle in wildly different places.
        if (URL_KEYS.includes(k.toLowerCase()) && typeof v === 'string') walk(v, depth + 1)
        else walk(v, depth + 1)
      }
    }
  }

  walk(rawMetadata, 0)
  return out
}

/**
 * Readiness and priority.
 *
 * HIGH means contacting this owner could plausibly produce a listed, hireable
 * agent — they are live, or they are in a category we have no supply for and
 * are one binding step away.
 */
export function assessReadiness(p: {
  liveness: string | null
  failureClass: string | null
  skills: string[]
  category: string
  hasEndpoint: boolean
  ownerAgentCount: number
}): { readiness: string; priority: Priority } {
  const inRequiredCategory = ['rebalancing', 'grid', 'yield', 'health_factor'].includes(p.category)

  if (p.liveness === 'live') {
    return {
      readiness: `Ready now: endpoint answers and exposes ${p.skills.length} callable skill(s). Needs only a conformance run and a listing.`,
      priority: 'HIGH',
    }
  }

  if (p.liveness === 'unbound' || p.failureClass === 'unbound' || p.failureClass === 'empty_tools') {
    const base = 'Registered and discoverable, but never bound to a runtime: the card serves, yet exposes no executable endpoint and no skills. One deploy away from being hireable.'
    return {
      readiness: base,
      // A large portfolio owner who binds once unlocks many agents at a time.
      priority: inRequiredCategory || p.ownerAgentCount >= 5 ? 'HIGH' : 'MEDIUM',
    }
  }

  if (p.failureClass === 'timeout' || p.failureClass === 'dns' || p.failureClass === 'refused') {
    return {
      readiness: `Declared endpoint does not respond (${p.failureClass}). Either the host is gone or the URL in their registry metadata is stale — worth telling them, since it is invisible from their side.`,
      priority: inRequiredCategory ? 'MEDIUM' : 'LOW',
    }
  }

  if (p.failureClass === 'bad_schema') {
    return {
      readiness: 'Endpoint answers but the payload does not match the protocol it declares. A small fix on their side makes it discoverable everywhere, not just here.',
      priority: 'MEDIUM',
    }
  }

  if (!p.hasEndpoint) {
    return {
      readiness: 'No parseable service endpoint in their registry metadata. Cannot be reached by any client until they publish one.',
      priority: inRequiredCategory ? 'MEDIUM' : 'LOW',
    }
  }

  return { readiness: 'Not yet probed.', priority: 'LOW' }
}

export async function buildProspects(opts: { limit?: number } = {}): Promise<Prospect[]> {
  const d = db()
  const limit = opts.limit ?? 400
  const refOwners = MARQUE_REFERENCE_OWNERS.map((o) => o.toLowerCase())
  const excludeRefs = refOwners.length > 0
    ? sql`and lower(coalesce(a.owner_address,'')) not in (${sql.join(refOwners.map((o) => sql`${o}`), sql`, `)})`
    : sql``

  const rows = await d.execute(sql`
    with latest as (
      select distinct on (agent_id) agent_id, liveness, latency_ms, failure_class, skills
      from probe order by agent_id, checked_at desc
    ),
    owner_counts as (
      select owner_address, count(*) as n from agent where chain_id = 56 group by owner_address
    )
    select a.id, a.chain_id, a.token_id, a.owner_address, a.agent_wallet, a.name, a.description,
           a.supported_protocols, a.x402_supported, a.raw_metadata,
           coalesce(c.category, 'unclassified') as category,
           coalesce(c.confidence, 0) as confidence,
           p.liveness, p.latency_ms, p.failure_class, coalesce(p.skills, '[]'::jsonb) as skills,
           coalesce(oc.n, 1) as owner_agent_count,
           (select json_agg(json_build_object('kind', s.kind,
              'url', coalesce(s.resolved_endpoint, s.endpoint), 'isTemplate', s.is_template))
            from agent_service s where s.agent_id = a.id) as endpoints
    from agent a
    left join agent_category c on c.agent_id = a.id
    left join latest p on p.agent_id = a.id
    left join owner_counts oc on oc.owner_address = a.owner_address
    where a.chain_id = 56
      and a.id <> 'canary:ssrf'
      ${excludeRefs}
      and (
        p.liveness in ('live','unbound','bad_schema')
        or exists (select 1 from agent_service s2 where s2.agent_id = a.id)
      )
    order by
      (p.liveness = 'live') desc nulls last,
      (coalesce(c.category,'unclassified') in ('rebalancing','grid','yield','health_factor')) desc,
      coalesce(oc.n, 1) desc
    limit ${limit}
  `)

  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>

  return list.map((r) => {
    const endpoints = (Array.isArray(r['endpoints']) ? r['endpoints'] : []) as Prospect['endpoints']
    const skills = (Array.isArray(r['skills']) ? r['skills'] : []) as string[]
    const category = String(r['category'])
    const ownerAgentCount = Number(r['owner_agent_count'] ?? 1)
    const { readiness, priority } = assessReadiness({
      liveness: (r['liveness'] as string | null) ?? null,
      failureClass: (r['failure_class'] as string | null) ?? null,
      skills,
      category,
      hasEndpoint: endpoints.length > 0,
      ownerAgentCount,
    })

    return {
      agentId: String(r['id']),
      chainId: Number(r['chain_id']),
      tokenId: String(r['token_id']),
      ownerAddress: (r['owner_address'] as string | null) ?? null,
      agentWallet: (r['agent_wallet'] as string | null) ?? null,
      name: (r['name'] as string | null) ?? null,
      description: (r['description'] as string | null) ?? null,
      category,
      categoryConfidence: Number(r['confidence'] ?? 0),
      endpoints,
      protocols: Array.isArray(r['supported_protocols']) ? (r['supported_protocols'] as string[]) : [],
      x402Supported: Boolean(r['x402_supported']),
      liveness: (r['liveness'] as string | null) ?? null,
      latencyMs: r['latency_ms'] === null || r['latency_ms'] === undefined ? null : Number(r['latency_ms']),
      failureClass: (r['failure_class'] as string | null) ?? null,
      skills,
      contacts: extractContacts(r['raw_metadata']),
      readiness,
      priority,
      ownerAgentCount,
    }
  })
}

/** Owners ranked by how much supply a single conversation could unlock. */
export interface OwnerRollup {
  ownerAddress: string
  agentCount: number
  liveCount: number
  unboundCount: number
  categories: string[]
  /** Distinct hosts this owner's agents point at. */
  hosts: string[]
  contacts: Prospect['contacts']
  topAgentName: string | null
  /** True when this owner covers a category we have no supply for. */
  coversRequiredCategory: boolean
  /**
   * True when every host this owner uses is already served by a higher-ranked
   * owner. Hundreds of BSC identities point at one shared endpoint, so without
   * this the list is 400 rows for a single supplier.
   */
  duplicateSupplier: boolean
  priority: Priority
  whyContact: string
}

export function rollupByOwner(prospects: readonly Prospect[]): OwnerRollup[] {
  const REQUIRED = new Set(['rebalancing', 'grid', 'yield', 'health_factor'])

  const byOwner = new Map<string, Prospect[]>()
  for (const p of prospects) {
    if (!p.ownerAddress) continue
    const key = p.ownerAddress.toLowerCase()
    const list = byOwner.get(key)
    if (list) list.push(p)
    else byOwner.set(key, [p])
  }

  const hostOf = (url: string): string => {
    try { return new URL(url).host } catch { return url }
  }

  const rows: OwnerRollup[] = []
  for (const [ownerAddress, list] of byOwner) {
    const live = list.filter((p) => p.liveness === 'live').length
    const unbound = list.filter((p) => p.liveness === 'unbound').length
    const categories = [...new Set(list.map((p) => p.category).filter((c) => c !== 'unclassified'))]
    const hosts = [...new Set(list.flatMap((p) => p.endpoints.map((e) => hostOf(e.url))))]
    const contacts: Prospect['contacts'] = {}
    for (const p of list) Object.assign(contacts, p.contacts, contacts)
    const coversRequiredCategory = categories.some((c) => REQUIRED.has(c))

    const why = coversRequiredCategory && live > 0
      ? `Live supply in ${categories.filter((c) => REQUIRED.has(c)).join(', ')} — a required category. Highest-value contact on the list.`
      : coversRequiredCategory
        ? `Has ${list.length} agent(s) in ${categories.filter((c) => REQUIRED.has(c)).join(', ')} that are registered but not bound. One deploy unlocks a category we have no supply for.`
        : live > 0
          ? 'Running live, callable supply. Worth listing even outside the four required categories.'
          : `${list.length} registered agent(s), none bound yet.`

    rows.push({
      ownerAddress, agentCount: list.length, liveCount: live, unboundCount: unbound,
      categories, hosts, contacts, topAgentName: list[0]?.name ?? null,
      coversRequiredCategory,
      duplicateSupplier: false,
      priority: coversRequiredCategory ? 'HIGH' : live > 0 ? 'HIGH' : list.some((p) => p.priority === 'HIGH') ? 'MEDIUM' : 'LOW',
      whyContact: why,
    })
  }

  // Rank by what a single conversation could actually unlock.
  rows.sort((a, b) =>
    Number(b.coversRequiredCategory) - Number(a.coversRequiredCategory) ||
    Number(b.liveCount > 0) - Number(a.liveCount > 0) ||
    b.categories.length - a.categories.length ||
    b.agentCount - a.agentCount,
  )

  // Mark owners whose every host is already covered by someone ranked above
  // them. They are the same supplier reached through a different identity.
  const seenHosts = new Set<string>()
  for (const r of rows) {
    if (r.hosts.length > 0 && r.hosts.every((h) => seenHosts.has(h))) {
      r.duplicateSupplier = true
      if (!r.coversRequiredCategory) r.priority = 'LOW'
    }
    for (const h of r.hosts) seenHosts.add(h)
  }

  return rows
}
