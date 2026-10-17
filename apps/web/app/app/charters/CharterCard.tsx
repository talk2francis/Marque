'use client'

import { useCallback, useEffect, useState } from 'react'
import { Chip, DataCell, MeasureRule } from '@marque/ui'
import { announceChartersChanged } from '../../_components/CharterStrip'
import { scanAddress, scanTx } from '../../../lib/charter-templates'
import { forgetCharterControl, readCharterControl } from '../../../lib/charter-control-client'
import styles from './charters.module.css'

/** Historical registry policy records. Stored limits and usage do not prove
 * native wallet enforcement. Capability holders can still anchor revocation. */

interface Cap {
  symbol: string; decimals: number; limit: number; spent: number; remaining: number; period: string
}
export interface CharterView {
  id: string
  provider: string
  status: string
  agentId: string
  agentName: string | null
  category: string
  ownerAddress: string
  sessionKeyAddress: string | null
  grantTxHash: string | null
  revokeTxHash: string | null
  policyHash: string
  label: string | null
  grantedAt: string
  expiresAt: string
  revokedAt: string | null
  callsUsed: number
  caps: Cap[]
  contracts: Array<{ to: string; label: string | null; selectors: string[] }>
  secondsRemaining: number
  fromChain: boolean
  blockNumber: string | null
}

