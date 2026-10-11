'use client'

import { registryImageUrl } from '../../lib/avatar-source'
import { AgentAvatar } from './AgentAvatar'
import styles from './AgentIdentityHero.module.css'

/**
 * Registry art appears once, sharply, at a size the source can support.
 * A low-resolution avatar is never stretched into a fake hero image.
 */
export function AgentIdentityHero({ agentId, tokenId, name, category, imageUrl, children }: {
  agentId: string
  tokenId: string
  name: string
  category: string | null
  imageUrl: string | null
  children: React.ReactNode
}) {
  const image = registryImageUrl(imageUrl)

  return (
    <header className={styles.masthead}>
      <div className={styles.topline}>
        <span>Agent profile</span>
        <span>BSC mainnet · 56</span>
      </div>
      <div className={styles.identity}>
        <div className={styles.copy}>
          {children}
        </div>
        <span className={styles.portrait}><AgentAvatar id={agentId} name={name} category={category} imageUrl={image} size={104} priority /></span>
      </div>
      <div className={styles.footline}>
        <span>ERC-8004 identity <strong>#{tokenId}</strong></span>
        <span>{image ? 'Image from the agent registry · owner-supplied' : 'No registry image · Marque fallback'}</span>
      </div>
    </header>
  )
}
