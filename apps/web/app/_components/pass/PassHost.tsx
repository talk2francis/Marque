'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { decodeFunctionData, erc20Abi, formatUnits, parseAbi, type Hex } from 'viem'
import type { PrivateKeyAccount } from 'viem/accounts'
import { agenticCommerceAbi, evaluatorRouterAbi } from '@marque/commerce/client'
import { createPass, restorePass, unlockPass, exportKey as deriveExport, loadRecord, UNSUPPORTED_REASON, type ConfirmRequest, type PassRecord } from '@marque/pass'
import { registerHost, heldAccount, holdAccount } from './bridge'
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
])

/** The transaction in the same plain words the hire sheet uses. */
export function describe(req: Extract<ConfirmRequest, { kind: 'transaction' }>): string {
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
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run(async () => { const r = await createPass(); (pending as Extract<Pending, { kind: 'onboard' }>).resolve(r); setPending(null) })}>{busy ? 'Waiting for your passkey…' : 'Create a Marque Pass'}</button>
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
      <h2 id="pass-title" className={styles.title}>{req.kind === 'transaction' ? describe(req) : req.kind === 'message' ? 'Sign a message' : 'Sign structured data'}</h2>
      <dl className={styles.rows}>
        <div><dt>Network</dt><dd>{net}{req.chainId === 97 ? ' · test tokens, no real value' : ''}</dd></div>
        {req.kind === 'transaction' ? <div><dt>Network fee</dt><dd>{req.sponsored ? `None if BNB Chain’s MegaFuel sponsors it, as it offers to; otherwise about ${Number(formatUnits(req.feeWei, 18)).toPrecision(2)} ${req.chainId === 97 ? 'tBNB' : 'BNB'}` : `about ${Number(formatUnits(req.feeWei, 18)).toPrecision(2)} ${req.chainId === 97 ? 'tBNB' : 'BNB'}`}</dd></div> : null}
        {req.kind === 'message' ? <div><dt>Message</dt><dd className={styles.msg}>{req.message.slice(0, 600)}</dd></div> : null}
      </dl>
      {req.chainId === 56 ? <p className={styles.warn}>Marque Pass is best for small amounts. For larger balances, use a hardware or app wallet.</p> : null}
      {req.kind === 'transaction' ? (
        <details className={styles.raw}>
          <summary>Transaction details</summary>
          <p>To <code>{req.tx.to}</code></p>
          {req.tx.value > 0n ? <p>Value {formatUnits(req.tx.value, 18)}</p> : null}
          <p className={styles.data}><code>{req.tx.data as Hex}</code></p>
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
