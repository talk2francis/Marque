'use client'
import { useEffect, useRef, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { switchChain, waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { PenLine } from 'lucide-react'
import { dataUri, identityRegistryAbi, NETWORKS, friendlyError } from '@marque/commerce/client'
import { toast } from '../../../lib/toast'
import { refreshRegistrationIndex, registrationForEdit } from '../../../lib/registration-index-client'
import styles from './profile.module.css'

/**
 * Edit an agent's ERC-8004 registration from Marque (29 Oct): its name, description and image. The owner's own wallet
 * signs one setAgentURI transaction on the agent's network, so the change is on chain and every marketplace that reads
 * the registry shows it. Every other field of the registration (services, registrations, type) is kept as it is.
 * Marque then re-reads that agent. A failed index refresh is reported separately from the confirmed chain update.
 */
interface Props { chainId: 56 | 97; tokenId: string; portraitUrl?: string | null; onSaved?: (name: string) => void }

export function RegistrationEditor({ chainId, tokenId, portraitUrl, onSaved }: Props) {
  const config = useConfig()
  const { address, chainId: walletChain } = useAccount()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<null | 'switching' | 'signing' | 'confirming' | 'refreshing'>(null)
  const [error, setError] = useState<string | null>(null)
  const [reg, setReg] = useState<Record<string, unknown> | null>(null)
  const [stored, setStored] = useState<'onchain' | 'hosted'>('onchain')
  const [owner, setOwner] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState('')
  const attempt = useRef(0)
  const saving = useRef(false)
  const reading = useRef<AbortController | null>(null)

  useEffect(() => () => { attempt.current++; reading.current?.abort() }, [])

  const cancel = () => {
    attempt.current++; saving.current = false; reading.current?.abort()
    setBusy(null); setLoading(false); setOpen(false)
  }

  const load = async () => {
    reading.current?.abort()
    const controller = new AbortController()
    reading.current = controller
    const id = ++attempt.current
    setOpen(true); setLoading(true); setError(null); setReg(null); setOwner(null)
    try {
      const r = await fetch(`/api/v1/builders/registration?chainId=${chainId}&tokenId=${tokenId}`, { cache: 'no-store', signal: controller.signal })
      if (!r.ok) throw new Error('The registration could not be read. Try again.')
      const j = registrationForEdit(await r.json(), chainId, tokenId)
      if (id !== attempt.current) return
      setReg(j.registration); setStored(j.stored); setOwner(j.owner)
      setName(String(j.registration['name'] ?? '')); setDescription(String(j.registration['description'] ?? ''))
      setImage(String(j.registration['image'] ?? '') || (portraitUrl ?? ''))
    } catch (e) {
      if (id === attempt.current) setError(e instanceof Error ? e.message : 'The registration could not be read.')
    } finally { if (id === attempt.current) setLoading(false) }
  }

  const changed = reg ? name.trim() !== String(reg['name'] ?? '') || description.trim() !== String(reg['description'] ?? '') || image.trim() !== String(reg['image'] ?? '') : false
  const isOwner = Boolean(address && owner && address.toLowerCase() === owner)
  const imageOk = !image.trim() || /^https:\/\/\S+$/i.test(image.trim())

  const save = async () => {
    if (!reg || !address || !isOwner || !changed || !name.trim() || !imageOk || saving.current) return
    const id = ++attempt.current
    saving.current = true
    setError(null)
    setBusy(walletChain !== chainId ? 'switching' : 'signing')
    const next = { ...reg, name: name.trim(), description: description.trim(), image: image.trim() }
    try {
      if (walletChain !== chainId) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            switchChain(config, { chainId }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('registration_switch_timeout')), 45_000) }),
          ])
        } finally { clearTimeout(timer) }
      }
      // Closing the editor or leaving this page during a wallet switch must never open a later signature request.
      if (id !== attempt.current) return
      setBusy('signing')
      const hash = await writeContract(config, { account: address, address: NETWORKS[chainId].identityRegistry, abi: identityRegistryAbi, functionName: 'setAgentURI', args: [BigInt(tokenId), dataUri(JSON.stringify(next))], chainId })
      if (id === attempt.current) setBusy('confirming')
      const receipt = await waitForTransactionReceipt(config, { hash, chainId })
      if (receipt.status !== 'success') throw new Error('The registry refused the update.')
      if (id === attempt.current) setBusy('refreshing')
      const indexed = await refreshRegistrationIndex(chainId, tokenId)
      if (id !== attempt.current) return
      setReg(next)
      toast(indexed
        ? { tone: 'success', title: 'Registration updated', body: `${next.name} is the agent's name on chain. Marque has refreshed its record; other marketplaces update when they next read the registry.` }
        : { tone: 'warn', title: 'Saved on chain', body: 'Your registry update is confirmed. Marque could not refresh its listing yet. You do not need to sign or pay again.', ttl: null })
      onSaved?.(next.name)
      setOpen(false)
    } catch (e) {
      if (id === attempt.current) setError(e instanceof Error && e.message === 'registration_switch_timeout'
        ? `Your wallet did not switch to ${chainId === 97 ? 'BSC testnet' : 'BSC mainnet'}. Complete the switch in your wallet, then try again.`
        : friendlyError(e).title)
    } finally { if (id === attempt.current) { saving.current = false; setBusy(null) } }
  }

  if (!open) return <button type="button" className={styles.linkBtn} style={{ color: 'var(--ink-2)' }} onClick={load}><PenLine aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 5 }} />Edit name and registration</button>
  return (
    <div className={styles.block} style={{ paddingTop: 8 }}>
      {loading ? <p className={styles.fine}>Reading the registration from chain…</p> : null}
      {reg ? (
        <>
          <label className={styles.field}>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={busy !== null} /><small>The one name Marque and other marketplaces show for this agent.</small></label>
          <label className={styles.field}>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} disabled={busy !== null} /></label>
          <label className={styles.field}>Image URL<input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" spellCheck={false} inputMode="url" disabled={busy !== null} /><small>{portraitUrl ? 'Prefilled with the portrait you set on Marque, so other marketplaces show it too.' : 'An https image URL. Set a portrait on Marque to get one.'}</small></label>
          {!imageOk ? <p className={styles.err}>Use an https image URL, or leave the image blank.</p> : null}
          <p className={styles.fine}>
            Your wallet signs one transaction on {chainId === 97 ? 'BSC testnet (network fee in test BNB)' : 'BSC mainnet (network fee in BNB)'}: setAgentURI on the ERC-8004 registry. Services and every other field stay as they are.
            {stored === 'hosted' ? ' The registration is hosted at a URL today; this writes the updated copy on chain instead.' : ''}
          </p>
          {!isOwner ? <p className={styles.err}>Connect the wallet that owns #{tokenId} ({owner ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : 'the owner'}) to sign.</p> : null}
          <div className={styles.cropActions}>
            <button type="button" className="btn btn--sm btn--primary" onClick={save} disabled={!isOwner || !changed || !name.trim() || !imageOk || busy !== null}>
              {busy === 'switching' ? 'Switching network…' : busy === 'signing' ? 'Confirm in your wallet…' : busy === 'confirming' ? 'Writing to the registry…' : busy === 'refreshing' ? 'Updating Marque…' : walletChain !== chainId ? `Switch to BSC ${chainId === 97 ? 'testnet' : 'mainnet'} and update` : 'Sign and update'}
            </button>
            <button type="button" className={styles.linkBtn} onClick={cancel} disabled={busy !== null && busy !== 'switching'}>Cancel</button>
          </div>
        </>
      ) : null}
      {error ? <p className={styles.err} role="alert">{error}</p> : null}
      {!reg ? <div className={styles.cropActions}>
        {!reg && error ? <button type="button" className={styles.linkBtn} onClick={load}>Try again</button> : null}
        <button type="button" className={styles.linkBtn} onClick={cancel} disabled={busy !== null && busy !== 'switching'}>Cancel</button>
      </div> : null}
    </div>
  )
}
