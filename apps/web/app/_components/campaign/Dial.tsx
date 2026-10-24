'use client'
import { useId } from 'react'
import styles from './campaign.module.css'

/**
 * The Set and Earn dial (replaces the V4-03 prism). Two rings read like a watch complication:
 * the outer ring is the Hire track (3 segments), the inner ring the Build track (6 criteria).
 * A segment fills when the chain shows it; both rings turn moss when that track is met. The
 * centre holds the days left (large size) or a quiet dot (small size). Both tracks met: the dial turns moss with a
 * check. Under 24 hours: the light turns amber and comes round faster.
 *
 * The only motion is a slow brass light sweeping the rings: decorative (invariant 38), stopped
 * under reduced motion and while the tab is hidden. Every value it shows is also in the text
 * beside it, so the dial itself carries no information a screen reader would miss.
 */
const TAU = Math.PI * 2

function arcs(n: number, r: number, gapDeg: number): string[] {
  const gap = (gapDeg / 360) * TAU
  const span = TAU / n
  return Array.from({ length: n }, (_, i) => {
    const a0 = -Math.PI / 2 + i * span + gap / 2
    const a1 = a0 + span - gap
    const p = (a: number) => `${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`
    return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`
  })
}

export function Dial({ hire, build, days, size = 30, warn = false, team = false }: {
  hire: number; build: number; days?: number | null; size?: number; warn?: boolean; team?: boolean
}) {
  const sheen = `dial-sheen-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const big = size >= 44
  const outer = arcs(3, 13, big ? 14 : 18)
  const inner = arcs(6, 8.6, big ? 16 : 22)
  const hireMet = !team && hire >= 3
  const buildMet = !team && build >= 6
  const complete = hireMet && buildMet
  return (
    <span className={styles.dial} data-big={big || undefined} data-warn={(warn && !complete) || undefined} data-complete={complete || undefined} data-team={team || undefined} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="-16 -16 32 32" width={size} height={size}>
        <defs>
          <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.9" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle r="15.2" className={styles.dialFace} />
        {outer.map((d, i) => <path key={`o${i}`} d={d} className={styles.dialSeg} data-on={i < hire || undefined} data-met={hireMet || undefined} strokeWidth={big ? 2.4 : 2.6} />)}
        {inner.map((d, i) => <path key={`i${i}`} d={d} className={styles.dialSeg} data-on={i < build || undefined} data-met={buildMet || undefined} strokeWidth={big ? 1.8 : 2} />)}
        <g className={styles.dialSweep}><path d="M 0 -15.2 A 15.2 15.2 0 0 1 10.75 -10.75" stroke={`url(#${sheen})`} strokeWidth="1.2" fill="none" strokeLinecap="round" /></g>
        {complete
          ? <path className={styles.dialCheck} d={big ? 'M -3.6 0.4 L -1 3 L 4 -2.6' : 'M -2.6 0.3 L -0.7 2.2 L 2.9 -1.9'} />
          : big && days != null
          ? <text className={styles.dialDays} y="1.6" textAnchor="middle" dominantBaseline="middle">{days}<tspan className={styles.dialUnit} dx="0.4">d</tspan></text>
          : <circle r={big ? 2.2 : 1.6} className={styles.dialDot} />}
      </svg>
    </span>
  )
}
