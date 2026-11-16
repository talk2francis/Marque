'use client'
import { LOCKUP_PATHS, LOCKUP_SPRITE_ID, LOCKUP_TRANSFORM, Wordmark as WordmarkOutline } from './Wordmark'

/** The lucide star outline, drawn once here and referenced by every rating star (ui/Stars.tsx). */
export const STAR_SPRITE_ID = 'mq-star'
const STAR_D = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'

/**
 * Shared vector outlines, drawn once per page at the start of <body> so a reference never waits for them (16 Nov
 * 2026). A client component, so the outlines are in the HTML once and not again in the page's RSC payload.
 * Takes no space and is hidden from assistive technology.
 */
export function BrandSprite() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        <g id={LOCKUP_SPRITE_ID} transform={LOCKUP_TRANSFORM}>{LOCKUP_PATHS.map((d, i) => <path key={i} d={d} />)}</g>
        <path id={STAR_SPRITE_ID} d={STAR_D} />
      </defs>
    </svg>
  )
}

/** The giant footer wordmark, unchanged, rendered from the client so its 8 KB outline is not also in the RSC payload. */
export function Wordmark(props: { height?: number; className?: string; title?: string }) {
  return <WordmarkOutline {...props} />
}

/** A rating star with exactly the attributes lucide's <Star fill="currentColor" strokeWidth={0} /> renders. */
export function StarGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={0} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star" aria-hidden="true">
      <use href={`#${STAR_SPRITE_ID}`} />
    </svg>
  )
}
