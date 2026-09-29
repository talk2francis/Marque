import { Check } from 'lucide-react'
import { AgentAvatar } from '../AgentAvatar'
import { Badge } from '../ui'
import { avatarSource } from '../../../lib/avatar-source'
import { utcDay } from '../../../lib/time'
import {
  CATEGORY_LABEL, agoWords, answersFree, deliveryWords, describe, hireBlocked, hireHref, isHireable,
  profileHref, tryHref, warrantIsStale, type MarketRow,
} from '../../register/market-model'
import styles from './AgentCard.module.css'

/**
 * The marketplace card (DESIGN-SYSTEM.md 8.3, simplified 28 Sep). Two axes, never
 * merged: can a wallet hire it right now, and has it passed Marque's published test.
 * Everything else is three figures with their source in words (a live quote or a
 * declared price, a median over paid jobs, verified buyers), so the card reads in one
 * pass. A third party that failed the test still carries Hire; the failure is named.
 *
 * `feature` is the home page's larger card: the portrait on a stage made from its own
 * image, blurred. Same facts, same order.
 */
const TONE: Record<string, string> = { yield: 'yield', grid: 'grid', rebalancing: 'rebalancing', health_factor: 'health', security: 'security' }

export function AgentCard({ a, compare, base = '', variant = 'default' }: {
  a: MarketRow
  /** The marketplace's compare toggle, when the card sits in a comparable list. */
  compare?: { picked: boolean; atLimit: boolean; onToggle: (a: MarketRow) => void }
  /** Path the hire sheet opens over (the home page passes "/"). */
  base?: string
  variant?: 'default' | 'feature'
}) {
  const feature = variant === 'feature'
  const profile = profileHref(a)
  const hireable = isHireable(a)
  const free = answersFree(a)
  const classified = a.category && a.category !== 'unclassified'
  const cat = classified ? CATEGORY_LABEL[a.category!] ?? a.category! : 'Other'
  const blurb = describe(a)
  const verified = a.track.verified
  const delivery = deliveryWords(a.track.delivery.medianSeconds)
  const priced = agoWords(a.commerce.quotedAt)
  const w = a.warrant
  const stale = w.status === 'warranted' && warrantIsStale(w.date)
  const art = avatarSource({ id: a.agentId, reference: a.isReference, imageUrl: a.identity.imageUrl, size: 512 })

  return (
    <article className={styles.card} data-variant={variant} data-agent={a.agentId} data-hireable={hireable || undefined} data-picked={compare?.picked || undefined}>
      {feature ? (
        <div className={styles.cover} aria-hidden="true" data-kind={art.kind}>
          {art.src
            ? <img className={styles.coverArt} src={art.src} alt="" width={512} height={512} loading="lazy" decoding="async" />
            : <span className={styles.coverEmblem}><AgentAvatar id={a.agentId} category={a.category} reference={a.isReference} size={72} /></span>}
        </div>
      ) : null}

      <header className={styles.head}>
        {feature ? null : (
          <span className={styles.portrait}>
            <AgentAvatar id={a.agentId} category={a.category} reference={a.isReference} imageUrl={a.identity.imageUrl} size={52} />
          </span>
        )}
        <div className={styles.title}>
          <h3 className={styles.name}>
            {profile ? <a href={profile} className={styles.nameLink}>{a.name}</a> : a.name}
          </h3>
          <span className={styles.where}>
            <span className={styles.mark} data-tone={classified ? TONE[a.category!] : 'other'} aria-hidden="true" />
            {cat}
            {a.identityCount > 1 && !classified ? <span className={styles.count}> · {a.identityCount} identities</span> : null}
          </span>
        </div>
        {a.isReference ? <a href="/register#reference-agents" className={styles.ref} title="Why Marque runs its own agents"><Badge kind="reference" /></a> : null}
      </header>

      {blurb ? <p className={styles.blurb}>{blurb}</p> : <p className={styles.blurbNone}>No description published.</p>}

      <p className={styles.status}>
        {hireable
          ? <span className={styles.ok}><span className={styles.dot} aria-hidden="true" />Hireable</span>
          : <span className={styles.off}>{a.commerce.state === 'preview_only' || free ? 'Preview only' : 'Not hireable'}</span>}
        <span className={styles.sep} aria-hidden="true" />
        {w.status === 'warranted' && w.date
          ? stale ? <span className={styles.retest}>Retest due</span> : <span className={styles.warrant}><Check aria-hidden="true" />Warranted {utcDay(w.date)}</span>
          : w.status === 'failed'
            ? <span className={styles.failed} title={`Failed ${w.testId ?? 'MCS'}${w.failedField ? ` on ${w.failedField}` : ''}${w.date ? `, ${utcDay(w.date)}` : ''}. The record is on its page.`}>Failed {w.testId ?? 'the test'}</span>
            : <span className={styles.untested}>Untested</span>}
      </p>

      <dl className={styles.stats}>
        <div>
          <dt>Price</dt>
          <dd className={a.priceProvenance === 'MEASURED' ? styles.live : styles.claimed}>{a.price ?? 'None'}</dd>
          {/* Relative time is computed at render: server and browser clocks differ by the page's age. */}
          <dd className={styles.src} suppressHydrationWarning>{a.price ? (a.priceProvenance === 'MEASURED' ? (priced ? `live quote, ${priced}` : 'live quote') : 'declared') : 'not published'}</dd>
        </div>
        <div>
          <dt>Delivers</dt>
          <dd>{delivery ?? (a.latencyMs !== null ? `${a.latencyMs} ms` : 'No jobs')}</dd>
          <dd className={styles.src}>{delivery ? `median, ${a.track.delivery.samples} paid` : a.latencyMs !== null ? 'probe reply' : 'none paid yet'}</dd>
        </div>
        <div>
          <dt>Rating</dt>
          <dd>{verified.averageStars !== null && verified.count > 0 ? <>{verified.averageStars.toFixed(1)}<span className={styles.star} aria-hidden="true">★</span></> : <span className={styles.none}>Not yet</span>}</dd>
          <dd className={styles.src}>{verified.count > 0 ? `${verified.count} verified` : 'no verified buyer yet'}</dd>
        </div>
      </dl>

      <footer className={styles.actions}>
        {compare ? (
          <label className={styles.compare} data-disabled={(!compare.picked && compare.atLimit) || undefined}>
            <input type="checkbox" checked={compare.picked} disabled={!compare.picked && compare.atLimit} onChange={() => compare.onToggle(a)} />
            <span className={styles.compareBox} aria-hidden="true"><Check /></span>
            Compare
          </label>
        ) : <span />}
        <span className={styles.buttons}>
          {free ? <a className={`btn btn--sm btn--quiet ${styles.try}`} href={`${base}${tryHref(a)}`}>Try free</a> : null}
          {hireable
            ? <a className="btn btn--sm btn--hire" href={`${base}${hireHref(a)}`}>Hire</a>
            : profile ? <a className="btn btn--sm" href={profile} title={hireBlocked(a)}>View record</a> : null}
        </span>
      </footer>
      {!hireable ? <p className={styles.why}>{hireBlocked(a)}.</p> : null}
    </article>
  )
}
