'use client'
import { ProvenanceChip } from '@marque/ui'
import type { CommerceFacts } from '@marque/commerce/client'
import { useAgentTerms } from './useTerms'
import { TermsLine } from './TermsLine'
import { Badge } from '../ui'

/** Compare-table cells: the same terms as every card, row and rail (invariant 41). */
export function TermsPriceCell({ agentId, facts, declared }: { agentId: string; facts: CommerceFacts; declared: string | null }) {
  const { terms, now, refresh, refreshing } = useAgentTerms(agentId, facts)
  if (terms.priceLabel) {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        <span className="terms-price">{terms.priceLabel}{terms.state === 'fresh' ? <> <ProvenanceChip provenance="MEASURED" /></> : null}</span>
        <TermsLine terms={terms} now={now} refresh={refresh} refreshing={refreshing} />
      </span>
    )
  }
  return declared ? <span>{declared} <ProvenanceChip provenance="CLAIMED" /></span> : <span style={{ color: 'var(--ink-3)' }}>{terms.reason}</span>
}

export function TermsHireStateCell({ agentId, facts, blocked }: { agentId: string; facts: CommerceFacts; blocked: string }) {
  const { terms, now } = useAgentTerms(agentId, facts)
  if (terms.state === 'fresh') return <><Badge kind="hireable" /> <TermsLine terms={terms} now={now} short /></>
  if (terms.state === 'dated') return <span style={{ color: 'var(--ink-3)' }}>Quote lapsed; the hire sheet asks for a fresh price.</span>
  return <span style={{ color: 'var(--ink-3)' }}>{blocked}</span>
}

/** The hire sheet's line before a task is priced: the agent's current terms, never an old price as current. */
export function TermsBeforeQuote({ agentId, network }: { agentId: string; network: (chainId: number | null) => string }) {
  const { terms, now } = useAgentTerms(agentId, null)
  if (!terms.priceLabel) return null
  return <> {terms.state === 'fresh' ? 'Its current quote is' : 'Its last quote was'} {terms.priceLabel} on {network(terms.chainId)} (<TermsLine terms={terms} now={now} short />). Your task gets its own price.</>
}
