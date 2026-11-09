'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { decodeFunctionData, erc20Abi, formatUnits, parseAbi, type Hex } from 'viem'
import type { PrivateKeyAccount } from 'viem/accounts'
import { agenticCommerceAbi, evaluatorRouterAbi } from '@marque/commerce/client'
import { CHARTER_CHAINS, charterFactoryAbi, loanGuardAbi, marketOf, type CharterChainId } from '@marque/charters/client'
import { createPass, restorePass, unlockPass, exportKey as deriveExport, loadRecord, UNSUPPORTED_REASON, type ConfirmRequest, type PassRecord } from '@marque/pass'
import { registerHost, heldAccount, holdAccount } from './bridge'
import { track } from '../../../lib/track'
import styles from './pass.module.css'

/**
 * Marque Pass dialogs (SPEC-ACCESS 2.3): create or restore, the confirmation Marque renders for
 * every signature (there is no wallet window), and export. Every passkey prompt starts from a click
 * in one of these dialogs, so it always has the user's gesture, and nothing ever signs silently.
 */
type Pending =
  | { kind: 'onboard'; resolve: (r: PassRecord) => void; reject: (e: Error) => void }
  | { kind: 'confirm'; req: ConfirmRequest; resolve: (a: PrivateKeyAccount) => void; reject: (e: Error) => void }
  | { kind: 'export' }
  | { kind: 'about' }

