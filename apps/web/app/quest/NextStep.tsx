import type { ReactNode } from 'react'
import type { QuestResult } from '../../lib/quest-api'
import { NextLink } from './QuestIslands'
import styles from './quest.module.css'

/**
 * The one most useful next step for this wallet, computed from the same chain read as the cards below
 * (BNB Chain's participant rule: three hires of different agents, on at least two shortlisted marketplaces, plus one
 * qualifying build). Never shown for a team wallet or after the window closes.
 */
export function NextStep({ q }: { q: QuestResult }) {
  if (q.excluded.team || q.closed) return null
  const hiresNeeded = Math.max(0, q.hire.required.agents - q.hire.distinctAgents)
  const named = q.hire.marketplaces.named
  const marketsNeeded = Math.max(0, q.hire.required.marketplaces - named.length)
  const onlyMarque = named.length > 0 && named.every((m) => m === 'marque.trade')
  const agent = q.build.agents[0] ?? null
  const buildDone = Boolean(agent && agent.observed === 6)
  const practice = `/quest/practice?for=${q.address}`
  const otherMarket = marketsNeeded > 0 && onlyMarque ? (
    <p className={styles.nextAlso}>
      You also need one hire on another shortlisted marketplace. <a href="#marketplaces">The shortlist</a>, as BNB Chain publishes it on its <a href={q.registration.formUrl} target="_blank" rel="noreferrer">rules page</a>.
    </p>
  ) : null

  let title: string
  let body: ReactNode = null
  let action: { label: string; href: string; step: string } | null = null
  if (hiresNeeded > 0) {
    title = `You need ${hiresNeeded} more ${hiresNeeded === 1 ? 'hire of a different agent' : 'hires of different agents'}.`
    body = <p>Do {hiresNeeded === 1 ? 'it' : 'them'} here, free, in about two minutes: BSC testnet, test tokens, your own wallet or a Marque Pass.</p>
    action = { label: 'Start a free practice hire', href: practice, step: 'practice' }
  } else if (marketsNeeded > 0 && !named.includes('marque.trade')) {
    title = 'You need one hire on a second shortlisted marketplace.'
    body = <p>Marque is on the shortlist. A hire here counts, free on BSC testnet.</p>
    action = { label: 'Start a free practice hire', href: practice, step: 'practice' }
  } else if (marketsNeeded > 0) {
    title = 'Your hires are done on Marque.'
  } else if (!buildDone) {
    title = 'Your hires are seen on chain. Next: your build.'
    body = <p>{agent ? `${agent.name ?? `Agent #${agent.tokenId}`} meets ${agent.observed} of 6 build checks.` : 'This wallet owns no ERC-8004 agent yet.'}</p>
    action = agent
      ? { label: 'Open the build checklist', href: `/builders/progress/${agent.chainId}/${agent.tokenId}`, step: 'build' }
      : { label: 'Start your agent in the Forge', href: '/builders', step: 'build' }
  } else {
    title = 'Both tracks are seen on chain.'
    body = <p>BNB Chain verifies every entry and decides after the window closes. Keep the registration form filled in.</p>
  }
  return (
    <section className={styles.nextStep} aria-labelledby="next-step">
      <span className={styles.nextKicker}>Your next step</span>
      <h2 id="next-step" className={styles.nextTitle}>{title}</h2>
      {body}
      {otherMarket}
      {action ? <NextLink href={action.href} step={action.step}>{action.label}</NextLink> : null}
    </section>
  )
}
