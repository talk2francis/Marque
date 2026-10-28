/**
 * Faceted light (28 Oct): the ground behind Marque's pages. A large, irregular low-poly surface with no outlines;
 * every facet is shaded only by how it meets one soft light that turns slowly around the page, the way light moves
 * across cut stone. Contrast stays within a few percent, so it reads as the texture of the page, not a drawing on it.
 *
 * Pure drawing code (no React), so the component and a preview share it.
 */
export interface FacetSurface { cols: number; rows: number; pts: Float32Array; seeds: Float32Array; tris: Uint16Array }

const CELL = 230

function rand(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** A jittered grid split into triangles along alternating diagonals, so no two neighbouring cells repeat. */
export function buildSurface(w: number, h: number, seed = 8004): FacetSurface {
  const r = rand(seed)
  const cols = Math.ceil(w / CELL) + 3, rows = Math.ceil(h / (CELL * 0.86)) + 3
  const pts = new Float32Array(cols * rows * 3)
  const seeds = new Float32Array(cols * rows * 2)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x
    pts[i * 3] = (x - 1) * CELL + (y % 2 ? CELL / 2 : 0) + (r() - 0.5) * CELL * 0.62
    pts[i * 3 + 1] = (y - 1) * CELL * 0.86 + (r() - 0.5) * CELL * 0.52
    pts[i * 3 + 2] = (r() - 0.5) * 2 // height, -1..1
    seeds[i * 2] = r() * Math.PI * 2 // phase
    seeds[i * 2 + 1] = 70 + r() * 60 // period, seconds
  }
  const tris: number[] = []
  for (let y = 0; y < rows - 1; y++) for (let x = 0; x < cols - 1; x++) {
    const a = y * cols + x, b = a + 1, c = a + cols, d = c + 1
    if ((x + y) % 2) tris.push(a, b, d, a, d, c); else tris.push(a, b, c, b, d, c)
  }
  return { cols, rows, pts, seeds, tris: new Uint16Array(tris) }
}

/**
 * Draws one frame. `t` in seconds; `ink` is the page's ink colour as an rgb triple; `strength` scales the contrast
 * (1 is the page default). Facets facing the light lift by up to `strength` × 2.6 % ink-over-ground, facets facing
 * away deepen by as much, and a few near the light catch a trace of champagne.
 */
export function drawSurface(ctx: CanvasRenderingContext2D, s: FacetSurface, t: number, o: { ink: [number, number, number]; glint: [number, number, number]; strength: number; day: boolean }) {
  const { pts, seeds, tris } = s
  // The light turns once every four minutes, low over the surface so the facets differ.
  const la = (t / 240) * Math.PI * 2
  const lx = Math.cos(la) * 0.62, ly = Math.sin(la) * 0.62, lz = 0.48
  const amp = 46 // height in px at full swing
  const n = pts.length / 3
  const z = new Float32Array(n)
  for (let i = 0; i < n; i++) z[i] = (pts[i * 3 + 2]! + Math.sin((t / seeds[i * 2 + 1]!) * Math.PI * 2 + seeds[i * 2]!) * 0.35) * amp
  const base = o.day ? 0.026 : 0.022
  for (let k = 0; k < tris.length; k += 3) {
    const a = tris[k]!, b = tris[k + 1]!, c = tris[k + 2]!
    const ax = pts[a * 3]!, ay = pts[a * 3 + 1]!, bx = pts[b * 3]!, by = pts[b * 3 + 1]!, cx = pts[c * 3]!, cy = pts[c * 3 + 1]!
    const ux = bx - ax, uy = by - ay, uz = z[b]! - z[a]!
    const vx = cx - ax, vy = cy - ay, vz = z[c]! - z[a]!
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz }
    const len = Math.hypot(nx, ny, nz) || 1
    const lit = (nx * lx + ny * ly + nz * lz) / len // about 0.3..1
    const shade = (lit - 0.62) * 2.4 // about -0.8..0.9
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath()
    if (shade > 0) {
      // Lit facets lighten the ground on night and darken it a hair less on day: either way, a lift.
      ctx.fillStyle = o.day ? `rgba(255,255,255,${(shade * base * 1.6 * o.strength).toFixed(4)})` : `rgba(${o.ink.join(',')},${(shade * base * o.strength).toFixed(4)})`
    } else {
      ctx.fillStyle = o.day ? `rgba(${o.ink.join(',')},${(-shade * base * o.strength).toFixed(4)})` : `rgba(0,0,0,${(-shade * base * 2.2 * o.strength).toFixed(4)})`
    }
    ctx.fill()
    if (shade > 0.78) { ctx.fillStyle = `rgba(${o.glint.join(',')},${((shade - 0.78) * 0.16 * o.strength).toFixed(4)})`; ctx.fill() }
  }
}
