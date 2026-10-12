'use client'

import type { CSSProperties } from 'react'
import { registryImageUrl } from '../../lib/avatar-source'
import { AgentAvatar } from './AgentAvatar'
import styles from './AgentIdentityHero.module.css'

/** The owner image is sharp at identity size, with a low-detail ambient echo. */
export function AgentIdentityHero({ agentId, tokenId, name, category, imageUrl, children }: {
  agentId: string
  tokenId: string
  name: string
  category: string | null
  imageUrl: string | null
  children: React.ReactNode
}) {
  const image = registryImageUrl(imageUrl)
  const art = image ? { '--identity-art': `url("${image}")` } as CSSProperties : undefined

  return (
    <header className={styles.masthead} data-has-art={image ? 'true' : 'false'} style={art}>
      <div className={styles.stage} aria-hidden="true">
        {image ? <span className={styles.ambient} /> : null}
        <span className={styles.stageRule} />
      </div>
      <div className={styles.topline}><span>Agent profile</span><span>BSC mainnet · 56</span></div>
      <div className={styles.identity}>
        <span className={styles.portrait}><AgentAvatar id={agentId} name={name} category={category} imageUrl={image} size={104} priority /></span>
        <div className={styles.copy}>
          {children}
        </div>
      </div>
      <div className={styles.footline}>
        <span>ERC-8004 identity <strong>#{tokenId}</strong></span>
        <span>{image ? 'Image from the agent registry · owner-supplied' : 'No registry image · Marque fallback'}</span>
      </div>
    </header>
  )
}
