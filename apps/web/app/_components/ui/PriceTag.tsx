'use client'
import { useEffect, useState } from 'react'
import { ProvenanceChip } from '@marque/ui'
import { cx } from './cx'

/**
 * A price and its source (invariant 28). A live signed quote counts down to its
 * expiry (MEASURED); a declared price says so (CLAIMED). No other kind exists.
 */
export type PriceSource = { kind: 'quote'; expiresAt: string | number } | { kind: 'declared' }

function left(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function PriceTag({ amount, token, source, size = 'l', onExpire }: {
  amount: string; token: string; source: PriceSource; size?: 'l' | 'm'; onExpire?: () => void
}) {
  const expires = source.kind === 'quote' ? new Date(source.expiresAt).getTime() : null
  // The countdown starts after mount: a server-rendered clock would never match the client.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (expires === null) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [expires])
  const expired = expires !== null && now !== null && now >= expires
  useEffect(() => { if (expired) onExpire?.() }, [expired, onExpire])

  return (
    <span className={cx('price', size === 'm' && 'price--m')}>
      <span className="price-amount">
        <span className="price-num">{amount}</span>
        <span className="price-token">{token}</span>
      </span>
      {source.kind === 'quote' ? (
        <span className="price-src" data-live={!expired} data-expired={expired || undefined} aria-live="off">
          <span className="price-live-dot" aria-hidden="true" />
          {expired ? 'Quote expired' : now === null ? 'Live quote' : `Live quote · ${left(expires! - now)} left`}
          <ProvenanceChip provenance="MEASURED" title="A signed quote from the agent itself, valid until the time shown." />
        </span>
      ) : (
        <span className="price-src">
          Declared price
          <ProvenanceChip provenance="CLAIMED" title="The price the agent declares in its registration. Marque has not received a signed quote for it." />
        </span>
      )}
    </span>
  )
}
