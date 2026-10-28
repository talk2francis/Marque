/**
 * Set and Earn rules and the open attribution convention, as pure functions (no I/O), so the
 * server, the worker and the browser read one source (SPEC-ADOPTION 2, FACTS 11, 16, 17).
 */

export const CAMPAIGN = {
  /** bnbchain.org/en/hackathons/smart-money-era-set-and-earn, re-read 23 Oct. */
  start: '2026-10-01T12:00:00Z',
  end: '2026-11-05T12:00:00Z',
  winnersAfter: '2026-11-13',
  /** Organizer blog post date; the X post time is not published (FACTS 11). */
  announced: '2026-10-01',
  required: { agents: 3, marketplaces: 2 },
  build: { hires: 3, actions: 5, days: 3 },
  rulesUrl: 'https://www.bnbchain.org/en/hackathons/smart-money-era-set-and-earn',
} as const

/** A Postgres array literal; only ids, addresses and integers go through it. */
export const pgArray = (list: ReadonlyArray<string | number>): string => `{${list.map((v) => String(v).replace(/[^0-9a-zA-Zx]/g, '')).join(',')}}`

export const campaignStartMs = Date.parse(CAMPAIGN.start)
export const campaignEndMs = Date.parse(CAMPAIGN.end)

/** The nine shortlisted marketplaces, as the organizer lists them. */
export const SHORTLIST: ReadonlyArray<{ name: string; domain: string; url: string; aliases: readonly string[] }> = [
  { name: 'Marque', domain: 'marque.trade', url: 'https://marque.trade/', aliases: [] },
  { name: 'TermiX', domain: 'termix.ai', url: 'https://app.termix.ai/', aliases: ['termix.live', 'agent.family'] },
  { name: 'Agent Souk', domain: 'agentsouk.xyz', url: 'https://agentsouk.xyz', aliases: [] },
  { name: 'Dolphin', domain: 'dolphinamp.xyz', url: 'https://www.dolphinamp.xyz/', aliases: [] },
  { name: 'HelloFugu', domain: 'hellofugu.xyz', url: 'https://app.hellofugu.xyz/', aliases: [] },
  { name: 'KATTEGAT', domain: 'kattegat.xyz', url: 'https://kattegat.xyz/', aliases: [] },
  { name: 'Pokter', domain: 'pokter.xyz', url: 'https://pokter.xyz/', aliases: [] },
  { name: 'Agent Atlas', domain: 'agent-atlas.xyz', url: 'https://www.agent-atlas.xyz/', aliases: [] },
  { name: 'Mandate', domain: 'mandatemarkets.com', url: 'https://www.mandatemarkets.com/', aliases: [] },
]

/** A host or domain string reduced to a shortlisted marketplace domain, or null. */
export function shortlistDomain(raw: string | null | undefined): string | null {
  if (!raw) return null
  let h = raw.trim().toLowerCase()
  h = h.replace(/^[a-z]+:\/\//, '').replace(/[/?#:].*$/, '').replace(/\.+$/, '')
  for (const m of SHORTLIST) {
    for (const d of [m.domain, ...m.aliases]) {
      if (h === d || h.endsWith(`.${d}`)) return m.domain
    }
  }
  return null
}

const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')
/** A marketplace named in words ("KATTEGAT", "agent-atlas", "Marque Trade") or by domain. */
export function marketplaceByName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const byDomain = shortlistDomain(raw)
  if (byDomain) return byDomain
  const k = squash(raw)
  if (!k) return null
  const m = SHORTLIST.find((x) => squash(x.name) === k || squash(x.domain.split('.')[0]!) === k || (x.domain === 'marque.trade' && k === 'marquetrade'))
  return m?.domain ?? null
}

export function marketplaceName(domain: string | null): string | null {
  return SHORTLIST.find((m) => m.domain === domain)?.name ?? null
}

export type Attribution = 'marque_intent' | 'client_ref' | 'via_suffix' | 'envelope'
export interface Attributed { marketplace: string | null; attribution: Attribution | null; clientRef: string | null }