const cancelled = () => Object.assign(new Error('You cancelled. Nothing was signed.'), { code: 4001 })
const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0xc70b8741b8b07a6d61e54fd4b20f22fa648e5565': { symbol: 'test U', decimals: 18 },
  '0xce24439f2d9c6a2289f741120fe202248b666666': { symbol: 'U', decimals: 18 },
  '0x55d398326f99059ff775485246999027b3197955': { symbol: 'USDT', decimals: 18 },
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': { symbol: 'USDC', decimals: 18 },
}
// The Loan Guard reserve tokens, by chain (testnet USDT and USDC have 6 decimals).
const tokenOf = (chainId: number, address: string) => {
  const m = (CHARTER_CHAINS[chainId as CharterChainId]?.markets ?? []).find((x) => x.token.toLowerCase() === address.toLowerCase())
  return m ? { symbol: m.symbol, decimals: m.decimals } : TOKENS[address.toLowerCase()]
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const health = (v: unknown) => (Number(BigInt(String(v)) / 10n ** 14n) / 10_000).toFixed(2)
const day = (v: unknown) => new Date(Number(v) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
type Call = { to: Hex; data: Hex; value: bigint }

/** A Loan Guard call in plain words, or null when it is not one. `batch` is the whole confirmation, for context. */
function describeCharter(chainId: number, tx: Call, batch: readonly Call[]): string | null {
  const chain = CHARTER_CHAINS[chainId as CharterChainId]
  if (!chain) return null
  try {
    const d = decodeFunctionData({ abi: charterFactoryAbi, data: tx.data })
    if (d.functionName === 'create' && chain.factory && tx.to.toLowerCase() === chain.factory.toLowerCase()) {
      const [p] = d.args as unknown as [{ vDebt: string; trigger: bigint; target: bigint; budget: bigint; tip: bigint; expiresAt: bigint }]
      const m = marketOf(chainId as CharterChainId, p.vDebt)
      const budget = m ? `${formatUnits(p.budget, m.decimals)} ${m.symbol}` : 'its budget'
      return `Create your Loan Guard: below health ${health(p.trigger)} it repays your ${m?.symbol ?? ''} loan back to ${health(p.target)}, using at most ${budget} from your wallet, until ${day(p.expiresAt)}`.replace('  ', ' ')
    }
  } catch { /* not the factory */ }
  try {
    const d = decodeFunctionData({ abi: loanGuardAbi, data: tx.data })
    if (d.functionName === 'end') return `End the Loan Guard ${short(tx.to)} for good. It moves no money`
    if (d.functionName === 'act') return `Protect your loan now: the guard ${short(tx.to)} repays what Venus says it needs, within its budget`
  } catch { /* not a guard call */ }
  try {
    const d = decodeFunctionData({ abi: erc20Abi, data: tx.data })
    if (d.functionName !== 'approve') return null
    const [spender, amount] = d.args as [string, bigint]
    const t = tokenOf(chainId, tx.to)
    if (amount === 0n) return `Clear the ${t?.symbol ?? 'token'} allowance you gave ${short(spender)}`
    const creates = batch.some((c) => chain.factory && c.to.toLowerCase() === chain.factory.toLowerCase())
    if (creates) return `Allow your new Loan Guard (${short(spender)}) to take up to ${formatUnits(amount, t?.decimals ?? 18)} ${t?.symbol ?? 'tokens'}, only when your loan needs it`
  } catch { /* not an approval */ }
  return null
}

/** Venus Core Pool markets Marque builds for (Act on the answer), by vToken. */
const VENUS: Record<string, string> = {
  '0xfd5840cd36d94d7229439859c0112a4185bc0255': 'vUSDT', '0xeca88125a5adbe82614ffc12d0db554e2e2867c8': 'vUSDC',
}
const extraAbi = parseAbi([
  'function requestTokens()',
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'function register(string agentURI, (string metadataKey, bytes metadataValue)[] metadata) returns (uint256 agentId)',
  'function repayBorrow(uint256 repayAmount) returns (uint256)',
  'function mint(uint256 mintAmount) returns (uint256)',
  'function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)',
  'function setAgentURI(uint256 agentId, string newURI)',
])

/** The transaction in the same plain words the hire sheet uses. */
export function describe(req: Extract<ConfirmRequest, { kind: 'transaction' }>, batch: readonly Call[] = [req.tx]): string {
  const charter = describeCharter(req.chainId, req.tx, batch)
  if (charter) return charter
  const data = req.tx.data
  for (const abi of [agenticCommerceAbi, evaluatorRouterAbi, erc20Abi, extraAbi] as const) {
    try {
      const d = decodeFunctionData({ abi: abi as never, data }) as { functionName: string; args?: readonly unknown[] }
      const a = d.args ?? []
      switch (d.functionName) {
        case 'createJob': case 'createJobWithToken': return 'Open a job with the agent in BNB Chain’s escrow'
        case 'registerJob': return 'Turn on buyer protection for the job'
        case 'setBudget': return 'Lock the agreed price on the job'
        case 'fund': { return `Pay ${formatUnits(BigInt(String(a[1] ?? 0)), 18)} ${req.chainId === 97 ? 'test U' : 'U'} into escrow for job #${String(a[0])}` }
        case 'approve': {
          const t = TOKENS[req.tx.to.toLowerCase()]
          const spender = VENUS[String(a[0]).toLowerCase()]
          return `Allow ${spender ? `Venus ${spender}` : 'the escrow'} to take exactly ${formatUnits(BigInt(String(a[1] ?? 0)), t?.decimals ?? 18)} ${t?.symbol ?? 'tokens'}`
        }
        case 'repayBorrow': return `Repay ${formatUnits(BigInt(String(a[0] ?? 0)), 18)} of your own ${VENUS[req.tx.to.toLowerCase()]?.slice(1) ?? ''} borrow on Venus`.replace('  ', ' ')
        case 'mint': return `Supply ${formatUnits(BigInt(String(a[0] ?? 0)), 18)} ${VENUS[req.tx.to.toLowerCase()]?.slice(1) ?? ''} to Venus, credited to your wallet`.replace('  ', ' ')
        case 'requestTokens': return 'Claim 10 test U from the public test U faucet'
        case 'giveFeedback': return `Rate the agent ${Number(a[1]) / 10 ** Number(a[2] ?? 0) / 20} of 5 on its public record`
        case 'claimRefund': return `Reclaim the payment for job #${String(a[0])}`
        case 'setAgentWallet': return `Let agent #${String(a[0])} answer with your seller's key ${String(a[1]).slice(0, 6)}…${String(a[1]).slice(-4)}, so buyers accept its quotes`
        case 'setAgentURI': return `Update agent #${String(a[0])}'s name, description and image in the ERC-8004 registry`
        case 'register': return `Register a new agent on ERC-8004 (${req.chainId === 97 ? 'BSC testnet' : 'BSC mainnet'}). You will own it`
        case 'transfer': { const t = TOKENS[req.tx.to.toLowerCase()]; return `Send ${formatUnits(BigInt(String(a[1] ?? 0)), t?.decimals ?? 18)} ${t?.symbol ?? 'tokens'} to ${String(a[0]).slice(0, 8)}…` }
        default: return `Call ${d.functionName} on ${req.tx.to.slice(0, 8)}…`
      }
    } catch { /* not this ABI */ }
  }
  return req.tx.value > 0n ? `Send ${formatUnits(req.tx.value, 18)} ${req.chainId === 97 ? 'tBNB' : 'BNB'} to ${req.tx.to.slice(0, 8)}…` : `Call the contract ${req.tx.to.slice(0, 8)}…`
}

export function PassHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => registerHost({
    onboard: () => new Promise<PassRecord>((resolve, reject) => { setError(null); setPending({ kind: 'onboard', resolve, reject }) }),
    confirm: (req) => new Promise<PrivateKeyAccount>((resolve, reject) => { setError(null); setPending({ kind: 'confirm', req, resolve, reject }) }),
    exportKey: async () => { setError(null); setPending({ kind: 'export' }) },
    about: () => setPending({ kind: 'about' }),
  }), [])

  const close = useCallback(() => {
    if (pending && (pending.kind === 'onboard' || pending.kind === 'confirm')) pending.reject(cancelled())
    setPending(null); setBusy(false); setError(null)
  }, [pending])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, busy, close])

  if (!mounted || !pending) return null
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await work() } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/NotAllowed|abort|cancel/i.test(msg) ? 'The passkey prompt was closed. Nothing was signed.' : msg === UNSUPPORTED_REASON ? UNSUPPORTED_REASON : msg.slice(0, 200))
    } finally { setBusy(false) }
  }

  return createPortal(
    <div className={styles.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close() }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="pass-title" data-pass-dialog="">
        {pending.kind === 'onboard' ? (
          <>
            <h2 id="pass-title" className={styles.title}>Marque Pass</h2>
            <ul className={styles.facts}>
              <li>A wallet made from your passkey: Face ID, fingerprint or your device PIN.</li>
              <li>Your key is made on this device from your passkey. Marque never sees it.</li>
              <li>Works on BSC mainnet and on the free practice network. Best for small amounts: for larger balances, use a hardware or app wallet.</li>
              <li>You can export the key any time, behind a fresh passkey prompt.</li>
            </ul>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.actions}>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run(async () => { const r = await createPass(); track('pass_created'); (pending as Extract<Pending, { kind: 'onboard' }>).resolve(r); setPending(null) })}>{busy ? 'Waiting for your passkey…' : 'Create a Marque Pass'}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { const r = await restorePass(); (pending as Extract<Pending, { kind: 'onboard' }>).resolve(r); setPending(null) })}>I already have one</button>
              <button type="button" className={styles.text} disabled={busy} onClick={close}>Cancel</button>
            </div>
          </>
        ) : pending.kind === 'confirm' ? <Confirm pending={pending} busy={busy} error={error} run={run} close={close} done={() => setPending(null)} />
          : pending.kind === 'export' ? <Export close={close} />
            : (
              <>
                <h2 id="pass-title" className={styles.title}>What is a Marque Pass?</h2>
                <ul className={styles.facts}>
                  <li>An ordinary BNB Chain wallet whose key your passkey makes, on your device, each time you confirm.</li>
                  <li>Marque never sees or keeps the key; it keeps only your public address in this browser.</li>
                  <li>The same synced passkey opens the same address on your other devices.</li>
                  <li>It works on BSC mainnet and testnet. For larger amounts, use a hardware or app wallet.</li>
                </ul>
                <div className={styles.actions}><button type="button" className="btn" onClick={close}>Close</button></div>
              </>
            )}
      </div>
    </div>,
    document.body,
  )
}

