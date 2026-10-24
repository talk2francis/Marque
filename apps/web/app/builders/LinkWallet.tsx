'use client'
import { useCallback, useEffect, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { getPublicClient, switchChain, waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import { agentWalletSignatureOk, AGENT_WALLET_MAX_DELAY_S, friendlyError, identityRegistryAbi, NETWORKS, parseWalletSignature, setAgentWalletCall, type FriendlyError } from '@marque/commerce/client'
import { Button, ErrorNote } from '../_components/ui'
import { copyText } from '../../lib/clipboard'
import { toast } from '../../lib/toast'
import { explorerTx } from '../../lib/network'
import { LINK_WALLET_SCRIPT, linkWalletCommand } from '../../lib/link-wallet-script'
import styles from './forge.module.css'

/**
 * Point an identity's agent wallet at the seller (ERC-8004 setAgentWallet). Quotes are signed by the seller's own
 * key, and buyers check that key against the identity's agent wallet, which starts as whichever wallet registered
 * it. Two signatures, no key ever shown: the seller signs consent with its own keystore (one command, printed
 * below), the owner's wallet sends the call. The registry accepts a consent at most 5 minutes old.
 */
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function LinkWallet({ chainId, agentId }: { chainId: 56 | 97; agentId: bigint }) {
  const config = useConfig()
  const { address, chainId: walletChain } = useAccount()
  const { openConnectModal } = useConnectModal()
  const registry = NETWORKS[chainId].identityRegistry
  const [current, setCurrent] = useState<{ owner: `0x${string}`; wallet: `0x${string}` } | null>(null)
  const [deadline, setDeadline] = useState(() => Math.floor(Date.now() / 1000) + AGENT_WALLET_MAX_DELAY_S - 30)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [pasted, setPasted] = useState('')
  const [verdict, setVerdict] = useState<{ wallet: `0x${string}`; signature: `0x${string}`; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FriendlyError | null>(null)
  const [linked, setLinked] = useState<`0x${string}` | null>(null)
  const [showScript, setShowScript] = useState(false)

  const read = useCallback(async () => {
    const pc = getPublicClient(config, { chainId })
    if (!pc) return
    try {
      const [owner, wallet] = await Promise.all([
        pc.readContract({ address: registry, abi: [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }] as const, functionName: 'ownerOf', args: [agentId] }),
        pc.readContract({ address: registry, abi: identityRegistryAbi, functionName: 'getAgentWallet', args: [agentId] }),
      ])
      setCurrent({ owner, wallet })
    } catch { setCurrent(null) }
  }, [config, chainId, registry, agentId])
  useEffect(() => { void read() }, [read])
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t) }, [])

  const owner = current?.owner ?? address ?? null
  const left = deadline - now
  const isOwner = Boolean(address && current && address.toLowerCase() === current.owner.toLowerCase())
  const command = owner ? linkWalletCommand(chainId, agentId.toString(), owner, deadline) : null

  useEffect(() => {
    const p = parseWalletSignature(pasted)
    if (!p || !owner) { setVerdict(null); return }
    let live = true
    void agentWalletSignatureOk(chainId, registry, { agentId, newWallet: p.wallet, owner: owner as `0x${string}`, deadline: BigInt(deadline) }, p.signature)
      .then((ok) => { if (live) setVerdict({ ...p, ok }) })
    return () => { live = false }
  }, [pasted, owner, chainId, registry, agentId, deadline])

  const fresh = () => { setDeadline(Math.floor(Date.now() / 1000) + AGENT_WALLET_MAX_DELAY_S - 30); setPasted(''); setVerdict(null) }

  const link = async () => {
    if (!address) { openConnectModal?.(); return }
    if (!verdict?.ok) return
    setBusy(true); setError(null)
    try {
      if (walletChain !== chainId) await switchChain(config, { chainId })
      const hash = await writeContract(config, { ...setAgentWalletCall(registry, agentId, verdict.wallet, BigInt(deadline), verdict.signature), chainId })
      const r = await waitForTransactionReceipt(config, { hash, chainId })
      if (r.status !== 'success') throw new Error('reverted')
      setLinked(verdict.wallet)
      void fetch('/api/v1/builders/index', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId, tokenId: agentId.toString() }) }).catch(() => undefined)
      toast({ tone: 'success', title: `Agent #${agentId} now answers with ${short(verdict.wallet)}`, href: explorerTx(chainId, hash) })
      await read()
    } catch (e) { setError(friendlyError(e)) } finally { setBusy(false) }
  }

  const sameAsSeller = current && verdict && current.wallet.toLowerCase() === verdict.wallet.toLowerCase()
  return (
    <section className={styles.link} aria-labelledby="link-title">
      <div className={styles.linkHead}>
        <h2 id="link-title">Point quotes at your seller</h2>
        <p className={styles.fine}>Buyers accept a quote only when it is signed by this identity&apos;s agent wallet. That is the wallet that registered it, so if your seller signs with its own key (every BNB Agent Studio seller does), link that key here. Skip this when you registered from the seller&apos;s own key.</p>
      </div>
      {current ? (
        <dl className={styles.callFacts}>
          <div><dt>Agent wallet now</dt><dd className="mono">{current.wallet}{current.wallet.toLowerCase() === current.owner.toLowerCase() ? ' (the owner)' : ''}</dd></div>
          <div><dt>Owner</dt><dd className="mono">{current.owner}{isOwner ? ' (you)' : ''}</dd></div>
        </dl>
      ) : null}
      {linked ? <p className={styles.ok}><Check aria-hidden="true" width={14} height={14} /> Linked. Quotes signed by {short(linked)} now match agent #{agentId.toString()}.</p> : (
        <>
          <ol className={styles.linkSteps}>
            <li>
              <b>In your seller&apos;s <code>app/agent</code> folder, run</b>
              <div className={styles.cmd}>
                <code>{command ?? 'Connect the owner wallet to get the line'}</code>
                {command ? <button type="button" onClick={async () => { if (await copyText(command)) toast({ tone: 'success', title: 'Command copied' }) }} aria-label="Copy command"><Copy aria-hidden="true" /></button> : null}
              </div>
              <span className={styles.fine} data-warn={left < 60 || undefined}>{left > 0 ? `Valid for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}. ` : 'Expired. '}<button type="button" className={styles.textBtn} onClick={fresh}>New line</button>{' · '}<button type="button" className={styles.textBtn} onClick={() => setShowScript((s) => !s)} aria-expanded={showScript}>{showScript ? 'Hide' : 'No'} link-wallet.mjs?</button></span>
              {showScript ? (
                <div className={styles.example}>
                  <div className={styles.exampleHead}><span>Save as <code>app/agent/link-wallet.mjs</code>. It reads the keystore the way <code>bag</code> does and prints only a signature.</span><button type="button" onClick={async () => { if (await copyText(LINK_WALLET_SCRIPT)) toast({ tone: 'success', title: 'Script copied' }) }}><Copy aria-hidden="true" />Copy</button></div>
                  <pre>{LINK_WALLET_SCRIPT}</pre>
                </div>
              ) : null}
            </li>
            <li>
              <b>Paste what it prints</b>
              <textarea className={styles.paste} value={pasted} onChange={(e) => setPasted(e.target.value)} rows={3} spellCheck={false} placeholder={'{"wallet":"0x…","signature":"0x…"}'} aria-label="Signature from your seller" />
              {verdict ? (verdict.ok
                ? <span className={styles.ok}>Signed by your seller {short(verdict.wallet)} for agent #{agentId.toString()}.{sameAsSeller ? ' It is already the agent wallet.' : ''}</span>
                : <span className={styles.err}>This signature is not for agent #{agentId.toString()}, this owner and this line. Run the line shown above again.</span>) : null}
            </li>
          </ol>
          {error ? <ErrorNote error={error} /> : null}
          <div className={styles.actions}>
            <Button variant="primary" loading={busy} disabled={Boolean(address) && (!verdict?.ok || left <= 0 || Boolean(sameAsSeller) || (current !== null && !isOwner))} onClick={link}>
              {!address ? 'Connect the owner wallet' : current && !isOwner ? `Only the owner ${short(current.owner)} can link` : `Link ${verdict?.ok ? short(verdict.wallet) : 'the seller'} to agent #${agentId.toString()}`}
            </Button>
            <a className={styles.extLink} href={`https://${chainId === 97 ? 'testnet.' : ''}bscscan.com/address/${registry}`} target="_blank" rel="noreferrer">Registry<ArrowUpRight aria-hidden="true" /></a>
          </div>
          <p className={styles.fine}>Your wallet sends <code>setAgentWallet</code> on {chainId === 97 ? 'BSC testnet' : 'BSC mainnet'}; the seller&apos;s key never leaves its keystore.</p>
        </>
      )}
    </section>
  )
}
