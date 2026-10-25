'use client'
import { useId } from 'react'
import styles from './emblem.module.css'

/**
 * The Set and Earn emblem (25 Oct, replaces the dial): an obelisk on a plinth, drawn from the monoliths in Marque's own
 * art. The capstone has three facets, one per agent hired (the Hire track); champagne metal rises up the shaft, one
 * sixth per Build criterion observed. A single ridge splits the stone into a lit face and a shaded face. Both tracks
 * met: the whole stone is metal and a light catches the apex. Under 24 hours left, the outline turns amber.
 * Course lines are engraved only at sizes where they read. Decorative (aria-hidden): every value is written beside it.
 */
const CAP_L = 'M12 1.4 L7.9 9 L10.65 9 Z'
const CAP_C = 'M12 1.4 L10.65 9 L13.35 9 Z'
const CAP_R = 'M12 1.4 L13.35 9 L16.1 9 Z'
const SHAFT_L = 'M8.1 9.7 L11.75 9.7 L11.6 29.6 L6.8 29.6 Z'
const SHAFT_R = 'M11.75 9.7 L15.9 9.7 L17.2 29.6 L11.6 29.6 Z'
const OUTLINE = 'M12 1.4 L16.1 9 L15.9 9.7 L17.2 29.6 L6.8 29.6 L8.1 9.7 L7.9 9 Z'
const SHAFT_H = 19.9

export function Emblem({ hire, build, size = 28, warn = false, team = false }: {
  hire: number; build: number; size?: number; warn?: boolean; team?: boolean
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const lit = `em-l-${id}`, shade = `em-s-${id}`, cap = `em-c-${id}`, clip = `em-k-${id}`
  const h = team ? 0 : Math.max(0, Math.min(3, hire))
  const b = team ? 0 : Math.max(0, Math.min(6, build))
  const complete = h === 3 && b === 6
  const fillTop = 29.6 - (SHAFT_H * b) / 6
  return (
    <svg className={styles.emblem} viewBox="0 0 24 32" width={size * 0.75} height={size} aria-hidden="true"
      data-complete={complete || undefined} data-warn={(warn && !complete) || undefined} data-team={team || undefined}>
      <defs>
        <linearGradient id={lit} x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stopColor="var(--em-hi)" /><stop offset="1" stopColor="var(--em-mid)" /></linearGradient>
        <linearGradient id={shade} x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stopColor="var(--em-mid)" /><stop offset="1" stopColor="var(--em-lo)" /></linearGradient>
        <linearGradient id={cap} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--em-hi)" /><stop offset="1" stopColor="var(--em-mid)" /></linearGradient>
        <clipPath id={clip}><rect x="0" y={fillTop} width="24" height={29.6 - fillTop + 0.01} /></clipPath>
      </defs>
      {/* The stone, in graphite */}
      <path d={CAP_L} className={styles.lit} /><path d={CAP_C} className={styles.lit} /><path d={CAP_R} className={styles.shade} />
      <path d={SHAFT_L} className={styles.lit} /><path d={SHAFT_R} className={styles.shade} />
      {/* Metal: a capstone facet per agent hired, the shaft rising per criterion */}
      {h >= 1 ? <path d={CAP_L} fill={`url(#${lit})`} /> : null}
      {h >= 2 ? <path d={CAP_C} fill={`url(#${cap})`} /> : null}
      {h >= 3 ? <path d={CAP_R} fill={`url(#${shade})`} /> : null}
      {b > 0 ? <g clipPath={`url(#${clip})`}><path d={SHAFT_L} fill={`url(#${lit})`} /><path d={SHAFT_R} fill={`url(#${shade})`} /></g> : null}
      {size >= 44 ? Array.from({ length: 5 }, (_, i) => { const y = 29.6 - (SHAFT_H * (i + 1)) / 6; return <line key={i} x1="6.9" y1={y} x2="17.1" y2={y} className={styles.course} /> }) : null}
      <path d={OUTLINE} className={styles.edge} />
      <line x1="7.9" y1="9.35" x2="16.1" y2="9.35" className={styles.edge} />
      {/* Plinth */}
      <path d="M5.2 29.9 L18.8 29.9 L19.6 31.4 L4.4 31.4 Z" className={styles.plinth} data-on={complete || undefined} />
      {complete ? <circle cx="12" cy="1.7" r="1.05" className={styles.spark} /> : null}
    </svg>
  )
}
