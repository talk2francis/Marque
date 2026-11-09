'use client'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import styles from './BandRule.module.css'

/**
 * BandRule: the MeasureRule with two handles over any scale (11_EXPERIENCE, one instrument per kind): Yield Sweep's
 * wallet band (floor and ceiling, in tokens), Grid Band's price ladder (lowest and highest level, in price). The
 * caller owns the bounds and the step, so the handles stop exactly where the factory would refuse. Keyboard
 * complete (arrows, Shift or Page for big steps, Home and End); values are announced in words.
 */
export interface BandMark { at: number; state: 'buy' | 'hold' | 'idle'; label?: string }
type Which = 'low' | 'high'

export function BandRule({
  min, max, low, high, onChange, step, bigStep, minGap, format, words, lowName, highName, now, nowLabel, ghost, marks, label, variant = 'edit', tones = ['amber', 'moss'],
}: {
  min: number; max: number; low: number; high: number
  onChange?: (next: { low: number; high: number }) => void
  step: number; bigStep: number; minGap: number
  format: (v: number) => string
  /** The announced value: "Keeps at least 200 USDC". */
  words: (which: Which, v: number) => string
  lowName: string; highName: string
  now?: number | null; nowLabel?: string
  /** A shaded stretch (what would move now). */
  ghost?: { from: number; to: number; label: string } | null
  marks?: BandMark[]
  label: string
  variant?: 'edit' | 'read'
  tones?: [string, string]
}) {
  const track = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Which | null>(null)
  const span = Math.max(max - min, 1e-12)
  const pct = (v: number) => `${Math.max(0, Math.min(1, (v - min) / span)) * 100}%`
  const editable = variant === 'edit' && Boolean(onChange)
  const snap = (v: number) => Math.round(v / step) * step
  const set = (which: Which, v: number) => {
    if (!onChange) return
    if (which === 'low') onChange({ low: Math.max(min, Math.min(v, high - minGap)), high })
    else onChange({ low, high: Math.min(max, Math.max(v, low + minGap)) })
  }
  const fromX = (x: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return null
    return snap(min + Math.max(0, Math.min(1, (x - r.left) / r.width)) * span)
  }
  const down = (w: Which) => (e: PointerEvent<HTMLDivElement>) => { if (!editable) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus(); setDrag(w) }
  const move = (e: PointerEvent<HTMLDivElement>) => { if (!drag) return; const v = fromX(e.clientX); if (v !== null) set(drag, v) }
  const up = (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); setDrag(null) }
  const key = (w: Which) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (!editable) return
    const v = w === 'low' ? low : high
    let n: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = v + (e.shiftKey ? bigStep : step)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = v - (e.shiftKey ? bigStep : step)
    else if (e.key === 'PageUp') n = v + bigStep
    else if (e.key === 'PageDown') n = v - bigStep
    else if (e.key === 'Home') n = w === 'low' ? min : low + minGap
    else if (e.key === 'End') n = w === 'low' ? high - minGap : max
    if (n === null) return
    e.preventDefault()
    set(w, n)
  }
  const handle = (w: Which) => {
    const v = w === 'low' ? low : high
    return (
      <div className={styles.handle} data-which={w} data-tone={w === 'low' ? tones[0] : tones[1]} data-dragging={drag === w ? 'true' : undefined} style={{ left: pct(v) }}
        role="slider" tabIndex={editable ? 0 : undefined} aria-label={w === 'low' ? lowName : highName}
        aria-valuemin={w === 'low' ? min : low + minGap} aria-valuemax={w === 'low' ? high - minGap : max} aria-valuenow={v} aria-valuetext={words(w, v)}
        aria-readonly={editable ? undefined : true}
        onPointerDown={down(w)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key(w)}>
        <span className={styles.handleLabel}><span className="mono">{format(v)}</span><small>{w === 'low' ? lowName : highName}</small></span>
      </div>
    )
  }
  const close = (high - low) / span < 0.18
  return (
    <div className={styles.rule} data-variant={variant} data-close={close ? 'true' : undefined} role="group" aria-label={label}>
      <div className={styles.track} ref={track}>
        <div className={styles.band} style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
        {ghost ? <div className={styles.ghost} style={{ left: pct(Math.min(ghost.from, ghost.to)), width: `calc(${pct(Math.max(ghost.from, ghost.to))} - ${pct(Math.min(ghost.from, ghost.to))})` }} title={ghost.label} /> : null}
        {(marks ?? []).map((m, i) => <span key={i} className={styles.mark} data-state={m.state} style={{ left: pct(m.at) }} title={m.label} aria-hidden="true" />)}
        {now !== null && now !== undefined ? (
          <div className={styles.now} style={{ left: pct(now) }} data-off={now > max ? 'above' : now < min ? 'below' : undefined}><span>{nowLabel ?? `Now ${format(now)}`}</span></div>
        ) : null}
        {handle('low')}
        {handle('high')}
      </div>
      <div className={styles.ends} aria-hidden="true"><span className="mono">{format(min)}</span><span className="mono">{format(max)}</span></div>
    </div>
  )
}
