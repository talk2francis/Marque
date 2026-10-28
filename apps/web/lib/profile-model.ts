import { z } from 'zod'

/**
 * A wallet's profile on Marque (28 Oct): what the owner chose to show, and how they like the site to behave.
 *
 * Opt-in and owner-signed. An address with no saved profile still has a portrait (its own facet, drawn from the
 * address) and renders exactly as before. Nothing here comes from chain or changes any figure, rank or result.
 */

/** The accents a facet portrait can be cut in. Names, not hex: the colours live in FacetAvatar. */
export const ACCENTS = ['champagne', 'graphite', 'porcelain', 'moss', 'oxide', 'tide'] as const
export type Accent = (typeof ACCENTS)[number]

export const avatarSchema = z.discriminatedUnion('kind', [
  /** The address's own facet, re-cut with another seed. */
  z.object({ kind: z.literal('facet'), seed: z.number().int().min(0).max(9999) }),
  /** An image the owner uploaded (raster only, checked server side). */
  z.object({ kind: z.literal('upload'), image: z.string().regex(/^[0-9a-f]{32}$/) }),
  /** The portrait of an agent this address owns. */
  z.object({ kind: z.literal('agent'), agentId: z.string().regex(/^(56|97):0x[0-9a-fA-F]{40}:\d{1,78}$/) }),
])
export type AvatarChoice = z.infer<typeof avatarSchema>

export const prefsSchema = z.object({
  theme: z.enum(['day', 'night', 'system']).default('night'),
  /** Calm stops the motion that runs on its own (the Facet field drift, looping animations) on every device. */
  motion: z.enum(['full', 'calm']).default('full'),
  /** The faceted lattice behind the pages. */
  ambient: z.boolean().default(true),
  /** Which networks the marketplace opens on: both side by side, mainnet only, or testnet (practice) only. */
  lane: z.enum(['all', 'mainnet', 'practice']).default('all'),
})
export type Prefs = z.infer<typeof prefsSchema>
export const DEFAULT_PREFS: Prefs = { theme: 'night', motion: 'full', ambient: true, lane: 'all' }

/** Plain text only: no links, no markup, no control characters. */
const plain = (max: number) => z.string().trim().max(max)
  .refine((s) => !/[<>]/.test(s) && ![...s].some((c) => { const n = c.charCodeAt(0); return (n < 32 && n !== 9 && n !== 10 && n !== 13) || n === 127 }), 'Use plain text, without angle brackets.')
  .refine((s) => !/(https?:\/\/|www\.)/i.test(s), 'Links are not shown on profiles.')

export const profileInput = z.object({
  displayName: plain(40).nullable(),
  bio: plain(160).nullable(),
  avatar: avatarSchema,
  accent: z.enum(ACCENTS).nullable(),
  prefs: prefsSchema,
  public: z.boolean(),
})
export type ProfileInput = z.infer<typeof profileInput>

/** What the API returns. `saved` is false for an address that never made a profile (the defaults are shown). */
export interface WalletProfile {
  address: string
  saved: boolean
  displayName: string | null
  bio: string | null
  avatar: AvatarChoice
  /** The image the avatar resolves to, when it is an upload or an agent portrait; null draws the facet. */
  avatarUrl: string | null
  accent: Accent
  public: boolean
  /** Only to the owner, with a signed session. */
  prefs: Prefs | null
  updatedAt: string | null
}

/** A stable seed from the address, so every wallet has its own facet before it saves anything. */
export function addressSeed(address: string): number {
  let h = 2166136261
  for (const c of address.toLowerCase()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h % 10000
}

/** A stable accent from the address, for the default facet. */
export function addressAccent(address: string): Accent {
  return ACCENTS[addressSeed(address) % ACCENTS.length]!
}

export function defaultProfile(address: string): WalletProfile {
  return {
    address: address.toLowerCase(), saved: false, displayName: null, bio: null,
    avatar: { kind: 'facet', seed: addressSeed(address) }, avatarUrl: null, accent: addressAccent(address),
    public: true, prefs: null, updatedAt: null,
  }
}

export const imageUrlOf = (id: string) => `/img/p/${id}`
