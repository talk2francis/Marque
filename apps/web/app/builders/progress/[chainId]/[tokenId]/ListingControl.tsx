'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useSignMessage } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import styles from './progress.module.css'

/**
 * List or delist, each from one signed message by the identity's owner (no transaction, no gas). Listing goes through
 * the claim rail (describe, optionally test, publish); delisting is one click here: the owner signs the same proof
 * message, and Marque marks the listing withdrawn.
 */
export function ListingControl({ chainId, tokenId, listed }: { chainId: 56 | 97; tokenId: string; listed: boolean }) {
  const router = useRouter()
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { openConnectModal } = useConnectModal()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const delist = async () => {
    if (!address) { openConnectModal?.(); return }
    setBusy(true); setError(null)
    try {
      const idRes = await fetch('/api/v1/builders/claim/identity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: tokenId, ...(chainId === 97 ? { chainId: 97 } : {}) }) })
      const id = await idRes.json()
      if (!idRes.ok) throw new Error(id.detail ?? 'The identity could not be read.')
      if (String(id.identity.owner).toLowerCase() !== address.toLowerCase()) throw new Error(`Connect the owner wallet ${String(id.identity.owner).slice(0, 6)}…${String(id.identity.owner).slice(-4)} to delist.`)
      const signature = await signMessageAsync({ message: id.message })
      const vRes = await fetch('/api/v1/builders/claim/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: id.identity.agentId, nonceToken: id.nonceToken, message: id.message, signature }) })
      const v = await vRes.json()
      if (!vRes.ok) throw new Error(v.detail ?? 'The signature could not be verified.')
      const wRes = await fetch('/api/v1/builders/claim/withdraw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claimToken: v.claimToken }) })
      const w = await wRes.json()
      if (!wRes.ok) throw new Error(w.detail ?? 'The listing could not be withdrawn.')
      setDone(true)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/reject|denied|cancel/i.test(msg) ? 'The signature was cancelled. Nothing changed.' : msg.slice(0, 200))
    } finally { setBusy(false) }
  }

  return (
    <div className={styles.control}>
      {listed && !done ? (
        <button type="button" className="btn btn--sm" disabled={busy} onClick={delist}>{busy ? 'Waiting for your signature…' : address ? 'Delist from Marque (sign)' : 'Connect the owner wallet to delist'}</button>
      ) : (
        <a className="btn btn--sm btn--primary" href={`/builders/claim?chain=${chainId}&token=${tokenId}`}>{chainId === 97 ? 'List it in the practice lane' : 'List it on Marque'}</a>
      )}
      {done ? <p className={styles.reason} role="status">Delisted. It leaves the marketplace within a few minutes; its record and job history stay on chain.</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  )
}
