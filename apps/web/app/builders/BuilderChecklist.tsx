'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Check, Circle, X, Radar, PenLine, Tag, FlaskConical, BadgeCheck } from 'lucide-react'
import { AddressChip, Button, ButtonLink, ErrorNote, Skeleton } from '../_components/ui'
import styles from './checklist.module.css'
import { SellerSummary } from './SellerSummary'
import type { SellerProjection } from '../../lib/seller'

/**
 * The builder checklist (DESIGN-SYSTEM.md 8.8): five checks read from the connected
 * wallet, the chain and the agent's endpoint, each with pass, fail with the exact fix,
 * or not yet, and the one action that moves it. The verdict itself is computed on the
 * server (packages/registry/src/quality.ts); this page never decides a check.
 */
type State = 'pass' | 'fail' | 'pending'
interface CheckView { id: 'identity' | 'proved' | 'callable' | 'classified' | 'tested'; label: string; state: State; reason: string; fix: string | null; note?: string | null }
interface IdentityView {
  seller?: SellerProjection
  identity: { chainId: 56 | 97; tokenId: string; agentKey: string; registry: string; owner: string | null; name: string | null; description: string | null; services: Array<{ kind: string; endpoint: string }> }
  verdict: { qualityListing: boolean; passed: number; checks: CheckView[] }
  category: string | null
  declared: string | null
  classified: { category: string | null; confidence: number | null; rationale: string | null }
  endpoint: string | null
  listed: boolean
  listingEvidence?: { ownerListed: boolean; qualityListed: boolean }
  availability?: {attempts:number; successes:number; scope:string}
}

const NET: Record<number, string> = { 56: 'BSC mainnet', 97: 'BSC testnet' }
const CATS = [
  { v: 'yield', label: 'Yield', test: 'MCS-YIELD-1' },
  { v: 'grid', label: 'Grid trading', test: 'MCS-GRID-1' },
  { v: 'rebalancing', label: 'Rebalancing', test: 'MCS-REB-1' },
  { v: 'health_factor', label: 'Health factor', test: 'MCS-HF-1' },
  { v: 'security', label: 'Security', test: null },
] as const
const ICON = { identity: BadgeCheck, proved: PenLine, callable: Radar, classified: Tag, tested: FlaskConical }
const tokenKey = (k: string) => `marque.claim.${k}`

function readClaim(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(tokenKey(key))
    if (!raw) return null
    const j = JSON.parse(raw) as { token: string; at: number }
    return Date.now() - j.at < 19 * 60_000 ? j.token : null
  } catch { return null }
}
function saveClaim(key: string, token: string) {
  try { sessionStorage.setItem(tokenKey(key), JSON.stringify({ token, at: Date.now() })) } catch { /* the claim still works for this page view */ }
}

function readClaimFor(chainId: number, tokenId: string): string | null {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(`marque.claim.${chainId}:`) && k.endsWith(`:${tokenId}`)) return readClaim(k.slice('marque.claim.'.length))
    }
  } catch { /* private diagnostics can be reauthorized */ }
  return null
}

