'use client'
import { CHARTERS_FILM } from '../../../lib/film-charters'
import { FilmPlayer } from './FilmPlayer'

// Keep cut/CTA selectors inside the client boundary, as with the launch film.
export function ChartersFilmPlayer({ archive }: { archive: boolean }) {
  return <FilmPlayer film={CHARTERS_FILM} compact={!archive} priority={!archive} />
}
