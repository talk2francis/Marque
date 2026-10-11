'use client'

import { useState } from 'react'
import { registryImageUrl } from '../../lib/avatar-source'
import { AgentAvatar } from './AgentAvatar'
import styles from './AgentIdentityHero.module.css'

/**
 * A third-party identity masthead. The image is the operator's ERC-8004
 * metadata, not Marque artwork or a claim of verification. Low-resolution art
 * is atmospheric only; the avatar remains the sharp identity cue.
 */
export function AgentIdentityHero({ agentId, tokenId, name, category, imageUrl, children }: {
  agentId: string
  tokenId: string
  name: string
  category: string | null
  imageUrl: string | null
  children: React.ReactNode
}) {
  const [failed, setFailed] = useState(false)
  const image = registryImageUrl(imageUrl)
  const hasArt = Boolean(image && !failed)

  return (
    <header className={styles.masthead}>
      <div className={styles.stage} data-art={hasArt || undefined}>
        {hasArt ? <img className={styles.atmosphere} src={image!} alt="" aria-hidden="true" loading="eager" decoding="async" onError={() => setFailed(true)} /> : null}
        <span className={styles.stageLabel}>ERC-8004 identity · BNB Smart Chain</span>
        <span className={styles.stageNumber} aria-hidden="true">#{tokenId}</span>
      </div>
      <div className={styles.identity}>
        <span className={styles.portrait}>
          <AgentAvatar id={agentId} name={name} category={category} imageUrl={image} size={88} priority />
        </span>
        <div className={styles.copy}>
          {children}
          <p className={styles.source}>{hasArt ? 'Image supplied in the agent registry · owner claim' : image ? 'Registry image unavailable · neutral identity tile' : 'No image supplied in the agent registry · neutral identity tile'}</p>
        </div>
      </div>
    </header>
  )
}
