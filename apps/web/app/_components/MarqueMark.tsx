/**
 * The Marque symbol — two winged strokes that meet at a single razor pinch,
 * reading as an M. This is a faithful trace of the finalised brand art in
 * /brand-assets (the outline was sampled straight off the master PNG, not
 * eyeballed): rounded outer-top shoulders, a straight outer edge, sharp lower
 * points, and concave inner sweeps that cross at the centre.
 *
 * Two forms:
 *  - full:   the mark as drawn — navbar seal, footer, app icons, OG card,
 *            the loading screen.
 *  - simple: the two wings eased ~2u apart so the centre pinch does not sinter
 *            into a blob below ~24px.
 *
 * `fill="currentColor"` throughout, so one component serves daylight, night and
 * the cockpit with no second asset. viewBox is 100 wide × 69 tall (the art's
 * real aspect); callers give a width and height follows.
 */

type Props = {
  size?: number
  variant?: 'full' | 'simple'
  title?: string
  className?: string
  /** Marks the paths so the loading screen can unfold each wing from the pinch. */
  winged?: boolean
}

const ASPECT = 0.69

// Traced from apps/web/public/brand/mark-ink.png (bbox-normalised to 100×69).
const FULL_L = 'M50 21C43 13 27 5 17 2.5C9 1 0 3 0 8.5L0 63L1 67.5C15 54 33 32 50 21Z'
const FULL_R = 'M50 21C57 13 73 5 83 2.5C91 1 100 3 100 8.5L100 63L99 67.5C85 54 67 32 50 21Z'

// Same wings, nudged apart, inner tip blunted a touch for small sizes.
const SIMPLE_L = 'M46 22C39 14 25 6 15 3.5C7 2 -2 4 -2 9.5L-2 63L-1 67.5C13 54 30 32 46 22Z'
const SIMPLE_R = 'M54 22C61 14 75 6 85 3.5C93 2 102 4 102 9.5L102 63L101 67.5C87 54 70 32 54 22Z'

export function MarqueMark({ size = 20, variant = 'full', title, className, winged }: Props) {
  const [l, r] = variant === 'simple' ? [SIMPLE_L, SIMPLE_R] : [FULL_L, FULL_R]
  return (
    <svg
      width={size}
      height={Math.round(size * ASPECT)}
      viewBox="0 0 100 69"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="currentColor"
    >
      {title ? <title>{title}</title> : null}
      <path d={l} data-wing={winged ? 'l' : undefined} />
      <path d={r} data-wing={winged ? 'r' : undefined} />
    </svg>
  )
}
