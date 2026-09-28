import { describe, expect, it } from 'vitest'
import { avatarSource } from './avatar-source'

describe('avatarSource', () => {
  it('a reference agent shows its portrait, never its registry image', () => {
    const s = avatarSource({ id: 'marque:keel', reference: true, imageUrl: 'https://example.com/keel.png', size: 40 })
    expect(s).toMatchObject({ kind: 'brand', src: '/brand/agents/keel/avatar-160.webp' })
  })

  it('picks the large portrait above 80 px', () => {
    expect(avatarSource({ id: '56:341555', reference: true, imageUrl: null, size: 104 }).src).toBe('/brand/agents/sluicegate/avatar.webp')
  })

  it('a third party keeps its registry image', () => {
    expect(avatarSource({ id: '56:304493', reference: false, imageUrl: 'https://x.test/a.png', size: 40 })).toEqual({ kind: 'registry', src: 'https://x.test/a.png' })
  })

  it('a third party that claims a reference token still gets no Marque art', () => {
    expect(avatarSource({ id: '56:341556', reference: false, imageUrl: null, size: 40 }).kind).toBe('emblem')
  })

  it('falls back to the emblem with no image', () => {
    expect(avatarSource({ id: '56:1', reference: false, imageUrl: null, size: 40 }).kind).toBe('emblem')
  })
})
