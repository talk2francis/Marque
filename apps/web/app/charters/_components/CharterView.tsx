'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { switchChain } from '@wagmi/core'
import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem'
import { Check, ExternalLink, ShieldCheck, X } from 'lucide-react'
import { CHARTER_CHAINS, loanGuardAbi, KEEL_WATCHER, type CharterChainId } from '@marque/charters/client'
import type { guardDetail } from '../../../lib/guards'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { useFocusTrap } from '../../_components/ui'
import { tokens } from '../../../lib/charters-builder'
import { HealthHistory } from './HealthHistory'
import { useCalls } from './useCalls'
import styles from './charter.module.css'

/**
 * A charter's page (03_EXPERIENCE sections 2, 4 and 5): what it is in one sentence, what the chain says now, what
 * it has done (onchain events only), who can press the button, how to check every claim yourself, and End for the
 * owner. Re-read every 30 seconds; every live number carries its block and read time.
 */
export type GuardDetail = NonNullable<Awaited<ReturnType<typeof guardDetail>>>

const CHAIN_NAME: Record<CharterChainId, string> = { 56: 'BNB Smart Chain', 97: 'BSC testnet' }
const WAD = 10n ** 18n
const h = (v: string | null | undefined) => (v === null || v === undefined ? null : Number((BigInt(v) * 10_000n) / WAD) / 10_000)
const h2 = (v: string | null | undefined) => { const x = h(v); return x === null ? 'n/a' : x > 100 ? 'over 100' : x.toFixed(2) }
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
const dayShort = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '')
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'time not yet read')
const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  return s < 60 ? `${s} seconds ago` : s < 3600 ? `${Math.round(s / 60)} minutes ago` : `${Math.round(s / 3600)} hours ago`
}

type Pill = { label: string; tone: 'moss' | 'amber' | 'ink' }