export function BuilderChecklist() {
  const { address, isConnected } = useAccount()
  const [watchWallet, setWatchWallet] = useState('')
  const [walletInput, setWalletInput] = useState('')
  const wallet = watchWallet || address
  const loadSequence = useRef(0)
  const { openConnectModal } = useConnectModal()
  const { signMessageAsync } = useSignMessage()
  const [list, setList] = useState<IdentityView[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<string | null>(null)
  const [endpoint, setEndpoint] = useState('')
  const [declare, setDeclare] = useState('')
  const [lookNet, setLookNet] = useState<56 | 97>(56)
  const [lookToken, setLookToken] = useState('')

  const load = useCallback(async (extra?: { chainId: number; tokenId: string }) => {
    if (!wallet) return
    const seq = ++loadSequence.current
    setLoading(true); setError(null)
    try {
      const q = extra ? `&chainId=${extra.chainId}&tokenId=${extra.tokenId}` : ''
      const proofToken = extra && address?.toLowerCase() === wallet.toLowerCase() ? readClaimFor(extra.chainId, extra.tokenId) : null
      const r = await fetch(`/api/v1/builders/checks?wallet=${wallet}${q}`, { headers: proofToken ? { Authorization: `Bearer ${proofToken}` } : {}, cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.detail ?? 'The checks could not be read.')
      if (seq !== loadSequence.current) return
      const got = j.identities as IdentityView[]
      setList((prev) => {
        if (!extra) return got
        const rest = (prev ?? []).filter((x) => x.identity.agentKey !== got[0]?.identity.agentKey)
        return [...got, ...rest]
      })
      if (extra && got[0]) setSelected(got[0].identity.agentKey)
      else if (!extra) setSelected((s) => s ?? got[0]?.identity.agentKey ?? null)
    } catch (e) {
      if (seq === loadSequence.current) setError(e instanceof Error ? e.message : 'The checks could not be read.')
    } finally { if (seq === loadSequence.current) setLoading(false) }
  }, [wallet, address])

  useEffect(() => { ++loadSequence.current; setList(null); setSelected(null); if (wallet) void load() }, [wallet, load])
  // Door 2 hands off here with ?chain=&token= (SPEC-BUILDERS 4.6): prefill and check that identity.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const t = q.get('token'), c = q.get('chain') === '97' ? 97 : 56
    if (!t || !/^\d{1,12}$/.test(t)) return
    setLookNet(c); setLookToken(t)
    if (wallet) void load({ chainId: c, tokenId: t })
  }, [wallet, load])

  const cur = useMemo(() => list?.find((x) => x.identity.agentKey === selected) ?? null, [list, selected])
  useEffect(() => {
    if (!cur) return
    setEndpoint(cur.endpoint ?? cur.identity.services[0]?.endpoint ?? '')
    setDeclare(cur.declared ?? cur.category ?? cur.classified.category ?? '')
    setActionError(null); setActionNote(null)
  }, [cur?.identity.agentKey]) // reset the inputs only when the identity changes

  const refresh = async () => { if (cur) await load({ chainId: cur.identity.chainId, tokenId: cur.identity.tokenId }) }

  /** Sign the proof message: no transaction, no gas. Returns a 20 minute claim token. */
  const prove = async (): Promise<string | null> => {
    if (!cur || !address) return null
    const r = await fetch('/api/v1/builders/claim/identity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: cur.identity.tokenId, chainId: cur.identity.chainId }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.detail ?? 'The identity could not be read.')
    const signature = await signMessageAsync({ message: j.message as string })
    const v = await fetch('/api/v1/builders/claim/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: j.identity.agentId, nonceToken: j.nonceToken, message: j.message, signature }) })
    const vj = await v.json()
    if (!v.ok) throw new Error(vj.detail ?? 'The signature did not verify.')
    saveClaim(cur.identity.agentKey, vj.claimToken)
    return vj.claimToken as string
  }
  const claimToken = async () => (cur ? readClaim(cur.identity.agentKey) : null) ?? prove()

  const act = async (name: string, fn: () => Promise<string | null | void>) => {
    setBusy(name); setActionError(null); setActionNote(null)
    try {
      const note = await fn()
      if (note) setActionNote(note)
      await refresh()
    } catch (e) {
      const m = e instanceof Error ? e.message : 'That did not complete.'
      setActionError(/user rejected|denied|4001/i.test(m) ? 'You cancelled in your wallet. Nothing was signed.' : m)
    } finally { setBusy(null) }
  }

  const doProve = () => act('proved', async () => { await prove(); return 'Ownership proved. The signature is stored with the identity.' })
  const doProbe = () => act('callable', async () => {
    if (!cur) return
    if (!window.confirm('This checks your declared service. For A2A it sends "What can you do?" and records the result publicly. Continue only if you control it or have permission and it needs no payment or other side effects.')) return
    const r = await fetch('/api/v1/builders/probe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: cur.identity.chainId, tokenId: cur.identity.tokenId, endpoint: endpoint.trim(), taskConsent: true }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.detail ?? 'The probe could not run.')
    return `${j.discoveryOnly ? 'Discovery' : 'Call check'} (${j.liveness}), ${j.latencyMs} ms: ${j.detail}.`
  })
  const doDeclare = () => act('classified', async () => {
    const token = await claimToken()
    if (!token) return
    const r = await fetch('/api/v1/builders/declare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claimToken: token, category: declare }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.detail ?? 'The category could not be saved.')
    return `Declared ${CATS.find((c) => c.v === declare)?.label}.`
  })
  const testFor = CATS.find((c) => c.v === (cur?.category ?? declare))
  const doTest = () => act('tested', async () => {
    if (!window.confirm('This sends a real task to your declared service and records the result publicly. Continue only if you control it and it accepts this test without payment or other side effects.')) return
    if (!testFor?.test) throw new Error('Security has no assertion-based Marque test yet, so it cannot complete the live test check.')
    const token = await claimToken()
    if (!token) return
    const r = await fetch('/api/v1/builders/claim/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claimToken: token, endpoint: endpoint.trim(), testId: testFor.test, taskConsent: true, kind: /\/mcp\b/i.test(endpoint) ? 'mcp' : 'a2a' }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.detail ?? 'The test could not run.')
    return j.error ? `${testFor.test}: no gradable answer (${String(j.error).slice(0, 140)}).` : `${testFor.test}: ${j.pass ? 'passed every field' : `answered; ${(j.diffs as Array<{ pass: boolean }>).filter((d) => !d.pass).length} fields off`}. Passing is not required.`
  })
  const doPublish = () => act('publish', async () => {
    if (!cur || !cur.category || !cur.endpoint) throw new Error('Choose a category and declared endpoint first.')
    const token = await claimToken()
    if (!token) return
    const service = cur.identity.services.find(s => s.endpoint === cur.endpoint)
    if (!service || !['a2a', 'mcp'].includes(service.kind)) throw new Error('Choose the declared A2A or MCP service in the claim form before publishing.')
    const r = await fetch('/api/v1/builders/claim/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claimToken: token, category: cur.category, serviceKind: service.kind, endpoint: cur.endpoint }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.detail ?? 'The listing could not be published.')
    return 'Owner-listed. Local quality checks, service Warrants and official BNB qualification remain separate.'
  })

  const readLookup = <form className={styles.lookup} onSubmit={e => { e.preventDefault(); if (/^0x[0-9a-fA-F]{40}$/.test(walletInput.trim())) setWatchWallet(walletInput.trim()) }}><label htmlFor="seller-wallet">Read seller status without a wallet</label><input id="seller-wallet" aria-label="Seller owner address" placeholder="0x owner address" value={walletInput} onChange={e => setWalletInput(e.target.value)} /><Button type="submit" size="sm" disabled={!/^0x[0-9a-fA-F]{40}$/.test(walletInput.trim())}>Read status</Button>{watchWallet ? <Button size="sm" onClick={() => setWatchWallet('')}>Use connected wallet</Button> : null}</form>

  if (!wallet) {
    return (
      <div className={styles.connect}>
        <p className={styles.connectTitle}>Read seller status or connect to manage.</p>
        {readLookup}
        <p className={styles.muted}>The checks read its ERC-8004 identity on BSC mainnet and testnet. Connecting signs nothing.</p>
        <Button variant="primary" onClick={openConnectModal}>Connect wallet</Button>
        <ol className={styles.preview} aria-label="The five checks">
          {['You own its ERC-8004 identity', 'You proved it with a signature', 'Its endpoint answers a live call', 'It classifies into a quest category', 'It answered a live Marque test'].map((l) => (
            <li key={l}><span className={styles.dot} data-state="pending" aria-hidden="true"><Circle /></span>{l}</li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {readLookup}
      {!isConnected ? <Button onClick={openConnectModal}>Connect wallet to manage</Button> : null}
      <div className={styles.picker}>
        <div className={styles.pickerHead}>
          <span className="t-label">Seller identities</span>
          <AddressChip value={wallet} label="Owner" />
        </div>
        {list === null && loading ? <Skeleton h={44} /> : null}
        {list && list.length === 0 ? <p className={styles.muted}>No ERC-8004 identity owned by this wallet is indexed yet. Check one by its token id below.</p> : null}
        {list && list.length > 0 ? (
          <div className={styles.idTabs} role="tablist" aria-label="Your agents">
            {list.map((x) => (
              <button key={x.identity.agentKey} type="button" role="tab" aria-selected={x.identity.agentKey === selected} className={styles.idTab} onClick={() => setSelected(x.identity.agentKey)}>
                <span className={styles.idName}>{x.identity.name ?? `Identity #${x.identity.tokenId}`}</span>
                <span className={styles.idMeta}>#{x.identity.tokenId} · {NET[x.identity.chainId]} · {x.verdict.passed} of 5</span>
              </button>
            ))}
          </div>
        ) : null}
        <form className={styles.lookup} onSubmit={(e) => { e.preventDefault(); if (/^\d{1,12}$/.test(lookToken.trim())) void load({ chainId: lookNet, tokenId: lookToken.trim() }) }}>
          <label className={styles.lookupLabel} htmlFor="look-token">Check another identity</label>
          <select aria-label="Network" value={lookNet} onChange={(e) => setLookNet(Number(e.target.value) as 56 | 97)}>
            <option value={56}>BSC mainnet</option>
            <option value={97}>BSC testnet</option>
          </select>
          <input id="look-token" inputMode="numeric" placeholder="Token id, e.g. 2501" value={lookToken} onChange={(e) => setLookToken(e.target.value)} />
          <Button size="sm" type="submit" loading={loading && !!lookToken} disabled={!/^\d{1,12}$/.test(lookToken.trim())}>Check</Button>
        </form>
      </div>

      {error ? <ErrorNote error={{ title: error, action: 'Try again in a minute.' }} /> : null}

      {cur ? (
        <section className={styles.card} aria-labelledby="bc-title">
          <header className={styles.cardHead}>
            <div>
              <h2 id="bc-title" className={styles.cardTitle}>{cur.identity.name ?? `Identity #${cur.identity.tokenId}`}</h2>
              <p className={styles.idMeta}>ERC-8004 #{cur.identity.tokenId} · {NET[cur.identity.chainId]} · {cur.verdict.passed} of 5 checks pass</p>
            </div>
            {cur.listed ? <span className={styles.listed}><Check aria-hidden="true" />{cur.listingEvidence?.ownerListed ? 'Owner-listed' : 'Published record; recheck proof'}</span> : null}
          </header>

          <p className={styles.muted}>Availability evidence, last 24 hours: {cur.availability ? `${cur.availability.successes} successful observations in ${cur.availability.attempts} builder checks at the current endpoint.` : 'No recent measurement available.'} These are irregular samples, not a continuous uptime score. Keep the service running after listing.</p>
          <ol className={styles.checks}>
            {cur.verdict.checks.map((c) => {
              const Icon = ICON[c.id]
              return (
                <li key={c.id} className={styles.check} data-state={c.state}>
                  <span className={styles.dot} data-state={c.state} aria-hidden="true">{c.state === 'pass' ? <Check /> : c.state === 'fail' ? <X /> : <Icon />}</span>
                  <div className={styles.checkBody}>
                    <p className={styles.checkLabel}>{c.label} <span className={styles.stateWord}>{c.state === 'pass' ? 'Passed' : c.state === 'fail' ? 'Needs a fix' : 'Not yet'}</span></p>
                    <p className={styles.reason}>{c.reason}</p>
                    {c.note ? <p className={styles.noteLine}>{c.note}</p> : null}
                    {c.state !== 'pass' && c.fix ? <p className={styles.fix}>{c.fix}</p> : null}

                    {c.id === 'proved' && c.state !== 'pass' && !!address && cur.identity.owner === address.toLowerCase() ? (
                      <div className={styles.actions}><Button size="sm" variant="primary" loading={busy === 'proved'} onClick={doProve}>Sign the proof</Button><span className={styles.muted}>No transaction, no gas.</span></div>
                    ) : null}

                    {c.id === 'callable' && !!address && cur.identity.owner === address.toLowerCase() ? (
                      <div className={styles.actions}>
                        <input className={styles.input} aria-label="Endpoint to probe" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://your-agent.example/.well-known/agent-card.json" spellCheck={false} />
                        <Button size="sm" variant={c.state === 'pass' ? 'secondary' : 'primary'} loading={busy === 'callable'} disabled={!/^https:\/\//.test(endpoint.trim())} onClick={doProbe}>Check live call</Button>
                      </div>
                    ) : null}

                    {c.id === 'classified' && !!address && cur.identity.owner === address.toLowerCase() ? (
                      <div className={styles.actions}>
                        <select className={styles.input} aria-label="Declared category" value={declare} onChange={(e) => setDeclare(e.target.value)}>
                          <option value="">Choose a category</option>
                          {CATS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
                        </select>
                        <Button size="sm" loading={busy === 'classified'} disabled={!declare || declare === cur.declared} onClick={doDeclare}>Declare</Button>
                        {cur.classified.category ? <span className={styles.muted}>Its description reads as {CATS.find((x) => x.v === cur.classified.category)?.label ?? cur.classified.category}.</span> : null}
                      </div>
                    ) : null}

                    {c.id === 'tested' && c.state !== 'pass' && !!address && cur.identity.owner === address.toLowerCase() ? (
                      <div className={styles.actions}>
                        <Button size="sm" variant="primary" loading={busy === 'tested'} disabled={!testFor?.test || !/^https:\/\//.test(endpoint.trim())} onClick={doTest}>
                          {testFor?.test ? `Run ${testFor.test} now` : 'Choose a category first'}
                        </Button>
                        <span className={styles.muted}>A real task on real chain state. The result goes on the public record either way.</span>
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>

          {cur.seller ? <SellerSummary seller={cur.seller} /> : null}
          {!!address && cur.identity.owner === address.toLowerCase() ? <div className={styles.actions}><Button size="sm" loading={busy === 'diagnostics'} onClick={() => act('diagnostics', async () => { await claimToken(); return 'Owner proof checked; private diagnostics refreshed.' })}>Read owner diagnostics</Button></div> : null}

          {actionNote ? <p className={styles.actionNote} role="status">{actionNote}</p> : null}
          {actionError ? <ErrorNote error={{ title: actionError, action: 'Fix it and try again. Nothing on chain changed.' }} /> : null}

          {cur.verdict.qualityListing ? (
            <div className={styles.done}>
              <p className={styles.doneTitle}><Check aria-hidden="true" />{cur.listingEvidence?.qualityListed ? 'Quality-listed; five local checks pass' : 'Five local checks pass; publish current details'}</p>
              <p className={styles.muted}>Reading this checklist does not publish. A Warrant requires a separate passing service test; hireability needs a current quote. BNB determines official qualification{cur.identity.chainId === 97 ? '; testnet listings appear in builder checks, and the public marketplace shows mainnet supply' : ''}.</p>
              <div className={styles.actions}>
                {!cur.listingEvidence?.qualityListed && !!address && cur.identity.owner === address.toLowerCase() ? <Button size="sm" variant="primary" loading={busy === 'publish'} onClick={doPublish}>Publish my listing</Button> : null}
                <ButtonLink href="/builders/claim" size="sm">Edit listing details</ButtonLink>
                <ButtonLink href="/quest" size="sm" variant="primary">See your quest</ButtonLink>
                {cur.identity.chainId === 56 ? <ButtonLink href={`/agents/56/${cur.identity.tokenId}`} size="sm">Open its storefront</ButtonLink> : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
