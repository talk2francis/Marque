import type { SellerProjection } from './seller'

/** Public observations only. Private reports require a separate, freshly proved owner request. */
export interface BuilderAgent {
  agentKey: string
  chainId: 56 | 97
  agentId: string
  name: string
  imageUrl?: string | null
  portraitByOwner?: boolean
  firstParty?: boolean
  category: string | null
  listedOnMarque: boolean
  quality: {
    passed: number
    checks: Array<{
      id: string
      label: string
      pass: boolean
      state: string
      reason: string
      fix: string | null
    }>
  }
  seller: SellerProjection
}
export interface BuilderPage {
  owner: string
  agents: BuilderAgent[]
  page: { total: number; nextCursor: string | null }
}

export function ownerCursor(value: string | null): number | null {
  if (value === null) return 0
  return /^(0|[1-9]\d{0,5})$/.test(value) ? Number(value) : null
}

export function agentPriceState(
  agent: Pick<BuilderAgent, 'seller'>,
  now = Date.now(),
): 'ready' | 'expired' | 'missing' {
  const quotes = agent.seller.services.filter((s) => s.declaredNow && s.kind === 'a2a')
  if (
    quotes.some(
      (s) =>
        s.quote.state === 'CURRENT_PROBE_SAMPLE' &&
        s.quote.expiresAt !== null &&
        Date.parse(s.quote.expiresAt) > now,
    )
  )
    return 'ready'
  if (
    quotes.some(
      (s) =>
        s.quote.state === 'EXPIRED' ||
        (s.quote.expiresAt !== null && Date.parse(s.quote.expiresAt) <= now),
    )
  )
    return 'expired'
  return 'missing'
}

export function builderNextStep(
  agent: BuilderAgent,
  now = Date.now(),
): { title: string; detail: string; href: string; action: string } {
  const owner = agent.seller.identity.owner
  const base = `/builders/run?chain=${agent.chainId}&token=${agent.agentId}${owner ? `&wallet=${encodeURIComponent(owner)}` : ''}#listed`
  if (!agent.seller.identity.current)
    return {
      title: 'Refresh the identity',
      detail:
        'The current owner and payment wallet could not be read. Retry before changing the listing.',
      href: base,
      action: 'Read the checks',
    }
  const price = agentPriceState(agent, now)
  if (price !== 'ready')
    return {
      title: price === 'expired' ? 'Refresh the price check' : 'Make this agent hireable',
      detail:
        'A reachable endpoint needs a current price for this agent and network. The fix report shows the last recorded result.',
      href: `/builders/check/${agent.chainId}/${agent.agentId}`,
      action: 'Open the fix report',
    }
  const fix = agent.quality.checks.find((c) => !c.pass)
  if (fix)
    return {
      title:
        (
          {
            identity: 'Check the identity owner',
            proved: 'Prove ownership',
            callable: 'Check a task reply',
            classified: 'Choose a category',
            tested: 'Run the published test',
          } as Record<string, string>
        )[fix.id] ?? 'Review the setup check',
      detail: fix.fix ?? fix.reason,
      href: base,
      action: 'Open this check',
    }
  if (agent.seller.jobs.funded === 0)
    return {
      title: 'Get ready for the first buyer',
      detail:
        'Keep your endpoint online and make sure a funded job produces a readable answer. No funded job is recorded in this window yet.',
      href: '/docs/sellers',
      action: 'Check the delivery format',
    }
  if (agent.seller.jobs.submitted === 0)
    return {
      title: 'Deliver the first funded job',
      detail:
        'Publish the answer file and record its hash on chain. Buyers should be able to read what they paid for.',
      href: '/docs/sellers',
      action: 'Read the delivery guide',
    }
  return {
    title: 'Keep the delivery path working',
    detail:
      'Review recent jobs, check that answer files remain readable and keep your endpoint online.',
    href: `/agents/${agent.chainId}/${agent.agentId}/record`,
    action: 'View the public record',
  }
}

export const BUILDER_JOB_STATE: Record<string, string> = {
  OPEN: 'Not funded',
  FUNDED: 'Awaiting delivery',
  SUBMITTED: 'Delivered; review open',
  COMPLETED: 'Completed',
  PAID: 'Payment released',
  REFUNDED: 'Refunded to buyer',
  EXPIRED: 'Expired',
  REJECTED: 'Rejected',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled',
}