const DOMAIN = /([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)/i
/** "… (via marque.trade)" or "…, via mandatemarkets.com" at the end of the task text. */
const VIA_TRAILING = new RegExp(`\\(?\\bvia\\s+${DOMAIN.source}\\)?[\\s.]*$`, 'i')
/** "via mandatemarkets.com: Mandate Range-1 …" at the start (FACTS 17). */
const VIA_LEADING = new RegExp(`^\\s*\\(?via\\s+${DOMAIN.source}\\)?\\s*:`, 'i')

function parseJson(s: string): Record<string, unknown> | null {
  const t = s.trim()
  if (!t.startsWith('{')) return null
  try {
    const v = JSON.parse(t) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch { return null }
}

/** Task texts a description carries, outermost first. Nested JSON task strings are unwrapped once. */
function taskTexts(desc: string, j: Record<string, unknown> | null): string[] {
  if (!j) return [desc]
  const out: string[] = []
  const push = (v: unknown) => { if (typeof v === 'string' && v.trim()) out.push(v) }
  push(j['task'])
  push(j['task_description'])
  const req = j['request']
  if (req && typeof req === 'object') push((req as Record<string, unknown>)['task_description'])
  for (const t of [...out]) {
    const inner = parseJson(t)
    if (inner) { push(inner['task']); push(inner['task_description']) }
  }
  return out
}

function viaIn(text: string): string | null {
  const m = text.match(VIA_TRAILING) ?? text.match(VIA_LEADING)
  return m ? shortlistDomain(m[1]) : null
}

/**
 * Marketplace attribution, in the published order (SPEC-ADOPTION 2.3, /docs/attribution):
 * Marque's own intent record, then client_ref in the description JSON, then a "via <domain>"
 * in the task text, then a known envelope format. Anything else is Not recorded.
 * Only shortlisted domains count; an unknown client_ref is kept but credits no one.
 */
export function attributeDescription(description: string, opts: { marqueIntent?: boolean } = {}): Attributed {
  const j = parseJson(description)
  const ref = j && typeof j['client_ref'] === 'string' ? (j['client_ref'] as string).slice(0, 120) : null
  if (opts.marqueIntent) return { marketplace: 'marque.trade', attribution: 'marque_intent', clientRef: ref }
  const refDomain = shortlistDomain(ref)
  if (refDomain) return { marketplace: refDomain, attribution: 'client_ref', clientRef: ref }
  for (const t of taskTexts(description, j)) {
    const d = viaIn(t)
    if (d) return { marketplace: d, attribution: 'via_suffix', clientRef: ref }
  }
  if (j) {
    const via = typeof j['via'] === 'string' ? shortlistDomain(j['via'] as string) : null
    if (via) return { marketplace: via, attribution: 'envelope', clientRef: ref }
    // A job envelope that names its marketplace: protocol "<name>-job", or requested_by "<name>".
    const protocol = typeof j['protocol'] === 'string' ? (j['protocol'] as string) : ''
    const byProtocol = /^(.+)-job$/i.exec(protocol)?.[1] ?? null
    const by = typeof j['requested_by'] === 'string' ? (j['requested_by'] as string) : null
    const named = marketplaceByName(byProtocol) ?? marketplaceByName(by)
    if (named) return { marketplace: named, attribution: 'envelope', clientRef: ref }
  }
  return { marketplace: null, attribution: null, clientRef: ref }
}

export const JOB_STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const
export const statusName = (s: number): string => JOB_STATUS[s] ?? `STATUS_${s}`
/** Funded means funded (SPEC-ADOPTION 2.3.5): the chain recorded a deposit. */
export const FUNDED_STATUSES = new Set([1, 2, 3])


/** The countdown, from the absolute UTC end (never from server time, so it cannot mismatch on hydration). */
export interface CampaignClock { closed: boolean; msLeft: number; days: number; hours: number; minutes: number; under24h: boolean; under3h: boolean; afterCloseDays: number }
export function campaignClock(nowMs: number): CampaignClock {
  const msLeft = Math.max(0, campaignEndMs - nowMs)
  const closed = nowMs >= campaignEndMs
  return {
    closed, msLeft,
    days: Math.floor(msLeft / 86_400_000), hours: Math.floor((msLeft % 86_400_000) / 3_600_000), minutes: Math.floor((msLeft % 3_600_000) / 60_000),
    under24h: !closed && msLeft < 86_400_000, under3h: !closed && msLeft < 3 * 3_600_000,
    afterCloseDays: closed ? Math.floor((nowMs - campaignEndMs) / 86_400_000) : 0,
  }
}

/** "13d 20h 14m" (or "2h 05m" under 3 hours, or "Closed"). */
export function clockShort(c: CampaignClock): string {
  if (c.closed) return 'Closed'
  if (c.under3h) return `${c.hours}h ${String(c.minutes).padStart(2, '0')}m`
  return c.days ? `${c.days}d ${c.hours}h ${c.minutes}m` : `${c.hours}h ${c.minutes}m`
}

/** "13 days 20 hours" for the expanded Dock. */
export function clockWords(c: CampaignClock): string {
  if (c.closed) return 'Closed'
  if (c.under3h) return `${c.hours} hour${c.hours === 1 ? '' : 's'} ${c.minutes} minute${c.minutes === 1 ? '' : 's'}`
  const d = c.days ? `${c.days} day${c.days === 1 ? '' : 's'} ` : ''
  return `${d}${c.hours} hour${c.hours === 1 ? '' : 's'}`
}
