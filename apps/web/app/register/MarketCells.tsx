'use client'

import Link from 'next/link'
import { Chip, LinkButton } from '@marque/ui'
import { ReferenceMark } from '../_components/ReferenceMark'
import { AgentAvatar } from '../_components/AgentAvatar'
import {
  CATEGORY_LABEL,
  describe,
  hireHref,
  priceParts,
  profileHref,
  qualView,
  type MarketRow,
} from './market-model'
import styles from './register.module.css'

/**
 * The cells shared by the list and the grid.
 *
 * Both views render the SAME facts from the SAME row — the grid is a different
 * arrangement, never a reduced one. Anything a cell cannot say truthfully it
 * omits; nothing here fills a gap with a zero, a dash that implies a value, or
 * a number the API did not send.
 */

const PREVIEW_HINT = 'Runs a real task against real chain state before you pay or grant authority.'

/* --- Qualification: buyer's word first, evidence second, raw record third --- */

export function QualCell({ a, compact = false }: { a: MarketRow; compact?: boolean }) {
  const q = qualView(a)
  return (
    <span className={styles.qual} data-tone={q.tone}>
      <span className={styles.qualLabel} title={q.title}>
        <span className={styles.qualDot} aria-hidden="true" />
        {q.label}
      </span>
      {(q.evidence || q.date) && (
        <span className={styles.qualEvidence} title={q.detail ?? q.title}>
          {q.evidence}
          {q.date && (
            <>
              {q.evidence ? ' ' : null}
              <span className={`mono ${styles.qualDate}`}>{q.date}</span>
            </>
          )}
        </span>
      )}
      {q.flag && (
        <span className={styles.qualFlag} title={q.title}>
          {q.flag}
        </span>
      )}
      {!compact && q.tone === 'failed' && q.detail && (
        <span className={`mono ${styles.qualRaw}`} title={q.title}>
          {q.detail}
        </span>
      )}
    </span>
  )
}

/* --- Availability ------------------------------------------------------ */

/**
 * Availability, and the one timing figure Marque actually holds.
 *
 * The stored value is the latency of the MOST RECENT probe — a single
 * measurement, not a percentile over a window. It is labelled "Last probe" for
 * exactly that reason: calling a lone sample "latency" invites a reader to
 * treat it as a p95 the product does not compute.
 */
const PROBE_HINT =
  'Round-trip time of the most recent probe Marque ran against this agent. A single measurement, not a percentile or an average.'

export function LiveCell({ a }: { a: MarketRow }) {
  const live = a.liveness === 'live'
  return (
    <span className={styles.live} data-live={live || undefined}>
      <span className={`${styles.liveDot} ${live ? styles.liveDotOn : styles.liveDotOff}`} aria-hidden="true" />
      <span className={styles.liveWord}>{live ? 'Live' : (a.liveness ?? 'Unknown')}</span>
      {a.latencyMs != null && (
        <span className={styles.liveProbe} title={PROBE_HINT}>
          <span className={styles.liveProbeLabel}>Last probe</span>
          <span className={`mono ${styles.liveLatency}`}>{a.latencyMs} ms</span>
        </span>
      )}
    </span>
  )
}

/* --- Price: the advertised string, split so the amount carries the weight --- */

export function PriceCell({ a }: { a: MarketRow }) {
  const p = priceParts(a.price)
  if (!p) return <span className={styles.priceNone}>No listed price</span>
  return (
    <span className={styles.price}>
      <span className={`mono ${styles.priceValue}`}>{p.value}</span>
      {p.note && <span className={styles.priceNote}>{p.note}</span>}
    </span>
  )
}

/* --- Compare: a selection control, not a third call-to-action ------------ */

export function CompareToggle({
  a,
  picked,
  atLimit,
  onToggle,
}: {
  a: MarketRow
  picked: boolean
  atLimit: boolean
  onToggle: (a: MarketRow) => void
}) {
  const disabled = !picked && atLimit
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={picked}
      aria-label={picked ? `Remove ${a.name} from comparison` : `Add ${a.name} to comparison`}
      title={disabled ? 'Three agents is the maximum comparison' : 'Select to compare'}
      className={styles.compare}
      disabled={disabled}
      onClick={() => onToggle(a)}
    >
      <span className={styles.compareBox} aria-hidden="true">
        <svg viewBox="0 0 12 12" width="10" height="10" focusable="false">
          <path d="M1.5 6.2 4.4 9 10.5 2.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={styles.compareText}>Compare</span>
    </button>
  )
}

