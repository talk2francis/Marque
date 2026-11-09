'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { switchChain } from '@wagmi/core'
import { encodeFunctionData, erc20Abi, parseAbi, type Address, type Hex } from 'viem'
import { Check, ExternalLink, ShieldCheck, X } from 'lucide-react'
import { CHARTER_CHAINS, EXECUTORS, KIND_NAMES, type CharterChainId, type CharterKind } from '@marque/charters/client'
import type { charterV2Detail } from '../../../lib/charters-v2'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { useFocusTrap } from '../../_components/ui'
import { amount, fmtPrice, priceAt } from '../../../lib/charters-builder-v2'
import { useCalls } from './useCalls'
import styles from './charter.module.css'

/**
 * The page of one v2 charter, any kind (11_EXPERIENCE, charter pages per kind): the sentence, what the chain says
 * now (with block and read time), what it has done (events only, each with its transaction), who may press the
 * button, the agent's key, how to check it yourself, and End for the owner. Re-read every 30 seconds.
 */
export type V2Detail = NonNullable<Awaited<ReturnType<typeof charterV2Detail>>>
const CHAIN_NAME: Record<CharterChainId, string> = { 56: 'BNB Smart Chain', 97: 'BSC testnet' }
const AGENT: Record<CharterKind, 'keel' | 'sluicegate' | 'lattice' | 'bound'> = { loan: 'keel', yield: 'sluicegate', grid: 'lattice', range: 'bound' }
const AGENT_NAME = { keel: 'Keel', sluicegate: 'Sluicegate', lattice: 'Lattice', bound: 'Bound' } as const
const BUTTON: Record<CharterKind, string> = { loan: 'Protect now', yield: 'Run now', grid: 'Trade now', range: 'Rebalance now' }
const WAD = 10n ** 18n
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'time not yet read')
const ago = (iso: string, now: number) => { const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000)); return s < 60 ? `${s} seconds ago` : s < 3600 ? `${Math.round(s / 60)} minutes ago` : `${Math.round(s / 3600)} hours ago` }
const B = (v: unknown) => BigInt(String(v ?? '0'))
const health = (v: unknown) => { const x = Number((B(v) * 10_000n) / WAD) / 10_000; return x > 100 ? 'over 100' : x.toFixed(2) }

