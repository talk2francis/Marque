'use client'
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { clampRule, fmtHealth, TARGET_MAX, TRIGGER_MAX, TRIGGER_MIN, GAP_MIN } from '../../../lib/charters-builder'
import styles from './HealthRule.module.css'

/**
 * HealthRule: Marque's MeasureRule with two handles (03_EXPERIENCE section 4). The rule runs from 1.00, where
 * Venus liquidates, to max(3.00, target + 0.50). Oxide below the trigger, a brass band for the lift, the Now
 * needle in ink. Trigger and target are sliders a keyboard can fully drive; the factory's bounds are theirs.
 * Values are whole hundredths (130 = 1.30).
 */
type Handle = 'trigger' | 'target'

export function HealthRule({
  now, trigger, target, onChange, variant = 'edit', label = 'Loan health rule from 1.00',
}: {
  /** Venus health now; null when unknown or when there is no debt. */
  now: number | null
  trigger: number
  target: number
  onChange?: (next: { trigger: number; target: number }) => void
  variant?: 'edit' | 'read' | 'mini'
  label?: string
}) {
  const track = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ which: Handle; top: number } | null>(null)
  // The scale holds still while a handle moves, so the handle stays under the pointer.
  const top = drag?.top ?? Math.max(300, target + 50)
  const pct = (v: number) => `${Math.max(0, Math.min(1, (v - 100) / (top - 100))) * 100}%`
  const editable = variant === 'edit' && Boolean(onChange)

  const set = useCallback((which: Handle, value: number) => {
    if (!onChange) return
    if (which === 'trigger') onChange(clampRule(value, Math.max(target, value + GAP_MIN)))
    else onChange(clampRule(trigger, value))
  }, [onChange, trigger, target])

  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return null
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return Math.round(100 + f * (top - 100))
  }
  const down = (which: Handle) => (e: PointerEvent<HTMLDivElement>) => {
    if (!editable) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    setDrag({ which, top })
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const v = fromPointer(e.clientX)
    if (v !== null) set(drag.which, v)
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }
  const key = (which: Handle) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (!editable) return
    const v = which === 'trigger' ? trigger : target
    const min = which === 'trigger' ? TRIGGER_MIN : trigger + GAP_MIN
    const max = which === 'trigger' ? TRIGGER_MAX : TARGET_MAX
    const step = e.shiftKey ? 10 : 1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = v + step
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = v - step
    else if (e.key === 'PageUp') next = v + 10
    else if (e.key === 'PageDown') next = v - 10
    else if (e.key === 'Home') next = min
    else if (e.key === 'End') next = max
    if (next === null) return
    e.preventDefault()
    set(which, Math.max(min, Math.min(max, next)))
  }

  const ticks = [100, 150, 200, 250, 300].filter((t) => t <= top)
  const nowPos = now === null ? null : Math.round(now * 100)
  const nowText = now === null ? null : now > 100 ? 'over 100' : now.toFixed(2)
  const handle = (which: Handle) => {
    const v = which === 'trigger' ? trigger : target
    return (
      <div
        className={styles.handle}
        data-which={which}
        data-dragging={drag?.which === which ? 'true' : undefined}
        style={{ left: pct(v) }}
        role={variant === 'mini' ? undefined : 'slider'}
        tabIndex={editable ? 0 : undefined}
        aria-label={which === 'trigger' ? 'Trigger: the guard acts below this health' : 'Target: the guard repays back up to this health'}
        aria-valuemin={which === 'trigger' ? TRIGGER_MIN / 100 : (trigger + GAP_MIN) / 100}
        aria-valuemax={(which === 'trigger' ? TRIGGER_MAX : TARGET_MAX) / 100}
        aria-valuenow={v / 100}
        aria-valuetext={which === 'trigger' ? `Acts below ${fmtHealth(v)}` : `Lifts back to ${fmtHealth(v)}`}
        aria-readonly={editable ? undefined : true}
        onPointerDown={down(which)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key(which)}
      >
        {variant === 'mini' ? null : (
          <span className={styles.handleLabel}>
            <span className="mono">{fmtHealth(v)}</span>
            <small>{which}</small>
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={styles.rule} data-variant={variant} data-close={(target - trigger) / (top - 100) < 0.14 ? 'true' : undefined} role="group" aria-label={label}>
      <div className={styles.track} ref={track}>
        <div className={styles.danger} style={{ width: pct(trigger) }} />
        <div className={styles.lift} style={{ left: pct(trigger), width: `calc(${pct(target)} - ${pct(trigger)})` }} />
        {variant === 'mini' ? null : <div className={styles.liq} />}
        {nowPos !== null ? (
          <div className={styles.now} style={{ left: pct(nowPos) }} data-off={nowPos > top ? 'above' : nowPos < 100 ? 'below' : undefined}>
            {variant === 'mini' ? null : <span>Now {nowText}</span>}
          </div>
        ) : null}
        {handle('trigger')}
        {handle('target')}
      </div>
      {variant === 'mini' ? null : (
        <div className={styles.ticks} aria-hidden="true">
          {ticks.map((t) => (t === 100
            ? <span key={t} className={styles.liqTick} style={{ left: 0 }}><span className="mono">1.00</span><span className={styles.liqWord}> liquidation</span></span>
            : <span key={t} className="mono" style={{ left: pct(t) }}>{(t / 100).toFixed(1)}</span>))}
        </div>
      )}
    </div>
  )
}
