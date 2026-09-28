import type { AgentBrand } from '../../lib/agent-brand'
import { AgentAvatar } from './AgentAvatar'
import styles from './AgentBrandHero.module.css'

/**
 * The reference-agent masthead on a storefront (27 Sep identity pass). Only for
 * the six Marque reference agents with a local brand: a third party keeps the
 * plain identity header, with no placeholder in its place.
 *
 * Three layers, all the same image, no colour of our own: the sharp artifact,
 * a blurred echo that lets its atmosphere bleed into the page, and an alpha mask
 * so there is no edge to point at. The portrait sits on the stage's lower edge.
 * Everything that matters (name, network, state, the reference mark) is text in
 * `children`, below the art, never on it. Server-rendered, CSS only.
 */
export function AgentBrandHero({ brand, agentId, category, children }: { brand: AgentBrand; agentId: string; category: string | null; children: React.ReactNode }) {
  return (
    <header className={styles.masthead} data-tone={brand.tone}>
      <div className={styles.stage} aria-hidden="true">
        <img className={styles.echo} src={brand.heroSmall} alt="" width={900} height={300} decoding="async" />
        <picture className={styles.art}>
          <source media="(max-width: 720px)" srcSet={brand.heroSmall} />
          <img src={brand.hero} alt="" width={1800} height={600} fetchPriority="high" decoding="async" style={{ objectPosition: brand.heroPosition }} />
        </picture>
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
