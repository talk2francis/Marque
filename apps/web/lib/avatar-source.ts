import { agentBrand } from './agent-brand'

export type AvatarSource =
  | { kind: 'brand'; src: string; srcSet: string }
  | { kind: 'registry'; src: string; srcSet?: undefined }
  | { kind: 'emblem'; src?: undefined; srcSet?: undefined }

/**
 * Which image an agent avatar shows (27 Sep identity pass).
 *
 * 1. A Marque reference agent: its local operative portrait, sized for the slot
 *    (160 px for anything up to 80 CSS px, 512 px above), even when the registry
 *    carries another image. The branded art is first-party only.
 * 2. Anyone else: the registry image, unchanged.
 * 3. Neither: the generated emblem.
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
  if (imageUrl) return { kind: 'registry', src: imageUrl }
  return { kind: 'emblem' }
}
