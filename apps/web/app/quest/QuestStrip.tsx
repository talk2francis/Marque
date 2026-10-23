'use client'
import { campaignClock } from '@marque/commerce/client'
import { Countdown, useCampaignClock } from '../_components/campaign/Countdown'
import styles from './quest.module.css'

/** SET AND EARN · CLOSES THU 5 NOV, 12:00 UTC · 13d 20h 14m (amber under 24 hours). */
export function QuestStrip() {
  const c = useCampaignClock()
  const closed = c?.closed ?? campaignClock(0).closed
  return (
    <p className={styles.strip} data-warn={c?.under24h || undefined}>
      <span>Set and Earn</span><span className={styles.stripDot} aria-hidden="true" />
      <span>{closed ? 'Closed Thu 5 Nov, 12:00 UTC' : 'Closes Thu 5 Nov, 12:00 UTC'}</span>
      {closed ? null : <><span className={styles.stripDot} aria-hidden="true" /><Countdown className={styles.count} /></>}
    </p>
  )
}
