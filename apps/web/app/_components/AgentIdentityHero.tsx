'use client'

import { registryImageUrl } from '../../lib/avatar-source'
import { AgentAvatar } from './AgentAvatar'
import styles from './AgentIdentityHero.module.css'

/** Third-party identity stays compact: registry artwork is an avatar, not a banner. */
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
