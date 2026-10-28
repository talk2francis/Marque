import type { Accent } from '../../../lib/profile-model'

/**
 * A wallet's own portrait: a cut stone seen from above, drawn from the address and a seed (28 Oct).
 *
 * The cut (six to eight sides, the table's size, the turn) and the play of light across the facets come from the
 * seed, so every address has its own stone and an owner can re-cut it. The same family as the Facet field behind
 * the pages. A circle for people; agents keep their rounded squares, so a wallet is never mistaken for an agent.
 */
const PALETTE: Record<Accent, { h: number; s: number; lo: number; hi: number; bg: string; ring: string }> = {
  champagne: { h: 40, s: 46, lo: 34, hi: 88, bg: 'hsl(32 20% 13%)', ring: 'hsl(40 40% 62% / .45)' },
  graphite: { h: 220, s: 7, lo: 22, hi: 84, bg: 'hsl(220 8% 11%)', ring: 'hsl(220 8% 62% / .4)' },
  porcelain: { h: 36, s: 20, lo: 62, hi: 97, bg: 'hsl(30 10% 16%)', ring: 'hsl(36 24% 80% / .45)' },
  moss: { h: 152, s: 24, lo: 24, hi: 76, bg: 'hsl(152 16% 10%)', ring: 'hsl(152 22% 56% / .4)' },
  oxide: { h: 14, s: 44, lo: 28, hi: 76, bg: 'hsl(14 22% 11%)', ring: 'hsl(14 40% 60% / .4)' },
  tide: { h: 196, s: 32, lo: 26, hi: 80, bg: 'hsl(200 22% 11%)', ring: 'hsl(196 30% 62% / .4)' },
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashAddress(address: string): number {
  let h = 2166136261
  for (const c of address.toLowerCase()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h
}

type P = [number, number]
const pts = (ps: P[]) => ps.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

export function cutStone(address: string, seed: number) {
  const r = rng(hashAddress(address) ^ Math.imul(seed + 1, 2654435761))
  const n = 6 + Math.floor(r() * 3)
  const turn = r() * Math.PI * 2
  const R = 23 + r() * 2.5
  const table = R * (0.4 + r() * 0.16)
  const C = 32
  const outer: P[] = []
  const inner: P[] = []
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2
    const b = a + Math.PI / n
    outer.push([C + Math.cos(a) * R, C + Math.sin(a) * R])
    inner.push([C + Math.cos(b) * table, C + Math.sin(b) * table])
  }
  // Light from the upper left; each facet's brightness follows the angle of its centre, with a little play.
  const light = -Math.PI * 0.75
  const shade = (ps: P[], lift: number) => {
    const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length - C
    const cy = ps.reduce((s, p) => s + p[1], 0) / ps.length - C
    const facing = Math.cos(Math.atan2(cy, cx) - light)
    return Math.min(1, Math.max(0, 0.5 + 0.42 * facing + lift + (r() - 0.5) * 0.18))
  }
  const facets: Array<{ points: string; t: number }> = []
  for (let i = 0; i < n; i++) {
    const o1 = outer[i]!, o2 = outer[(i + 1) % n]!, i1 = inner[i]!, i0 = inner[(i - 1 + n) % n]!
    facets.push({ points: pts([o1, o2, i1]), t: shade([o1, o2, i1], -0.06) })
    facets.push({ points: pts([i0, o1, i1]), t: shade([i0, o1, i1], 0.08) })
  }
  return { n, outer: pts(outer), table: pts(inner), facets, tableT: 0.62 + r() * 0.2 }
}

export function FacetAvatar({ address, seed, accent, size = 40, label }: { address: string; seed: number; accent: Accent; size?: number; label?: string }) {
  // Ids from the stone's own inputs: two roots drawing the same stone share identical gradients, never wrong ones.
  const id = `fa${accent}${hashAddress(address).toString(36)}s${seed}`
  const p = PALETTE[accent]
  const stone = cutStone(address, seed)
  const tone = (t: number) => `hsl(${p.h} ${p.s}% ${(p.lo + (p.hi - p.lo) * t).toFixed(1)}%)`
  return (
    <svg className="facet-avatar" width={size} height={size} viewBox="0 0 64 64" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <radialGradient id={`g${id}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor={`hsl(${p.h} ${Math.max(6, p.s - 18)}% 22%)`} />
          <stop offset="1" stopColor={p.bg} />
        </radialGradient>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={tone(Math.min(1, stone.tableT + 0.18))} />
          <stop offset="1" stopColor={tone(stone.tableT - 0.12)} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#g${id})`} />
      {stone.facets.map((f, i) => <polygon key={i} points={f.points} fill={tone(f.t)} />)}
      <polygon points={stone.table} fill={`url(#t${id})`} />
      <g fill="none" stroke={`hsl(${p.h} ${p.s}% 92% / .28)`} strokeWidth="0.45" strokeLinejoin="round">
        {stone.facets.map((f, i) => <polygon key={i} points={f.points} />)}
        <polygon points={stone.table} />
      </g>
      <polygon points={stone.outer} fill="none" stroke={`hsl(${p.h} ${p.s}% 94% / .5)`} strokeWidth="0.7" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="31.4" fill="none" stroke={p.ring} strokeWidth="1.2" />
    </svg>
  )
}
