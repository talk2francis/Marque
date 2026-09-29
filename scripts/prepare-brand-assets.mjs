/**
 * Web derivatives of the brand masters (27 Sep identity pass). Deterministic,
 * idempotent, never touches a master.
 *
 *   node scripts/prepare-brand-assets.mjs
 *
 * Reference agents (brand-assets/agents-brand/avatars_and_hero_banners):
 *   public/brand/agents/<slug>/avatar.webp      512 px square, profile and panel
 *   public/brand/agents/<slug>/avatar-160.webp  160 px, cards and lists (40 to 80 CSS px)
 *   public/brand/agents/<slug>/hero-{day,night}.webp      1800 px wide, the storefront masthead
 *   public/brand/agents/<slug>/hero-{day,night}-900.webp  900 px wide, phones
 *   Day = the ivory masters ("<Name>-Agent- Hero-banner.png"), Night = the purpose-built
 *   nocturnal masters ("<Name>-Agent-Nighttime-Hero-banner.png", 29 Sep). The page picks
 *   one by the resolved <html data-theme>; see AgentBrandHero.
 * World plates (brand-assets/*-theme.png, 16:9, 29 Sep), mapped by what they show:
 *   public/brand/world/home-{day,night}.webp            the Marque Monument
 *   public/brand/world/marketplace-{day,night}.webp     the Registry Field (monoliths)
 *   public/brand/world/quest-{day,night}.webp           the Proof Causeway (five markers)
 *   each also at -1100.webp. The masters' names swap the last two ("Quest-*" shows the
 *   monolith field, "Marketplace-*" the causeway); the mapping below follows the pictures.
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
  const heroes = {
    day: join(SRC, `${cap(slug)}-Agent- Hero-banner.png`),
    night: join(SRC, `${cap(slug)}-Agent-Nighttime-Hero-banner.png`),
  }
  await emit(avatar, join(dir, 'avatar.webp'), { width: 512, height: 512, fit: 'cover' }, 84)
  await emit(avatar, join(dir, 'avatar-160.webp'), { width: 160, height: 160, fit: 'cover' }, 82)
  for (const [t, src] of Object.entries(heroes)) {
    await emit(src, join(dir, `hero-${t}.webp`), { width: 1800, withoutEnlargement: true }, 82)
    await emit(src, join(dir, `hero-${t}-900.webp`), { width: 900 }, 80)
  }
}

const WORLDS = { home: 'Homepage', marketplace: 'Quest', quest: 'Marketplace' }
mkdirSync(join(OUT, 'world'), { recursive: true })
for (const [route, master] of Object.entries(WORLDS)) {
  for (const [t, file] of [['day', 'light'], ['night', 'dark']]) {
    const src = join(ROOT, `brand-assets/${master}-${file}-theme.png`)
    await emit(src, join(OUT, 'world', `${route}-${t}.webp`), { width: 1672, withoutEnlargement: true }, 84)
    await emit(src, join(OUT, 'world', `${route}-${t}-1100.webp`), { width: 1100 }, 82)
  }
}
