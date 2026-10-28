'use client'
import { useState } from 'react'
import { FacetAvatar } from './FacetAvatar'
import { addressAccent, addressSeed, type WalletProfile } from '../../../lib/profile-model'

/**
 * A wallet's portrait wherever it appears: the image its owner chose (an upload, or one of their agents), or its own
 * facet stone. An image that fails to load falls back to the stone, never to a broken tile.
 */
export function ProfileAvatar({ address, profile, size = 40, label }: { address: string; profile: WalletProfile | null; size?: number; label?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const url = profile?.avatarUrl ?? null
  const seed = profile?.avatar.kind === 'facet' ? profile.avatar.seed : addressSeed(address)
  const accent = profile?.accent ?? addressAccent(address)
  if (url && failed !== url) {
    return (
      <span className="profile-avatar" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(url)} />
      </span>
    )
  }
  return <FacetAvatar address={address} seed={seed} accent={accent} size={size} label={label} />
}
