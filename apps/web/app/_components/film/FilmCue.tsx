'use client'
import { track } from '../../../lib/track'
import { clock } from '../../../lib/film'
import styles from './film.module.css'

/**
 * Starts the film from elsewhere on the page: the hero's "Watch the film" and the transcript's
 * times. The play call runs inside this click (so the film starts with sound), then the page
 * glides to the screen while the lights go down. Without the player (no script yet, or another
 * page), it is a plain link to the film.
 */
function cue(e: React.MouseEvent, from: number | undefined, source: 'hero' | 'transcript') {
  const host = document.querySelector('[data-film-ready]')
  if (!host || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  e.preventDefault()
  // On the home page the film is folded: open it first, inside this click, so it can start with sound.
  const fold = host.closest('details')
  if (fold && !fold.open) fold.open = true
  window.dispatchEvent(new CustomEvent('marque:film', { detail: { from, source } }))
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  host.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
  if (source === 'hero') track('film_cta', { to: 'film', from: 'hero' })
}

export function FilmCue({ href = '#film' }: { href?: string }) {
  return (
    <a className={styles.cue} href={href} onClick={(e) => cue(e, 0, 'hero')}>
      <span className={styles.cueDisc} aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>
      </span>
      Watch the film
      <span className={styles.cueTime} aria-label="1 minute">1:00</span>
    </a>
  )
}

export function FilmTime({ at }: { at: number }) {
  return (
    <a className={styles.tTime} href={`/film?t=${at}`} onClick={(e) => cue(e, at, 'transcript')} aria-label={`Play from ${clock(at)}`}>
      {clock(at)}
    </a>
  )
}
