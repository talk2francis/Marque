'use client'
import { ProvenanceChip } from '@marque/ui'
import type { CommerceFacts } from '@marque/commerce/client'
import { useAgentTerms } from '../../_components/terms/useTerms'
import { TermsLine } from '../../_components/terms/TermsLine'
import styles from './storefront.module.css'

/**
 * The storefront's price and its one primary action, from the same terms every other
 * surface reads (invariant 41). Fresh: hire at this price. Dated: the price with its age
 * and Refresh; Hire still opens the sheet, which asks for a price for the buyer's task.
 * None: the reason, and a fresh quote request where the agent has a service.
 */
export function RailTerms({ agentId, facts, name, hireHref, tryHref, answersFree, canQuote, children }: {
  agentId: string
  facts: CommerceFacts | null
  name: string
  hireHref: string
  tryHref: string
  answersFree: boolean
  canQuote: boolean
  /** Rendered between the price and the actions (the rail's measured facts). */
  children?: React.ReactNode
}) {
  const { terms, now, refresh, refreshing } = useAgentTerms(agentId, facts)
  const [num, ...unit] = (terms.priceLabel ?? '').split(' ')
  const hireLabel = name.length <= 22 ? `Hire ${name}` : 'Hire this agent'
  return (
    <>
      <div className={styles.price} data-terms={terms.state}>
        {terms.priceLabel ? (
          <>
            <span className={styles.priceNum}><span className="num">{num}</span> <span className={styles.priceTok}>{unit.join(' ')}</span></span>
            <span className={styles.priceSrc}>
              <span className={styles.liveDot} aria-hidden="true" data-live={terms.state === 'fresh' || undefined} />
              <TermsLine terms={terms} now={now} refresh={refresh} refreshing={refreshing} />
              {terms.state === 'fresh' ? <ProvenanceChip provenance="MEASURED" title="A quote this agent returned to Marque, inside its acceptance window. Hiring asks for a price for your exact task." /> : null}
            </span>
          </>
        ) : (
          <span className={styles.priceNone}>No current price. {terms.reason}</span>
        )}
      </div>
      {children}
      <div className={styles.panelActions} data-slot="actions">
        {terms.state !== 'none' ? <a className="btn btn--primary btn--block btn--lg" href={hireHref}>{hireLabel}</a> : null}
        {terms.state === 'none' && canQuote ? <a className="btn btn--primary btn--block btn--lg" href={hireHref}>Ask for a price</a> : null}
        {answersFree ? <a className={`btn btn--block ${terms.state !== 'none' ? '' : 'btn--lg'}`} href={tryHref}>Try free</a> : null}
        {terms.state === 'none' && !canQuote && !answersFree ? <p className={styles.muted}>This agent cannot be hired or tried right now. The record below says why.</p> : null}
      </div>
    </>
  )
}
