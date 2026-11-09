'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { getPublicClient, switchChain } from '@wagmi/core'
import { getAddress, isAddress, type Address } from 'viem'
import { ArrowRight, ShieldCheck, X } from 'lucide-react'
import {
  V2,  CHARTER_CHAINS, dropToHealth, HEALTH_ONE, priceAtHealth, priceToUsd, repayAtTrigger, type CharterChainId,
} from '@marque/charters/client'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { AddressChip } from '../../_components/ui'
import {
  DURATIONS, PRESETS, clampRule, dateOf, expiryFor, fmtHealth, framingOf, paramsOf, presetRule, readBudget, suggestBudget, tipFor, toHundredths, toWad, tokens, usd,
  type PresetId, type Quote, type TipChoice,
} from '../../../lib/charters-builder'
import { HealthRule } from './HealthRule'
import { StormTest } from './StormTest'
import { Seal } from './Seal'
import { checkPending, tipBudgetOf, useGrant } from './useGrant'
import { minRepayFor } from '../../../lib/charters-builder-v2'
import styles from './builder.module.css'

/**
 * /charters/new (03_EXPERIENCE sections 1 to 5): the loan and its Health Rule on the left, the charter as a
 * sentence on the right, the Seal at the end. It reads any address with no wallet; only the grant needs the
 * wallet that owns the loan, on the loan's network. Every number is from chain (the quote names its block) or is
 * a labelled projection.
 */
const CHAIN_NAME: Record<CharterChainId, string> = { 56: 'BNB Smart Chain', 97: 'BSC testnet' }
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}

type Load = { state: 'loading' } | { state: 'error'; detail: string } | { state: 'ok'; quote: Quote; at: number }

