import { describe, expect, it } from 'vitest'
import { avatarSource, identityInitials, registryImageUrl } from './avatar-source'

describe('avatarSource', () => {
  it('a reference agent shows its portrait, never its registry image', () => {
    const s = avatarSource({ id: 'marque:keel', reference: true, imageUrl: 'https://example.com/keel.png', size: 40 })
    expect(s).toMatchObject({ kind: 'brand', src: '/brand/agents/keel/avatar-160.webp' })
  })

  it('picks the large portrait above 80 px', () => {
    expect(avatarSource({ id: '56:341555', reference: true, imageUrl: null, size: 104 }).src).toBe('/brand/agents/sluicegate/avatar.webp')
  })

  it('a third party keeps its registry image', () => {
    expect(avatarSource({ id: '56:304493', reference: false, imageUrl: 'https://api.8004scan.io/a.png', size: 40 })).toEqual({ kind: 'registry', src: 'https://api.8004scan.io/a.png' })
  })

  it('a third party that claims a reference token still gets no Marque art', () => {
    expect(avatarSource({ id: '56:341556', reference: false, imageUrl: null, size: 40 }).kind).toBe('emblem')
  })

  it('falls back to the emblem with no image', () => {
    expect(avatarSource({ id: '56:1', reference: false, imageUrl: null, size: 40 }).kind).toBe('emblem')
  })

  it('does not render arbitrary owner-controlled URLs as an image', () => {
    expect(registryImageUrl('http://api.8004scan.io/a')).toBeNull()
    expect(registryImageUrl('https://api.8004scan.io.evil.test/a')).toBeNull()
    expect(registryImageUrl('https://example.com/a.png')).toBeNull()
  })

  it('derives a neutral identity tile from the published name', () => {
    expect(identityInitials('Health Factor Monitor')).toBe('HM')
    expect(identityInitials('Tidemark')).toBe('TI')
    expect(identityInitials('')).toBe('ID')
  })
})
