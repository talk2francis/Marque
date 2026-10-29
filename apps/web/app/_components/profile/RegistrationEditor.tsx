'use client'
import { useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { switchChain, waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { PenLine } from 'lucide-react'
import { dataUri, identityRegistryAbi, NETWORKS, friendlyError } from '@marque/commerce/client'
import { toast } from '../../../lib/toast'
import styles from './profile.module.css'

/**
 * Edit an agent's ERC-8004 registration from Marque (29 Oct): its name, description and image. The owner's own wallet
 * signs one setAgentURI transaction on the agent's network, so the change is on chain and every marketplace that reads
 * the registry shows it. Every other field of the registration (services, registrations, type) is kept as it is.
 * Marque then re-reads that one agent so its pages update at once.
 */
interface Props { chainId: 56 | 97; tokenId: string; portraitUrl?: string | null; onSaved?: (name: string) => void }

export function RegistrationEditor({ chainId, tokenId, portraitUrl, onSaved }: Props) {
  const config = useConfig()
  const { address, chainId: walletChain } = useAccount()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<null | 'signing' | 'confirming'>(null)
  const [error, setError] = useState<string | null>(null)
  const [reg, setReg] = useState<Record<string, unknown> | null>(null)
  const [stored, setStored] = useState<'onchain' | 'hosted'>('onchain')
  const [owner, setOwner] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState('')

  const load = async () => {
    setOpen(true); setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/v1/builders/registration?chainId=${chainId}&tokenId=${tokenId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.detail ?? 'The registration could not be read.')
      setReg(j.registration); setStored(j.stored); setOwner(j.owner)
      setName(String(j.registration.name ?? '')); setDescription(String(j.registration.description ?? ''))
      setImage(String(j.registration.image ?? '') || (portraitUrl ?? ''))
    } catch (e) { setError(e instanceof Error ? e.message : 'The registration could not be read.') } finally { setLoading(false) }
  }

  const changed = reg ? name.trim() !== String(reg['name'] ?? '') || description.trim() !== String(reg['description'] ?? '') || image.trim() !== String(reg['image'] ?? '') : false
  const isOwner = Boolean(address && owner && address.toLowerCase() === owner)
  const imageOk = !image.trim() || /^https:\/\/\S+$/i.test(image.trim())

  const save = async () => {
    if (!reg || !address) return
    setError(null)
    try {
      if (walletChain !== chainId) await switchChain(config, { chainId })
      setBusy('signing')
      const next = { ...reg, name: name.trim(), description: description.trim(), image: image.trim() }
      const hash = await writeContract(config, { account: address, address: NETWORKS[chainId].identityRegistry, abi: identityRegistryAbi, functionName: 'setAgentURI', args: [BigInt(tokenId), dataUri(JSON.stringify(next))], chainId })
      setBusy('confirming')
      const receipt = await waitForTransactionReceipt(config, { hash, chainId })
      if (receipt.status !== 'success') throw new Error('The registry refused the update.')
      await fetch('/api/v1/builders/registration/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId, tokenId }) }).catch(() => undefined)
      setReg(next)
      toast({ tone: 'success', title: 'Registration updated', body: `${next.name} is the agent's name on chain now; Marque shows it at once, other marketplaces when they next read the registry.` })
      onSaved?.(next.name)
      setOpen(false)
    } catch (e) {
      setError(friendlyError(e).title)
    } finally { setBusy(null) }
  }

  if (!open) return <button type="button" className={styles.linkBtn} style={{ color: 'var(--ink-2)' }} onClick={load}><PenLine aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 5 }} />Edit name and registration</button>
  return (
    <div className={styles.block} style={{ paddingTop: 8 }}>
      {loading ? <p className={styles.fine}>Reading the registration from chain…</p> : null}
      {reg ? (
        <>
          <label className={styles.field}>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /><small>The one name Marque and other marketplaces show for this agent.</small></label>
          <label className={styles.field}>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} /></label>
          <label className={styles.field}>Image URL<input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" spellCheck={false} inputMode="url" /><small>{portraitUrl ? 'Prefilled with the portrait you set on Marque, so other marketplaces show it too.' : 'An https image URL. Set a portrait on Marque to get one.'}</small></label>
          <p className={styles.fine}>
            Your wallet signs one transaction on {chainId === 97 ? 'BSC testnet (network fee in test BNB)' : 'BSC mainnet (network fee in BNB)'}: setAgentURI on the ERC-8004 registry. Services and every other field stay as they are.
            {stored === 'hosted' ? ' The registration is hosted at a URL today; this writes the updated copy on chain instead.' : ''}
          </p>
          {!isOwner ? <p className={styles.err}>Connect the wallet that owns #{tokenId} ({owner ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : 'the owner'}) to sign.</p> : null}
          <div className={styles.cropActions}>
            <button type="button" className="btn btn--sm btn--primary" onClick={save} disabled={!isOwner || !changed || !name.trim() || !imageOk || busy !== null}>
              {busy === 'signing' ? 'Confirm in your wallet…' : busy === 'confirming' ? 'Writing to the registry…' : 'Sign and update'}
            </button>
            <button type="button" className={styles.linkBtn} onClick={() => setOpen(false)} disabled={busy !== null}>Cancel</button>
          </div>
        </>
      ) : null}
      {error ? <p className={styles.err} role="alert">{error}</p> : null}
    </div>
  )
}
