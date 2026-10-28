import { describe, expect, it } from 'vitest'
import { addressAccent, addressSeed, defaultProfile, profileInput } from './profile-model'

const base = { displayName: 'Ada', bio: 'I hire yield agents.', avatar: { kind: 'facet' as const, seed: 12 }, accent: 'champagne' as const, prefs: { theme: 'night' as const, motion: 'full' as const, ambient: true, lane: 'all' as const }, public: true }

describe('profileInput', () => {
  it('accepts a plain profile', () => { expect(profileInput.safeParse(base).success).toBe(true) })
  it('refuses markup, links and overlong text', () => {
    expect(profileInput.safeParse({ ...base, displayName: '<b>Ada</b>' }).success).toBe(false)
    expect(profileInput.safeParse({ ...base, bio: 'see https://example.com' }).success).toBe(false)
    expect(profileInput.safeParse({ ...base, bio: 'www.example.com' }).success).toBe(false)
    expect(profileInput.safeParse({ ...base, displayName: 'x'.repeat(41) }).success).toBe(false)
    expect(profileInput.safeParse({ ...base, bio: 'x'.repeat(161) }).success).toBe(false)
  })
  it('only takes an uploaded image by its hash, and an agent by its full id', () => {
    expect(profileInput.safeParse({ ...base, avatar: { kind: 'upload', image: '../../etc/passwd' } }).success).toBe(false)
    expect(profileInput.safeParse({ ...base, avatar: { kind: 'upload', image: 'a'.repeat(32) } }).success).toBe(true)
    expect(profileInput.safeParse({ ...base, avatar: { kind: 'agent', agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341556' } }).success).toBe(true)
    expect(profileInput.safeParse({ ...base, avatar: { kind: 'agent', agentId: '1:0xabc:1' } }).success).toBe(false)
  })
})

describe('defaults', () => {
  it('gives every address its own stable stone before anything is saved', () => {
    const a = '0x8122991297DC98Dc5c735fDE90a501528922aFdC'
    expect(addressSeed(a)).toBe(addressSeed(a.toLowerCase()))
    expect(defaultProfile(a)).toMatchObject({ saved: false, avatar: { kind: 'facet', seed: addressSeed(a) }, accent: addressAccent(a), avatarUrl: null, prefs: null })
  })
})
