'use client'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useRate, explorerTx } from '@marque/commerce/client'
import styles from './job.module.css'

/** Minimal rating control (P2-04). Only the job's buyer can rate; the wallet signs giveFeedback itself. */
export function RateJob({ chainId, jobId, client, agentName }: { chainId: number; jobId: string; client: string; agentName: string }) {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { state, rate } = useRate()
  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState('')
  const isBuyer = address?.toLowerCase() === client.toLowerCase()

  if (state.phase === 'done' && state.tx) {
    return <p className={styles.note}>Rated {stars} of 5. <a href={explorerTx(chainId, state.tx)} target="_blank" rel="noreferrer">View the rating on chain</a>. It shows here once indexed.</p>
  }
  return (
    <section className={styles.rate} aria-label={`Rate ${agentName}`}>
      <h2 className={styles.rateTitle}>Rate {agentName}</h2>
      <div className={styles.stars} role="radiogroup" aria-label="Stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} className={n <= stars ? styles.starOn : styles.star} onClick={() => setStars(n)}>
            {n}
          </button>
        ))}
      </div>
      <textarea className={styles.comment} rows={2} maxLength={280} placeholder="Optional comment, 280 characters" value={comment} onChange={(e) => setComment(e.target.value)} />
      {!isConnected ? (
        <button type="button" className="btn btn--primary btn--sm" onClick={openConnectModal}>Connect the buyer&apos;s wallet to rate</button>
      ) : !isBuyer ? (
        <p className={styles.note}>Only the wallet that paid for this job can rate it.</p>
      ) : (
        <button type="button" className="btn btn--primary btn--sm" disabled={state.phase === 'preparing' || state.phase === 'signing'}
          onClick={() => rate({ chainId, jobId, wallet: address!, stars, ...(comment.trim() ? { comment: comment.trim() } : {}) })}>
          {state.phase === 'signing' ? 'Confirm in your wallet' : state.phase === 'preparing' ? 'Checking' : `Rate ${stars} of 5`}
        </button>
      )}
      {state.error && <p className={styles.error} role="alert">{state.error.title} {state.error.action}</p>}
      <p className={styles.note}>Your rating is written to the public ERC-8004 reputation registry, where any marketplace can read it.</p>
    </section>
  )
}
