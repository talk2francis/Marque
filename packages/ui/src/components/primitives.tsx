import type { ReactNode, ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react'

/**
 * The primitive set.
 *
 * Note what is absent: there is no Card. Marque ships Rows, because a grid of
 * identical rounded cards is the single clearest tell of a generated interface
 * and a competitor already ships one (AGENTS.md, Forbidden).
 */

// ---------------------------------------------------------------------------
// Statement — Fraunces. Four uses only: hero, section statements, charter
// headings, receipt title. Never card titles, never buttons.
// ---------------------------------------------------------------------------

export function Statement({
  children, as: As = 'h2', size = 'statement', className,
}: {
  children: ReactNode
  as?: 'h1' | 'h2' | 'h3' | 'p'
  size?: 'hero' | 'statement'
  className?: string
}) {
  return (
    <As className={['statement', `statement--${size}`, className].filter(Boolean).join(' ')}>
      {children}
    </As>
  )
}

// ---------------------------------------------------------------------------
// DataCell — Geist Mono, tabular. Numerals in tables, receipts and hashes only.
// ---------------------------------------------------------------------------

export function DataCell({
  children, align = 'right', muted, className,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  muted?: boolean
  className?: string
}) {
  return (
    <span
      className={['mono', 'data', `data--${align}`, muted ? 'data--muted' : '', className].filter(Boolean).join(' ')}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Provenance — the controlled vocabulary. CLAIMED is deliberately weakest:
// an unverified provider metric must never look like a chain-derived fact.
// ---------------------------------------------------------------------------

export type Provenance = 'ONCHAIN' | 'MEASURED' | 'TESTED' | 'CLAIMED'

const PROVENANCE_TITLE: Record<Provenance, string> = {
  ONCHAIN: 'Read directly from BNB Smart Chain, or computed purely from values that were.',
  MEASURED: 'Measured by Marque off-chain, with a source and a timestamp.',
  TESTED: 'Produced by a deterministic conformance test.',
  CLAIMED: 'Asserted by the provider and not verified by Marque.',
}

export function ProvenanceChip({
  provenance, onClick, title,
}: {
  provenance: Provenance
  onClick?: () => void
  title?: string
}) {
  const label = (
    <span className={`prov prov--${provenance.toLowerCase()}`} title={title ?? PROVENANCE_TITLE[provenance]}>
      {provenance}
    </span>
  )
  if (!onClick) return label
  return (
    <button type="button" className="prov__button" onClick={onClick} aria-label={`${provenance} — show evidence`}>
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Chip — a neutral tag. Sentence case, never a label shouting in caps.
// ---------------------------------------------------------------------------

export function Chip({
  children, tone = 'neutral', className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'holds' | 'watch' | 'breach' | 'chain'
  className?: string
}) {
  return <span className={['chip', `chip--${tone}`, className].filter(Boolean).join(' ')}>{children}</span>
}

// ---------------------------------------------------------------------------
// WarrantBadge — a conformance mark. Always dated, because a pass goes stale.
// ---------------------------------------------------------------------------

export function WarrantBadge({
  status, date, testId, failedField,
}: {
  status: 'warranted' | 'failed' | 'untested'
  date?: string
  testId?: string
  failedField?: string
}) {
  if (status === 'untested') {
    return <span className="warrant warrant--untested">Not yet tested</span>
  }
  if (status === 'failed') {
    return (
      <span className="warrant warrant--failed" title={failedField ? `Failed on ${failedField}` : undefined}>
        Failed {testId ?? ''}{failedField ? ` · ${failedField}` : ''}
      </span>
    )
  }
  return (
    <span className="warrant warrant--ok">
      Warranted{date ? <span className="warrant__date"> {date}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Button — plain verbs, sentence case, no arrow appended to the label.
// ---------------------------------------------------------------------------

type ButtonProps = {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'quiet'
  size?: 'md' | 'sm'
} & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ children, variant = 'secondary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}

export function LinkButton({
  children, variant = 'secondary', size = 'md', className, ...rest
}: { children: ReactNode; variant?: 'primary' | 'secondary' | 'quiet'; size?: 'md' | 'sm' } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Row — the unit of the Register. Dense, ~64px, eight to a screen.
// ---------------------------------------------------------------------------

export function Row({
  children, href, onClick, className, muted,
}: {
  children: ReactNode
  href?: string
  onClick?: () => void
  className?: string
  /** Used for the graveyard: present, legible, visibly not live. */
  muted?: boolean
}) {
  const classes = ['row', muted ? 'row--muted' : '', className].filter(Boolean).join(' ')
  if (href) return <a className={classes} href={href}>{children}</a>
  if (onClick) return <button type="button" className={classes} onClick={onClick}>{children}</button>
  return <div className={classes}>{children}</div>
}

// ---------------------------------------------------------------------------
// EmptyState — an invitation, never a shrug. AGENTS.md invariant 4: if a
// number is unavailable we say why, rather than showing a placeholder.
// ---------------------------------------------------------------------------

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grain — inline feTurbulence at 1.5%, cockpit surfaces only. On light ground
// grain reads as noise; on near-black it reads as material.
// ---------------------------------------------------------------------------

export function Grain() {
  return (
    <svg className="grain" aria-hidden="true" focusable="false">
      <filter id="marque-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#marque-grain)" />
    </svg>
  )
}