export function CharterView({ initial, teamOwner }: { initial: GuardDetail; teamOwner: boolean }) {
  const config = useConfig()
  const { address: wallet, chainId: walletChain } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [d, setD] = useState(initial)
  // The server's read time first, so the first client render matches the server's; the clock ticks from there.
  const [now, setNow] = useState(() => Date.parse(initial.readAt))
  useEffect(() => setNow(Date.now()), [])
  const [stale, setStale] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const end = useCalls()
  const protect = useCalls()
  const g = d.guard
  const chainId = g.chainId as CharterChainId
  const chain = CHARTER_CHAINS[chainId]
  const explorer = chain.explorer

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/guards/${chainId}/${g.address}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      setD(await r.json() as GuardDetail); setStale(false)
    } catch { setStale(true) }
  }, [chainId, g.address])
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); if (document.visibilityState === 'visible') void refresh() }, 30_000)
    const tick = setInterval(() => setNow(Date.now()), 5_000)
    return () => { clearInterval(t); clearInterval(tick) }
  }, [refresh])

  const isOwner = Boolean(wallet && wallet.toLowerCase() === g.owner.toLowerCase())
  const sym = g.symbol
  const dec = g.decimals
  const budget = BigInt(g.budget)
  const spent = BigInt(g.spent)
  const left = budget > spent ? budget - spent : 0n
  const trigger = h(g.trigger)!
  const target = h(g.target)!
  const live = d.live
  const allowance = d.reserve ? BigInt(d.reserve.allowance) : null
  const balance = d.reserve ? BigInt(d.reserve.balance) : null
  const usable = allowance !== null && balance !== null ? (allowance < balance ? allowance : balance) : null
  const ended = g.status === 'ended'
  const expired = g.status === 'expired'
  const daysLeft = Math.max(0, Math.ceil((Date.parse(g.expiresAt) - now) / 86_400_000))
  const keel = d.keel

  const pill: Pill = ended || expired ? { label: ended ? 'Ended' : 'Expired', tone: 'ink' }
    : protect.state === 'pending' || live.state === 'would_act' ? { label: 'Acting', tone: 'amber' }
      : live.state === 'no_funds' || live.state === 'cannot_rescue' || (usable !== null && usable < left) ? { label: 'Needs you', tone: 'amber' }
        : { label: 'Armed', tone: 'moss' }

  // The one status line, in the words of section 5.
  const status = (() => {
    if (ended) {
      // Only the owner can end a guard.
      const revokePending = keel && keel.status !== 'revoked' && keel.status !== 'failed'
      return `Ended${isOwner ? ' by you' : ' by its owner'} on ${day(g.endedAt)}. It can never act again.${revokePending ? ' Keel\u2019s key revocation is still pending on Altana.' : ''}`
    }
    if (expired) return `This charter ended on ${day(g.expiresAt)}.`
    if (left === 0n) return `All ${tokens(budget, dec)} ${sym} of this charter’s budget has been used. Grant a new charter to keep guarding.`
    switch (live.state) {
      case 'watching': return `Watching. Health ${h2(live.health)} is above your ${trigger.toFixed(2)}.`
      case 'would_act': return `Health ${h2(live.health)} is under your ${trigger.toFixed(2)}. An agent can act now.`
      case 'no_funds': return 'Health is under your trigger, but there is nothing the guard can use: your wallet or allowance is empty, or the budget is spent.'
      case 'cannot_rescue': return `Health ${h2(live.health)} is under 1.00, and the most this guard may repay would not lift it back to 1.00, so it will not spend. Repay directly on Venus, or add collateral.`
      case 'no_debt': return `There is no ${sym} debt in this market now. Nothing to guard until there is.`
      case 'unavailable': return live.unavailableReason === 'price'
        ? 'Venus’s price for this market is unavailable right now, so no action can happen. Nothing moved.'
        : 'The chain could not be read just now. Checking again.'
      default: return ''
    }
  })()

  // The timeline: onchain events only, newest first.
  const timeline = useMemo(() => {
    const items: Array<{ key: string; at: string | null; tone: 'moss' | 'ink' | 'amber'; title: string; body: string; tx?: string | null; receipt?: Array<[string, string]> }> = []
    for (const e of d.events) {
      const x = e.data ?? {}
      if (e.kind === 'GuardCreated') items.push({ key: e.txHash, at: e.at, tone: 'ink', title: 'Charter granted', body: `${isOwner ? 'You' : 'The owner'} allowed up to ${tokens(budget, dec)} ${sym} and created it. No money moved.`, tx: e.txHash })
      if (e.kind === 'Acted') {
        const who = e.callerKind === 'keel' ? 'Keel' : e.callerKind === 'backup' ? 'Marque’s backup watcher' : e.callerKind === 'owner' ? (isOwner ? 'You' : 'The owner') : `An agent (${short(e.caller ?? '')})`
        const tip = BigInt(x['tipPaid'] ?? '0')
        items.push({
          key: `${e.txHash}-${e.logIndex}`, at: e.at, tone: 'moss',
          title: `${who} repaid ${tokens(BigInt(x['repaid'] ?? '0'), dec)} ${sym}`,
          body: `Venus showed health ${h2(x['healthBefore'])}, under the ${trigger.toFixed(2)} trigger. The guard repaid the loan back to ${h2(x['healthAfter'])} in one transaction.`,
          tx: e.txHash,
          receipt: [
            ['Health', `${h2(x['healthBefore'])} to ${h2(x['healthAfter'])}`],
            ['The loan', `${tokens(BigInt(x['debtBefore'] ?? '0'), dec)} to ${tokens(BigInt(x['debtAfter'] ?? '0'), dec)} ${sym}`],
            ['Network fee', e.callerKind === 'keel' ? 'paid by Keel' : e.callerKind === 'backup' ? 'paid by Marque’s backup watcher' : 'paid by the caller'],
            ...(tip > 0n ? [['Thank-you', `${tokens(tip, dec)} ${sym}`] as [string, string]] : []),
          ],
        })
      }
      if (e.kind === 'Ended') items.push({ key: e.txHash, at: e.at, tone: 'ink', title: 'Charter ended', body: 'It can never act again. Ending moved no money.', tx: e.txHash })
    }
    if (keel?.grantTx) items.push({ key: `key-${keel.grantTx}`, at: null, tone: 'ink', title: 'Keel’s key registered', body: `Altana KeyStore records a key for Keel that can call only act() on this guard${keel.expiry ? `, until ${dayShort(keel.expiry)}` : ''}.`, tx: keel.grantTx })
    if (keel?.revokeTx) items.push({ key: `rev-${keel.revokeTx}`, at: null, tone: 'ink', title: 'Keel’s key revoked', body: 'Altana KeyStore shows the key revoked.', tx: keel.revokeTx })
    if (expired) items.push({ key: 'expired', at: g.expiresAt, tone: 'ink', title: 'Charter expired', body: 'It reached its end date and can never act again.' })
    // Key lines carry no block time of their own: they sit after the grant, before anything later.
    const created = items.find((i) => i.title === 'Charter granted')?.at ?? g.createdAt
    return items.map((i) => ({ ...i, sortAt: Date.parse(i.at ?? created) + (i.at ? 0 : 1) })).sort((a, b) => b.sortAt - a.sortAt)
  }, [d.events, keel, isOwner, budget, dec, sym, trigger, expired, g.expiresAt, g.createdAt])

  const history = useMemo(() => d.history.filter((p) => p.health !== null).map((p) => ({ at: p.at, health: h(p.health)!, blockNumber: p.blockNumber })), [d.history])
  const actions = useMemo(() => d.events.filter((e) => e.kind === 'Acted' && e.at).map((e) => ({
    at: e.at!, before: h(e.data?.['healthBefore'])!, after: h(e.data?.['healthAfter'])!,
    label: `${e.callerKind === 'keel' ? 'Keel' : e.callerKind === 'backup' ? 'Backup' : e.callerKind === 'owner' ? 'Owner' : 'Agent'} repaid ${tokens(BigInt(e.data?.['repaid'] ?? '0'), dec)} ${sym}`,
  })), [d.events, dec, sym])

  const wrongChain = Boolean(wallet && walletChain !== chainId)
  const needChain = async () => { if (wrongChain) await switchChain(config, { chainId }).catch(() => undefined) }
  const doProtect = async () => {
    if (!wallet) { openConnectModal?.(); return }
    await needChain()
    if (await protect.run(wallet, chainId, [{ to: g.address as Address, data: encodeFunctionData({ abi: loanGuardAbi, functionName: 'act' }) }])) void refresh()
  }
  const doEnd = async (clear: boolean) => {
    if (!wallet) return
    await needChain()
    const calls: Array<{ to: Address; data: Hex }> = []
    if (!ended) calls.push({ to: g.address as Address, data: encodeFunctionData({ abi: loanGuardAbi, functionName: 'end' }) })
    if (clear) calls.push({ to: g.token as Address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [g.address as Address, 0n] }) })
    if (calls.length && await end.run(wallet, chainId, calls)) { setEndOpen(false); void refresh() }
  }

  const keelLine = (() => {
    if (!keel) return ended || expired ? 'did not hold a key for this charter' : 'registering its key on Altana'
    if (keel.status === 'registered') return `via Altana, active until ${dayShort(keel.expiry)}`
    if (keel.status === 'revoked') return 'key revoked'
    if (keel.status === 'revoking') return 'revoking its key'
    if (keel.status === 'failed') return 'its key is not registered; the backup watcher is covering'
    return 'registering its key on Altana'
  })()
  const backupActed = [...d.events].reverse().find((e) => e.kind === 'Acted' && e.callerKind === 'backup')

  return (
    <div className={styles.view}>
      {!d.indexed ? <p className={styles.notice}>Just created. Marque&apos;s index will list it within a minute; everything on this page is read from the chain.</p> : null}
      {teamOwner ? <p className={styles.notice}>A Marque team test charter.</p> : null}

      <header className={styles.top}>
        <span className={styles.pill} data-tone={pill.tone}><i aria-hidden="true" />{pill.label}</span>
        <h1 className={styles.title}>Guards the {sym} loan of {short(g.owner)} on Venus. Acts below {trigger.toFixed(2)}, lifts back to {target.toFixed(2)}.</h1>
        <p className={styles.meta}>
          Granted {day(g.createdAt)}. {ended ? `Ended ${day(g.endedAt)}.` : `Ends ${day(g.expiresAt)}.`} {CHAIN_NAME[chainId]}.{' '}
          <span title={live.blockNumber ? `Read at block ${live.blockNumber}` : undefined}>Last checked {ago(live.readAt, now)}{live.blockNumber ? `, block ${Number(live.blockNumber).toLocaleString('en-US')}` : ''}.</span>
          {stale ? ' Checking again.' : ''}
        </p>
      </header>

      <div className={styles.grid}>
        <div className={styles.main}>
          <p className={styles.status} data-tone={pill.tone} role="status">{status}</p>
          {!ended && !expired && usable !== null && usable < left ? (
            <div className={styles.attention}>
              <p>{balance !== null && balance < left ? `Your wallet holds ${tokens(balance, dec)} ${sym}` : `The allowance to this guard is ${tokens(allowance ?? 0n, dec)} ${sym}`}, but this guard may use up to {tokens(left, dec)}. It will repay only what is there.</p>
            </div>
          ) : null}

          <dl className={styles.facts}>
            <div title={live.blockNumber ? `Onchain, block ${live.blockNumber}, read ${when(live.readAt)}` : undefined}>
              <dt>Health now</dt><dd className="mono">{ended || expired ? 'not read' : h2(live.health)}</dd>
            </div>
            <div title={`Onchain: budget ${g.budget}, spent ${g.spent}`}>
              <dt>{sym} left of {tokens(budget, dec)}</dt><dd className="mono">{tokens(left, dec)}</dd>
              <span className={styles.meter} aria-hidden="true"><i style={{ width: `${budget > 0n ? Number((left * 1000n) / budget) / 10 : 0}%` }} /></span>
            </div>
            <div title="Onchain: Acted events"><dt>Times it acted</dt><dd className="mono">{g.acts}</dd></div>
            <div><dt>{ended || expired ? 'Status' : 'Days left'}</dt><dd className="mono">{ended ? 'ended' : expired ? 'expired' : daysLeft}</dd></div>
          </dl>

          <section aria-labelledby="hist-h">
            <h2 id="hist-h" className={styles.h2}>Health over time</h2>
            <HealthHistory points={history} actions={actions} trigger={trigger} target={target} from={Date.parse(g.createdAt)} to={ended && g.endedAt ? Date.parse(g.endedAt) : Math.min(now, Date.parse(g.expiresAt))} />
          </section>

          <section aria-labelledby="tl-h">
            <h2 id="tl-h" className={styles.h2}>What happened</h2>
            {timeline.length === 0 ? <p className={styles.fine}>Nothing yet beyond the grant. Every action will appear here with its transaction.</p> : (
              <ol className={styles.timeline}>
                {timeline.map((i) => (
                  <li key={i.key} data-tone={i.tone}>
                    <span className={styles.tlWhen}>{i.at ? when(i.at) : ''}</span>
                    <span className={styles.tlDot} aria-hidden="true" />
                    <div className={styles.tlBody}>
                      <b>{i.title}</b>
                      <p>{i.body}</p>
                      {i.receipt ? <dl className={styles.receipt}>{i.receipt.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : null}
                      {i.tx ? <a href={`${explorer}/tx/${i.tx}`} target="_blank" rel="noreferrer">Transaction on {chainId === 97 ? 'testnet ' : ''}BscScan<ExternalLink aria-hidden="true" /></a> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className={styles.side}>
          <section className={styles.card} aria-labelledby="who-h">
            <h2 id="who-h" className={styles.h3}>Who can press the button</h2>
            <ul className={styles.watchers}>
              <li><AgentAvatar id="keel" reference size={28} /><span><b>Keel</b> {keelLine}</span></li>
              <li><span className={styles.icon} aria-hidden="true"><ShieldCheck /></span><span><b>Backup watcher</b>, {backupActed ? `last acted ${when(backupActed.at)}` : 'standing by'}</span></li>
              <li><span className={styles.icon} aria-hidden="true"><Check /></span><span><b>You</b>, when health is below {trigger.toFixed(2)}</span></li>
            </ul>
            {!ended && !expired ? (
              <>
                <button type="button" className={styles.protect} disabled={live.state !== 'would_act' || protect.state === 'signing' || protect.state === 'pending'} onClick={() => void doProtect()}>
                  {protect.state === 'signing' ? 'Waiting for your wallet…' : protect.state === 'pending' ? 'Repaying now…' : 'Protect now'}
                </button>
                <p className={styles.fine}>{live.state === 'would_act' ? 'Repaying now is the same one thing any watcher would do. We will show the result when the chain confirms it.' : `Opens when Venus shows health under ${trigger.toFixed(2)}.`} Anyone else may press it too. It only ever does the same one thing.</p>
                {protect.error ? <p className={styles.error} role="alert">{protect.error}</p> : null}
              </>
            ) : null}
          </section>

          <section className={styles.card} aria-labelledby="verify-h">
            <h2 id="verify-h" className={styles.h3}>Check it yourself</h2>
            <ul className={styles.checks}>
              <Check2 ok={d.madeByFactory === true}>{d.madeByFactory === true ? 'Made by Marque’s charter factory' : d.madeByFactory === false ? 'Not made by Marque’s charter factory' : 'Factory check could not be read just now'}{d.factory ? <> <a href={`${explorer}/address/${d.factory}#readContract`} target="_blank" rel="noreferrer">isGuard</a></> : null}</Check2>
              <Check2 ok>No admin, no upgrade, no owner change: the guard&apos;s rules are fixed in its code</Check2>
              <Check2 ok={allowance !== null}>{allowance !== null ? `Allowance ${tokens(allowance, dec)} ${sym}, to this guard only` : 'Allowance not read just now'}</Check2>
              <Check2 ok={keel?.status === 'registered'}>{keel?.status === 'registered' ? <>Keel&apos;s key is live on <a href={`${explorer}/address/${d.keyStore}#readContract`} target="_blank" rel="noreferrer">Altana KeyStore</a>{keel.keyId ? <span className="mono"> {short(keel.keyId)}</span> : null}</> : `Keel’s key: ${keelLine}`}</Check2>
            </ul>
            <dl className={styles.addrs}>
              <div><dt>Guard</dt><dd><a className="mono" href={`${explorer}/address/${g.address}`} target="_blank" rel="noreferrer">{short(g.address)}</a></dd></div>
              <div><dt>Read its preview()</dt><dd><a href={`${explorer}/address/${g.address}#readContract`} target="_blank" rel="noreferrer">BscScan</a></dd></div>
              <div><dt>Keel&apos;s watcher</dt><dd><a className="mono" href={`${explorer}/address/${KEEL_WATCHER}`} target="_blank" rel="noreferrer">{short(KEEL_WATCHER)}</a></dd></div>
            </dl>
            <p className={styles.fine}>The guard&apos;s source is published on BscScan on launch day; until then its bytecode is checked against the factory above.</p>
          </section>

          <section className={styles.card} aria-labelledby="end-h">
            <h2 id="end-h" className={styles.h3}>{ended || expired ? 'Allowance' : 'End this charter'}</h2>
            {isOwner ? (
              ended || expired ? (
                allowance !== null && allowance > 0n ? (
                  <>
                    <p className={styles.fine}>This guard can never act again, but your wallet still allows it {tokens(allowance, dec)} {sym}. Clearing it is tidy, not urgent.</p>
                    <button type="button" className={styles.endBtn} disabled={end.state === 'signing' || end.state === 'pending'} onClick={() => void doEnd(true)}>{end.state === 'signing' || end.state === 'pending' ? 'Clearing…' : 'Clear allowance'}</button>
                  </>
                ) : <p className={styles.fine}>Nothing left to clear: the allowance to this guard is zero.</p>
              ) : (
                <>
                  <button type="button" className={styles.endBtn} onClick={() => { end.reset(); setEndOpen(true) }}>End charter</button>
                  <p className={styles.fine}>Ending stops every future action at once. It moves no money. You can also clear the allowance in the same step.</p>
                </>
              )
            ) : <p className={styles.fine}>{wallet ? 'Only the owner can end this charter.' : 'Only the owner can end this charter. '}{!wallet && openConnectModal ? <button type="button" className={styles.link} onClick={openConnectModal}>Connect</button> : null}</p>}
            {end.error && !endOpen ? <p className={styles.error} role="alert">{end.error}</p> : null}
          </section>
        </aside>
      </div>

      {endOpen ? <EndDialog allowance={allowance} sym={sym} dec={dec} state={end.state} error={end.error} onClose={() => setEndOpen(false)} onEnd={(clear) => void doEnd(clear)} /> : null}
    </div>
  )
}

function Check2({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li data-ok={ok ? 'true' : 'false'}>{ok ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}<span>{children}</span></li>
}

function EndDialog({ allowance, sym, dec, state, error, onClose, onEnd }: {
  allowance: bigint | null; sym: string; dec: number; state: string; error: string | null; onClose: () => void; onEnd: (clear: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const busy = state === 'signing' || state === 'pending'
  const [clear, setClear] = useState(Boolean(allowance && allowance > 0n))
  useFocusTrap(ref, true, () => { if (!busy) onClose() })
  return (
    <div className={styles.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={styles.dialog} ref={ref} role="dialog" aria-modal="true" aria-labelledby="end-title">
        <h2 id="end-title" className={styles.h3}>End this charter?</h2>
        <p>Ending stops every future action at once. It moves no money.</p>
        {allowance !== null && allowance > 0n ? (
          <label className={styles.check}><input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} disabled={busy} />Also clear the {tokens(allowance, dec)} {sym} allowance</label>
        ) : null}
        <p className={styles.fine}>{busy ? 'Ending. An action already submitted may still finish first.' : 'It takes effect from the next block.'}</p>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.endBtn} data-autofocus="" disabled={busy} onClick={() => onEnd(clear)}>{busy ? 'Ending…' : 'End charter'}</button>
          <button type="button" className={styles.link} disabled={busy} onClick={onClose}>Keep it</button>
        </div>
      </div>
    </div>
  )
}
