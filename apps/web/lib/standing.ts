import type { MarketRow } from './marketplace'
import type { StandingEvidence } from './agent-standing'

/**
 * An agent's standing (V4.4, 2 Nov): four separate questions, each with its own evidence, and only safety hides an agent.
 *
 * hireable: a live signed price payable into the ERC-8183 escrow to the identity's own agent wallet (the quote checks
 * already refuse a price signed by a key the identity does not name), and not pulled.
 * pulled: its latest paid job closed in the last 14 days without a delivery, or in the last 14 days it stated a chain fact
 * outside tolerance (a check call, a paid job's Lens check pinned to its block, or the Standard's test) and nothing has
 * agreed since. A missing field never pulls.
 * checked: within 30 days, an answer whose stated chain facts all agreed with the chain; a Warrant counts, as the strictest check.
 * warranted: a full pass of its category's published test (the Standard, unchanged) within 14 days.
 * A testnet identity with the same owner and endpoint host as a mainnet one carries that one's checked and warranted,
 * marked as earned on mainnet.
 */
export interface Standing {
  pulled: { reason: 'undelivered' | 'wrong_answer'; text: string; at: string; ref: string | null } | null
  checked: { at: string; via: 'job' | 'check' | 'test'; ref: string; onMainnet: boolean } | null
  warranted: { at: string; testId: string; onMainnet: boolean } | null
}

export const NO_STANDING: Standing = { pulled: null, checked: null, warranted: null }
export const WARRANT_DAYS = 14
const DAY = 86_400_000

const priced = (r: Pick<MarketRow, 'commerce'>) => r.commerce.state === 'hireable' || r.commerce.state === 'settleable'
/** Hireable now: priced and not pulled. The one predicate every count and the Ready view use. */
export const isHireable = (r: Pick<MarketRow, 'commerce' | 'standing'>) => priced(r) && !r.standing?.pulled
export const isPulled = (r: Pick<MarketRow, 'standing'>) => Boolean(r.standing?.pulled)
export const isChecked = (r: Pick<MarketRow, 'standing'>) => Boolean(r.standing?.checked)
export const isWarrantedNow = (r: Pick<MarketRow, 'standing'>) => Boolean(r.standing?.warranted)
export const hasDelivered = (r: Pick<MarketRow, 'track'>) => (r.track?.jobs.delivered ?? 0) > 0

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const twinKey = (r: Pick<MarketRow, 'owner' | 'host'>) => (r.owner && r.host ? `${r.owner.toLowerCase()}|${r.host.toLowerCase()}` : null)

function own(r: MarketRow, ev: StandingEvidence | undefined, now: number): Standing {
  const w = r.warrant
  const warranted = w.status === 'warranted' && w.date && w.testId && now - Date.parse(w.date) <= WARRANT_DAYS * DAY
    ? { at: w.date, testId: w.testId, onMainnet: false } : null
  let checked: Standing['checked'] = ev?.checked ? { ...ev.checked, onMainnet: false } : null
  let pulled: Standing['pulled'] = null
  // The Standard's test found a stated value wrong (warrant 'failed' is only that now), recently, with no agreement since.
  const testWrong = w.status === 'failed' && w.date && now - Date.parse(w.date) <= WARRANT_DAYS * DAY && !(checked && checked.at > w.date)
  if (ev?.wrong) pulled = { reason: 'wrong_answer', text: `Stated ${ev.wrong.detail ? ev.wrong.detail.toLowerCase() : 'a chain fact'} outside tolerance, ${day(ev.wrong.at)}`, at: ev.wrong.at, ref: ev.wrong.ref }
  else if (testWrong) pulled = { reason: 'wrong_answer', text: `Stated a wrong ${w.failedField ? w.failedField.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() : 'value'} in ${w.testId}, ${day(w.date!)}`, at: w.date!, ref: w.testId }
  else if (ev?.undelivered) pulled = { reason: 'undelivered', text: `Its latest paid job was ${ev.undelivered.state === 'EXPIRED' ? 'left to expire' : 'refunded'} without a delivery, ${day(ev.undelivered.at)}`, at: ev.undelivered.at, ref: ev.undelivered.jobId }
  if (pulled?.reason === 'wrong_answer') checked = null
  // A Warrant is the strictest chain check there is: every field recomputed from BNB Chain at a pinned block. A warranted
  // agent is therefore checked too, so "checked" is the whole proven set and "warranted" the top part of it (3 Nov).
  if (!checked && warranted && !pulled) checked = { at: warranted.at, via: 'test', ref: warranted.testId, onMainnet: warranted.onMainnet }
  return { pulled, checked, warranted }
}

/**
 * Every row's standing. `mainnetRows` are the mainnet listing (their own standing is computed here too), so a testnet
 * twin can carry what its mainnet identity earned.
 */
export function withStanding<T extends MarketRow>(rows: T[], evidence: Record<string, StandingEvidence>, mainnetRows: readonly MarketRow[] = [], now = Date.now()): T[] {
  const main = new Map<string, Standing>()
  for (const m of rows.some(row => row.agentId.startsWith('97:')) ? mainnetRows : []) {
    const k = twinKey(m)
    if (!k || !m.agentId.startsWith('56:')) continue
    const s = own(m, evidence[m.agentId], now)
    const prev = main.get(k)
    if (!prev || (!prev.warranted && s.warranted) || (!prev.checked && s.checked)) main.set(k, { pulled: null, checked: s.checked ?? prev?.checked ?? null, warranted: s.warranted ?? prev?.warranted ?? null })
  }
  return rows.map((r) => {
    const s = own(r, evidence[r.agentId], now)
    if (r.agentId.startsWith('97:')) {
      const k = twinKey(r)
      const m = k ? main.get(k) : undefined
      if (m && !s.pulled) {
        if (!s.warranted && m.warranted) s.warranted = { ...m.warranted, onMainnet: true }
        if (!s.checked && m.checked) s.checked = { ...m.checked, onMainnet: true }
      }
    }
    return { ...r, standing: s }
  })
}

/** The pulled list, one row per operator and endpoint host (a template deployed many times is one entry). */
export function dedupePulled<T extends Pick<MarketRow, 'owner' | 'host' | 'agentId'>>(rows: readonly T[]): Array<T & { identities: number }> {
  const seen = new Map<string, T & { identities: number }>()
  for (const r of rows) {
    const k = twinKey(r) ?? r.agentId
    const prev = seen.get(k)
    if (prev) prev.identities++
    else seen.set(k, { ...r, identities: 1 })
  }
  return [...seen.values()]
}
