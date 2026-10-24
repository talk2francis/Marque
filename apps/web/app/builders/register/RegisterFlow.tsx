'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { getPublicClient, switchChain, waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { formatEther } from 'viem'
import { ArrowUpRight, Copy } from 'lucide-react'
import { dataUri, friendlyError, NETWORKS, registerCall, registeredAgent, registrationJson, registrationText, type ForgeCategory, type FriendlyError } from '@marque/commerce/client'
import { Button, ButtonLink, ErrorNote } from '../../_components/ui'
import { copyText } from '../../../lib/clipboard'
import { toast } from '../../../lib/toast'
import { explorerTx } from '../../../lib/network'
import { CardCheck, type CardCheckView } from '../CardCheck'
import { LaunchKit } from '../LaunchKit'
import { NoWalletLine } from '../../_components/pass/NoWalletLine'
import { markForge } from '../ForgeRail'
import styles from '../forge.module.css'

/**
 * Door 2 (SPEC-BUILDERS 4): register an agent that already has an endpoint, from Marque. The card is
 * checked first so nobody registers a broken agent; the registration file is hosted by the builder (or
 * carried on chain as a data URI); the builder's own wallet signs `register`. Marque never registers on
 * anyone's behalf, never pays the gas and never holds the key.
 */
const CATS: Array<{ v: ForgeCategory; label: string }> = [
  { v: 'health_factor', label: 'Health factor' }, { v: 'yield', label: 'Yield' }, { v: 'grid', label: 'Grid trading' },
  { v: 'rebalancing', label: 'Rebalancing' }, { v: 'security', label: 'Security' },
]
type Phase = 'details' | 'card' | 'file' | 'sign' | 'done'
const PHASES: Array<{ id: Phase; label: string }> = [{ id: 'details', label: 'Details' }, { id: 'card', label: 'Card' }, { id: 'file', label: 'File' }, { id: 'sign', label: 'Sign' }, { id: 'done', label: 'Registered' }]