export function CharterV2View({ initial, teamOwner }: { initial: V2Detail; teamOwner: boolean }) {
  const config = useConfig()
  const { address: wallet, chainId: walletChain } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [d, setD] = useState(initial)
  const [now, setNow] = useState(() => Date.parse(initial.readAt))
  useEffect(() => setNow(Date.now()), [])
  const [stale, setStale] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const end = useCalls()
  const press = useCalls()
  const c = d.charter
  const kind = c.kind as CharterKind
  const chainId = c.chainId as CharterChainId
  const explorer = CHARTER_CHAINS[chainId].explorer
  const p = (c.params['p'] ?? {}) as Record<string, string>
  const t = c.totals as Record<string, string | number | boolean>
  const live = d.live
  const f = (live.ok ? live.fields : {}) as Record<string, string | boolean>

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/guards/${chainId}/${c.address}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      setD(await r.json() as V2Detail); setStale(false)
    } catch { setStale(true) }
  }, [chainId, c.address])
  useEffect(() => {
    const a = setInterval(() => { setNow(Date.now()); if (document.visibilityState === 'visible') void refresh() }, 30_000)
    return () => clearInterval(a)
  }, [refresh])

  const ended = c.status === 'ended'
  const expired = c.status === 'expired'
  const isOwner = Boolean(wallet && wallet.toLowerCase() === c.owner.toLowerCase())
  const named = c.executors.map((e) => e.toLowerCase())
  const mayPress = c.open || isOwner || Boolean(wallet && named.includes(wallet.toLowerCase()))
  const agent = AGENT[kind]
  const agentNamed = c.open || named.includes(EXECUTORS[agent].toLowerCase())
  const backupNamed = c.open || named.includes(EXECUTORS.backup.toLowerCase())
  const daysLeft = Math.max(0, Math.ceil((Date.parse(c.expiresAt) - now) / 86_400_000))
  const pool = c.pool
  const b0 = pool ? pool.base.toLowerCase() < pool.quote.toLowerCase() : true
  const tickPrice = (tick: unknown) => fmtPrice(priceAt(b0 ? Number(tick) : -Number(tick)))
  const market = useMemo(() => CHARTER_CHAINS[chainId].markets.find((m) => m.vToken.toLowerCase() === String(p['vDebt'] ?? p['vToken']).toLowerCase()), [chainId, p])
  const sym = market?.symbol ?? ''
  const dec = market?.decimals ?? 18
  const wouldAct = live.ok && ((kind === 'loan' && live.stateCode === 1) || (kind !== 'loan' && kind !== 'range' && (live.stateCode === 1 || live.stateCode === 2)) || (kind === 'range' && live.stateCode === 1))

  // The sentence, the status line and the facts per kind, from the charter's own parameters and the live read.
  const view = (() => {
    if (kind === 'loan') return {
      sentence: `Guards the ${sym} loan of ${short(c.owner)} on Venus. Acts below ${health(p['trigger'])}, lifts back to ${health(p['target'])}.`,
      status: !live.ok ? 'The live read failed just now; nothing is assumed.' : live.state === 'would_act' ? 'Below the trigger: the next check repays.' : live.state === 'watching' ? `Watching. Health ${health(f['health'])}, trigger ${health(p['trigger'])}.` : live.state === 'no_funds' ? `Below the trigger, but nothing in the wallet or allowance to repay with.` : live.state === 'below_minimum' ? 'Below the trigger, but what is available is under the smallest repayment.' : live.state.replace('_', ' '),
      facts: [['Health now', ended || expired ? 'not read' : health(f['health'])], [`${sym} left of ${amount(B(p['budget']), dec)}`, amount(B(p['budget']) - B(t['spent']), dec)], ['Times it acted', String(c.actions)], [ended || expired ? 'Status' : 'Days left', ended ? 'ended' : expired ? 'expired' : String(daysLeft)]],
    }
    if (kind === 'yield') return {
      sentence: `Keeps ${short(c.owner)} between ${amount(B(p['floor']), dec)} and ${amount(B(p['ceiling']), dec)} ${sym}, the rest in Venus in their name, supplying at most ${amount(B(p['supplyCap']), dec)} over its life.`,
      status: !live.ok ? 'The live read failed just now; nothing is assumed.' : ({ in_band: 'Inside your band. Nothing to do.', would_supply: `Ready to put ${amount(B(f['amount']), dec)} ${sym} in Venus.`, would_withdraw: `Ready to bring ${amount(B(f['amount']), dec)} ${sym} back.`, collateral_hold: 'You use this market as collateral, so the sweep is holding. Nothing moves.', liquidity_short: `Venus has too little free ${sym} to pay out right now. Your supply is safe; the sweep will try again.`, cap_reached: `This charter has supplied its ${amount(B(p['supplyCap']), dec)} ${sym} lifetime limit.`, nothing_held: 'Below your floor, but nothing this charter supplied is left to bring back.', health_limit: 'A withdrawal would take loan health below your limit: holding.' } as Record<string, string>)[live.state] ?? live.state,
      facts: [['Wallet now', live.ok ? `${amount(B(f['walletBalance']), dec)} ${sym}` : 'n/a'], ['In Venus via this charter', live.ok ? `${amount(B(f['heldUnderlying']), dec)} ${sym}` : 'n/a'], [`Supplied of ${amount(B(p['supplyCap']), dec)}`, amount(B(t['grossSupplied']), dec)], [ended || expired ? 'Status' : 'Days left', ended ? 'ended' : expired ? 'expired' : String(daysLeft)]],
    }
    if (kind === 'grid') return {
      sentence: `Buys ${amount(B(p['orderQuote']), 18)} ${pool?.quoteSymbol ?? ''} of ${pool?.baseSymbol ?? ''} at each of ${p['slots']} levels from ${tickPrice(b0 ? p['lowerBt'] : -Number(p['lowerBt']))} as the price falls, and sells each one a level higher, on PancakeSwap.`,
      status: !live.ok ? (live.reason === 'pool_history' ? 'The pool has not built up enough history for its average yet.' : 'The live read failed just now; nothing is assumed.') : ({ idle: `No level reached. The 5-minute average is ${tickPrice(f['twapTick'])}.`, would_buy: `A level is reached: buying ${amount(B(f['amountIn']), 18)} ${pool?.quoteSymbol ?? ''} of ${pool?.baseSymbol ?? ''}.`, would_sell: `A level is reached: selling ${amount(B(f['amountIn']), 18)} ${pool?.baseSymbol ?? ''}.`, unsettled: 'The price is moving fast: waiting for it to settle near the average.', no_funds: 'A level is reached, but the wallet has too little for this order.' } as Record<string, string>)[live.state] ?? live.state,
      facts: [['Price now', live.ok ? tickPrice(f['twapTick']) : 'n/a'], [`Bought of ${amount(B(p['buyCap']), 18)} ${pool?.quoteSymbol ?? ''}`, amount(B(t['quoteSpent']), 18)], [`Sold of ${amount(B(p['sellCap']), 18)} ${pool?.baseSymbol ?? ''}`, amount(B(t['baseSold']), 18)], ['Round trips', String(t['sells'] ?? 0)]],
    }
    return {
      sentence: `Keeps a ${pool ? `${pool.baseSymbol.replace(/^W/, '')}/${pool.quoteSymbol}` : ''} PancakeSwap position of ${short(c.owner)} in range: moves it back around the price when it leaves, same width, at most ${p['maxRebalances']} times, one every ${Math.round(Number(p['minInterval']) / 3600)} hours at most, each losing at most ${(Number(p['maxLossBps']) / 100).toFixed(2)}% at the average price.`,
      status: !live.ok ? 'The live read failed just now; nothing is assumed.' : ({ in_range: 'In range. Earning fees.', would_move: `Out of range: ready to move it around ${tickPrice(f['twapTick'])}.`, unsettled: 'The price is moving fast: waiting for it to settle near the average.', too_soon: 'Out of range, but it moved recently: the next move waits for its interval.', limit_reached: `All ${p['maxRebalances']} moves used. End it to take your position back.`, not_held: t['returned'] ? 'Your position is back in your wallet.' : 'The keeper does not hold the position.' } as Record<string, string>)[live.state] ?? live.state,
      facts: [['Now', live.ok ? (live.state === 'in_range' ? 'in range' : 'out of range') : 'n/a'], ['Range', live.ok && f['lower'] !== undefined && Number(f['upper']) !== 0 ? `${tickPrice(b0 ? f['lower'] : f['upper'])} to ${tickPrice(b0 ? f['upper'] : f['lower'])}` : 'n/a'], [`Moves used of ${p['maxRebalances']}`, String(t['rebalances'] ?? 0)], [ended || expired ? 'Status' : 'Days left', ended ? 'ended' : expired ? 'expired' : String(daysLeft)]],
    }
  })()

  const pill = ended ? { label: 'Ended', tone: 'ink' } : expired ? { label: 'Expired', tone: 'ink' } : wouldAct ? { label: 'Acting', tone: 'amber' } : { label: 'Armed', tone: 'moss' }
  const callerWords = (who: string | null) => (who === 'owner' ? 'you' : who && who in AGENT_NAME ? AGENT_NAME[who as keyof typeof AGENT_NAME] : who === 'backup' ? 'the Marque backup' : 'another caller')
  const timeline = d.events.filter((e) => !['TipPaid', 'ExecutorSet', 'RebalanceValue'].includes(e.event)).map((e) => {
    const x = e.data as Record<string, string | boolean>
    const by = callerWords(e.callerIs)
    const base = { key: `${e.txHash}-${e.logIndex}`, at: e.at, tx: e.txHash, tone: 'ink' as string, receipt: null as Array<[string, string]> | null }
    if (e.event === 'Created') return { ...base, title: 'Granted', body: `Created on ${CHAIN_NAME[chainId]} by its owner.` }
    if (e.event === 'Ended') return { ...base, title: 'Ended', body: 'Its owner ended it. It can never act again.' }
    if (e.event === 'Returned') return { ...base, title: 'Position returned', body: `Position #${x['tokenId']} is back in the owner's wallet.`, tone: 'moss' }
    if (e.event === 'Repaid') return { ...base, tone: 'moss', title: `Repaid ${amount(B(x['repaid']), dec)} ${sym}`, body: `Pressed by ${by}.`, receipt: [['Health', `${health(x['healthBefore'])} to ${health(x['healthAfter'])}`], ['Loan', `${amount(B(x['debtBefore']), dec)} to ${amount(B(x['debtAfter']), dec)} ${sym}`]] as Array<[string, string]> }
    if (e.event === 'Supplied') return { ...base, tone: 'moss', title: `Supplied ${amount(B(x['amount']), dec)} ${sym} to Venus`, body: `In the owner's name. Pressed by ${by}.`, receipt: [['Wallet after', `${amount(B(x['walletAfter']), dec)} ${sym}`], ['Supplied in total', amount(B(x['grossSupplied']), dec)]] as Array<[string, string]> }
    if (e.event === 'Withdrew') return { ...base, tone: 'moss', title: `Brought back ${amount(B(x['amount']), dec)} ${sym}`, body: `From what this charter supplied. Pressed by ${by}.`, receipt: [['Wallet after', `${amount(B(x['walletAfter']), dec)} ${sym}`]] as Array<[string, string]> }
    if (e.event === 'Traded') {
      const buy = x['buy'] === true || x['buy'] === 'true'
      return { ...base, tone: 'moss', title: buy ? `Bought ${amount(B(x['amountOut']), 18, 6)} ${pool?.baseSymbol ?? ''} for ${amount(B(x['amountIn']), 18)} ${pool?.quoteSymbol ?? ''}` : `Sold ${amount(B(x['amountIn']), 18, 6)} ${pool?.baseSymbol ?? ''} for ${amount(B(x['amountOut']), 18)} ${pool?.quoteSymbol ?? ''}`, body: `Level ${Number(x['slot']) + 1}. Pressed by ${by}.`, receipt: [['Average at the time', tickPrice(x['twapTick'])]] as Array<[string, string]> }
    }
    if (e.event === 'Rebalanced') {
      const v = d.events.find((y) => y.event === 'RebalanceValue' && y.txHash === e.txHash)?.data as Record<string, string> | undefined
      return { ...base, tone: 'moss', title: `Moved to ${tickPrice(b0 ? x['newLower'] : x['newUpper'])} to ${tickPrice(b0 ? x['newUpper'] : x['newLower'])}`, body: `New position #${x['newTokenId']}, held by the keeper. Pressed by ${by}.`,
        receipt: v ? [['Value before, at the average', amount(B(v['valueBefore']), 18)], ['Value after, at the average', amount(B(v['valueAfter']), 18)], ['Leftovers to the owner', `${amount(B(v['left0']), 18, 6)} and ${amount(B(v['left1']), 18, 6)}`]] as Array<[string, string]> : null }
    }
    if (e.event === 'Exited') return { ...base, tone: 'moss', title: 'Closed the position', body: `Everything sent to the owner. Pressed by ${by}.` }
    return { ...base, title: e.event, body: '' }
  }).reverse()

  const wrongChain = Boolean(wallet && walletChain !== chainId)
  const needChain = async () => { if (wrongChain) await switchChain(config, { chainId }).catch(() => undefined) }
  const doPress = async () => {
    if (!wallet) { openConnectModal?.(); return }
    await needChain()
    if (await press.run(wallet, chainId, [{ to: c.address, data: encodeFunctionData({ abi: parseAbi(['function act()']), functionName: 'act' }) }])) void refresh()
  }
  const doEnd = async (clear: boolean) => {
    if (!wallet) return
    await needChain()
    const calls: Array<{ to: Address; data: Hex }> = []
    if (!ended) calls.push({ to: c.address, data: encodeFunctionData({ abi: parseAbi(['function end()']), functionName: 'end' }) })
    if (clear) for (const a of d.allowances) if (a.allowance && a.allowance !== '0') calls.push({ to: a.token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [c.address, 0n] }) })
    if (calls.length && await end.run(wallet, chainId, calls)) { setEndOpen(false); void refresh() }
  }
  const doRelease = async () => {
    if (!wallet) { openConnectModal?.(); return }
    await needChain()
    if (await end.run(wallet, chainId, [{ to: c.address, data: encodeFunctionData({ abi: parseAbi(['function release()']), functionName: 'release' }) }])) void refresh()
  }
  const open = d.allowances.filter((a) => a.allowance && a.allowance !== '0')
  const keyLine = (() => {
    const k = d.key
    if (!c.open && !agentNamed) return 'not named by the owner'
    if (!k) return ended || expired ? 'held no key for this charter' : 'registering its key on Altana'
    if (k.status === 'none') return kind === 'yield' ? 'acts from its own account, no session key' : 'acts from its own account'
    if (k.status === 'registered') return `via Altana, a key for this charter only, until ${day(k.expiry)}`
    if (k.status === 'revoked') return 'key revoked'
    if (k.status === 'revoking') return 'revoking its key'
    if (k.status === 'failed') return 'its key is not registered yet; the backup covers'
    return 'registering its key on Altana'
  })()

  return (
    <div className={styles.view}>
      {teamOwner ? <p className={styles.notice}>A Marque team test charter.</p> : null}
      {c.fixture ? <p className={styles.notice}>Testnet fixture pool: prices are moved by Marque&apos;s test market maker.</p> : null}
      <header className={styles.top}>
        <span className={styles.pill} data-tone={pill.tone}><i aria-hidden="true" />{pill.label}</span>
        <h1 className={styles.title}>{view.sentence}</h1>
        <p className={styles.meta}>
          {KIND_NAMES[kind]}. Granted {day(c.createdAt)}. {ended ? `Ended ${day(c.endedAt)}.` : `Ends ${day(c.expiresAt)}.`} {CHAIN_NAME[chainId]}.{' '}
          <span title={live.ok ? `Read at block ${live.blockNumber}` : undefined}>Last checked {ago(live.readAt, now)}{live.ok ? `, block ${Number(live.blockNumber).toLocaleString('en-US')}` : ''}.</span>{stale ? ' Checking again.' : ''}
        </p>
      </header>
      <div className={styles.grid}>
        <div className={styles.main}>
          <p className={styles.status} data-tone={pill.tone} role="status">{ended ? 'Ended. It can never act again.' : expired ? 'Past its end date. It can never act again.' : view.status}</p>
          <dl className={styles.facts}>{view.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="mono">{v}</dd></div>)}</dl>
          <section aria-labelledby="tl-h">
            <h2 id="tl-h" className={styles.h2}>What happened</h2>
            {timeline.length === 0 ? <p className={styles.fine}>Nothing yet. Every action will appear here with its transaction.</p> : (
              <ol className={styles.timeline}>
                {timeline.map((i) => (
                  <li key={i.key} data-tone={i.tone}>
                    <span className={styles.tlWhen}>{when(i.at)}</span>
                    <span className={styles.tlDot} aria-hidden="true" />
                    <div className={styles.tlBody}>
                      <b>{i.title}</b>
                      {i.body ? <p>{i.body}</p> : null}
                      {i.receipt ? <dl className={styles.receipt}>{i.receipt.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : null}
                      <a href={`${explorer}/tx/${i.tx}`} target="_blank" rel="noreferrer">Transaction on {chainId === 97 ? 'testnet ' : ''}BscScan<ExternalLink aria-hidden="true" /></a>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <aside className={styles.side}>
          <section className={styles.card} aria-labelledby="who-h">
            <h2 id="who-h" className={styles.h3}>{c.open ? 'Who can press the button' : 'Who may act'}</h2>
            <ul className={styles.watchers}>
              <li><AgentAvatar id={agent} reference size={28} /><span><b>{AGENT_NAME[agent]}</b> {keyLine}</span></li>
              <li><span className={styles.icon} aria-hidden="true"><ShieldCheck /></span><span><b>Marque backup</b>, {backupNamed ? 'standing by' : 'not named by the owner'}</span></li>
              <li><span className={styles.icon} aria-hidden="true"><Check /></span><span><b>The owner</b>, with {BUTTON[kind]}</span></li>
              {c.executors.filter((e) => ![EXECUTORS[agent], EXECUTORS.backup].map((x) => x.toLowerCase()).includes(e.toLowerCase())).map((e) => <li key={e}><span className={styles.icon} aria-hidden="true"><Check /></span><span>Named agent <a className="mono" href={`${explorer}/address/${e}`} target="_blank" rel="noreferrer">{short(e)}</a></span></li>)}
            </ul>
            {!c.open ? <p className={styles.fine}>No one else can: whoever picks the moment of a trade could profit from it, so only agents the owner named may choose it.</p> : null}
            {!ended && !expired && mayPress ? (
              <>
                <button type="button" className={styles.protect} disabled={!wouldAct || press.state === 'signing' || press.state === 'pending'} onClick={() => void doPress()}>{press.state === 'signing' ? 'Waiting for your wallet…' : press.state === 'pending' ? 'Sending…' : BUTTON[kind]}</button>
                <p className={styles.fine}>{wouldAct ? 'It does the same one thing any agent would. The result shows when the chain confirms it.' : 'Opens when the chain shows the condition.'}</p>
                {press.error ? <p className={styles.error} role="alert">{press.error}</p> : null}
              </>
            ) : null}
          </section>
          <section className={styles.card} aria-labelledby="verify-h">
            <h2 id="verify-h" className={styles.h3}>Check it yourself</h2>
            <ul className={styles.checks}>
              <li data-ok="true"><Check aria-hidden="true" /><span>Made by Marque&apos;s {KIND_NAMES[kind]} factory <a href={`${explorer}/address/${c.factory}#readContract`} target="_blank" rel="noreferrer">isCharter</a></span></li>
              <li data-ok="true"><Check aria-hidden="true" /><span>No admin, no upgrade, no owner change: its rules are fixed in its code</span></li>
              {d.allowances.map((a) => <li key={a.token} data-ok={a.allowance !== null ? 'true' : 'false'}>{a.allowance !== null ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}<span>{a.allowance !== null ? `Allowance ${amount(BigInt(a.allowance), a.decimals)} ${a.symbol}, to this charter only` : `${a.symbol} allowance not read just now`}</span></li>)}
              {kind === 'range' ? <li data-ok="true"><Check aria-hidden="true" /><span>{t['returned'] ? 'The position is back with its owner' : 'Holds one position NFT, in the owner’s own keeper contract'}</span></li> : null}
            </ul>
            <dl className={styles.addrs}>
              <div><dt>Charter</dt><dd><a className="mono" href={`${explorer}/address/${c.address}`} target="_blank" rel="noreferrer">{short(c.address)}</a></dd></div>
              <div><dt>Read its preview()</dt><dd><a href={`${explorer}/address/${c.address}#readContract`} target="_blank" rel="noreferrer">BscScan</a></dd></div>
              {d.key?.keyId ? <div><dt>{AGENT_NAME[agent]}&apos;s key</dt><dd className="mono">{short(d.key.keyId)}</dd></div> : null}
            </dl>
            <p className={styles.fine}>Unaudited. The source is published on BscScan on launch day; until then the bytecode is checked against the factory above.</p>
          </section>
          <section className={styles.card} aria-labelledby="end-h">
            <h2 id="end-h" className={styles.h3}>{ended || expired ? (kind === 'range' ? 'Your position' : 'Allowances') : 'End this charter'}</h2>
            {kind === 'range' && (ended || expired) && !t['returned'] ? (
              <><p className={styles.fine}>Anyone can send the position back to its owner now.</p><button type="button" className={styles.endBtn} disabled={end.state === 'signing' || end.state === 'pending'} onClick={() => void doRelease()}>Send the position back</button></>
            ) : isOwner ? (
              ended || expired ? (
                open.length ? (
                  <><p className={styles.fine}>It can never act again, but your wallet still allows it {open.map((a) => `${amount(BigInt(a.allowance!), a.decimals)} ${a.symbol}`).join(' and ')}. Clearing is tidy, not urgent.</p>
                    <button type="button" className={styles.endBtn} disabled={end.state === 'signing' || end.state === 'pending'} onClick={() => void doEnd(true)}>{end.state === 'signing' || end.state === 'pending' ? 'Clearing…' : 'Clear allowances'}</button></>
                ) : <p className={styles.fine}>Nothing left to clear.</p>
              ) : (
                <><button type="button" className={styles.endBtn} onClick={() => { end.reset(); setEndOpen(true) }}>End charter</button>
                  <p className={styles.fine}>{kind === 'range' ? 'Ending stops every future move and sends your position back in the same transaction.' : 'Ending stops every future action at once. It moves no money.'}</p></>
              )
            ) : <p className={styles.fine}>Only the owner can end this charter.{!wallet && openConnectModal ? <> <button type="button" className={styles.link} onClick={openConnectModal}>Connect</button></> : null}</p>}
            {end.error && !endOpen ? <p className={styles.error} role="alert">{end.error}</p> : null}
          </section>
        </aside>
      </div>
      {endOpen ? <EndDialog kind={kind} open={open} state={end.state} error={end.error} onClose={() => setEndOpen(false)} onEnd={(clear) => void doEnd(clear)} /> : null}
    </div>
  )
}

function EndDialog({ kind, open, state, error, onClose, onEnd }: { kind: CharterKind; open: Array<{ symbol: string; allowance: string | null; decimals: number }>; state: string; error: string | null; onClose: () => void; onEnd: (clear: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const busy = state === 'signing' || state === 'pending'
  const [clear, setClear] = useState(open.length > 0)
  useFocusTrap(ref, true, () => { if (!busy) onClose() })
  return (
    <div className={styles.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={styles.dialog} ref={ref} role="dialog" aria-modal="true" aria-labelledby="end-title">
        <h2 id="end-title" className={styles.h3}>End this charter?</h2>
        <p>{kind === 'range' ? 'Ending stops every future move and sends your position NFT back to your wallet in the same transaction.' : 'Ending stops every future action at once. It moves no money.'}</p>
        {open.length ? <label className={styles.check}><input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} disabled={busy} />Also clear the {open.map((a) => `${amount(BigInt(a.allowance!), a.decimals)} ${a.symbol}`).join(' and ')} {open.length > 1 ? 'allowances' : 'allowance'}</label> : null}
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
