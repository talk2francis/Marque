'use client'

import { useState } from 'react'
import { avatarSource } from '../../lib/avatar-source'
import { MarqueMark } from './MarqueMark'

/**
 * An agent's avatar.
 *
 * Precedence (lib/avatar-source.ts): a Marque reference agent shows its own
 * operative portrait, served locally at card size, never its registry image.
 * Anyone else shows the registry-supplied image when there is one (CLAIMED).
 * Absent/broken images show the Marque mark as a platform fallback.
 *
 * A rounded square, never a circle: 8 to 10 px at card size, up to 16 px large.
 */

/* The former fallback varied its colour by agent id. Keep that distinction while
 * using the Marque mark, so the tile cannot be mistaken for owner artwork. */
const FALLBACK_HUES = [34, 155, 198, 10, 82, 175] as const

function fallbackHue(id: string): number {
  let hash = 2166136261
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return FALLBACK_HUES[(hash >>> 0) % FALLBACK_HUES.length] ?? 34
}

function Fallback({ id, size, reference }: { id: string; size: number; reference: boolean }) {
  const hue = fallbackHue(id)
  return <span className="agent-avatar" data-kind="platform-fallback" role="img" title="No agent image supplied; Marque platform mark" aria-label="No agent image supplied; Marque platform mark" style={{ flex: 'none', display: 'grid', placeItems: 'center', width: size, height: size, borderRadius: avatarRadius(size), border: reference ? '1px solid var(--hair-2)' : `1px solid hsl(${hue} 31% 40%)`, background: reference ? 'var(--panel)' : `hsl(${hue} 30% 20%)`, color: reference ? 'var(--ink-2)' : `hsl(${hue} 42% 80%)` }}><MarqueMark size={Math.round(size * .54)} variant="simple" /></span>
}

export function AgentAvatar({
  id,
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
    // The platform mark holds the tile only until the owner's image has loaded, then leaves: an image with a
    // transparent background (an SVG logo the registry serves as WebP) sits on a plain tile, never on the mark.
    const loaded = loadedSrc === src.src
    return (
      <span className="agent-avatar" data-kind="registry" aria-hidden="true" style={{ position: 'relative', flex: 'none', display: 'block', width: size, height: size, borderRadius: radius, overflow: 'hidden', background: 'var(--panel-2, var(--panel))' }}>
        {loaded ? null : <Fallback id={id} size={size} reference={reference} />}
        <img
          src={src.src} alt="" width={size} height={size} loading={priority ? 'eager' : 'lazy'} decoding="async"
          // An image already complete before hydration fires no load event: count it on mount.
          ref={(el) => { if (el?.complete && el.naturalWidth > 0 && loadedSrc !== src.src) setLoadedSrc(src.src) }}
          onLoad={() => setLoadedSrc(src.src)} onError={() => setFailedSrc(src.src)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0 }}
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
  return <Fallback id={id} size={size} reference={reference} />
}

/** 8 px at 40, 10 px at 48 to 64, 14 px from 88: soft enough to breathe, never a circle. */
export function avatarRadius(size: number): number {
  return size >= 88 ? 14 : size >= 72 ? 12 : size >= 48 ? 10 : 8
}
