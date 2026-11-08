import { describe, expect, it } from 'vitest'
import { chartersPublic, chartersVisible, guardPageVisible, previewCookieValid, previewCookieValue, previewTokenMatches } from './charters-access'

const TOKEN = 'a-preview-token-long-enough-to-count'
const env = (over: Record<string, string | undefined> = {}) => ({ CHARTERS_PUBLIC: '0', CHARTERS_PREVIEW_TOKEN: TOKEN, ...over })

describe('charters access', () => {
  it('is public only when CHARTERS_PUBLIC is exactly 1', () => {
    expect(chartersPublic(env())).toBe(false)
    expect(chartersPublic(env({ CHARTERS_PUBLIC: 'true' }))).toBe(false)
    expect(chartersPublic(env({ CHARTERS_PUBLIC: '1' }))).toBe(true)
    expect(chartersPublic({})).toBe(false)
  })
  it('accepts the configured token and nothing else', () => {
    expect(previewTokenMatches(TOKEN, env())).toBe(true)
    expect(previewTokenMatches(TOKEN + 'x', env())).toBe(false)
    expect(previewTokenMatches('', env())).toBe(false)
    expect(previewTokenMatches(null, env())).toBe(false)
  })
  it('refuses every token when none, or a short one, is configured', () => {
    expect(previewTokenMatches(TOKEN, env({ CHARTERS_PREVIEW_TOKEN: undefined }))).toBe(false)
    expect(previewTokenMatches('short', env({ CHARTERS_PREVIEW_TOKEN: 'short' }))).toBe(false)
  })
  it('stores a digest in the cookie, never the token, and validates it', () => {
    const v = previewCookieValue(TOKEN)
    expect(v).toMatch(/^[0-9a-f]{64}$/)
    expect(v).not.toContain(TOKEN)
    expect(previewCookieValid(v, env())).toBe(true)
    expect(previewCookieValid(previewCookieValue('another-token-of-enough-length'), env())).toBe(false)
    expect(previewCookieValid(TOKEN, env())).toBe(false)
    expect(previewCookieValid(v, env({ CHARTERS_PREVIEW_TOKEN: undefined }))).toBe(false)
  })
  it('shows discovery surfaces publicly or with the preview cookie', () => {
    expect(chartersVisible(undefined, env())).toBe(false)
    expect(chartersVisible(previewCookieValue(TOKEN), env())).toBe(true)
    expect(chartersVisible(undefined, env({ CHARTERS_PUBLIC: '1' }))).toBe(true)
  })
  it('keeps an outside owner\'s guard page reachable so they can always end it', () => {
    const team = ['0xAAAA000000000000000000000000000000000001']
    expect(guardPageVisible(undefined, '0xaaaa000000000000000000000000000000000001', team, env())).toBe(false)
    expect(guardPageVisible(undefined, '0xbbbb000000000000000000000000000000000002', team, env())).toBe(true)
    expect(guardPageVisible(undefined, null, team, env())).toBe(false)
    expect(guardPageVisible(previewCookieValue(TOKEN), '0xaaaa000000000000000000000000000000000001', team, env())).toBe(true)
  })
})
