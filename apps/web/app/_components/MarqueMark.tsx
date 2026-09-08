/**
 * The Marque symbol — two winged strokes meeting at a centre pinch, reading as
 * an M. Traced from the finalised brand art in /brand-assets.
 *
 * Two forms:
 *  - full:   the mark as drawn, for the navbar lockup, the footer, app icons
 *            and the OG card.
 *  - simple: the wings pulled apart around a wedge of ground so the form stays
 *            legible at 16/32px, where the full mark's pinch closes to a blob
 *            (P10.5H).
 *
 * `currentColor` throughout, so one component serves daylight and cockpit.
 */

type Props = {
  size?: number
  variant?: 'full' | 'simple'
  title?: string
  className?: string
}

const FULL_L = 'M50 43C46 36 39 30 32 30 27 30 25 33 25 39.5L25 58C25 63 24.5 68 28.5 67.5L50 43Z'
const FULL_R = 'M50 43C54 36 61 30 68 30 73 30 75 33 75 39.5L75 58C75 63 75.5 68 71.5 67.5L50 43Z'

const SIMPLE_L = 'M47 45C43 37 37 31 30 31 25 31 23 34 23 40L23 58C23 63 22.5 68 26.5 67.5L47 45Z'
const SIMPLE_R = 'M53 45C57 37 63 31 70 31 75 31 77 34 77 40L77 58C77 63 77.5 68 73.5 67.5L53 45Z'

export function MarqueMark({ size = 20, variant = 'full', title, className }: Props) {
  const [l, r] = variant === 'simple' ? [SIMPLE_L, SIMPLE_R] : [FULL_L, FULL_R]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="currentColor"
    >
      {title ? <title>{title}</title> : null}
      <path d={l} />
      <path d={r} />
    </svg>
  )
}