/* --- Preview / Hire: the existing eligibility rules, unchanged ----------- */

export function RowActions({ a }: { a: MarketRow }) {
  const href = profileHref(a)
  const warranted = a.warrant.status === 'warranted'
  const hireable = a.hireBlockedReason === null
  return (
    <span className={styles.actions}>
      {a.previewable && href && (
        <LinkButton
          size="sm"
          variant={warranted ? 'secondary' : 'primary'}
          href={`${href}#preview`}
          title={PREVIEW_HINT}
        >
          Preview free
        </LinkButton>
      )}
      {hireable ? (
        <LinkButton size="sm" variant={warranted ? 'primary' : 'secondary'} href={hireHref(a)}>
          Hire
        </LinkButton>
      ) : (
        <span className={styles.hireBlocked}>
          <button type="button" className={styles.hireBlockedBtn} disabled title={a.hireBlockedReason ?? undefined}>
            Hire
          </button>
          <span className={styles.hireBlockedWhy} title={a.hireBlockedReason ?? undefined}>
            {a.hireBlockedReason}
          </span>
        </span>
      )}
    </span>
  )
}

/* --- Identity ----------------------------------------------------------- */

/**
 * The avatar. Linked where a profile exists, but hidden from assistive tech and
 * the tab order: the name link beside it goes to the same place, and a second
 * identical stop is noise, not access.
 */
export function AgentThumb({ a, size }: { a: MarketRow; size: number }) {
  const href = profileHref(a)
  const avatar = (
    <AgentAvatar id={a.agentId} category={a.category} reference={a.isReference} size={size} imageUrl={a.identity.imageUrl} />
  )
  if (!href) return <span className={styles.thumb}>{avatar}</span>
  return (
    <Link href={href} className={styles.thumb} tabIndex={-1} aria-hidden="true">
      {avatar}
    </Link>
  )
}

/**
 * The name. Where a profile exists this is the row's ONE real link, and its
 * ::after is stretched over the row by the stylesheet so the whole card is
 * clickable without nesting anything interactive inside another anchor.
 */
export function AgentName({ a }: { a: MarketRow }) {
  const href = profileHref(a)
  if (!href) return <span className={styles.agentName}>{a.name}</span>
  return (
    <Link href={href} className={`${styles.agentName} ${styles.agentNameLink}`}>
      {a.name}
    </Link>
  )
}

/** Category + the provider's own one-line description, when there is one. */
export function AgentBlurb({ a }: { a: MarketRow }) {
  const cat = a.category && a.category !== 'unclassified' ? (CATEGORY_LABEL[a.category] ?? a.category) : null
  const desc = describe(a)
  if (!cat && !desc) return null
  return (
    <span className={styles.blurb}>
      {cat && <span className={styles.blurbCat}>{cat}</span>}
      {cat && desc && <span className={styles.blurbSep} aria-hidden="true">·</span>}
      {desc && <span className={styles.blurbText}>{desc}</span>}
    </span>
  )
}

/**
 * Level 3: what the agent declares and who registered it. Deliberately the
 * quietest thing in the row — a judge needs it, a buyer does not read it first.
 */
export function AgentMeta({ a, limit = 3 }: { a: MarketRow; limit?: number }) {
  const ifaces = a.interfaces.slice(0, limit)
  const hasToken = !!a.tokenId && /^\d+$/.test(a.tokenId)
  if (!ifaces.length && !a.identity.x402 && !hasToken && !a.ownerLabel && a.identityCount <= 1) return null
  return (
    <span className={styles.agentMeta}>
      {ifaces.map((k) => (
        <Chip key={k} className={styles.metaChip}>{k}</Chip>
      ))}
      {a.identity.x402 && <Chip tone="chain" className={styles.metaChip}>x402</Chip>}
      {hasToken && (
        <span className={`mono ${styles.metaId}`} title="ERC-8004 identity token on BNB Smart Chain">
          ERC-8004 #{a.tokenId}
        </span>
      )}
      {a.ownerLabel && (
        <span className={`mono ${styles.metaOwner}`} title={a.owner ?? undefined}>
          {a.ownerLabel}
        </span>
      )}
      {a.identityCount > 1 && (
        <span
          className={styles.metaDupes}
          title={`${a.identityCount.toLocaleString()} ERC-8004 identities grouped under this operator.`}
        >
          {a.identityCount.toLocaleString()} identities
        </span>
      )}
    </span>
  )
}

export function ReferenceTag() {
  return <ReferenceMark compact />
}
