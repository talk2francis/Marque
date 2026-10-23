'use client'
import { ageWords, validForWords, type Terms } from '@marque/commerce/client'
import styles from './terms.module.css'

/**
 * The line under a price, identical on every surface: a fresh quote says how long it is
 * valid; a dated one says how old it is and offers Refresh; none says why in plain words.
 * Relative times render only after mount, so a cached page never hydrates a stale age.
 */
export function TermsLine({ terms, now, refresh, refreshing, short = false }: {
  terms: Terms
  now: number | null
  refresh?: () => void
  refreshing?: boolean
  /** Card and row variants drop the signature words to fit. */
  short?: boolean
}) {
  if (terms.state === 'fresh') {
    const valid = now === null ? null : validForWords(terms.expiresAt, now)
    return (
      <span className={styles.line} data-state="fresh">
        live quote{valid ? `, ${valid}` : ''}
        {!short && terms.signed !== null ? <span className={styles.sig}>{terms.signed ? ' · signed by the agent' : ' · identity checked'}</span> : null}
      </span>
    )
  }
  if (terms.state === 'dated') {
    const age = now === null ? null : ageWords(terms.observedAt, now)
    return (
      <span className={styles.line} data-state="dated">
        {age ? `quoted ${age}` : 'last quote'}
        {refresh ? (
          <>
            <span aria-hidden="true"> · </span>
            <button type="button" className={styles.refresh} onClick={refresh} disabled={refreshing} aria-live="polite">
              {refreshing ? 'Asking…' : 'Refresh'}
            </button>
          </>
        ) : null}
      </span>
    )
  }
  return <span className={styles.line} data-state="none">{short ? 'No current price' : terms.reason}</span>
}
