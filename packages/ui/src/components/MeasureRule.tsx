import type { CSSProperties } from 'react'

/**
 * MeasureRule — the signature component.
 *
 * A 3px rule showing where a value sits inside its safe band, with the
 * threshold marked. One component, four categories: LP price range, health
 * factor, net APR comparison, grid band.
 *
 * This is the thing that makes "equal depth across four categories" *visible*
 * rather than asserted, and it is why Marque is not a card grid. Do not add a
 * second competing device (AGENTS.md, Design system).
 *
 * The band is drawn in the direction the numbers run, so `lower` may be greater
 * than `upper` — a health factor is safest at the top, an LP position is
 * healthiest in the middle. `state` colours the marker and nothing else:
 * signal colours are for state only, never decoration.
 */

export type MeasureState = 'holds' | 'watch' | 'breach' | 'neutral'

export interface MeasureRuleProps {
  /** Where the value sits. */
  value: number
  /** Band start and end, in the same unit as `value`. */
  lower: number
  upper: number
  /**
   * Optional threshold marked on the rule — a liquidation point, a stop, the
   * APR you are currently earning. Rendered as a hairline, not a second marker.
   */
  threshold?: number
  /** Labels for the two ends. Rendered as data, in mono. */
  lowerLabel?: string
  upperLabel?: string
  /** What the marker is pointing at, shown beside the rule. */
  valueLabel?: string
  thresholdLabel?: string
  state?: MeasureState
  /** Accessible description. Required — this component IS the data. */
  label: string
  /** Suppress the entrance fill, e.g. inside a dense table. */
  animate?: boolean
  /**
   * Position in a group of rules that arrive together. Each unit adds a 30ms
   * delay to the entrance fill, so a stack of rules settles in sequence rather
   * than all at once (P10.5H item 2). Ignored when `animate` is false or motion
   * is reduced.
   */
  index?: number
  className?: string
}

const STATE_COLOR: Record<MeasureState, string> = {
  holds: 'var(--holds-mark)',
  watch: 'var(--watch-mark)',
  breach: 'var(--breach-mark)',
  neutral: 'var(--ink-soft)',
}

/** Position as a 0..1 fraction of the band, clamped so a marker never escapes. */
function fraction(value: number, lower: number, upper: number): number {
  if (upper === lower) return 0.5
  const raw = (value - lower) / (upper - lower)
  return Math.max(0, Math.min(1, raw))
}

export function MeasureRule({
  value, lower, upper, threshold,
  lowerLabel, upperLabel, valueLabel, thresholdLabel,
  state = 'neutral', label, animate = true, index = 0, className,
}: MeasureRuleProps) {
  const pos = fraction(value, lower, upper)
  const thresholdPos = threshold === undefined ? null : fraction(threshold, lower, upper)
  // Out-of-band values are the interesting case: an LP position below its
  // range, an HF under its liquidation point. The marker pins to the edge and
  // the caret says which way it went.
  const below = value < Math.min(lower, upper)
  const above = value > Math.max(lower, upper)

  const style = {
    '--measure-pos': `${pos * 100}%`,
    '--measure-color': STATE_COLOR[state],
    '--measure-i': Math.max(0, index),
  } as CSSProperties

  return (
    <div
      className={['measure', animate ? 'measure--animate' : '', className].filter(Boolean).join(' ')}
      style={style}
      role="img"
      aria-label={label}
    >
      <div className="measure__track">
        <div className="measure__rule" />
        {thresholdPos !== null && (
          <div
            className="measure__threshold"
            style={{ left: `${thresholdPos * 100}%` }}
            aria-hidden="true"
          />
        )}
        <div className="measure__marker" aria-hidden="true">
          {below ? '‹' : above ? '›' : ''}
        </div>
      </div>
      {(lowerLabel || upperLabel || valueLabel || thresholdLabel) && (
        <div className="measure__labels">
          <span className="measure__bound mono">{lowerLabel}</span>
          <span className="measure__readout">
            {valueLabel && <span className="mono measure__value">{valueLabel}</span>}
            {thresholdLabel && <span className="measure__thresholdLabel">{thresholdLabel}</span>}
          </span>
          <span className="measure__bound mono">{upperLabel}</span>
        </div>
      )}
    </div>
  )
}
