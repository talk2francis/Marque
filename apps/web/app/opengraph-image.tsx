import { ImageResponse } from 'next/og'
import { BRAND } from '@marque/ui/brand'

/**
 * The site's share card (P10.5A item 5, rebrand P10.5H). Every link posted
 * during judging currently renders as a bare URL; this is the 1200x630 that
 * fixes that.
 *
 * The Marque mark on the dark ground, one line of positioning, one brass rule.
 * No web font is fetched. Satori requires an explicit `display` on any element
 * with more than one child, so every div here sets it.
 */

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${BRAND.name} — ${BRAND.tagline}`

const INK = '#15160F'
const PAPER = '#EDEDE7'
const SOFT = '#9A9C8C'
const BRASS = '#C79A4B'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: INK,
          color: PAPER,
          padding: '88px 96px',
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <svg width="76" height="76" viewBox="0 0 100 100" fill={PAPER}>
            <path d="M50 43C46 36 39 30 32 30 27 30 25 33 25 39.5L25 58C25 63 24.5 68 28.5 67.5L50 43Z" />
            <path d="M50 43C54 36 61 30 68 30 73 30 75 33 75 39.5L75 58C75 63 75.5 68 71.5 67.5L50 43Z" />
          </svg>
          <div style={{ display: 'flex', fontSize: 60, letterSpacing: '-0.01em' }}>{BRAND.name}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', height: 3, width: 220, background: BRASS, marginBottom: 26 }} />
          <div style={{ display: 'flex', fontSize: 46, lineHeight: 1.25, maxWidth: 960, marginBottom: 22 }}>
            {BRAND.tagline}
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: SOFT, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
            {`${BRAND.domain}  —  a marketplace on ${BRAND.chain}`}
          </div>
        </div>

        <div style={{ display: 'flex', height: 1, background: '#2C2D24' }} />
      </div>
    ),
    size,
  )
}