function Confirm({ pending, busy, error, run, close, done }: {
  pending: Extract<Pending, { kind: 'confirm' }>; busy: boolean; error: string | null
  run: (w: () => Promise<void>) => Promise<void>; close: () => void; done: () => void
}) {
  const req = pending.req
  const held = heldAccount()
  const net = req.chainId === 97 ? 'BSC testnet' : 'BSC mainnet'
  const go = () => run(async () => {
    const record = loadRecord()
    if (!record) throw new Error('This Pass is not set up on this device any more.')
    const account = heldAccount() ?? await unlockPass(record)
    holdAccount(account)
    pending.resolve(account)
    done()
  })
  return (
    <>
      <h2 id="pass-title" className={styles.title}>{req.kind === 'transaction' ? describe(req) : req.kind === 'calls' ? `${req.calls.length} steps, one confirmation` : req.kind === 'message' ? 'Sign a message' : 'Sign structured data'}</h2>
      {req.kind === 'calls' ? (
        <ol className={styles.steps}>
          {req.calls.map((c, i) => <li key={i}>{describe({ kind: 'transaction', chainId: req.chainId, tx: c, feeWei: 0n, sponsored: false }, req.calls)}</li>)}
        </ol>
      ) : null}
      <dl className={styles.rows}>
        <div><dt>Network</dt><dd>{net}{req.chainId === 97 ? ' · test tokens, no real value' : ''}</dd></div>
        {req.kind === 'calls' ? <div><dt>Network fee</dt><dd>{`about ${Number(formatUnits(req.feeWei, 18)).toPrecision(2)} ${req.chainId === 97 ? 'tBNB' : 'BNB'} for all ${req.calls.length}, sent one after another`}</dd></div> : null}
        {req.kind === 'transaction' ? <div><dt>Network fee</dt><dd>{req.sponsored ? `None if BNB Chain’s MegaFuel sponsors it, as it offers to; otherwise about ${Number(formatUnits(req.feeWei, 18)).toPrecision(2)} ${req.chainId === 97 ? 'tBNB' : 'BNB'}` : `about ${Number(formatUnits(req.feeWei, 18)).toPrecision(2)} ${req.chainId === 97 ? 'tBNB' : 'BNB'}`}</dd></div> : null}
        {req.kind === 'message' ? <div><dt>Message</dt><dd className={styles.msg}>{req.message.slice(0, 600)}</dd></div> : null}
      </dl>
      {req.chainId === 56 ? <p className={styles.warn}>Marque Pass is best for small amounts. For larger balances, use a hardware or app wallet.</p> : null}
      {req.kind === 'transaction' || req.kind === 'calls' ? (
        <details className={styles.raw}>
          <summary>Transaction details</summary>
          {(req.kind === 'calls' ? req.calls : [req.tx]).map((tx, i) => (
            <div key={i}>
              <p>{req.kind === 'calls' ? `${i + 1}. ` : ''}To <code>{tx.to}</code></p>
              {tx.value > 0n ? <p>Value {formatUnits(tx.value, 18)}</p> : null}
              <p className={styles.data}><code>{tx.data as Hex}</code></p>
            </div>
          ))}
        </details>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={go} autoFocus>{busy ? 'Waiting for your passkey…' : held ? 'Confirm' : 'Confirm with passkey'}</button>
        <button type="button" className={styles.text} disabled={busy} onClick={close}>Cancel</button>
      </div>
      {held ? <p className={styles.fine}>Your passkey unlocked this Pass a moment ago; it locks again within 2 minutes or when you leave the tab.</p> : null}
    </>
  )
}

function Export({ close }: { close: () => void }) {
  const [key, setKey] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const reveal = async () => {
    setBusy(true); setError(null)
    try {
      const record = loadRecord()
      if (!record) throw new Error('No Pass on this device.')
      setKey(await deriveExport(record))
      timer.current = setTimeout(() => { setKey(null); setShown(false) }, 60_000)
    } catch (e) { setError(e instanceof Error && !/NotAllowed/i.test(e.message) ? e.message : 'The passkey prompt was closed.') } finally { setBusy(false) }
  }
  return (
    <>
      <h2 id="pass-title" className={styles.title}>Export your key</h2>
      <p className={styles.warn}>Anyone with this key controls the wallet. Marque will never ask you for it.</p>
      {key ? (
        <>
          <p className={styles.key}><code>{shown ? key : `${key.slice(0, 4)}${'•'.repeat(24)}${key.slice(-4)}`}</code></p>
          <div className={styles.actions}>
            <button type="button" className="btn" onClick={() => setShown((s) => !s)}>{shown ? 'Hide' : 'Reveal'}</button>
            <button type="button" className="btn" onClick={() => { void navigator.clipboard.writeText(key).catch(() => undefined) }}>Copy</button>
            <button type="button" className={styles.text} onClick={() => { setKey(null); close() }}>Done</button>
          </div>
          <p className={styles.fine}>It hides itself after 60 seconds.</p>
        </>
      ) : (
        <>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={reveal}>{busy ? 'Waiting for your passkey…' : 'Confirm with passkey'}</button>
            <button type="button" className={styles.text} onClick={close}>Cancel</button>
          </div>
        </>
      )}
    </>
  )
}
