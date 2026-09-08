/**
 * A generated emblem for an agent, so a row/profile isn't a wall of text.
 *
 * Deterministic: the winged mark on a tile whose hue and corner ticks are
 * seeded from the agent's id. Reference agents get their category's signal
 * colour; third parties get a neutral seeded hue. No image files, no network.
 */

const CATEGORY_HUE: Record<string, number> = {
  rebalancing: 28, // brass
  grid: 205, // slate blue
  yield: 150, // green
  health_factor: 8, // ember
  security: 268, // violet
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function AgentAvatar({
  id,
  category,
  size = 40,
  reference = false,
}: {
  id: string
  category?: string | null
  size?: number
  reference?: boolean
}) {
  const h = hash(id)
  const hue = reference && category && CATEGORY_HUE[category] !== undefined
    ? CATEGORY_HUE[category]
    : 30 + (h % 300)
  const sat = reference ? 42 : 14
  const bg = `hsl(${hue} ${sat}% 16%)`
  const edge = `hsl(${hue} ${sat}% 34%)`
  const mark = `hsl(${hue} ${Math.min(sat + 18, 60)}% 72%)`

  // three corner ticks, present/absent from the hash — a quiet fingerprint
  const ticks = [h & 1, (h >> 3) & 1, (h >> 6) & 1, (h >> 9) & 1]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{ flex: 'none', borderRadius: 8, display: 'block' }}
    >
      <rect x="0.5" y="0.5" width="39" height="39" rx="8" fill={bg} stroke={edge} strokeWidth="1" />
      {ticks[0] ? <rect x="5" y="5" width="5" height="1.6" fill={edge} /> : null}
      {ticks[1] ? <rect x="30" y="5" width="5" height="1.6" fill={edge} /> : null}
      {ticks[2] ? <rect x="5" y="33.4" width="5" height="1.6" fill={edge} /> : null}
      {ticks[3] ? <rect x="30" y="33.4" width="5" height="1.6" fill={edge} /> : null}
      <g transform="translate(8 12) scale(0.24)" fill={mark}>
        <path d="M50 21C43 13 27 5 17 2.5C9 1 0 3 0 8.5L0 63L1 67.5C15 54 33 32 50 21Z" />
        <path d="M50 21C57 13 73 5 83 2.5C91 1 100 3 100 8.5L100 63L99 67.5C85 54 67 32 50 21Z" />
      </g>
    </svg>
  )
}