export function Builder({ initialChain, initialAccount, initialMarket, demo }: {
  initialChain: CharterChainId
  initialAccount: string | null
  initialMarket: string | null
  demo: Record<CharterChainId, string>
}) {
  const config = useConfig()
  const { address: wallet, chainId: walletChain, connector } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [chainId, setChainId] = useState<CharterChainId>(initialChain)
  // Whose loan: an address in the link or typed here wins; otherwise the connected wallet; otherwise the demo.
  const [chosen, setChosen] = useState<string | null>(initialAccount && isAddress(initialAccount) ? getAddress(initialAccount) : null)
  const account = (chosen ?? wallet ?? demo[chainId]) as Address
  const [typed, setTyped] = useState('')
  const [market, setMarket] = useState<string | null>(initialMarket)
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [now, setNow] = useState(() => Date.now())
  const [rule, setRule] = useState<{ trigger: number; target: number } | null>(null)
  const [preset, setPreset] = useState<PresetId | null>(null)
  const [budget, setBudget] = useState('')
  const [days, setDays] = useState<number>(30)
  const [tip, setTip] = useState<TipChoice>('none')
  const [pending, setPending] = useState<Awaited<ReturnType<typeof checkPending>>>(null)
  const [pendingMsg, setPendingMsg] = useState<string | null>(null)
  const ruleBox = useRef<HTMLDivElement>(null)
  const budgetInput = useRef<HTMLInputElement>(null)
  const endsBox = useRef<HTMLDivElement>(null)
  const draftFor = useRef<string | null>(null)
  const grant = useGrant()

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t) }, [])

  // The link always says what is on screen.
  useEffect(() => {
    const u = new URL(window.location.href)
    u.searchParams.set('chain', String(chainId))
    if (chosen) u.searchParams.set('account', chosen); else u.searchParams.delete('account')
    if (market) u.searchParams.set('market', market); else u.searchParams.delete('market')
    window.history.replaceState(null, '', u)
  }, [chainId, chosen, market])

  const marketParam = useMemo(() => {
    if (!market) return null
    if (isAddress(market)) return market
    const m = CHARTER_CHAINS[chainId].markets.find((x) => `v${x.symbol}`.toLowerCase() === market.toLowerCase() || x.symbol.toLowerCase() === market.toLowerCase())
    return m?.vToken ?? null
  }, [market, chainId])

  const read = useCallback(async (quiet: boolean) => {
    if (!quiet) setLoad({ state: 'loading' })
    const q = new URLSearchParams({ chainId: String(chainId), account })
    if (marketParam) q.set('market', marketParam)
    // A public RPC that answers slowly once usually answers the second time: one quiet retry before saying so.
    for (let attempt = 0; attempt < (quiet ? 1 : 2); attempt++) {
      try {
        const r = await fetch(`/api/v1/guards/quote?${q}`, { cache: 'no-store' })
        const j = await r.json() as Quote & { detail?: string; error?: string }
        if (!r.ok) throw Object.assign(new Error(j.detail ?? 'The loan could not be read just now.'), { status: r.status })
        setLoad({ state: 'ok', quote: j, at: Date.now() })
        return
      } catch (e) {
        const last = quiet || attempt === 1 || (e as { status?: number }).status === 400
        if (!last) { await new Promise((r) => setTimeout(r, 1500)); continue }
        if (!quiet) setLoad({ state: 'error', detail: e instanceof Error ? e.message : 'The loan could not be read just now.' })
        return
      }
    }
  }, [chainId, account, marketParam])

  // A new loan (account, chain or market) is a new draft: read it, start from its own defaults, close any Seal.
  useEffect(() => { grant.close(); void read(false) }, [read])
  // Health is re-read every minute while the page is open; the draft is kept.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible' && grant.phase !== 'signing') void read(true) }, 60_000)
    return () => clearInterval(t)
  }, [read, grant.phase])

  const quote = load.state === 'ok' ? load.quote : null
  const framing = useMemo(() => (quote ? framingOf(quote) : null), [quote])
  const healthNow = quote?.health ? Number(BigInt(quote.health)) / 1e18 : null
  const debtMarket = quote?.market ?? null
  const walletBalance = quote?.wallet ? BigInt(quote.wallet.balance) : null

  useEffect(() => {
    if (!quote) return
    const key = `${quote.chainId}:${quote.account}:${quote.market?.vToken ?? ''}`
    if (draftFor.current === key) return
    draftFor.current = key
    const d = quote.defaults
    const r = d ? clampRule(toHundredths(BigInt(d.trigger)), toHundredths(BigInt(d.target))) : clampRule(130, 180)
    setRule(r); setPreset(null); setTip('none'); setDays(30)
    if (framing && quote.market) {
      const need = repayAtTrigger(framing, toWad(r.trigger), toWad(r.target), BigInt(quote.market.price))
      const b = suggestBudget(need, quote.market.decimals, quote.wallet ? BigInt(quote.wallet.balance) : null)
      setBudget(b > 0n ? tokens(b, quote.market.decimals).replace(/,/g, '') : '')
    } else setBudget('')
  }, [quote, framing])

  // An unfinished grant from an earlier visit, for the connected wallet.
  useEffect(() => {
    setPending(null)
    if (!wallet || !CHARTER_CHAINS[chainId].factory) return
    const pub = getPublicClient(config, { chainId })
    if (!pub) return
    void checkPending(pub as never, wallet, chainId).then(setPending)
  }, [wallet, chainId, config, grant.phase])

  const decimals = debtMarket?.decimals ?? 18
  const symbol = debtMarket?.symbol ?? 'USDT'
  const parsedBudget = readBudget(budget, decimals)
  const budgetUnits = 'value' in parsedBudget ? parsedBudget.value : null
  const tipUnits = budgetUnits !== null ? tipFor(tip, budgetUnits) : 0n
  const expiresAt = expiryFor(days, Math.floor(now / 1000))
  const until = dateOf(expiresAt)

  const frame = useMemo(() => {
    if (!framing || !rule || !quote?.mainCollateral) return null
    const main = quote.mainCollateral
    const p = (h: bigint) => { const x = priceAtHealth(framing, h); return x === null ? null : priceToUsd(x, main.decimals) }
    return {
      triggerPrice: p(toWad(rule.trigger)), liquidationPrice: p(HEALTH_ONE),
      drop: dropToHealth(framing, toWad(rule.trigger)),
      repay: debtMarket ? repayAtTrigger(framing, toWad(rule.trigger), toWad(rule.target), BigInt(debtMarket.price)) : null,
      actsNow: healthNow !== null && rule.trigger / 100 > healthNow,
    }
  }, [framing, rule, quote, debtMarket, healthNow])

  const stormGuard = useMemo(() => (rule && debtMarket && budgetUnits !== null ? {
    trigger: toWad(rule.trigger), target: toWad(rule.target), budgetLeft: budgetUnits,
    allowance: budgetUnits, balance: budgetUnits, debtInMarket: BigInt(debtMarket.borrowed), debtPrice: BigInt(debtMarket.price),
  } : null), [rule, debtMarket, budgetUnits])

  // Why the Grant button cannot be pressed, in the words of section 5; null when it can.
  const factory = V2[chainId].loanFactory ?? CHARTER_CHAINS[chainId].factory
  const isOwner = Boolean(wallet && wallet.toLowerCase() === account.toLowerCase())
  const blocker: { words: string; action?: { label: string; run: () => void } } | null = (() => {
    if (!factory) return { words: `Loan Guard is not on ${CHAIN_NAME[chainId]} yet. You can draw and test a charter here; granting opens when the guard is live on this network.` }
    if (!quote || !rule) return { words: 'Reading the loan.' }
    if (quote.noLoan) return { words: `No Venus loan found for this address on ${CHAIN_NAME[chainId]}.` }
    if (!debtMarket) return { words: 'Automatic repayment is not available for this debt yet. Stablecoin loans first.' }
    if (!wallet) return { words: 'Connect the wallet that owns this loan to grant a charter. You can explore everything without one.', action: openConnectModal ? { label: 'Connect', run: openConnectModal } : undefined }
    if (!isOwner) return { words: `This loan belongs to ${short(account)}. Switch to that wallet to grant a charter for it.`, action: { label: 'Show my own loan', run: () => setChosen(null) } }
    if (walletChain !== chainId) return { words: `This loan is on ${CHAIN_NAME[chainId]}. Your wallet is on ${walletChain === 56 || walletChain === 97 ? CHAIN_NAME[walletChain] : 'another network'}.`, action: { label: 'Switch network', run: () => { void switchChain(config, { chainId }).catch(() => undefined) } } }
    if ('error' in parsedBudget) return { words: parsedBudget.error }
    return null
  })()

  const pass = connector?.id === 'marque-pass'
  const walletWords = pass
    ? 'Marque Pass: one confirmation and one passkey touch sign both steps, the allowance and the guard.'
    : 'Your wallet asks once if it can batch both steps, otherwise twice: the allowance, then the guard.'

  // The Seal reads the grant it will sign (a resumed one included), never the form behind it.
  const lines = (() => {
    const p = grant.prep
    if (!p) return []
    const t = p.params
    return [
      { label: 'Guards', value: `${p.symbol} loan of ${short(p.owner)}` },
      { label: 'Where', value: `Venus Core, ${CHAIN_NAME[p.chainId]}` },
      { label: 'Acts', value: `below ${fmtHealth(toHundredths(t.trigger))}, lifts to ${fmtHealth(toHundredths(t.target))}` },
      { label: 'Can use', value: `at most ${tokens(t.budget, p.decimals)} ${p.symbol}, from your wallet, never less than ${tokens(minRepayFor(t.budget, p.decimals), p.decimals)} at a time unless that restores your target` },
      ...(t.tip > 0n ? [{ label: 'Can tip', value: `${tokens(t.tip, p.decimals)} per action to the agent that acts, at most ${tokens(tipBudgetOf(t.tip), p.decimals)} in total, apart from the budget` }] : []),
      { label: 'Can pay', value: 'only your own loan' },
      { label: 'Ends', value: `${new Date(Number(t.expiresAt) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}, or when you end it` },
    ]
  })()

  const startGrant = () => {
    if (blocker || !rule || !debtMarket || budgetUnits === null || !wallet) return
    void grant.prepare({
      chainId, owner: wallet, token: debtMarket.token, symbol, decimals,
      params: { vDebt: debtMarket.vToken, trigger: toWad(rule.trigger), target: toWad(rule.target), budget: budgetUnits, tip: tipUnits, expiresAt },
    }, [`Allow up to ${tokens(budgetUnits + tipBudgetOf(tipUnits), decimals)} ${symbol} for this guard only`, 'Create the guard'])
  }

  const resume = () => {
    if (!pending || !wallet) return
    const p = pending.pending
    void grant.prepare({ chainId, owner: wallet, token: p.token, symbol: p.symbol, decimals: p.decimals, params: paramsOf(p.params) },
      [`Allow up to ${tokens(BigInt(p.params.budget), p.decimals)} ${p.symbol} for this guard only`, 'Create the guard'],
      { salt: p.salt, predicted: p.predicted, approved: true })
  }
  const clearOld = async () => {
    if (!pending || !wallet) return
    setPendingMsg('Waiting for your wallet…')
    try { await grant.clearAllowance({ chainId, owner: wallet, token: pending.pending.token, predicted: pending.pending.predicted }); setPending(null); setPendingMsg(null) } catch { setPendingMsg('The allowance was not cleared. Nothing changed.') }
  }

  const sealPrimary = (() => {
    if (grant.phase === 'sealed' || grant.phase === 'signing') return null
    if (grant.approveDone) return grant.note?.includes('can no longer be used') ? 'Clear the allowance' : grant.phase === 'failed' ? 'Try again' : 'Create the guard'
    if (grant.phase === 'failed') return 'Try again'
    return pass ? 'Seal with your fingerprint' : 'Open your wallet'
  })()
  const onSealPrimary = () => {
    if (sealPrimary === 'Clear the allowance' && grant.prep) {
      const p = grant.prep
      void grant.clearAllowance(p).then(() => grant.close()).catch(() => undefined)
    } else if (grant.approveDone) void grant.retryCreate()
    else void grant.sign()
  }

  const focusHandle = (which: 'trigger' | 'target') => ruleBox.current?.querySelector<HTMLElement>(`[data-which="${which}"]`)?.focus()
  const coin = chainId === 97 ? 'tBNB' : 'BNB'
  const mainSym = quote?.mainCollateral?.symbol ?? 'collateral'

  return (
    <div className={styles.builder}>
      <form className={styles.who} onSubmit={(e) => { e.preventDefault(); const v = typed.trim(); if (isAddress(v)) { setChosen(getAddress(v)); setTyped('') } }}>
        <div className={styles.seg} role="group" aria-label="Network">
          {([56, 97] as const).map((c) => (
            <button key={c} type="button" aria-pressed={chainId === c} onClick={() => { setChainId(c); setMarket(null) }}>{CHAIN_NAME[c]}</button>
          ))}
        </div>
        <label className={styles.addr}>
          <span className="sr-only">Any address with a Venus loan</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Paste any address (now ${short(account)})`} spellCheck={false} autoComplete="off" inputMode="text" aria-invalid={typed.trim() !== '' && !isAddress(typed.trim())} />
        </label>
        <button type="submit" className={styles.ghost} disabled={!isAddress(typed.trim())}>Read</button>
        {chosen && wallet && chosen.toLowerCase() !== wallet.toLowerCase() ? <button type="button" className={styles.link} onClick={() => setChosen(null)}>My wallet&apos;s loan</button> : null}
      </form>

      {pending ? (
        <div className={styles.attention} role="status">
          <p>A charter you started was not finished. The allowance of {tokens(pending.allowance, pending.pending.decimals)} {pending.pending.symbol} points at {short(pending.pending.predicted)}, an address only that charter can occupy.</p>
          <div className={styles.attentionActions}>
            <button type="button" className={styles.ghost} onClick={resume} disabled={grant.checking}>Finish it</button>
            <button type="button" className={styles.ghost} onClick={() => void clearOld()}>Clear the allowance</button>
          </div>
          {pendingMsg ? <p className={styles.fine}>{pendingMsg}</p> : null}
        </div>
      ) : null}

      <div className={styles.grid}>
        <div className={styles.left}>
          <section className={`${styles.panel} ${styles.position}`} aria-labelledby="loan-h" aria-busy={load.state === 'loading'}>
            <div className={styles.posTop}>
              <div>
                <h2 id="loan-h" className={styles.panelTitle}>{account.toLowerCase() === demo[chainId].toLowerCase() && !chosen && !wallet ? 'An example Venus loan' : 'Your Venus loan'}</h2>
                <div className={styles.meta}>
                  <AddressChip value={account} chainId={chainId} />
                  {quote ? <span className={styles.prov} title={`Read from chain at block ${quote.blockNumber}`}>Onchain, block {Number(quote.blockNumber).toLocaleString('en-US')}, read {ago(quote.readAt, now)}</span> : null}
                </div>
              </div>
              <div className={styles.hfBig}>
                <span className={`mono ${styles.hfValue}`} data-tone={healthNow === null ? undefined : healthNow < 1 ? 'breach' : healthNow < 1.2 ? 'watch' : 'holds'}>
                  {load.state === 'loading' ? '…' : healthNow === null ? 'n/a' : healthNow > 100 ? '100+' : healthNow.toFixed(2)}
                </span>
                <span className={styles.caption}>loan health now</span>
              </div>
            </div>

            {load.state === 'error' ? (
              <div className={styles.empty}><p>{load.detail}</p><button type="button" className={styles.ghost} onClick={() => void read(false)}>Read again</button></div>
            ) : quote?.noLoan ? (
              <div className={styles.empty}><p>No Venus loan found for this address on {CHAIN_NAME[chainId]}.</p><a className={styles.link} href={`/positions?addr=${account}`}>Back to Positions</a></div>
            ) : quote?.unsupportedOnly ? (
              <div className={styles.empty}><p>Automatic repayment is not available for {quote.markets.filter((m) => m.borrowed !== '0').map((m) => m.symbol).join(' and ')} debt yet. Stablecoin loans first.</p></div>
            ) : quote && rule ? (
              <>
                <div className={styles.legs}>
                  {quote.mainCollateral ? <div><b className="mono">{tokens(BigInt(quote.mainCollateral.supplied), quote.mainCollateral.decimals)} {mainSym}</b><span>Main collateral, about {usd(quote.mainCollateral.priceUsd)} each</span></div> : null}
                  {debtMarket ? <div><b className="mono">{tokens(BigInt(debtMarket.borrowed), decimals)} {symbol}</b><span>Borrowed</span></div> : null}
                  <div><b className="mono">{frame?.liquidationPrice ? usd(frame.liquidationPrice) : 'n/a'}</b><span>{mainSym} price where Venus liquidates, about</span></div>
                </div>
                {quote.markets.filter((m) => m.repayable && m.borrowed !== '0').length > 1 ? (
                  <label className={styles.marketPick}>
                    <span>Debt to guard</span>
                    <select value={debtMarket?.vToken ?? ''} onChange={(e) => setMarket(e.target.value)}>
                      {quote.markets.filter((m) => m.repayable && m.borrowed !== '0').map((m) => <option key={m.vToken} value={m.vToken}>{m.symbol}, {tokens(BigInt(m.borrowed), m.decimals)} borrowed</option>)}
                    </select>
                  </label>
                ) : null}
                {quote.markets.some((m) => m.borrowed !== '0' && !m.repayable) ? (
                  <p className={styles.fine}>{quote.markets.filter((m) => m.borrowed !== '0' && !m.repayable).map((m) => m.symbol).join(' and ')} debt counts toward health, but a Loan Guard repays stablecoin debt only.</p>
                ) : null}

                <div ref={ruleBox}>
                  <HealthRule now={healthNow} trigger={rule.trigger} target={rule.target} onChange={(r) => { setRule(r); setPreset(null) }} label="Loan health rule: drag the trigger and the target" />
                </div>
                <div className={styles.notes}>
                  <div data-tone="amber">
                    {frame?.actsNow
                      ? <><b>Acts at the next check</b><span>Your trigger is above today&apos;s health of {healthNow?.toFixed(2)}.</span></>
                      : frame?.triggerPrice
                        ? <><b>Acts if {mainSym} falls to about {usd(frame.triggerPrice)}</b><span>{frame.drop !== null ? `${frame.drop.toFixed(1)}% below today. ` : ''}Venus would liquidate at about {usd(frame.liquidationPrice)}.</span></>
                        : <><b>Acts below {fmtHealth(rule.trigger)}</b><span>Your other collateral alone keeps health above this; no single price is shown.</span></>}
                  </div>
                  <div data-tone="moss">
                    <b>Lifts you back to {fmtHealth(rule.target)}</b>
                    <span>{frame?.repay !== null && frame?.repay !== undefined ? `At that moment it would repay about ${tokens(frame.repay, decimals)} ${symbol}.` : 'It repays exactly what Venus says that takes.'}</span>
                  </div>
                </div>
                <div className={styles.presets} role="group" aria-label="Starting points">
                  {PRESETS.map((p) => (
                    <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => {
                      setRule(presetRule(p.id, healthNow)); setPreset(p.id)
                      if (p.id === 'test') setBudget('5')
                    }}>{p.label}</button>
                  ))}
                </div>
                <p className={styles.fine}>
                  {preset === 'test'
                    ? 'Your trigger is above today’s health, so the guard will act within a minute. Keep the budget small: this is how you watch it work for real.'
                    : preset === null && quote.defaults ? `A starting point from your loan, not advice.${quote.defaults.warn ? ' Your loan is already close to liquidation, so this starting trigger sits near or above today’s health.' : ''}` : 'Presets set the trigger and target only.'}
                </p>
              </>
            ) : <div className={styles.skeleton} aria-hidden="true" />}
          </section>

          {framing && stormGuard && quote?.mainCollateral && debtMarket ? (
            <StormTest framing={framing} guard={stormGuard} collateral={{ symbol: mainSym, decimals: quote.mainCollateral.decimals }} debt={{ symbol, decimals }}
              walletShort={walletBalance !== null && budgetUnits !== null && walletBalance < budgetUnits ? walletBalance : null} />
          ) : null}
        </div>

        <aside className={`${styles.panel} ${styles.paper}`} aria-labelledby="charter-h">
          <h2 id="charter-h" className={styles.panelTitle}>Your charter</h2>
          {rule ? (
            <p className={styles.sentence}>
              If my loan health falls below <button type="button" data-tone="amber" onClick={() => focusHandle('trigger')}>{fmtHealth(rule.trigger)}</button>, repay my {symbol} loan back to{' '}
              <button type="button" data-tone="moss" onClick={() => focusHandle('target')}>{fmtHealth(rule.target)}</button>, using up to{' '}
              <button type="button" onClick={() => budgetInput.current?.focus()}>{budgetUnits !== null ? tokens(budgetUnits, decimals) : '…'} {symbol}</button> from my wallet, until{' '}
              <button type="button" onClick={() => endsBox.current?.querySelector('button')?.focus()}>{until}</button>.
            </p>
          ) : <div className={styles.skeleton} aria-hidden="true" />}

          <div className={styles.field}>
            <div className={styles.row}><label htmlFor="budget">Most it can ever use</label>{walletBalance !== null ? <span className={styles.caption}>You hold {tokens(walletBalance, decimals)} {symbol}</span> : null}</div>
            <div className={styles.amount}>
              <input id="budget" ref={budgetInput} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} aria-invalid={'error' in parsedBudget} aria-describedby="budget-hint" autoComplete="off" />
              <span>{symbol}</span>
            </div>
            <p className={styles.fine} id="budget-hint">
              {'error' in parsedBudget && budget.trim() !== '' ? parsedBudget.error
                : frame?.repay && budgetUnits !== null && budgetUnits < frame.repay ? `Enough for part of one action at the trigger price (about ${tokens(frame.repay, decimals)} needed). It repays what it can.`
                  : walletBalance !== null && budgetUnits !== null && budgetUnits > walletBalance ? `Your wallet holds ${tokens(walletBalance, decimals)}. The guard can only use what is there when it acts.`
                    : 'It stays in your wallet. The guard can take only what your loan needs, when it needs it.'}
            </p>
          </div>

          <div className={styles.field} ref={endsBox}>
            <div className={styles.row}><span className={styles.label}>Ends</span><span className={styles.caption}>{until}</span></div>
            <div className={styles.chips} role="group" aria-label="Duration">
              {DURATIONS.map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>)}
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.row}><span className={styles.label}>Who watches</span><span className={styles.caption}>Anyone may press the button; the result is the same</span></div>
            <ul className={styles.watchers}>
              <li><AgentAvatar id="keel" reference size={28} /><span><b>Keel</b>, Marque&apos;s health agent, through a key that can only call this guard</span></li>
              <li><span className={styles.dotIcon} aria-hidden="true"><ShieldCheck /></span><span><b>Backup watcher</b>, a direct call if the relay is down</span></li>
              <li><span className={styles.dotIcon} aria-hidden="true"><ArrowRight /></span><span><b>You</b>, with Protect now</span></li>
            </ul>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>This charter can never</span>
            <ul className={styles.never}>
              <li><X aria-hidden="true" />Borrow, or touch your collateral</li>
              <li><X aria-hidden="true" />Send money anywhere except your own loan</li>
              <li><X aria-hidden="true" />Use more than {budgetUnits !== null ? tokens(budgetUnits, decimals) : 'its budget of'} {symbol}, ever</li>
              <li><X aria-hidden="true" />Act while your health is above {rule ? fmtHealth(rule.trigger) : 'the trigger'}, or after {until}</li>
              <li><X aria-hidden="true" />Spend on a loan it cannot lift back to 1.00</li>
            </ul>
            <div className={styles.money} aria-label="Where money can go: from your wallet, only when needed, to your Venus loan">
              <span>Your wallet</span><span className={styles.moneyLine} aria-hidden="true"><i>only when needed</i></span><span>Your Venus loan</span>
            </div>
          </div>

          <details className={styles.advanced}>
            <summary>Thank the agent that acts</summary>
            <div className={styles.chips} role="group" aria-label="Thank-you per action">
              {(['none', 'small', 'larger'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tip === t} onClick={() => setTip(t)}>
                  {t === 'none' ? 'None' : `${t === 'small' ? 'Small' : 'Larger'}, ${budgetUnits !== null ? tokens(tipFor(t, budgetUnits), decimals) : '…'} ${symbol}`}
                </button>
              ))}
            </div>
            <p className={styles.fine}>Paid per action only to a caller other than you, after the repayment, from a separate tip budget of ten actions' worth that never touches the repayment budget. A tip that cannot be paid is skipped. Keel and the backup watcher act without one.</p>
          </details>

          <div className={styles.grant}>
            <button type="button" className={styles.primary} disabled={Boolean(blocker) || grant.checking} onClick={startGrant}>{grant.checking ? 'Checking the network fee…' : 'Grant a charter'}</button>
            {blocker ? (
              <p className={styles.blocker} role="status">{blocker.words}{blocker.action ? <> <button type="button" className={styles.link} onClick={blocker.action.run}>{blocker.action.label}</button></> : null}</p>
            ) : <p className={styles.fine}>{walletWords} The wallet pays the network fee in {coin}.</p>}
            {grant.preError ? <p className={styles.error} role="alert">{grant.preError}</p> : null}
          </div>
        </aside>
      </div>

      {rule && budgetUnits !== null ? (
        <div className={styles.sticky} data-bottom-bar="" aria-hidden={grant.prep ? true : undefined}>
          <p>Below {fmtHealth(rule.trigger)}, back to {fmtHealth(rule.target)}, up to {tokens(budgetUnits, decimals)} {symbol}, until {until}</p>
          <button type="button" className={styles.primary} disabled={Boolean(blocker) || grant.checking} onClick={startGrant}>Grant a charter</button>
        </div>
      ) : null}

      <Seal
        open={grant.prep !== null}
        phase={grant.phase}
        lines={lines}
        steps={grant.steps}
        wallet={{ pass, words: pass ? 'One touch signs both steps: the allowance and the guard.' : 'Your wallet opens with the allowance and the guard, in that order.' }}
        primary={sealPrimary}
        onPrimary={onSealPrimary}
        onClose={grant.close}
        error={grant.error}
        note={grant.note}
        explorerTx={(h) => `${CHARTER_CHAINS[chainId].explorer}/tx/${h}`}
        done={grant.granted ? { href: `/charters/${chainId}/${grant.granted}`, label: 'Open the charter' } : null}
      />
    </div>
  )
}