async function sha256(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function RegisterFlow() {
  const config = useConfig()
  const { address, chainId: walletChain } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [phase, setPhase] = useState<Phase>('details')
  const [f, setF] = useState({ name: '', description: '', category: 'health_factor' as ForgeCategory, cardUrl: '', mcpUrl: '', imageUrl: '', chainId: 97 as 56 | 97 })
  const [card, setCard] = useState<CardCheckView | null>(null)
  const [hosting, setHosting] = useState<'domain' | 'data'>('domain')
  const [hostedOk, setHostedOk] = useState<string | null>(null)
  const [hostNote, setHostNote] = useState<string | null>(null)
  const [fee, setFee] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FriendlyError | null>(null)
  const [done, setDone] = useState<{ agentId: bigint; tx: `0x${string}`; uri: string } | null>(null)

  // Restore the draft (not the result) after a reload.
  useEffect(() => { try { const d = JSON.parse(localStorage.getItem('marque:forge:register') ?? 'null'); if (d) setF((x) => ({ ...x, ...d })) } catch { /* fresh */ } }, [])
  useEffect(() => { try { localStorage.setItem('marque:forge:register', JSON.stringify(f)) } catch { /* fine */ } }, [f])

  const input = useMemo(() => ({ name: f.name, description: f.description, category: f.category, a2aCardUrl: f.cardUrl.trim(), mcpUrl: f.mcpUrl.trim() || null, imageUrl: f.imageUrl.trim() || null }), [f])
  const text = useMemo(() => registrationText(registrationJson(input)), [input])
  // Beside the card: an agent served under a path keeps its path (…/agent/.well-known/agent-registration.json).
  const hostUrl = useMemo(() => {
    try {
      const u = new URL(f.cardUrl.trim())
      const base = u.pathname.includes('/.well-known/') ? u.pathname.slice(0, u.pathname.indexOf('/.well-known/')) : ''
      return `${u.origin}${base}/.well-known/agent-registration.json`
    } catch { return '' }
  }, [f.cardUrl])
  const uri = hosting === 'data' ? dataUri(text) : hostUrl
  const n = NETWORKS[f.chainId]
  const net = f.chainId === 97 ? 'BSC testnet' : 'BSC mainnet'
  const unit = f.chainId === 97 ? 'tBNB' : 'BNB'
  const detailsOk = f.name.trim().length >= 2 && f.description.trim().length >= 10 && /^https:\/\//.test(f.cardUrl.trim())

  // A fee estimate once a wallet is present on the sign step; the wallet shows the final number.
  useEffect(() => {
    if (phase !== 'sign' || !address) return
    let live = true
    ;(async () => {
      try {
        const pc = getPublicClient(config, { chainId: f.chainId })
        if (!pc) return
        const c = registerCall(n.identityRegistry, uri)
        const [gas, price] = await Promise.all([pc.estimateContractGas({ ...c, account: address }), pc.getGasPrice()])
        if (live) setFee(Number(formatEther(gas * price)).toLocaleString('en-US', { maximumSignificantDigits: 2 }))
      } catch { if (live) setFee(null) }
    })()
    return () => { live = false }
  }, [phase, address, f.chainId, uri, config, n.identityRegistry])

  const checkHosted = async () => {
    setHostNote(null)
    const r = await fetch(`/api/v1/builders/registration-check?url=${encodeURIComponent(hostUrl)}&sha256=${await sha256(text)}`).then((x) => x.json()).catch(() => null) as { match?: boolean; detail?: string } | null
    if (r?.match) setHostedOk(hostUrl)
    setHostNote(r?.detail ?? 'The check could not run just now.')
  }

  const sign = async () => {
    if (!address) { openConnectModal?.(); return }
    setBusy(true); setError(null)
    try {
      if (walletChain !== f.chainId) await switchChain(config, { chainId: f.chainId })
      const c = registerCall(n.identityRegistry, uri)
      const tx = await writeContract(config, { ...c, chainId: f.chainId })
      const receipt = await waitForTransactionReceipt(config, { hash: tx, chainId: f.chainId })
      if (receipt.status !== 'success') throw new Error('reverted')
      const got = registeredAgent(receipt.logs, n.identityRegistry)
      if (!got) throw new Error('no Registered event')
      setDone({ agentId: got.agentId, tx, uri })
      // Index it now so My Marque and the quest build track show it at once (best effort; the sweep also finds it).
      void fetch('/api/v1/builders/index', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: f.chainId, tokenId: got.agentId.toString() }) }).catch(() => undefined)
      setPhase('done')
      markForge('register', { chain: String(f.chainId), token: got.agentId.toString() })
      try { localStorage.removeItem('marque:forge:register') } catch { /* fine */ }
      toast({ tone: 'success', title: `Registered as agent #${got.agentId}`, href: explorerTx(f.chainId, tx) })
    } catch (e) { setError(friendlyError(e)) } finally { setBusy(false) }
  }

  const phaseIdx = PHASES.findIndex((p) => p.id === phase)
  return (
    <div className={styles.flow}>
      <ol className={styles.phases} aria-label="Registration steps">
        {PHASES.map((p, i) => <li key={p.id} data-done={i < phaseIdx || undefined} aria-current={p.id === phase ? 'step' : undefined}>{p.label}</li>)}
      </ol>

      {phase === 'details' ? (
        <section className={styles.panel} aria-labelledby="d-title">
          <h2 id="d-title">Your agent</h2>
          <div className={styles.fields}>
            <label>Name<input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Lattice Mini" /></label>
            <label>Category<select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ForgeCategory })}>{CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}</select></label>
            <label className={styles.wide}>One-line description<input value={f.description} maxLength={200} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Plans PancakeSwap V3 ranges on valid ticks for any position." /></label>
            <label className={styles.wide}>A2A agent card URL <span>required</span><input value={f.cardUrl} onChange={(e) => setF({ ...f, cardUrl: e.target.value })} placeholder="https://your-domain/.well-known/agent-card.json" spellCheck={false} inputMode="url" /></label>
            <label>MCP URL <span>optional</span><input value={f.mcpUrl} onChange={(e) => setF({ ...f, mcpUrl: e.target.value })} placeholder="https://your-domain/mcp" spellCheck={false} inputMode="url" /></label>
            <label>Image URL <span>optional</span><input value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} placeholder="Leave empty for a generated avatar" spellCheck={false} inputMode="url" /></label>
          </div>
          <fieldset className={styles.netPick}>
            <legend>Network</legend>
            {([97, 56] as const).map((c) => (
              <label key={c} data-on={f.chainId === c || undefined}>
                <input type="radio" name="net" checked={f.chainId === c} onChange={() => setF({ ...f, chainId: c })} />
                <b>{c === 97 ? 'BSC testnet' : 'BSC mainnet'}</b>
                <span>{c === 97 ? 'Free test BNB. Counts for Set and Earn the same as mainnet.' : 'Real BNB for the network fee. Buyers pay with real tokens.'}</span>
              </label>
            ))}
          </fieldset>
          <div className={styles.actions}><Button variant="primary" disabled={!detailsOk} onClick={() => setPhase('card')}>Check the card</Button></div>
        </section>
      ) : null}

      {phase === 'card' ? (
        <section className={styles.panel} aria-labelledby="c-title">
          <h2 id="c-title">Card check</h2>
          <p className={styles.lede}>Checked before anything is registered, so nobody registers a broken agent.</p>
          <CardCheck initialUrl={f.cardUrl} category={f.category} onResult={(r) => { setCard(r); if (r?.url) setF((x) => ({ ...x, cardUrl: r.url })) }} />
          <div className={styles.actions}>
            <Button onClick={() => setPhase('details')}>Back</Button>
            <Button variant="primary" disabled={!card?.ok} onClick={() => setPhase('file')}>Continue</Button>
          </div>
        </section>
      ) : null}

      {phase === 'file' ? (
        <section className={styles.panel} aria-labelledby="f-title">
          <h2 id="f-title">Registration file</h2>
          <div className={styles.hostPick} role="radiogroup" aria-label="Where the file lives">
            <button type="button" role="radio" aria-checked={hosting === 'domain'} data-on={hosting === 'domain' || undefined} onClick={() => setHosting('domain')}><b>On your domain</b><span>Recommended. Also counts as a domain agent card.</span></button>
            <button type="button" role="radio" aria-checked={hosting === 'data'} data-on={hosting === 'data' || undefined} onClick={() => setHosting('data')}><b>On chain</b><span>No hosting. A data URI costs a little more gas ({text.length.toLocaleString('en-US')} bytes).</span></button>
          </div>
          <div className={styles.example}>
            <div className={styles.exampleHead}><span>{hosting === 'domain' ? <>Host exactly this at <code>{hostUrl || 'your-domain/.well-known/agent-registration.json'}</code></> : 'Carried on chain as a data URI'}</span><button type="button" onClick={async () => { if (await copyText(text)) toast({ tone: 'success', title: 'File copied' }) }}><Copy aria-hidden="true" />Copy</button></div>
            <pre>{text}</pre>
          </div>
          {hosting === 'domain' ? (
            <div className={styles.hostCheck}>
              <Button onClick={checkHosted} disabled={!hostUrl}>Check it is hosted</Button>
              {hostNote ? <p className={hostedOk === hostUrl ? styles.ok : styles.err}>{hostNote}</p> : null}
            </div>
          ) : null}
          <div className={styles.actions}>
            <Button onClick={() => setPhase('card')}>Back</Button>
            <Button variant="primary" disabled={hosting === 'domain' && hostedOk !== hostUrl} onClick={() => setPhase('sign')}>Continue</Button>
          </div>
        </section>
      ) : null}

      {phase === 'sign' ? (
        <section className={styles.panel} aria-labelledby="s-title">
          <h2 id="s-title">Sign the registration</h2>
          <p className={styles.plain}>Register &lsquo;{f.name.trim()}&rsquo; as a new agent on {net}. You will own it.{fee ? <> Network fee about {fee} {unit}.</> : <> Your wallet shows the network fee.</>}</p>
          <dl className={styles.callFacts}>
            <div><dt>Contract</dt><dd className="mono">ERC-8004 IdentityRegistry {n.identityRegistry}</dd></div>
            <div><dt>Call</dt><dd className="mono">register(string agentURI, (string,bytes)[] metadata)</dd></div>
            <div><dt>agentURI</dt><dd className="mono">{hosting === 'data' ? `data:application/json;base64,… (${uri.length.toLocaleString('en-US')} characters)` : uri}</dd></div>
            <div><dt>metadata</dt><dd className="mono">launched_with = &quot;Marque Forge · https://marque.trade/builders&quot;</dd></div>
          </dl>
          <p className={styles.fine}>Your wallet signs and pays the fee. Marque never registers on anyone&apos;s behalf and never holds a key.</p>
          {!address ? <NoWalletLine chainId={f.chainId} /> : null}
          <p className={styles.fine}>Buyers&apos; quotes must be signed by the agent wallet on this identity, which starts as the wallet that registers it. If your seller signs with its own key (a BNB Agent Studio seller does), register from that key instead with <code>bag erc8004 register</code>, then <a href="/builders/run">check and list it in Door 1</a>.</p>
          {error ? <ErrorNote error={error} /> : null}
          <div className={styles.actions}>
            <Button onClick={() => setPhase('file')} disabled={busy}>Back</Button>
            <Button variant="primary" loading={busy} onClick={sign}>{address ? `Register on ${net}` : 'Connect a wallet'}</Button>
          </div>
        </section>
      ) : null}

      {phase === 'done' && done ? (
        <section className={styles.panel} aria-labelledby="ok-title">
          <h2 id="ok-title">Registered: agent #{done.agentId.toString()}</h2>
          <dl className={styles.callFacts}>
            <div><dt>Network</dt><dd>{net} · {f.chainId}</dd></div>
            <div><dt>Registry</dt><dd className="mono">{n.identityRegistry}</dd></div>
            <div><dt>Transaction</dt><dd><a href={explorerTx(f.chainId, done.tx)} target="_blank" rel="noreferrer" className="mono">{done.tx.slice(0, 18)}…<ArrowUpRight aria-hidden="true" /></a></dd></div>
          </dl>
          {hosting === 'domain' ? (
            <div className={styles.example}>
              <div className={styles.exampleHead}><span>Re-host the file with its own id, at the same address</span><button type="button" onClick={async () => { if (await copyText(registrationText(registrationJson(input, { chainId: f.chainId, registry: n.identityRegistry, agentId: done.agentId })))) toast({ tone: 'success', title: 'File copied' }) }}><Copy aria-hidden="true" />Copy</button></div>
              <pre>{registrationText(registrationJson(input, { chainId: f.chainId, registry: n.identityRegistry, agentId: done.agentId }))}</pre>
            </div>
          ) : null}
          <div className={styles.actions}>
            <ButtonLink variant="primary" href={`/builders/run?chain=${f.chainId}&token=${done.agentId}`}>Run the listing checks</ButtonLink>
            <ButtonLink href={`/me?view=agents`}>See it in My Marque</ButtonLink>
          </div>
          <LaunchKit agentId={`${f.chainId}:${n.identityRegistry.toLowerCase()}:${done.agentId}`} chainId={f.chainId} tokenId={done.agentId.toString()} name={f.name.trim()} category={f.category} priceLabel={null} warrant={null} />
        </section>
      ) : null}
    </div>
  )
}
