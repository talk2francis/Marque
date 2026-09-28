import { Check } from 'lucide-react'
import { ProvenanceChip } from '@marque/ui'
import { AgentAvatar } from '../AgentAvatar'
import { Badge, Stars } from '../ui'
import {
  CATEGORY_LABEL, agoWords, answersFree, deliveryWords, describe, hireBlocked, hireHref, isHireable, networkOf,
  profileHref, tryHref, warrantIsStale, type MarketRow,
} from '../../register/market-model'
import styles from './AgentCard.module.css'

/**
 * The marketplace card (DESIGN-SYSTEM.md 8.3), used on the home page and the
 * marketplace. Two axes, never merged: can a wallet hire it right now (and at
 * what live price), and has it passed Marque's published test. A third party
 * that failed the test still carries Hire; the failure sits under it, dated.
 *
 * Every figure is the row the marketplace API sent: nothing is filled in.
 */
export function AgentCard({ a, compare, base = '' }: {
  a: MarketRow
  /** The marketplace's compare toggle, when the card sits in a comparable list. */
  compare?: { picked: boolean; atLimit: boolean; onToggle: (a: MarketRow) => void }
  /** Path the hire sheet opens over (the home page passes "/"). */
  base?: string
}) {
  const profile = profileHref(a)
  const hireable = isHireable(a)
  const free = answersFree(a)
  const cat = a.category && a.category !== 'unclassified' ? CATEGORY_LABEL[a.category] ?? a.category : 'Unclassified'
  const blurb = describe(a)
  const verified = a.track.verified
  const delivery = deliveryWords(a.track.delivery.medianSeconds)
  const priced = agoWords(a.commerce.quotedAt)
  const w = a.warrant
  const stale = w.status === 'warranted' && warrantIsStale(w.date)

  return (
    <article className={styles.card} data-agent={a.agentId} data-hireable={hireable || undefined} data-picked={compare?.picked || undefined}>
      <header className={styles.head}>
        <AgentAvatar id={a.agentId} category={a.category} reference={a.isReference} imageUrl={a.identity.imageUrl} size={40} />
        <div className={styles.title}>
          <h3 className={styles.name}>
            {profile ? <a href={profile} className={styles.nameLink}>{a.name}</a> : a.name}
          </h3>
          <span className={styles.where}>{cat} · {networkOf(a)}</span>
        </div>
        {a.isReference ? <a href="/register#reference-agents" className={styles.ref} title="Why Marque runs its own agents"><Badge kind="reference" /></a> : null}
      </header>

      {blurb ? <p className={styles.blurb}>{blurb}</p> : <p className={styles.blurbNone}>No description published.</p>}

      <div className={styles.facts}>
        <div className={styles.row}>
          <span className={styles.cell}>{hireable ? <Badge kind="hireable" /> : a.commerce.state === 'preview_only' || free ? <Badge kind="preview" /> : <span className={styles.off}>Not hireable</span>}</span>
          <span className={styles.price} data-src={a.priceProvenance ?? 'none'}>
            {a.price ? (
              <>
                <span className="num">{a.price}</span>
                <ProvenanceChip provenance={a.priceProvenance === 'MEASURED' ? 'MEASURED' : 'CLAIMED'} title={a.priceProvenance === 'MEASURED' ? 'A live quote the agent returned to Marque.' : 'The price the agent declares in its registration.'} />
              </>
            ) : <span className={styles.muted}>No price published</span>}
          </span>
          <span className={styles.cellEnd}><Stars value={verified.averageStars} count={verified.count} label="verified" /></span>
        </div>
        <div className={styles.row}>
          <span className={styles.cell}>
            {w.status === 'warranted' && w.date
              ? stale ? <Badge kind="retest" /> : <Badge kind="warranted" date={w.date} />
              : w.status === 'failed'
                ? <Badge kind="failed" test={w.testId ?? 'MCS'} field={w.failedField ?? undefined} date={w.date ?? undefined} />
                : <Badge kind="untested" />}
          </span>
          <span className={styles.muted}>
            {delivery
              ? <span title={`Median time from payment into escrow to delivery, over ${a.track.delivery.samples} paid ${a.track.delivery.samples === 1 ? 'job' : 'jobs'} on BNB Chain.`}>delivers in {delivery}</span>
              : a.latencyMs !== null ? <span title="Round trip of Marque's latest probe. Not a paid job.">answers in {a.latencyMs} ms</span> : 'No paid jobs yet'}
          </span>
          {priced ? <span className={`${styles.muted} ${styles.cellEnd}`} suppressHydrationWarning>priced {priced}</span> : null}
        </div>
      </div>

      <footer className={styles.actions}>
        {compare ? (
          <label className={styles.compare} data-disabled={(!compare.picked && compare.atLimit) || undefined}>
            <input type="checkbox" checked={compare.picked} disabled={!compare.picked && compare.atLimit} onChange={() => compare.onToggle(a)} />
            <span className={styles.compareBox} aria-hidden="true"><Check /></span>
            Compare
          </label>
        ) : <span />}
        <span className={styles.buttons}>
          {free ? <a className="btn btn--sm" href={`${base}${tryHref(a)}`}>Try free</a> : null}
          {hireable
            ? <a className="btn btn--sm btn--hire" href={`${base}${hireHref(a)}`}>Hire</a>
            : profile ? <a className="btn btn--sm" href={profile} title={hireBlocked(a)}>View record</a> : null}
        </span>
      </footer>
      {!hireable ? <p className={styles.why}>{hireBlocked(a)}.</p> : null}
    </article>
  )
}
