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

function Fallback({ size }: { size: number }) {
  return <span className="agent-avatar" data-kind="platform-fallback" title="No agent image supplied; Marque platform mark" aria-label="No agent image supplied; Marque platform mark" style={{ flex: 'none', display: 'grid', placeItems: 'center', width: size, height: size, borderRadius: avatarRadius(size), border: '1px solid var(--hair-2)', background: 'var(--panel)', color: 'var(--ink-2)' }}><MarqueMark size={Math.round(size * .54)} variant="simple" /></span>
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
  const src = avatarSource({ id, reference, imageUrl, size })
  const radius = avatarRadius(size)

  if (src.kind === 'registry') {
    return (
      <span className="agent-avatar" data-kind="registry" aria-hidden="true" style={{ position: 'relative', flex: 'none', display: 'block', width: size, height: size, borderRadius: radius, overflow: 'hidden' }}>
        <Fallback size={size} />
        <span style={{ position: 'absolute', inset: 0, borderRadius: radius, backgroundImage: `url("${src.src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
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
  return <Fallback size={size} />
}

/** 8 px at 40, 10 px at 48 to 64, 14 px from 88: soft enough to breathe, never a circle. */
export function avatarRadius(size: number): number {
  return size >= 88 ? 14 : size >= 72 ? 12 : size >= 48 ? 10 : 8
}
