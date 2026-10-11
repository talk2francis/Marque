import { agentBrand } from './agent-brand'

export type AvatarSource =
  | { kind: 'brand'; src: string; srcSet: string }
  | { kind: 'registry'; src: string; srcSet?: undefined }
  | { kind: 'emblem'; src?: undefined; srcSet?: undefined }

/** Only render images served by the registry indexer's image proxy. */
export function registryImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (!/(^|\.)8004scan\.(io|app)$/i.test(url.hostname)) return null
    return url.href
  } catch {
    return null
  }
}

/** Initials are derived from the published name, never passed off as owner artwork. */
export function identityInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).map((word) =>
    Array.from(word).filter((letter) => /[\p{L}\p{N}]/u.test(letter)),
  ).filter((word) => word.length > 0)
  if (words.length > 1) return ((words[0]?.[0] ?? '') + (words[words.length - 1]?.[0] ?? '')).toLocaleUpperCase()
  if (words.length === 1) return (words[0] ?? []).slice(0, 2).join('').toLocaleUpperCase()
  return 'ID'
}

/**
 * Which image an agent avatar shows (27 Sep identity pass).
 *
 * 1. A Marque reference agent: its local operative portrait, sized for the slot
 *    (160 px for anything up to 80 CSS px, 512 px above), even when the registry
 *    carries another image. The branded art is first-party only.
 * 2. Anyone else: the registry image, unchanged.
 * 3. Neither: a neutral name-derived identity tile, never Marque's logo.
 */
export function avatarSource({ id, reference, imageUrl, size }: { id: string; reference: boolean; imageUrl: string | null | undefined; size: number }): AvatarSource {
  const brand = reference ? agentBrand(id) : null
  if (brand) {
    const small = size <= 80
    return {
      kind: 'brand',
      src: small ? brand.avatarSmall : brand.avatar,
      srcSet: small ? `${brand.avatarSmall} 160w, ${brand.avatar} 512w` : `${brand.avatar} 512w`,
    }
  }
  const registry = registryImageUrl(imageUrl)
  if (registry) return { kind: 'registry', src: registry }
  return { kind: 'emblem' }
}
