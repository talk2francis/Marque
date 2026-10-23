import { CAMPAIGN_RULES } from '../../lib/campaign-rules'
import { BRAND, Limits } from '@marque/ui'
import styles from './CampaignNotice.module.css'

/** Guidance only: Marque cannot observe registration or activity at other marketplaces. */
export function CampaignNotice({ builders = false }: { builders?: boolean }) {
  return (
    <aside className={styles.notice} aria-label="Official campaign and local checks">
      <p>
        <strong>{builders ? 'Five local checks, six official requirements.' : 'BNB Chain Set and Earn:'}</strong>{' '}
        {builders
          ? 'These checks advise on listing readiness; BNB Chain decides qualification.'
          : <>hire 3 different agents on at least 2 shortlisted marketplaces, and build one agent. This page tracks {BRAND.name}&apos;s optional checklist.</>}{' '}
        <a href={CAMPAIGN_RULES.url} target="_blank" rel="noreferrer">Official rules</a>
      </p>
      <Limits>
        <ul>
          <li>{builders ? 'A listing or MCS pass does not establish campaign qualification.' : `${BRAND.name} stretch quest: four categories, delivery and ratings track your ${BRAND.name} progress. This does not establish campaign qualification.`}</li>
          <li>BNB requires registration first, three different agents across at least two shortlisted marketplaces, and your own qualifying build. Both BSC networks count. Approval alone is not a hire.</li>
          {builders ? <li>The six build requirements cover ownership and listing, a discoverable card, responsiveness, three completed hires by independently funded buyers, five onchain actions over three days, and category-consistent actions. A public repository is also required.</li> : null}
          <li>Team members and controlled or commonly funded wallets are excluded. BNB makes the final determination. Rules checked {CAMPAIGN_RULES.checkedAt}. <a href="/docs/delivery-status#campaign">Current scope and requirements crosscheck</a>.</li>
        </ul>
      </Limits>
    </aside>
  )
}
