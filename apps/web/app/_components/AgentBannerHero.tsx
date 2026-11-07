import type { CSSProperties, ReactNode } from 'react'
import { AgentAvatar } from './AgentAvatar'
import { AgentIdentityHero } from './AgentIdentityHero'
import { hostedBannerUrl } from '../../lib/agent-banner-model'
import styles from './AgentBrandHero.module.css'

/** The reference masthead's layout for explicitly uploaded owner art, without a reference badge. */
export function AgentBannerHero({ agentId, tokenId, name, category, imageUrl, bannerUrl, children }: { agentId: string; tokenId: string; name: string; category: string | null; imageUrl: string | null; bannerUrl: string; children: ReactNode }) {
  const source = hostedBannerUrl(bannerUrl)
  if (!source) return <AgentIdentityHero agentId={agentId} tokenId={tokenId} name={name} category={category} imageUrl={imageUrl}>{children}</AgentIdentityHero>
  const image = `url("${source}")`
  const art = { '--hero-day': image, '--hero-day-small': image, '--hero-night': image, '--hero-night-small': image, '--hero-position': '50% 50%' } as CSSProperties
  return <header className={styles.masthead} data-agent-brand-hero data-agent-owner-banner>
    <div className={styles.stage} style={art} aria-hidden="true"><span className={styles.echo} /><span className={styles.art} /></div>
    <div className={styles.id}><div className={styles.portrait}><span className={styles.frame}><AgentAvatar id={agentId} name={name} category={category} imageUrl={imageUrl} reference={false} size={104} priority /></span></div><div className={styles.txt}>{children}</div></div>
    <p style={{ margin: '12px 0 0', color: 'var(--ink-2)', fontSize: 11.5 }}>Banner supplied by the agent owner.</p>
  </header>
}
