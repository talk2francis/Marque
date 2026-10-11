'use client'

import { useState } from 'react'
import { avatarSource, identityInitials } from '../../lib/avatar-source'

/**
 * An agent's avatar.
 *
 * Precedence (lib/avatar-source.ts): a Marque reference agent shows its own
 * operative portrait, served locally at card size, never its registry image.
 * Anyone else shows the registry-supplied image when there is one (CLAIMED:
 * whatever the operator uploaded). Either falls back on error or absence to a
 * neutral identity tile: initials derived from the published name, with a hue
 * seeded from the agent id. It is not presented as owner-supplied artwork.
 *
 * A rounded square, never a circle: 8 to 10 px at card size, up to 16 px large.
 */

const CATEGORY_HUE: Record<string, number> = {
  rebalancing: 28, // brass
  grid: 205, // slate blue
  yield: 150, // green
  health_factor: 8, // ember
  security: 268, // violet
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function Emblem({ id, name, category, size, reference }: { id: string; name?: string | null; category?: string | null; size: number; reference: boolean }) {
  const h = hash(id)
  const hue = reference && category && CATEGORY_HUE[category] !== undefined
    ? CATEGORY_HUE[category]
    : 30 + (h % 300)
  const sat = reference ? 42 : 28
  const bg = `hsl(${hue} ${sat}% 16%)`
  const edge = `hsl(${hue} ${sat}% 34%)`
  const mark = `hsl(${hue} ${Math.min(sat + 18, 60)}% 72%)`
  const initials = identityInitials(name)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      data-kind="identity-placeholder"
      style={{ flex: 'none', borderRadius: 8, display: 'block' }}
    >
      <rect x="0.5" y="0.5" width="39" height="39" rx="8" fill={bg} stroke={edge} strokeWidth="1" />
      <path d="M6 8V6h5M29 6h5v2M6 32v2h5M29 34h5v-2" fill="none" stroke={edge} strokeWidth="1" />
      <text x="20" y="21" textAnchor="middle" dominantBaseline="middle" fill={mark} fontFamily="var(--font-ui), sans-serif" fontSize={initials.length > 1 ? 15 : 18} fontWeight="600" letterSpacing="-0.5">{initials}</text>
    </svg>
  )
}

export function AgentAvatar({
  id,
  name,
  category,
  size = 40,
  reference = false,
  imageUrl = null,
  priority = false,
}: {
  id: string
  name?: string | null
  category?: string | null
  size?: number
  reference?: boolean
  /** Registry-supplied image. Ignored for a reference agent; falls back to the emblem on error. */
  imageUrl?: string | null
  /** Above the fold on its page (the storefront head): fetch eagerly. */
  priority?: boolean
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const src = avatarSource({ id, reference, imageUrl, size })
  const radius = avatarRadius(size)

  if (src.kind === 'registry' && failedSrc !== src.src) {
    return (
      <span className="agent-avatar" data-kind="registry" aria-hidden="true" style={{ position: 'relative', flex: 'none', display: 'block', width: size, height: size, borderRadius: radius, overflow: 'hidden' }}>
        <Emblem id={id} name={name} category={category} size={size} reference={reference} />
        <img
          src={src.src}
          alt=""
          width={size}
          height={size}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoadedSrc(src.src)}
          onError={() => setFailedSrc(src.src)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: loadedSrc === src.src ? 1 : 0 }}
        />
      </span>
    )
  }
  if (src.kind === 'brand' && failedSrc !== src.src) {
    return (
      <img
        src={src.src}
        srcSet={src.srcSet}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailedSrc(src.src)}
        className="agent-avatar"
        data-kind={src.kind}
        style={{ flex: 'none', width: size, height: size, borderRadius: radius, objectFit: 'cover', display: 'block', background: 'var(--ground-sunk)' }}
      />
    )
  }
  return <Emblem id={id} name={name} category={category} size={size} reference={reference} />
}

/** 8 px at 40, 10 px at 48 to 64, 14 px from 88: soft enough to breathe, never a circle. */
export function avatarRadius(size: number): number {
  return size >= 88 ? 14 : size >= 72 ? 12 : size >= 48 ? 10 : 8
}
