/**
 * The ground's grain tiles (29 Sep atmosphere pass). Deterministic: a seeded PRNG, so a
 * rerun writes identical bytes. 160 px tiles of single-pixel specks with a low alpha;
 * light specks for Night, dark for Day. They sit in the body background (painted once,
 * scrolled with the page), never in a fixed blended overlay (27 Sep performance note).
 *
 *   node scripts/make-grain.mjs
 */
import sharp from 'sharp'
import { join } from 'node:path'

const OUT = join(new URL('..', import.meta.url).pathname, 'apps/web/public/brand')
const N = 160
let seed = 0x9e3779b9
const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 10000) / 10000 }

for (const [name, v] of [['grain-night', 255], ['grain-day', 20]]) {
  const px = Buffer.alloc(N * N * 2)
  for (let i = 0; i < N * N; i++) {
    const r = rand()
    // About a quarter of the pixels carry a speck, at one of four barely-there strengths:
    // felt as material and as the end of gradient banding, never seen as noise.
    const a = r < 0.74 ? 0 : (v > 128 ? [3, 4, 6, 8] : [3, 5, 6, 8])[Math.floor(rand() * 4)]
    px[i * 2] = v
    px[i * 2 + 1] = a
  }
  await sharp(px, { raw: { width: N, height: N, channels: 2 } }).png({ compressionLevel: 9, palette: false }).toFile(join(OUT, `${name}.png`))
  console.log(name)
}
