import { CAMPAIGN_RULES } from '../../lib/campaign-rules'
import { BRAND } from '@marque/ui'
import { Disclosure } from './ui/Disclosure'
import styles from './CampaignNotice.module.css'

/** Guidance only: Marque cannot observe registration or activity at other marketplaces. */
export function CampaignNotice({ builders = false }: { builders?: boolean }) {
  return (
    <aside className={styles.notice} aria-label="Official campaign and local checks">
      <p><strong>{builders ? 'Five local checks, six official requirements.' : `${BRAND.name} stretch quest.`}</strong>{' '}
        {builders ? 'These checks advise on listing readiness. A listing or MCS pass does not establish campaign qualification.' : `Four categories, delivery and ratings track your ${BRAND.name} progress. This does not establish campaign qualification.`}
      </p>
      <p>BNB requires registration first, three different agents across at least two shortlisted marketplaces, and your own qualifying build. Both BSC networks count. Approval alone is not a hire.</p>
      {builders ? <Disclosure summary="The six official build requirements"><p>The six build requirements cover ownership and listing, a discoverable card, responsiveness, three completed hires by independently funded buyers, five onchain actions over three days, and category-consistent actions. A public repository is also required.</p></Disclosure> : null}
      <p>Team members and controlled or commonly funded wallets are excluded. BNB makes the final determination.{' '}
        <a href={CAMPAIGN_RULES.url} target="_blank" rel="noreferrer">Official rules and registration</a>{' '}
        (checked {CAMPAIGN_RULES.checkedAt}).
      </p>
    </aside>
  )
}
