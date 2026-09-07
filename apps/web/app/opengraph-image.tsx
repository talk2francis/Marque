import { ImageResponse } from 'next/og'
import { BRAND } from '@marque/ui/brand'

/**
 * The site's share card (P10.5A item 5). Every link posted during judging
 * currently renders as a bare URL; this is the 1200x630 that fixes that.
 *
 * The typographic wordmark on --paper, one line of positioning, one rule.
 * No web font is fetched. Satori requires an explicit `display` on any element
 * with more than one child, so every div here sets it.
 */

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${BRAND.name} — ${BRAND.tagline}`

const PAPER = '#EDEDE7'
const INK = '#15160F'
const SOFT = '#5C5E52'
const RULE = '#D4D4CB'
const BRASS = '#846621'

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
          background: PAPER,
          color: INK,
          padding: '90px 96px',
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', border: `3px solid ${INK}`, padding: '8px 26px 16px', fontSize: 64, letterSpacing: '-0.01em' }}>
            {BRAND.name}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', height: 3, width: 220, background: BRASS, marginBottom: 24 }} />
          <div style={{ display: 'flex', fontSize: 46, lineHeight: 1.25, maxWidth: 940, marginBottom: 22 }}>
            {BRAND.tagline}
          </div>
          <div style={{ display: 'flex', fontSize: 25, color: SOFT, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
            {`${BRAND.domain}  —  a marketplace on ${BRAND.chain}`}
          </div>
        </div>

        <div style={{ display: 'flex', height: 1, background: RULE }} />
      </div>
    ),
    size,
  )
}
