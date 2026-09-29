import type { CSSProperties } from 'react'
import type { AgentBrand } from '../../lib/agent-brand'
import { AgentAvatar } from './AgentAvatar'
import styles from './AgentBrandHero.module.css'

/**
 * The reference-agent masthead on a storefront (27 Sep identity pass; night art 29 Sep).
 * Only for the six Marque reference agents with a local brand: a third party keeps the
 * plain identity header, with no placeholder in its place.
 *
 * The artifact comes in two lighting states, Day and Night, and the resolved
 * <html data-theme> picks one in CSS: the four URLs travel as custom properties and only
 * the matching background is ever requested, so there is no wrong-theme flash, no
 * hydration branch and no double download. Two layers of the same image: the sharp
 * artifact under an alpha mask, and a blurred echo that lets its air reach the page.
 * Everything that matters (name, network, state) is text in `children`, below the art.
 */
export function AgentBrandHero({ brand, agentId, category, children }: { brand: AgentBrand; agentId: string; category: string | null; children: React.ReactNode }) {
  const art = {
    '--hero-day': `url("${brand.heroDay}")`,
    '--hero-day-small': `url("${brand.heroDaySmall}")`,
    '--hero-night': `url("${brand.heroNight}")`,
    '--hero-night-small': `url("${brand.heroNightSmall}")`,
    '--hero-position': brand.heroPosition,
  } as CSSProperties
  return (
    <header className={styles.masthead} data-tone={brand.tone}>
      <div className={styles.stage} style={art} aria-hidden="true">
        <span className={styles.echo} />
        <span className={styles.art} />
      </div>
      <div className={styles.id}>
        <div className={styles.portrait}>
          <img className={styles.halo} src={brand.avatarSmall} alt="" aria-hidden="true" width={160} height={160} decoding="async" />
          <span className={styles.frame}><AgentAvatar id={agentId} category={category} reference size={104} priority /></span>
        </div>
        <div className={styles.txt}>{children}</div>
      </div>
    </header>
  )
}
