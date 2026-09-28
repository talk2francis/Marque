/**
 * Web derivatives of the brand masters (27 Sep identity pass). Deterministic,
 * idempotent, never touches a master.
 *
 *   node scripts/prepare-brand-assets.mjs
 *
 * Reference agents (brand-assets/agents-brand/avatars_and_hero_banners):
 *   public/brand/agents/<slug>/avatar.webp      512 px square, profile and panel
 *   public/brand/agents/<slug>/avatar-160.webp  160 px, cards and lists (40 to 80 CSS px)
 *   public/brand/agents/<slug>/hero.webp        1800 px wide, the storefront masthead
 *   public/brand/agents/<slug>/hero-900.webp    900 px wide, phones
 * Home plate (brand-assets/web-plates, the two hero concepts with the lockup
 * and captions painted out):
 *   public/brand/plate-{night,day}.webp and plate-{night,day}-1100.webp
 */
import sharp from 'sharp'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'brand-assets/agents-brand/avatars_and_hero_banners')
const OUT = join(ROOT, 'apps/web/public/brand')
const AGENTS = ['keel', 'lattice', 'bound', 'sluicegate', 'tidemark', 'redcell']
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`

async function emit(src, out, resize, quality) {
  await sharp(src).resize(resize).webp({ quality, effort: 6, smartSubsample: true }).toFile(out)
  console.log(`${out.replace(ROOT, '')}  ${kb(out)}`)
}

for (const slug of AGENTS) {
  const dir = join(OUT, 'agents', slug)
  mkdirSync(dir, { recursive: true })
  const avatar = join(SRC, `${cap(slug)}-Agent.png`)
  const hero = join(SRC, `${cap(slug)}-Agent- Hero-banner.png`)
  await emit(avatar, join(dir, 'avatar.webp'), { width: 512, height: 512, fit: 'cover' }, 84)
  await emit(avatar, join(dir, 'avatar-160.webp'), { width: 160, height: 160, fit: 'cover' }, 82)
  await emit(hero, join(dir, 'hero.webp'), { width: 1800, withoutEnlargement: true }, 80)
  await emit(hero, join(dir, 'hero-900.webp'), { width: 900 }, 78)
}

for (const t of ['night', 'day']) {
  const src = join(ROOT, `brand-assets/web-plates/marque-arch-${t}.png`)
  await emit(src, join(OUT, `plate-${t}.webp`), { width: 1920, withoutEnlargement: true }, 78)
  await emit(src, join(OUT, `plate-${t}-1100.webp`), { width: 1100 }, 76)
}
