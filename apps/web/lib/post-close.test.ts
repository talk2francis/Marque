import { describe, expect, it } from 'vitest'
import { CAMPAIGN } from '@marque/commerce/rules'
import { CLOSED_LINE, docsPrimary, footerActions, heroActions, isClosed, JUDGE_AFTER_CLOSE } from './post-close'

const close = Date.parse(CAMPAIGN.end)
const before = close - 1, after = close

describe('post-close gates', () => {
  it('closes exactly at 5 Nov 2026 12:00:00 UTC', () => {
    expect(new Date(close).toISOString()).toBe('2026-11-05T12:00:00.000Z')
    expect(isClosed(before)).toBe(false)
    expect(isClosed(after)).toBe(true)
  })
  it('keeps the campaign cut before the close', () => {
    expect(heroActions(before)).toEqual({ primary: { href: '/quest', label: 'Start the Set and Earn quest' }, secondary: { href: '/register', label: 'Browse agents' } })
    expect(footerActions(before).primary).toEqual({ href: '/quest', label: 'Start the quest' })
    expect(docsPrimary(before)).toEqual({ href: '/quest', label: 'Start the Set and Earn quest' })
  })
  it('leads to the marketplace after the close', () => {
    expect(heroActions(after)).toEqual({ primary: { href: '/register', label: 'Find an agent' }, secondary: { href: '/builders', label: 'List your agent' } })
    expect(footerActions(after)).toEqual(heroActions(after))
    expect(docsPrimary(after)).toEqual({ href: '/register', label: 'Find an agent' })
  })
  it('says the close in past tense, with no countdown', () => {
    expect(CLOSED_LINE).toMatch(/^Set and Earn closed Thu 5 Nov, 12:00 UTC\./)
    expect(CLOSED_LINE).not.toMatch(/left|closes|\d+d /i)
  })
  it('gives a reviewer only steps that exist, each without a wallet', () => {
    expect(JUDGE_AFTER_CLOSE.map((s) => s.href)).toEqual(['/film', '/proof?chain=56&funder=outside#jobs', '/jobs/56/56903', '/proof#record-at-close'])
  })
})