function countdown(seconds: number | null): string {
  if (seconds === null) return '…'
  if (seconds <= 0) return 'expired'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export function CharterCard({ charter }: { charter: CharterView }) {
  const [live, setLive] = useState<CharterView>(charter)
  // `null` until mounted: the seconds-remaining depends on Date.now(), which is
  // not the same on the server and in the browser, so computing it during
  // render is a guaranteed hydration mismatch. The clock starts in useEffect.
  const [seconds, setSeconds] = useState<number | null>(null)
  const [busy, setBusy] = useState<null | 'revoking'>(null)
  const [error, setError] = useState<string | null>(null)
  const [pulse, setPulse] = useState(false)
  const [controlToken, setControlToken] = useState<string | null>(null)

  const active = live.status === 'active' && (seconds === null || seconds > 0)

  useEffect(() => { setControlToken(readCharterControl(live.id)) }, [live.id])

  // The clock ticks locally; the state comes from the server. Extrapolating a
  // spend meter between polls would be an estimate rendered as a measurement.
  useEffect(() => {
    const compute = () => setSeconds(Math.floor((new Date(live.expiresAt).getTime() - Date.now()) / 1000))
    compute()
    const tick = setInterval(compute, 1000)
    return () => clearInterval(tick)
  }, [live.expiresAt])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/charters/${encodeURIComponent(live.id)}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { charter: CharterView }
        if (cancelled) return
        if (data.charter.callsUsed !== live.callsUsed) {
          setPulse(true)
          setTimeout(() => setPulse(false), 200)
        }
        setLive(data.charter)
      } catch { /* a failed poll leaves the last known state, never a guess */ }
    }, 6_000)
    return () => { cancelled = true; clearInterval(poll) }
  }, [active, live.id, live.callsUsed])

  const revoke = useCallback(async () => {
    setBusy('revoking')
    setError(null)
    try {
      const res = await fetch(`/api/v1/charters/${encodeURIComponent(live.id)}/revoke`, {
        method: 'POST', headers: controlToken ? { authorization: `Bearer ${controlToken}` } : {},
      })
      const data = (await res.json()) as { charter?: CharterView; error?: string }
      if (!res.ok || !data.charter) { setError(data.error ?? 'the revocation did not land'); return }
      setLive(data.charter)
      forgetCharterControl(live.id)
      setControlToken(null)
      // Tell the strip at once. Its poll is fifteen seconds, and a strip still
      // saying "Charter active" after the revoke has landed is the one stale
      // state a safety product may never show.
      announceChartersChanged()
    } catch {
      setError('the network request failed before the revocation could be sent')
    } finally {
      setBusy(null)
    }
  }, [controlToken, live.id])

  const cap = live.caps[0]
  const spentPct = cap && cap.limit > 0 ? cap.spent / cap.limit : 0

  return (
    <article className={styles.card} id={live.id} data-status={live.status} data-pulse={pulse ? 'true' : undefined}>
      <header className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>{live.agentName ?? live.agentId}</h3>
          <p className={styles.cardSub}>{live.label ?? live.category}</p>
        </div>
        {active
          ? <Chip tone="watch">Unexpired record</Chip>
          : live.status === 'revoked'
            ? <Chip tone="breach">Revoked</Chip>
            : <Chip tone="watch">{live.status === 'active' ? 'Expired' : live.status}</Chip>}
      </header>

      {cap && (
        <div className={styles.meterBlock}>
          <MeasureRule
            label={`Recorded remainder: ${cap.remaining.toFixed(5)} of ${cap.limit.toFixed(5)} ${cap.symbol}`}
            value={cap.spent}
            lower={0}
            upper={cap.limit}
            threshold={cap.limit}
            thresholdLabel="recorded limit"
            lowerLabel="0"
            upperLabel={`${cap.limit} ${cap.symbol}`}
            state={spentPct >= 1 ? 'breach' : spentPct > 0.8 ? 'watch' : 'holds'}
          />
        </div>
      )}

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Time left</dt>
          <dd><DataCell align="left">{live.status === 'active' ? countdown(seconds) : 'Unavailable'}</DataCell></dd>
        </div>
        <div className={styles.fact}>
          <dt>Recorded calls</dt>
          <dd><DataCell align="left">{live.callsUsed}</DataCell></dd>
        </div>
        <div className={styles.fact}>
          <dt>Recorded spend</dt>
          <dd><DataCell align="left">{cap ? `${cap.spent.toFixed(5)} ${cap.symbol}` : 'Unavailable'}</DataCell></dd>
        </div>
        <div className={styles.fact}>
          <dt>Expires</dt>
          <dd><DataCell align="left">{new Date(live.expiresAt).toISOString().replace('T', ' ').slice(0, 19)}Z</DataCell></dd>
        </div>
      </dl>

      <div className={styles.permits}>
        <span className={styles.permitsLabel}>
          Policy names {live.contracts.length} contract{live.contracts.length === 1 ? '' : 's'}. Enforcement is not proven.
        </span>
        <ul className={styles.permitList}>
          {live.contracts.map((c) => (
            <li key={c.to}>
              <a href={scanAddress(c.to)} target="_blank" rel="noreferrer">
                {c.label ?? c.to}
              </a>
              <span className={`mono ${styles.selectors}`}>
                {c.selectors.length > 0
                  ? `${c.selectors.length} function${c.selectors.length === 1 ? '' : 's'}`
                  : 'every function'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.proofs}>
        {live.grantTxHash && (
          <a className={`mono ${styles.proof}`} href={scanTx(live.grantTxHash)} target="_blank" rel="noreferrer">
            Policy anchor {live.grantTxHash.slice(0, 10)}…
          </a>
        )}
        {live.revokeTxHash && (
          <a className={`mono ${styles.proof}`} href={scanTx(live.revokeTxHash)} target="_blank" rel="noreferrer">
            Revocation anchor {live.revokeTxHash.slice(0, 10)}…
          </a>
        )}
        <span className={`mono ${styles.proof}`} title="keccak of the policy that was anchored on chain">
          Policy {live.policyHash.slice(0, 10)}…
        </span>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {active && controlToken && (
        <div className={styles.actions}>
          <button type="button" className={styles.revoke} onClick={() => void revoke()} disabled={busy !== null}>
            {busy === 'revoking' ? 'Revoking…' : 'Revoke policy record'}
          </button>

        </div>
      )}
      {active && !controlToken && (
        <p className={styles.error}>Public policy record only. This browser does not hold its revocation capability. Wallet permissions have not been inspected.</p>
      )}
    </article>
  )
}
