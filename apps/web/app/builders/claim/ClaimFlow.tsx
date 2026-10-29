'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAccount, useSignMessage } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Button, LinkButton, Chip, ProvenanceChip } from '@marque/ui'
import styles from '../builders.module.css'
import { AgentPortraitControl } from '../../_components/profile/AgentPortraitControl'


interface Identity {
  agentId: string
  chainId: number
  tokenId: string
  contract: string
  owner: string
  ownerProvenance: 'ONCHAIN'
  indexerOwner: string | null
  indexerLag: boolean
  name: string | null
  description: string | null
  cardUrl: string | null
  declaredProtocols: string[]
}

interface Diff { field: string; pass: boolean; expected: string; actual: string; tolerance: string; detail?: string }
interface TestResult {
  conformanceResultId: number | null
  testId: string
  pass: boolean
  error: string | null
  latencyMs: number
  caseId: string
  blockNumber: string
  diffs: Diff[]
}

const CATEGORIES = [
  { v: 'rebalancing', label: 'Rebalancing', test: 'MCS-REB-1' },
  { v: 'grid', label: 'Grid trading', test: 'MCS-GRID-1' },
  { v: 'yield', label: 'Yield optimisation', test: 'MCS-YIELD-1' },
  { v: 'health_factor', label: 'Health factor', test: 'MCS-HF-1' },
  { v: 'security', label: 'Security', test: null },
] as const

const KINDS = [
  { v: 'a2a', label: 'A2A: agent card and message/send' },
  { v: 'mcp', label: 'MCP: streamable HTTP' },
  { v: 'x402', label: 'x402: per-call payment' },
  { v: 'erc8183', label: 'ERC-8183: commerce rail' },
] as const

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const scanOn = (chainId: number, path: string) => `https://${chainId === 97 ? 'testnet.' : ''}bscscan.com/${path}`

