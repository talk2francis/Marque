import { describe, expect, it } from 'vitest'
import { CHAPTERS, FILM, chapterAt, chaptersVtt, filmAfter, filmCta, filmJsonLd, filmVariant } from './film'
import { FILM_MEDIA } from './film-media'

const at = (iso: string) => Date.parse(iso)

describe('the film shows a true countdown', () => {
  it('plays the cut whose day count matches the Campaign Dock (whole days left, switching at 12:00 UTC)', () => {
    expect(filmVariant(at('2026-10-27T11:59:00Z'))).toBe('d9')
    expect(filmVariant(at('2026-10-27T12:00:01Z'))).toBe('d8')
    expect(filmVariant(at('2026-10-27T18:30:00Z'))).toBe('d8')
    expect(filmVariant(at('2026-10-28T12:00:01Z'))).toBe('d7')
    expect(filmVariant(at('2026-11-03T13:00:00Z'))).toBe('d1')
    expect(filmVariant(at('2026-11-04T11:59:59Z'))).toBe('d1')
  })
  it('plays the final-24-hours cut on the last day', () => {
    expect(filmVariant(at('2026-11-04T12:00:01Z'))).toBe('d0')
    expect(filmVariant(at('2026-11-05T11:59:59Z'))).toBe('d0')
  })
  it('plays the cut made for after the close from 12:00 UTC on 5 Nov, for good', () => {
    expect(filmVariant(at('2026-11-05T12:00:00Z'))).toBe('after')
    expect(filmVariant(at('2027-03-01T00:00:00Z'))).toBe('after')
    expect(filmAfter(at('2026-11-05T12:00:00Z'))).toBe(true)
    expect(filmAfter(at('2026-11-05T11:59:59Z'))).toBe(false)
  })
  it('points the end card at the right page for the cut playing', () => {
    expect(filmCta(at('2026-11-05T11:59:59Z')).href).toBe('/quest')
    expect(filmCta(at('2026-11-05T12:00:00Z'))).toMatchObject({ href: '/register', label: 'Find an agent' })
    const c = filmCta(at('2026-11-06T00:00:00Z'))
    expect(c.left + c.width).toBeLessThanOrEqual(100)
    expect(c.top + c.height).toBeLessThanOrEqual(100)
  })
  it('keeps the launch film as posted, and describes the cut that plays', () => {
    expect(FILM_MEDIA.variants.d9.h264.file).toMatch(/^on-the-record-d9\./)
    expect(FILM_MEDIA.variants.after.h264.file).toMatch(/^on-the-record-after\./)
    expect(filmJsonLd('https://marque.trade').contentUrl).toContain(FILM_MEDIA.variants.after.h264.file)
  })
  it('has a cut for every key it can choose', () => {
    for (let ms = at('2026-10-26T00:00:00Z'); ms < at('2026-11-20T00:00:00Z'); ms += 3_600_000) {
      const v = FILM_MEDIA.variants[filmVariant(ms)]
      expect(v.h264.file).toMatch(/\.h264\.mp4$/)
      expect(v.av1.file).toMatch(/\.av1\.mp4$/)
    }
  })
})

describe('chapters', () => {
  it('cover the film end to end, in order, without gaps', () => {
    expect(CHAPTERS[0]!.start).toBe(0)
    expect(CHAPTERS[CHAPTERS.length - 1]!.end).toBe(FILM.duration)
    CHAPTERS.forEach((c, i) => { if (i) expect(c.start).toBe(CHAPTERS[i - 1]!.end) })
  })
  it('find the chapter playing at a time', () => {
    expect(chapterAt(0).id).toBe('question')
    expect(chapterAt(17.5).id).toBe('pay')
    expect(chapterAt(59.9).id).toBe('record')
    expect(chapterAt(60).id).toBe('record')
  })
  it('label what is illustrative and link what is real', () => {
    expect(CHAPTERS.find((c) => c.id === 'build')!.evidence.provenance).toBe('ILLUSTRATIVE')
    for (const id of ['ask', 'choose', 'pay', 'deliver', 'check']) expect(CHAPTERS.find((c) => c.id === id)!.evidence.href).toBe('/jobs/56/56903')
  })
  it('serve as WebVTT', () => {
    const vtt = chaptersVtt()
    expect(vtt.startsWith('WEBVTT\n')).toBe(true)
    expect(vtt).toContain('00:00:16.000 --> 00:00:20.000\nPay')
  })
  it('carry the figures read at the close, word for word as the film shows them', () => {
    const r = FILM.after.record
    const text = CHAPTERS.flatMap((c) => c.lines).join(' ')
    for (const s of [r.registered.toLocaleString('en-US'), r.answering.toLocaleString('en-US'), `Checked against the chain: ${r.checked}`,
      `${r.outsideMainnet} outside hires`, `${r.checksAgreed} of ${r.checksDecided} chain checks agree`]) expect(text).toContain(s)
    expect(r.outsideAlsoOperator).toBeLessThanOrEqual(r.outsideMainnet)
    expect(r.checksAgreed).toBeLessThanOrEqual(r.checksDecided)
  })
  it('never use em or en dashes', () => {
    const text = JSON.stringify(CHAPTERS)
    expect(text).not.toMatch(/[\u2013\u2014]/)
  })
})
