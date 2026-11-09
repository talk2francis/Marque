'use client'
import { useId, useMemo, useState, type PointerEvent } from 'react'
import { useWidth } from './useWidth'
import styles from './charter.module.css'

/**
 * HealthHistory (03_EXPERIENCE section 4): the owner's health over the charter's life from the watcher's sampled
 * reads (MEASURED), with the trigger, target and liquidation lines and each action (ONCHAIN) marked. One series,
 * so no legend box: the reference lines are labelled where they sit. Hover or touch for any reading; a table of
 * every point sits under it for screen readers and for checking.
 */
export interface HistoryPoint { at: string; health: number; blockNumber: string }
export interface HistoryAction { at: string; before: number; after: number; label: string }

const PAD = { l: 12, r: 12, t: 14, b: 26 }
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
// Under two days the axis reads in hours; three ticks saying "9 Nov" would say nothing.
const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const fmtTime = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'

export function HealthHistory({ points, actions, trigger, target, from, to }: {
  points: HistoryPoint[]
  actions: HistoryAction[]
  trigger: number
  target: number
  /** The charter's start and the right edge (now, or when it ended). */
  from: number
  to: number
}) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const [boxRef, W] = useWidth<HTMLDivElement>(720)
  const H = W < 520 ? 200 : 240
  const data = useMemo(() => points.map((p) => ({ t: Date.parse(p.at), h: Math.min(p.health, 50), block: p.blockNumber })).filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t), [points])
  const t0 = Math.min(from, data[0]?.t ?? from)
  const t1 = Math.max(to, t0 + 60_000)
  const hs = [...data.map((p) => p.h), ...actions.flatMap((a) => [a.before, a.after]), trigger, target, 1]
  const lo = Math.max(0, Math.min(...hs) - 0.1)
  const hi = Math.max(...hs) + 0.15
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r)
  const y = (h: number) => PAD.t + (1 - (h - lo) / (hi - lo)) * (H - PAD.t - PAD.b)

  if (data.length === 0 && actions.length === 0) {
    return <div className={styles.historyEmpty}><p>History starts now.</p><span>Every reading the watchers take is added here.</span></div>
  }

  // Each action is a step in the line: health jumps from before to after at the same instant.
  const series = [...data.map((p) => ({ t: p.t, h: p.h })), ...actions.flatMap((a) => [{ t: Date.parse(a.at) - 1, h: a.before }, { t: Date.parse(a.at), h: a.after }])].sort((a, b) => a.t - b.t)
  const path = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.h).toFixed(1)}`).join('')
  const ticks = [0, 0.5, 1].map((f) => t0 + f * (t1 - t0))
  const ref = [
    { h: target, label: `target ${target.toFixed(2)}`, cls: styles.refTarget },
    { h: trigger, label: `trigger ${trigger.toFixed(2)}`, cls: styles.refTrigger },
    { h: 1, label: 'liquidation 1.00', cls: styles.refLiq },
  ].filter((r) => r.h >= lo && r.h <= hi)

  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (data.length === 0) return
    const box = e.currentTarget.getBoundingClientRect()
    const t = t0 + (((e.clientX - box.left) / box.width) * W - PAD.l) / (W - PAD.l - PAD.r) * (t1 - t0)
    let best = 0
    for (let i = 1; i < data.length; i++) if (Math.abs(data[i]!.t - t) < Math.abs(data[best]!.t - t)) best = i
    setHover(best)
  }
  const hp = hover !== null ? data[hover] : null

  return (
    <figure className={styles.history} aria-labelledby={`${id}-c`}>
      <div className={styles.chartBox} ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Loan health from ${fmtDay(t0)} to ${fmtDay(t1)}: ${data.length} readings and ${actions.length} action${actions.length === 1 ? '' : 's'}. The table below lists every point.`}
          onPointerMove={move} onPointerLeave={() => setHover(null)}>
          {ref.map((r) => (
            <g key={r.label}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(r.h)} y2={y(r.h)} className={r.cls} />
              <text x={W - PAD.r} y={y(r.h) - 5} textAnchor="end" className={styles.refLabel}>{r.label}</text>
            </g>
          ))}
          {ticks.map((t) => <text key={t} x={x(t)} y={H - 6} textAnchor={t === t0 ? 'start' : t === t1 ? 'end' : 'middle'} className={styles.axis}>{t1 - t0 < 2 * 86_400_000 ? fmtClock(t) : fmtDay(t)}</text>)}
          <path d={path} className={styles.line} />
          {actions.map((a) => {
            const ax = x(Date.parse(a.at))
            return (
              <g key={a.at}>
                <line x1={ax} x2={ax} y1={y(a.before)} y2={y(a.after)} className={styles.actLine} />
                <circle cx={ax} cy={y(a.after)} r={5} className={styles.actDot} />
                <text x={Math.min(ax + 8, W - PAD.r - 4)} y={Math.max(PAD.t + 10, y(a.after) - 8)} textAnchor={ax > W * 0.7 ? 'end' : 'start'} className={styles.actLabel}>{a.label}</text>
              </g>
            )
          })}
          {hp ? (
            <g>
              <line x1={x(hp.t)} x2={x(hp.t)} y1={PAD.t} y2={H - PAD.b} className={styles.cross} />
              <circle cx={x(hp.t)} cy={y(hp.h)} r={4.5} className={styles.hoverDot} />
            </g>
          ) : null}
        </svg>
        {hp ? (
          <div className={styles.tip} style={{ left: `${(x(hp.t) / W) * 100}%` }} role="status">
            <b className="mono">{hp.h.toFixed(2)}</b><span>{fmtTime(hp.t)}</span><span>block {Number(hp.block).toLocaleString('en-US')}</span>
          </div>
        ) : null}
      </div>
      <figcaption id={`${id}-c`} className={styles.caption}>Health as Venus reported it at each watcher reading (measured); actions from the chain&apos;s Acted events.</figcaption>
      <details className={styles.table}>
        <summary>Every reading</summary>
        <table>
          <thead><tr><th scope="col">Time (UTC)</th><th scope="col">Health</th><th scope="col">Block</th></tr></thead>
          <tbody>{data.map((p) => <tr key={`${p.t}-${p.block}`}><td>{fmtTime(p.t)}</td><td className="mono">{p.h.toFixed(4)}</td><td className="mono">{p.block}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  )
}
