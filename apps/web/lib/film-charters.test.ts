import { describe, expect, it } from 'vitest'
import { chapterAt, LAUNCH_FILM, chaptersVtt } from './film'
import { CHARTERS_CHAPTERS, CHARTERS_FILM, chartersFilmJsonLd } from './film-charters'

describe('independent films', () => {
  it('covers all 66 seconds with continuous chapters and the right seek boundary', () => {
    expect(CHARTERS_CHAPTERS[0]!.start).toBe(0)
    CHARTERS_CHAPTERS.forEach((c, i) => { if (i) expect(c.start).toBe(CHARTERS_CHAPTERS[i - 1]!.end) })
    expect(CHARTERS_CHAPTERS.at(-1)!.end).toBe(66)
    expect(chapterAt(40, CHARTERS_CHAPTERS).id).toBe('key')
    expect(chapterAt(40).id).toBe('automate')
    expect(chaptersVtt(CHARTERS_CHAPTERS)).toContain('00:00:58.000 --> 00:01:06.000')
  })
  it('keeps simulated counts distinct from the linked live record', () => {
    for (const c of CHARTERS_CHAPTERS) expect(c.evidence.provenance).toBe(c.id === 'four' ? 'ONCHAIN' : 'ILLUSTRATIVE')
    expect(CHARTERS_CHAPTERS.find(c => c.id === 'four')!.evidence.href).toBe('/charters#kinds-h')
    expect(CHARTERS_FILM.cta(Date.now()).href).toBe('/charters/new?kind=loan')
    expect(LAUNCH_FILM.cta(Date.parse('2026-11-10')).href).toBe('/register')
  })
  it('gives sharing and deep links the correct film and duration', () => {
    const ld = chartersFilmJsonLd('https://marque.trade')
    expect(ld.duration).toBe('PT1M6S')
    expect(ld.contentUrl).toContain('draw-the-line.')
    expect(ld.hasPart.every(c => c.url.includes('film=charters'))).toBe(true)
    expect(JSON.stringify(CHARTERS_CHAPTERS)).not.toMatch(/[\u2013\u2014]/)
  })
})
