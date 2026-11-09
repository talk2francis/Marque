import { describe, expect, it } from 'vitest'
import { journeyOf, standingOf, testName, when, type JourneyAgent } from './builder-journey'

const base = (over: Partial<JourneyAgent> = {}): JourneyAgent => ({
  chainId: 97, agentId: '2682', listedOnMarque: true,
  quality: { checks: [
    { id: 'identity', pass: true }, { id: 'proved', pass: true },
    { id: 'callable', pass: false, reason: 'message/send returned HTTP 503' },
    { id: 'classified', pass: true }, { id: 'tested', pass: false },
  ] },
  seller: { services: [{ kind: 'a2a', declaredNow: true, quote: { state: 'NOT_HIREABLE', nextStep: 'Restore the endpoint.' } }], jobs: { received: 0, paid: 0 } },
  ...over,
})

describe('the builder journey', () => {
  it('puts the one next step on the first thing not done, with the technical reason kept for Why', () => {
    const s = journeyOf(base(), '0xowner')
    expect(s.map((x) => x.state)).toEqual(['done', 'next', 'todo', 'todo', 'done', 'todo'])
    const next = s.find((x) => x.state === 'next')!
    expect(next.id).toBe('answers')
    expect(next.action).toEqual({ kind: 'bench', label: 'Test it now' })
    expect(next.why).toContain('503')
    expect(standingOf(s)).toEqual({ word: 'Needs a fix', tone: 'work' })
  })

  it('asks for an address when nothing is declared, and links to the agent workspace', () => {
    const s = journeyOf(base({ seller: { services: [], jobs: { received: 0, paid: 0 } } }), '0xowner')
    const next = s.find((x) => x.state === 'next')!
    expect(next.action).toMatchObject({ kind: 'link', label: 'Add its address' })
    expect((next.action as { href: string }).href).toContain('wallet=0xowner&agent=97:2682')
  })

  it('reads a live price from the quote sample and calls a hired agent hired', () => {
    const checks = base().quality.checks.map((c) => ({ ...c, pass: true }))
    const s = journeyOf(base({ quality: { checks }, seller: { services: [{ kind: 'a2a', declaredNow: true, quote: { state: 'CURRENT_PROBE_SAMPLE' } }], jobs: { received: 2, paid: 1 } } }), '0x1')
    expect(s.every((x) => x.state === 'done')).toBe(true)
    expect(standingOf(s).word).toBe('Hired')
  })

  it('says Ready for buyers when only the first hire is left', () => {
    const checks = base().quality.checks.map((c) => ({ ...c, pass: true }))
    const s = journeyOf(base({ quality: { checks }, seller: { services: [{ kind: 'a2a', declaredNow: true, quote: { state: 'CURRENT_PROBE_SAMPLE' } }], jobs: { received: 0, paid: 0 } } }), '0x1')
    expect(s.find((x) => x.state === 'next')!.action).toMatchObject({ kind: 'share' })
    expect(standingOf(s)).toEqual({ word: 'Ready for buyers', tone: 'good' })
  })

  it('names tests and times for people', () => {
    expect(testName('MCS-GRID-1')).toBe('Grid trading test')
    expect(testName('X')).toBe('X')
    expect(when('2026-11-03T08:35:10Z')).toBe('3 Nov, 08:35')
    expect(when('2026-11-03 08:35')).toBe('3 Nov, 08:35')
    expect(when(null)).toBe('time not recorded')
  })
})
