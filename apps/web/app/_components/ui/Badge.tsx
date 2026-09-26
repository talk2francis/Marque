import type { ReactNode } from 'react'
import { utcDay } from '../../../lib/time'
import { cx } from './cx'

/**
 * The badge set (DESIGN-SYSTEM.md section 6, Pill / Badge). State is never
 * carried by colour alone: every badge says its state in words.
 */
export type BadgeKind =
  | { kind: 'hireable' }
  | { kind: 'preview' }
  | { kind: 'warranted'; date: string }
  | { kind: 'failed'; test: string; field?: string; date?: string }
  | { kind: 'untested' }
  | { kind: 'retest' }
  | { kind: 'reference' }
  | { kind: 'network'; label: string }

const day = utcDay

export function Badge(props: BadgeKind & { className?: string }) {
  const c = props.className
  switch (props.kind) {
    case 'hireable':
      return <span className={cx('pill pill--hireable', c)}><span className="pill-dot" aria-hidden="true" />Hireable</span>
    case 'preview':
      return <span className={cx('pill pill--preview', c)}>Preview only</span>
    case 'warranted':
      return <span className={cx('pill pill--warranted', c)}>Warranted {day(props.date)}</span>
    case 'failed':
      return (
        <span className={cx('pill pill--failed', c)}>
          Tested: failed {props.field ?? props.test}{props.date ? ` (${day(props.date)})` : ''}
        </span>
      )
    case 'untested':
      return <span className={cx('pill pill--untested', c)}>Untested</span>
    case 'retest':
      return <span className={cx('pill pill--retest', c)}>Retest due</span>
    case 'reference':
      return <span className={cx('pill pill--reference', c)}>Marque reference</span>
    case 'network':
      return <span className={cx('pill pill--chain', c)}><span className="pill-dot" aria-hidden="true" />{props.label}</span>
  }
}

/** A generic pill for anything outside the fixed set. */
export function Pill({ tone, dot, children, className }: { tone?: 'hireable' | 'warranted' | 'retest' | 'chain' | 'reference' | 'solid'; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('pill', tone && `pill--${tone}`, className)}>
      {dot ? <span className="pill-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}
