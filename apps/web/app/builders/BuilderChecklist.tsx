'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Check, Circle, X, Radar, PenLine, Tag, FlaskConical, BadgeCheck } from 'lucide-react'
import { AddressChip, Button, ButtonLink, ErrorNote, Skeleton } from '../_components/ui'
import styles from './checklist.module.css'

/**
 * The builder checklist (DESIGN-SYSTEM.md 8.8): five checks read from the connected
 * wallet, the chain and the agent's endpoint, each with pass, fail with the exact fix,
 * or not yet, and the one action that moves it. The verdict itself is computed on the
 * server (packages/registry/src/quality.ts); this page never decides a check.
 */
type State = 'pass' | 'fail' | 'pending'
interface CheckView { id: 'identity' | 'proved' | 'callable' | 'classified' | 'tested'; label: string; state: State; reason: string; fix: string | null; note?: string | null }
interface IdentityView {
  identity: { chainId: 56 | 97; tokenId: string; agentKey: string; registry: string; owner: string | null; name: string | null; description: string | null; services: Array<{ kind: string; endpoint: string }> }
  verdict: { qualityListing: boolean; passed: number; checks: CheckView[] }
  category: string | null
  declared: string | null
  classified: { category: string | null; confidence: number | null; rationale: string | null }
  endpoint: string | null
  listed: boolean
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

export function BuilderChecklist() {
  const { address, isConnected } = useAccount()
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
    if (!address) return
    setLoading(true); setError(null)
    try {
      const q = extra ? `&chainId=${extra.chainId}&tokenId=${extra.tokenId}` : ''
      const r = await fetch(`/api/v1/builders/checks?wallet=${address}${q}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.detail ?? 'The checks could not be read.')
      const got = j.identities as IdentityView[]
      setList((prev) => {
        if (!extra) return got
        const rest = (prev ?? []).filter((x) => x.identity.agentKey !== got[0]?.identity.agentKey)
        return [...got, ...rest]
      })
      if (extra && got[0]) setSelected(got[0].identity.agentKey)
      else if (!extra) setSelected((s) => s ?? got[0]?.identity.agentKey ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The checks could not be read.')
    } finally { setLoading(false) }
  }, [address])

  useEffect(() => { setList(null); setSelected(null); if (address) void load() }, [address, load])

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
    const r = await fetch('/api/v1/builders/probe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: cur.identity.chainId, tokenId: cur.identity.tokenId, endpoint: endpoint.trim() }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.detail ?? 'The probe could not run.')
    return j.ok ? `Answered as callable in ${j.latencyMs} ms.` : `Did not reach a callable service (${j.liveness}): ${j.detail}`
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
    if (!testFor?.test) throw new Error('Security has no assertion-based Marque test yet, so it cannot complete the live test check.')
    const token = await claimToken()
    if (!token) return
    const r = await fetch('/api/v1/builders/claim/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claimToken: token, endpoint: endpoint.trim(), testId: testFor.test, kind: /\/mcp\b/i.test(endpoint) ? 'mcp' : 'a2a' }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.detail ?? 'The test could not run.')
    return j.error ? `${testFor.test}: no gradable answer (${String(j.error).slice(0, 140)}).` : `${testFor.test}: ${j.pass ? 'passed every field' : `answered; ${(j.diffs as Array<{ pass: boolean }>).filter((d) => !d.pass).length} fields off`}. Passing is not required.`
  })

  if (!isConnected || !address) {
    return (
      <div className={styles.connect}>
        <p className={styles.connectTitle}>Connect the wallet that owns your agent.</p>
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
      <div className={styles.picker}>
        <div className={styles.pickerHead}>
          <span className="t-label">Your agents</span>
          <AddressChip value={address} label="Wallet" />
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
            {cur.listed ? <span className={styles.listed}><Check aria-hidden="true" />Listed on Marque</span> : null}
          </header>

          <p className={styles.muted}>Availability evidence, last 24 hours: {cur.availability ? `${cur.availability.successes} successful calls in ${cur.availability.attempts} builder probes at the current endpoint.` : 'No recent measurement available.'} These are irregular samples, not a continuous uptime score. Keep the service running after listing.</p>
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

                    {c.id === 'proved' && c.state !== 'pass' && cur.identity.owner === address.toLowerCase() ? (
                      <div className={styles.actions}><Button size="sm" variant="primary" loading={busy === 'proved'} onClick={doProve}>Sign the proof</Button><span className={styles.muted}>No transaction, no gas.</span></div>
                    ) : null}

                    {c.id === 'callable' ? (
                      <div className={styles.actions}>
                        <input className={styles.input} aria-label="Endpoint to probe" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://your-agent.example/.well-known/agent-card.json" spellCheck={false} />
                        <Button size="sm" variant={c.state === 'pass' ? 'secondary' : 'primary'} loading={busy === 'callable'} disabled={!/^https:\/\//.test(endpoint.trim())} onClick={doProbe}>Probe now</Button>
                      </div>
                    ) : null}

                    {c.id === 'classified' && cur.identity.owner === address.toLowerCase() ? (
                      <div className={styles.actions}>
                        <select className={styles.input} aria-label="Declared category" value={declare} onChange={(e) => setDeclare(e.target.value)}>
                          <option value="">Choose a category</option>
                          {CATS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
                        </select>
                        <Button size="sm" loading={busy === 'classified'} disabled={!declare || declare === cur.declared} onClick={doDeclare}>Declare</Button>
                        {cur.classified.category ? <span className={styles.muted}>Its description reads as {CATS.find((x) => x.v === cur.classified.category)?.label ?? cur.classified.category}.</span> : null}
                      </div>
                    ) : null}

                    {c.id === 'tested' && c.state !== 'pass' && cur.identity.owner === address.toLowerCase() ? (
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

          {actionNote ? <p className={styles.actionNote} role="status">{actionNote}</p> : null}
          {actionError ? <ErrorNote error={{ title: actionError, action: 'Fix it and try again. Nothing on chain changed.' }} /> : null}

          {cur.verdict.qualityListing ? (
            <div className={styles.done}>
              <p className={styles.doneTitle}><Check aria-hidden="true" />Listed on Marque</p>
              <p className={styles.muted}>All five checks pass. The quest&apos;s fifth step reads this listing from Marque&apos;s records{cur.identity.chainId === 97 ? '; testnet agents are listed for the quest only, the marketplace shows mainnet supply' : ''}.</p>
              <div className={styles.actions}>
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
