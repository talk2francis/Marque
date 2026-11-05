import { campaignClock } from '@marque/commerce/rules'

/**
 * What the site says once Set and Earn has closed (5 Nov 2026, 12:00 UTC). Every surface that spoke of the
 * campaign as open reads its words here, gated on the campaign clock, so the campaign cut still renders when the
 * clock is set before the close. A plain module: client and server components both import it.
 */
export interface Action { href: string; label: string }

export const isClosed = (nowMs: number): boolean => campaignClock(nowMs).closed

export const CLOSED_LINE = 'Set and Earn closed Thu 5 Nov, 12:00 UTC. BNB Chain announces the winners after 13 November.'
export const CHECK_WALLET: Action = { href: '/quest', label: 'Check any wallet' }

const FIND: Action = { href: '/register', label: 'Find an agent' }
const LIST: Action = { href: '/builders', label: 'List your agent' }
const BROWSE: Action = { href: '/register', label: 'Browse agents' }

/** The home hero's two buttons. */
export function heroActions(nowMs: number): { primary: Action; secondary: Action } {
  return isClosed(nowMs) ? { primary: FIND, secondary: LIST } : { primary: { href: '/quest', label: 'Start the Set and Earn quest' }, secondary: BROWSE }
}

/** The site footer's two buttons. */
export function footerActions(nowMs: number): { primary: Action; secondary: Action } {
  return isClosed(nowMs) ? { primary: FIND, secondary: LIST } : { primary: { href: '/quest', label: 'Start the quest' }, secondary: BROWSE }
}

/** The docs home's first button. */
export function docsPrimary(nowMs: number): Action {
  return isClosed(nowMs) ? FIND : { href: '/quest', label: 'Start the Set and Earn quest' }
}

/**
 * /judge after the close: the shortest honest path for a reviewer, every step a link that needs no wallet. Steps
 * whose page does not exist yet (the anchored record, rechecking an answer) are left out, not shown disabled.
 */
export const JUDGE_AFTER_CLOSE: ReadonlyArray<Action & { note: string }> = [
  { href: '/film', label: 'Watch the film', note: '60 seconds, every figure read at the close.' },
  { href: '/proof?chain=56&funder=outside#jobs', label: 'Open Every job, outside wallets', note: 'Each mainnet hire paid by a wallet outside the team list, with what the chain checks said.' },
  { href: '/jobs/56/56903', label: 'Open job 56903 and its checks', note: 'One paid job end to end: the quote, the escrow, the answer and each check against BNB Chain.' },
]
