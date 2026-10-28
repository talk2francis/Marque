import { agentBrand } from './agent-brand'

export type AvatarSource =
  | { kind: 'brand'; src: string; srcSet: string }
  | { kind: 'registry'; src: string; srcSet?: undefined }
  | { kind: 'fallback'; src?: undefined; srcSet?: undefined }

/** A portrait Marque hosts (an owner's upload, checked raster only): /img/p/<id>. */
const MARQUE_IMAGE = /^\/img\/p\/[0-9a-f]{32}$/

/** Only render images served by the registry indexer's image proxy, or a portrait Marque hosts. */
export function registryImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (MARQUE_IMAGE.test(value.trim())) return value.trim()
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'https:' && /^(www\.)?marque\.trade$/i.test(url.hostname) && MARQUE_IMAGE.test(url.pathname) && !url.search) return url.pathname
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (!/(^|\.)8004scan\.(io|app)$/i.test(url.hostname)) return null
    return url.href
  } catch {
    return null
  }
}

/**
 * Which image an agent avatar shows (27 Sep identity pass).
 *
 * 1. A Marque reference agent: its local operative portrait, sized for the slot
 *    (160 px for anything up to 80 CSS px, 512 px above), even when the registry
 *    carries another image. The branded art is first-party only.
 * 2. Anyone else: the registry image, unchanged.
 * 3. Neither: Marque's mark as a clearly labelled platform fallback, never
 *    misrepresented as an owner-supplied identity.
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
  return { kind: 'fallback' }
}