export function ClaimFlow() {
  // ?chain=97&token=N (from a build checklist or the practice lane): look that identity up at once.
  const params = useSearchParams()
  const [chainId, setChainId] = useState<56 | 97>(params.get('chain') === '97' ? 97 : 56)
  const scan = (path: string) => scanOn(chainId, path)
  // A connected wallet (including a Marque Pass) signs through wagmi; an injected wallet alone still works.
  const { address: connected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { openConnectModal } = useConnectModal()
  const [step, setStep] = useState<'find' | 'prove' | 'list' | 'done'>('find')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [input, setInput] = useState('')
  const [candidates, setCandidates] = useState<Array<{ tokenId: string; name: string | null }>>([])
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [message, setMessage] = useState('')
  const [nonceToken, setNonceToken] = useState('')

  const [wallet, setWallet] = useState<string | null>(null)
  const [claimToken, setClaimToken] = useState('')

  const [category, setCategory] = useState<string>('rebalancing')
  const [kind, setKind] = useState<string>('a2a')
  const [endpoint, setEndpoint] = useState('')
  const [inputs, setInputs] = useState('')
  const [outputs, setOutputs] = useState('')
  const [price, setPrice] = useState('')

  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState('')

  // The same token id on the other network, when the connected wallet owns it there (29 Oct): the most common
  // builder mistake is looking up a testnet agent on mainnet, where the same number is someone else's agent.
  const [otherNet, setOtherNet] = useState<{ chainId: 56 | 97; tokenId: string; name: string | null } | null>(null)
  const lookup = (value: string, chain: 56 | 97) => fetch('/api/v1/builders/claim/identity', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: value.trim(), ...(chain === 97 ? { chainId: 97 } : {}) }),
  })

  async function findIdentity(e?: React.FormEvent, tokenOverride?: string, chainOverride?: 56 | 97) {
    e?.preventDefault()
    const chain = chainOverride ?? chainId
    if (chainOverride) setChainId(chainOverride)
    setBusy(true); setError(null); setCandidates([]); setOtherNet(null)
    try {
      const res = await lookup(tokenOverride ?? input, chain)
      const body = await res.json()
      if (res.status === 409 && body.candidates) { setCandidates(body.candidates); setError(body.detail); return }
      if (!res.ok) { setError(body.detail ?? body.error ?? `lookup failed (${res.status})`); return }
      setIdentity(body.identity)
      setMessage(body.message)
      setNonceToken(body.nonceToken)
      setEndpoint(body.identity.cardUrl ?? '')
      setStep('prove')
      const owner = String(body.identity.owner ?? '').toLowerCase()
      if (connected && owner && owner !== connected.toLowerCase() && /^\d+$/.test(String(body.identity.tokenId))) {
        const other: 56 | 97 = chain === 97 ? 56 : 97
        void lookup(String(body.identity.tokenId), other).then((r) => (r.ok ? r.json() : null)).then((j: { identity?: Identity } | null) => {
          if (j?.identity && String(j.identity.owner).toLowerCase() === connected.toLowerCase()) setOtherNet({ chainId: other, tokenId: String(j.identity.tokenId), name: j.identity.name ?? null })
        }).catch(() => undefined)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the lookup failed')
    } finally { setBusy(false) }
  }

  const auto = useRef(false)
  useEffect(() => {
    const token = params.get('token')
    if (auto.current || !token || !/^\d{1,12}$/.test(token)) return
    auto.current = true
    setInput(token)
    void findIdentity(undefined, token)
  }, [])
  useEffect(() => { if (connected && step === 'prove' && !wallet) setWallet(connected) }, [connected, step])

  async function connect() {
    setError(null)
    if (connected) { setWallet(connected); return }
    if ((typeof window === 'undefined' || !window.ethereum) && openConnectModal) { openConnectModal(); return }
    if (typeof window === 'undefined' || !window.ethereum) {
      setError('No injected wallet found. Install one to prove control. Everything else on Marque works without a wallet.')
      return
    }
    try {
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
      setWallet(accounts[0] ?? null)
    } catch {
      setError('Wallet connection was rejected.')
    }
  }

  async function sign() {
    const viaWagmi = Boolean(connected && wallet && connected.toLowerCase() === wallet.toLowerCase())
    if (!identity || !wallet || (!viaWagmi && !window.ethereum)) return
    setBusy(true); setError(null)
    try {
      const signature = viaWagmi
        ? await signMessageAsync({ message })
        : (await window.ethereum!.request({ method: 'personal_sign', params: [message, wallet] })) as string
      const res = await fetch('/api/v1/builders/claim/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: identity.agentId, nonceToken, message, signature }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.detail ?? body.error ?? 'could not verify'); return }
      setClaimToken(body.claimToken)
      setStep('list')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'signing was cancelled')
    } finally { setBusy(false) }
  }

  async function runTest() {
    if (!claimToken || !endpoint) return
    if (!window.confirm('Send a real task to your declared service and publish the result? Continue only if it accepts this test without payment or other side effects.')) return
    setTesting(true); setError(null); setTestResult(null)
    try {
      const testId = CATEGORIES.find((c) => c.v === category)?.test
      if (!testId) { setError('No conformance test exists for this category yet.'); return }
      const res = await fetch('/api/v1/builders/claim/test', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ claimToken, endpoint: endpoint.trim(), testId, taskConsent: true, kind: kind === 'mcp' ? 'mcp' : 'a2a' }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.detail ?? body.error ?? `run failed (${res.status})`); return }
      setTestResult(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the run failed')
    } finally { setTesting(false) }
  }

  async function publish() {
    if (!claimToken) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/v1/builders/claim/publish', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          claimToken, category, serviceKind: kind, endpoint: endpoint.trim(),
          inputs: inputs.trim() || undefined, outputs: outputs.trim() || undefined,
          price: price.trim() || undefined,
          conformanceResultId: testResult?.conformanceResultId ?? null,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.detail ?? body.error ?? `publish failed (${res.status})`); return }
      setPublishedUrl(body.profileUrl)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'publish failed')
    } finally { setBusy(false) }
  }

  const walletIsOwner = wallet && identity && wallet.toLowerCase() === identity.owner.toLowerCase()
  const testCategory = CATEGORIES.find((c) => c.v === category)
  const failedDiffs = testResult?.diffs.filter((d) => !d.pass) ?? []

  return (
    <>
      {/* Step 1 — find the identity */}
      {step === 'find' && (
        <form onSubmit={findIdentity}>
          <div className={styles.field}>
            <label id="claim-net">Network your agent is registered on</label>
            <div className={styles.actions} role="radiogroup" aria-labelledby="claim-net" style={{ marginTop: 0 }}>
              {([56, 97] as const).map((c) => (
                <Button key={c} type="button" size="sm" variant={chainId === c ? 'primary' : 'quiet'} role="radio" aria-checked={chainId === c} onClick={() => setChainId(c)}>
                  {c === 56 ? 'BSC mainnet · 56' : 'BSC testnet · 97'}
                </Button>
              ))}
            </div>
            <span className={styles.hint}>The same token id is a different agent on each network. Agents made with BNB Agent Studio's testnet trial, or the Forge on testnet, are on BSC testnet.</span>
          </div>
          <div className={styles.field}>
            <label htmlFor="claim-input">ERC-8004 token id, or the owner address</label>
            <input
              id="claim-input" value={input} spellCheck={false} autoComplete="off" required
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 320933  ·  or  0xabc…"
            />
            <span className={styles.hint}>
              {chainId === 97
                ? 'On BSC testnet (97): give the token id. We read the identity contract directly for the current owner. A testnet listing goes in the practice lane.'
                : 'On BNB Smart Chain (56). We read the identity contract directly for the current owner: the index is only used to find which contract.'}
            </span>
          </div>
          {candidates.length > 0 && (
            <div className={styles.field}>
              <label>That address owns several. Pick one:</label>
              <div className={styles.actions}>
                {candidates.map((c) => (
                  <Button key={c.tokenId} variant="quiet" size="sm" type="button"
                    onClick={() => { setInput(c.tokenId); void findIdentity(undefined, c.tokenId) }}>
                    #{c.tokenId}{c.name ? ` · ${c.name}` : ''}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className={styles.actions}>
            <Button variant="primary" size="md" type="submit" disabled={busy}>
              {busy ? 'Reading the chain…' : 'Find identity'}
            </Button>
          </div>
        </form>
      )}

      {/* Step 2 — prove control */}
      {step === 'prove' && identity && (
        <div className={styles.section} style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className={styles.verdict}>
            <span className={styles.verdictWord}>#{identity.tokenId}</span>
            {identity.name && <Chip tone="chain">{identity.name}</Chip>}
            <Chip tone="chain">{chainId === 97 ? 'BSC testnet · 97' : 'BSC mainnet · 56'}</Chip>
          </div>
          {otherNet ? (
            <p className={styles.muted} role="status">
              Your connected wallet owns #{otherNet.tokenId}{otherNet.name ? ` (${otherNet.name})` : ''} on {otherNet.chainId === 97 ? 'BSC testnet' : 'BSC mainnet'}, not this one.{' '}
              <button type="button" className={styles.linkBtn} onClick={() => { setStep('find'); void findIdentity(undefined, otherNet.tokenId, otherNet.chainId) }}>Use #{otherNet.tokenId} on {otherNet.chainId === 97 ? 'BSC testnet' : 'BSC mainnet'}</button>
            </p>
          ) : null}
          {identity.description && <p className={styles.muted}>{identity.description}</p>}
          <table className={styles.diffs}>
            <tbody>
              <tr><td className="mono">Contract</td>
                <td className="mono"><a href={scan(`token/${identity.contract}`)} target="_blank" rel="noreferrer">{identity.contract}</a></td></tr>
              <tr><td className="mono">Owner now</td>
                <td className="mono">
                  <a href={scan(`address/${identity.owner}`)} target="_blank" rel="noreferrer">{identity.owner}</a>{' '}
                  <ProvenanceChip provenance="ONCHAIN" />
                </td></tr>
              {identity.indexerLag && (
                <tr><td className="mono">Index says</td>
                  <td className="mono wrap">{identity.indexerOwner} (stale). The chain value above is what must sign.</td></tr>
              )}
            </tbody>
          </table>

          <div className={styles.field} style={{ marginTop: 'var(--s4)' }}>
            <label>The message you will sign</label>
            <pre className={styles.warn} style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{message}</pre>
          </div>

          <div className={styles.actions}>
            {!wallet && <Button variant="primary" size="md" type="button" onClick={connect}>Connect wallet</Button>}
            {wallet && (
              <>
                <span className={styles.note}>Connected {short(wallet)}{walletIsOwner ? '' : ', not the owner'}</span>
                <Button variant="primary" size="md" type="button" disabled={busy || !walletIsOwner} onClick={sign}>
                  {busy ? 'Verifying…' : 'Sign to prove control'}
                </Button>
              </>
            )}
          </div>
          {wallet && !walletIsOwner && (
            <p className={styles.warn}>
              This wallet is {short(wallet)}. The identity is owned by {short(identity.owner)}. Switch
              accounts in your wallet to the owner and reconnect.
            </p>
          )}
        </div>
      )}

      {/* Step 3 — the listing + live test */}
      {step === 'list' && identity && (
        <div className={styles.section} style={{ borderTop: 'none', paddingTop: 0 }}>
          <p className={styles.note}>
            <ProvenanceChip provenance="ONCHAIN" /> Control of #{identity.tokenId} proven as {short(identity.owner)}.
            Fill the listing. No email, no approval queue.
          </p>

          <div className={styles.field}>
            <label htmlFor="claim-cat">Category</label>
            <select id="claim-cat" value={category} onChange={(e) => { setCategory(e.target.value); setTestResult(null) }}>
              {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="claim-kind">Interface</label>
            <select id="claim-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="claim-endpoint">Endpoint</label>
            <input id="claim-endpoint" type="url" value={endpoint} spellCheck={false} autoComplete="off"
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://your-agent.example/.well-known/agent-card.json" />
            <span className={styles.hint}>For A2A, the agent card URL. We read the card and call the <code>url</code> inside it.</span>
          </div>
          <div className={styles.field}>
            <label htmlFor="claim-inputs">What it takes</label>
            <input id="claim-inputs" value={inputs} onChange={(e) => setInputs(e.target.value)}
              placeholder="e.g. a position id and a target range" style={{ fontFamily: 'inherit' }} />
          </div>
          <div className={styles.field}>
            <label htmlFor="claim-outputs">What it returns</label>
            <input id="claim-outputs" value={outputs} onChange={(e) => setOutputs(e.target.value)}
              placeholder="e.g. a re-centre plan with tick bounds and amounts" style={{ fontFamily: 'inherit' }} />
          </div>
          <div className={styles.field}>
            <label htmlFor="claim-price">Price</label>
            <input id="claim-price" value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 0.15 U per call" style={{ fontFamily: 'inherit' }} />
            <span className={styles.hint}>Leave blank if you do not advertise one: the marketplace shows that as a finding, not a gap.</span>
          </div>
          <div className={styles.field}>
            <strong>Agent image · optional</strong>
            <span className={styles.hint}>Upload a PNG, JPEG or WebP and frame it: it shows on your agent's card and page on Marque at once. To show it on other marketplaces too, put the URL Marque gives you in your ERC-8004 registration file as <code>image</code>.</span>
            {identity && connected && connected.toLowerCase() === identity.owner.toLowerCase()
              ? <AgentPortraitControl owner={connected} agentId={identity.agentId} hasPortrait={false} onChanged={() => undefined} />
              : <span className={styles.hint}>Connect the wallet that owns #{identity?.tokenId} to upload one.</span>}
          </div>

          {testCategory?.test ? (
            <div className={styles.actions}>
              <Button variant="secondary" size="md" type="button" disabled={testing || !endpoint} onClick={runTest}>
                {testing ? 'Capturing a case and running…' : testResult ? 'Run again' : `Run ${testCategory.test} now`}
              </Button>
              {testResult && (
                <span className={`${styles.verdictWord} ${testResult.pass ? styles.pass : styles.fail}`} style={{ fontSize: 20 }}>
                  {testResult.error ? 'No gradable answer' : testResult.pass ? 'Pass' : 'Fail'}
                </span>
              )}
            </div>
          ) : (
            <p className={styles.note}>Security has no assertion-based conformance test (invariant 8). It publishes untested and is judged in the Ledger.</p>
          )}

          {testResult && !testResult.error && (
            <table className={styles.diffs}>
              <thead><tr><th>Field</th><th>Expected</th><th>Answer</th><th>Tolerance</th><th>Why it failed</th></tr></thead>
              <tbody>
                {[...failedDiffs, ...testResult.diffs.filter((d) => d.pass)].map((d) => (
                  <tr key={d.field} className={`${styles.diffRow} ${d.pass ? '' : styles.diffFail}`}>
                    <td className="mono">{d.field}</td><td className="mono">{d.expected}</td>
                    <td className="mono">{d.actual}</td><td className="mono">{d.tolerance}</td>
                    <td className="wrap">{d.pass ? '' : (d.detail ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {testResult?.error && (
            <p className={styles.warn}>Your endpoint did not return a gradable answer: {testResult.error}. You can still publish; it will show as untested.</p>
          )}

          <div className={styles.actions} style={{ marginTop: 'var(--s4)' }}>
            <Button variant="primary" size="md" type="button" disabled={busy || !endpoint} onClick={publish}>
              {busy ? 'Publishing…' : testResult && !testResult.error ? 'Publish with this result' : 'Publish'}
            </Button>
            {!testResult && testCategory?.test && (
              <span className={styles.note}>Publishing without running the test lists you as not yet tested.</span>
            )}
          </div>
        </div>
      )}

      {/* Step 4 — done */}
      {step === 'done' && identity && (
        <div className={styles.section} style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className={styles.verdict}>
            <span className={`${styles.verdictWord} ${styles.pass}`}>Listed</span>
            <Chip tone="chain">#{identity.tokenId}</Chip>
          </div>
          <p className={styles.muted}>
            {identity.name ?? `Identity #${identity.tokenId}`} is live in{' '}
            <Link href={`/register/${category === 'health_factor' ? 'health-factor' : category}`}>the marketplace</Link>{' '}
            under {testCategory?.label}. No email, no queue, no transaction.
          </p>
          <div className={styles.actions}>
            <LinkButton variant="primary" size="md" href={publishedUrl}>View the listing</LinkButton>
            <a className={styles.note} href="/builders/claim">List another</a>
          </div>
          <p className={styles.note}>
            The signature that proved your control is stored with the listing, so anyone can
            re-check it against <code className="mono">ownerOf({identity.tokenId})</code> without trusting us.
          </p>
        </div>
      )}

      {error && <p className={styles.warn} style={{ marginTop: 'var(--s4)' }}>{error}</p>}
    </>
  )
}
