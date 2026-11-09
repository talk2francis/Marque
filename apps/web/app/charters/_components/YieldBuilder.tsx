'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConfig } from 'wagmi'
import { getPublicClient } from '@wagmi/core'
import { ArrowRight, ShieldCheck, X } from 'lucide-react'
import type { Address, Hex } from 'viem'
import { CHARTER_CHAINS, V2, yieldSweepFactoryAbi, type CharterChainId } from '@marque/charters/client'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { AddressChip } from '../../_components/ui'
import { amount, compact, dateWords, expiryFor, KIND_DURATIONS, newSalt, units, yieldCalls, yieldDefaults, yieldNow, yieldProblem, yieldSentence } from '../../../lib/charters-builder-v2'
import { BandRule } from './BandRule'
import { CHAIN_NAME, WhoBar, ago, promptWords, useWho } from './BuilderShell'
import { Seal } from './Seal'
import { useGrantSteps } from './useGrantSteps'
import styles from './builder.module.css'

/**
 * Yield Sweep builder (11_EXPERIENCE): the wallet band. Keeps the owner's wallet between a floor and a ceiling and
 * puts the rest into Venus in the owner's name. Every number comes from the quote route (read on chain, with its
 * block) or from what the person typed; the spend simulation is labelled as one.
 */
interface Market { vToken: Address; token: Address; symbol: string; decimals: number; balance: string; collateralMember: boolean; borrows: boolean; cash: string; supplyCapRoom: string; unlimitedCap: boolean }
interface Quote { markets: Market[]; blockNumber: string; readAt: string; factory: Address | null }
const num = (v: bigint, d: number) => Number(v) / 10 ** d

export function YieldBuilder({ initialChain, initialAccount, demo }: { initialChain: CharterChainId; initialAccount: string | null; demo: Record<CharterChainId, string> }) {
  const who = useWho(initialChain, initialAccount, demo)
  const config = useConfig()
  const { chainId, account } = who
  const [quote, setQuote] = useState<Quote | null>(null)
  const [load, setLoad] = useState<'loading' | 'ok' | 'error'>('loading')
  const [vToken, setVToken] = useState<Address | null>(null)
  const [band, setBand] = useState<{ low: number; high: number } | null>(null)
  const [minAction, setMinAction] = useState('')
  const [cap, setCap] = useState('')
  const [days, setDays] = useState(90)
  const [collateralMode, setCollateralMode] = useState(false)
  const [minHealth, setMinHealth] = useState('')
  const [guardTarget, setGuardTarget] = useState<number | null>(null)
  const [spend, setSpend] = useState(0)
  const grant = useGrantSteps()

  const read = useCallback(async () => {
    setLoad('loading')
    try {
      const r = await fetch(`/api/v1/guards/quote?kind=yield&chainId=${chainId}&account=${account}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('read')
      const q = await r.json() as Quote
      setQuote(q); setLoad('ok')
      // A market the owner is not a member of, with money in the wallet; otherwise the first.
      const pick = q.markets.find((m) => !m.collateralMember && BigInt(m.balance) > 0n) ?? q.markets.find((m) => !m.collateralMember) ?? q.markets[0]
      setVToken((v) => (v && q.markets.some((m) => m.vToken === v) ? v : pick?.vToken ?? null))
      // Loan Guards on this account set the lowest health a collateral-mode sweep may leave (target + 0.20).
      const g = await fetch(`/api/v1/guards?chainId=${chainId}&owner=${account}&state=armed&kind=loan&limit=20`, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null)
      const targets = [...(g?.guards ?? []).map((x: { target: string }) => Number(x.target) / 1e18), ...(g?.charters ?? []).map((x: { params: { p: { target: string } } }) => Number(x.params.p.target) / 1e18)]
      setGuardTarget(targets.length ? Math.max(...targets) : null)
    } catch { setLoad('error') }
  }, [chainId, account])
  useEffect(() => { void read() }, [read])

  const m = quote?.markets.find((x) => x.vToken === vToken) ?? null
  const d = m?.decimals ?? 18
  const balance = m ? BigInt(m.balance) : 0n
  // Defaults from the wallet whenever the market or the account changes.
  useEffect(() => {
    if (!m) return
    const df = yieldDefaults(BigInt(m.balance), m.decimals)
    setBand({ low: num(df.floor, m.decimals), high: num(df.ceiling, m.decimals) })
    setMinAction(amount(df.minAction, m.decimals, 2).replace(/,/g, ''))
    setCap(amount(df.supplyCap, m.decimals, 0).replace(/,/g, ''))
    setCollateralMode(false)
  }, [m?.vToken, account]) // eslint-disable-line react-hooks/exhaustive-deps

  const floor = band ? units(band.low.toFixed(Math.min(d, 6)), d) ?? 0n : 0n
  const ceiling = band ? units(band.high.toFixed(Math.min(d, 6)), d) ?? 0n : 0n
  const minA = units(minAction || '0', d) ?? 0n
  const capU = units(cap || '0', d) ?? 0n
  const minHealthWad = collateralMode ? (units(minHealth || '0', 18) ?? 0n) : 0n
  const problem = band ? yieldProblem({ vToken: vToken!, floor, ceiling, minAction: minA, supplyCap: capU, minHealthAfter: minHealthWad }, 0n) : null
  const nowAct = yieldNow(balance, { floor, ceiling })
  const scaleMax = Math.max(num(balance, d) * 2, band ? band.high * 1.3 : 0, 10)
  const step = scaleMax > 2000 ? 10 : scaleMax > 200 ? 1 : 0.1
  const expiresAt = useMemo(() => expiryFor(days, Math.floor(Date.now() / 1000)), [days])
  const until = dateWords(expiresAt)
  const sym = m?.symbol ?? 'USDT'
  const fmt = (v: number) => `${v.toLocaleString('en-US', { maximumFractionDigits: step < 1 ? 1 : 0 })}`
  const healthFloor = guardTarget !== null ? Math.max(1.1, guardTarget + 0.2) : 1.1
  const afterSpend = balance - (units(String(spend), d) ?? 0n)
  const spendAct = yieldNow(afterSpend > 0n ? afterSpend : 0n, { floor, ceiling })

  const factory = V2[chainId].yieldFactory
  const blocker = (() => {
    if (!factory) return { words: `Yield Sweep is not on ${CHAIN_NAME[chainId]} yet.` }
    if (!m || !band) return { words: 'Reading your wallet and Venus.' }
    if (m.collateralMember && !collateralMode) return { words: `You ${m.borrows ? 'borrow' : 'use'} ${sym} on Venus, so Venus counts ${sym} you supply as collateral: liquidators could take it, and taking it out would lower your loan health. Use another stablecoin, or turn on collateral mode below.` }
    if (collateralMode && (Number(minHealth) < healthFloor || !minHealth)) return { words: `Set the lowest health a withdrawal may leave: at least ${healthFloor.toFixed(2)}${guardTarget !== null ? ' (your Loan Guard target plus 0.20)' : ''}.` }
    if (problem === 'band') return { words: 'Keep the ceiling at least two smallest moves above the floor, so a supply cannot be followed straight away by a withdrawal.' }
    if (problem === 'cap') return { words: 'The lifetime supply limit must be at least one smallest move.' }
    if (!m.unlimitedCap && BigInt(m.supplyCapRoom) === 0n) return { words: `Venus is not taking more ${sym} right now (its supply cap is reached).` }
    return who.walletBlocker('wallet')
  })()

  const start = async () => {
    if (blocker || !m || !factory || !who.wallet) return
    const pub = getPublicClient(config, { chainId })!
    const salt = newSalt()
    const p = { vToken: m.vToken, floor, ceiling, minAction: minA, supplyCap: capU, minHealthAfter: minHealthWad }
    const create = { p, expiresAt, tipPerAction: 0n, tipBudget: 0n }
    try {
      const [predicted, vAllow] = await Promise.all([
        pub.readContract({ address: factory, abi: yieldSweepFactoryAbi, functionName: 'predict', args: [who.wallet, create, salt] }),
        pub.readContract({ address: factory, abi: yieldSweepFactoryAbi, functionName: 'vTokenAllowanceFor', args: [m.vToken, capU] }),
      ])
      const calls = yieldCalls(factory, m.token, m.vToken, predicted, vAllow, p, expiresAt, 0n, 0n, salt as Hex)
      await grant.prepare({
        chainId, owner: who.wallet,
        steps: [
          { label: `Allow up to ${amount(capU, d)} ${sym} for this sweep only`, ...calls[0]! },
          { label: `Allow it to bring back only what it supplied (v${sym})`, ...calls[1]! },
          { label: 'Create the sweep', ...calls[2]! },
        ].map((s) => ({ label: s.label, to: s.to as Address, data: s.data as Hex })),
        gasFallback: [70_000n, 70_000n, 2_600_000n],
        verify: async () => ((await pub.readContract({ address: factory, abi: yieldSweepFactoryAbi, functionName: 'isCharter', args: [predicted] })) ? predicted : null),
      })
    } catch (e) { grant.setPreError(e instanceof Error ? e.message.slice(0, 200) : 'The factory could not be read.') }
  }

  const lines = m && band ? [
    { label: 'Keeps', value: `between ${amount(floor, d)} and ${amount(ceiling, d)} ${sym} in your wallet` },
    { label: 'Where', value: `Venus Core, ${CHAIN_NAME[chainId]}, in your name (the v${sym} land in your wallet)` },
    { label: 'Supplies', value: `what is above ${amount(ceiling, d)}, down to the middle, at least ${amount(minA, d)} at a time` },
    { label: 'Withdraws', value: `only what this charter supplied, when you fall below ${amount(floor, d)}${collateralMode ? `, and only while your loan health stays at or above ${minHealth}` : ''}` },
    { label: 'Can supply in total', value: `${amount(capU, d)} ${sym}, over its whole life` },
    { label: 'Ends', value: `${until}, or when you end it` },
  ] : []

  return (
    <div className={styles.builder}>
      <WhoBar who={who} placeholder="Paste any address" onChain={() => setVToken(null)} />
      <div className={styles.grid}>
        <div className={styles.left}>
          <section className={`${styles.panel} ${styles.position}`} aria-labelledby="ys-h" aria-busy={load === 'loading'}>
            <div className={styles.posTop}>
              <div>
                <h2 id="ys-h" className={styles.panelTitle}>{who.isDemo ? 'An example wallet' : 'Your wallet'}</h2>
                <div className={styles.meta}>
                  <AddressChip value={account} chainId={chainId} />
                  {quote ? <span className={styles.prov} title={`Read from chain at block ${quote.blockNumber}`}>Onchain, block {Number(quote.blockNumber).toLocaleString('en-US')}, read {ago(quote.readAt, who.now)}</span> : null}
                </div>
              </div>
              <div className={styles.hfBig}>
                <span className={`mono ${styles.hfValue}`}>{m ? amount(balance, d, 2) : '…'}</span>
                <span className={styles.caption}>{sym} in this wallet now</span>
              </div>
            </div>
            {load === 'error' ? (
              <div className={styles.empty}><p>The wallet could not be read on {CHAIN_NAME[chainId]} just now.</p><button type="button" className={styles.ghost} onClick={() => void read()}>Read again</button></div>
            ) : quote && m && band ? (
              <>
                <div className={styles.chips} role="group" aria-label="Stablecoin to sweep">
                  {quote.markets.map((x) => (
                    <button key={x.vToken} type="button" aria-pressed={x.vToken === vToken} onClick={() => setVToken(x.vToken)}>
                      {x.symbol}{x.collateralMember ? ' (collateral)' : ''}
                    </button>
                  ))}
                </div>
                <BandRule min={0} max={scaleMax} low={band.low} high={band.high} onChange={setBand} step={step} bigStep={step * 10} minGap={2 * num(minA, d)}
                  format={fmt} words={(w, v) => (w === 'low' ? `Keeps at least ${fmt(v)} ${sym}` : `Keeps at most ${fmt(v)} ${sym}`)} lowName="floor" highName="ceiling"
                  now={num(balance, d)} nowLabel={`Wallet ${fmt(num(balance, d))}`}
                  ghost={nowAct.action === 'supply' ? { from: num(nowAct.after, d), to: num(balance, d), label: 'Would go to Venus now' } : null}
                  label={`Wallet band in ${sym}: drag the floor and the ceiling`} tones={['amber', 'moss']} />
                <div className={styles.notes}>
                  <div data-tone="moss">
                    <b>{nowAct.action === 'supply' ? `${amount(nowAct.amount, d)} ${sym} would go to Venus now` : nowAct.action === 'withdraw' ? 'Below your floor today' : 'Inside your band today'}</b>
                    <span>{nowAct.action === 'supply' ? `Leaving ${amount(nowAct.after, d)} in your wallet.` : nowAct.action === 'withdraw' ? 'A new sweep has nothing of its own to bring back yet.' : 'Nothing to do until your balance leaves the band.'}</span>
                  </div>
                  <div data-tone="amber">
                    <b>Venus cash to pay out: {compact(BigInt(m.cash), d)} {sym}</b>
                    <span>Read now. Withdrawals are bounded by what Venus can pay at that moment, never promised.</span>
                  </div>
                </div>
                {m.collateralMember ? (
                  <div className={styles.attention} role="alert">
                    <p>You {m.borrows ? 'borrow' : 'have entered'} {sym} on Venus, so Venus counts {sym} you supply as collateral: liquidators could take it, and taking it out would lower your loan health. Use another stablecoin above, or count your savings as collateral and set the lowest health a withdrawal may leave.</p>
                    <label className={styles.toggle}><input type="checkbox" checked={collateralMode} onChange={(e) => { setCollateralMode(e.target.checked); setMinHealth(healthFloor.toFixed(2)) }} /> <span>Count my savings as collateral</span></label>
                    {collateralMode ? (
                      <div className={styles.amount}><input aria-label="Lowest health a withdrawal may leave" inputMode="decimal" value={minHealth} onChange={(e) => setMinHealth(e.target.value)} /><span>health, at least {healthFloor.toFixed(2)}</span></div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : <div className={styles.skeleton} aria-hidden="true" />}
          </section>

          {m && band ? (
            <section className={styles.panel} aria-labelledby="ys-sim">
              <h2 id="ys-sim" className={styles.panelTitle}>If you spend tomorrow <span className={styles.prov}>Simulation</span></h2>
              <label className={styles.field}>
                <span className={styles.row}><span className={styles.label}>You spend</span><span className="mono">{fmt(spend)} {sym}</span></span>
                <input type="range" min={0} max={Math.max(1, Math.round(num(balance, d)))} step={step} value={spend} onChange={(e) => setSpend(Number(e.target.value))} aria-valuetext={`You spend ${fmt(spend)} ${sym}`} />
              </label>
              <p className={styles.fine}>{spendAct.action === 'withdraw' ? `Your wallet would fall to ${amount(afterSpend > 0n ? afterSpend : 0n, d)}: the sweep brings back up to ${amount(spendAct.amount, d)} of what it supplied, to ${amount(spendAct.after, d)}.` : spendAct.action === 'supply' ? `Still above your ceiling: it would supply ${amount(spendAct.amount, d)}.` : 'Still inside your band: nothing moves.'} Uses today&apos;s balance; a projection, not a record.</p>
            </section>
          ) : null}
        </div>

        <aside className={`${styles.panel} ${styles.paper}`} aria-labelledby="ys-charter">
          <h2 id="ys-charter" className={styles.panelTitle}>Your charter</h2>
          {band ? <p className={styles.sentence}>{yieldSentence({ floor: amount(floor, d), ceiling: amount(ceiling, d), cap: amount(capU, d), symbol: sym, until })}</p> : <div className={styles.skeleton} aria-hidden="true" />}
          <div className={styles.field}>
            <div className={styles.row}><label htmlFor="ys-min">Smallest move</label><span className={styles.caption}>Below this, nothing moves</span></div>
            <div className={styles.amount}><input id="ys-min" inputMode="decimal" value={minAction} onChange={(e) => setMinAction(e.target.value)} /><span>{sym}</span></div>
          </div>
          <div className={styles.field}>
            <div className={styles.row}><label htmlFor="ys-cap">Most it can supply, in total</label><span className={styles.caption}>Recycled money counts again</span></div>
            <div className={styles.amount}><input id="ys-cap" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} /><span>{sym}</span></div>
          </div>
          <div className={styles.field}>
            <div className={styles.row}><span className={styles.label}>Ends</span><span className={styles.caption}>{until}</span></div>
            <div className={styles.chips} role="group" aria-label="Duration">{KIND_DURATIONS.yield.map((x) => <button key={x} type="button" aria-pressed={days === x} onClick={() => setDays(x)}>{x} days</button>)}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.row}><span className={styles.label}>Who acts</span><span className={styles.caption}>Anyone may press the button; the result is the same</span></div>
            <ul className={styles.watchers}>
              <li><AgentAvatar id="sluicegate" reference size={28} /><span><b>Sluicegate</b>, Marque&apos;s yield agent, from its own account</span></li>
              <li><span className={styles.dotIcon} aria-hidden="true"><ShieldCheck /></span><span><b>Marque backup</b>, if Sluicegate is quiet</span></li>
              <li><span className={styles.dotIcon} aria-hidden="true"><ArrowRight /></span><span><b>You</b>, with Run now</span></li>
            </ul>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>This charter can never</span>
            <ul className={styles.never}>
              <li><X aria-hidden="true" />Move money anywhere but between your wallet and your own Venus balance</li>
              <li><X aria-hidden="true" />Touch Venus supply you made yourself: it brings back at most what it supplied</li>
              <li><X aria-hidden="true" />Supply more than {amount(capU, d)} {sym} over its life</li>
              <li><X aria-hidden="true" />Borrow, or act after {until}</li>
            </ul>
            <div className={styles.money} aria-label="Where money can go: between your wallet and your own Venus balance"><span>Your wallet</span><span className={styles.moneyLine} aria-hidden="true"><i>in your name</i></span><span>Venus, yours</span></div>
            <p className={styles.fine}>Money in Venus carries Venus&apos;s protocol risk, and Venus may not have free cash at a given moment. You can withdraw your v{sym} in the Venus app at any time. Contracts are unaudited.</p>
          </div>
          <div className={styles.grant}>
            <button type="button" className={styles.primary} disabled={Boolean(blocker) || grant.checking} onClick={() => void start()}>{grant.checking ? 'Checking the network fee…' : 'Grant a charter'}</button>
            {blocker ? <p className={styles.blocker} role="status">{blocker.words}{blocker.action ? <> <button type="button" className={styles.link} onClick={blocker.action.run}>{blocker.action.label}</button></> : null}</p>
              : <p className={styles.fine}>{promptWords(who.pass, 3, `the ${sym} allowance, the v${sym} allowance, then the sweep`)} The wallet pays the network fee in {chainId === 97 ? 'tBNB' : 'BNB'}.</p>}
            {grant.preError ? <p className={styles.error} role="alert">{grant.preError}</p> : null}
          </div>
        </aside>
      </div>
      {band ? (
        <div className={styles.sticky} data-bottom-bar="" aria-hidden={grant.grant ? true : undefined}>
          <p>Keep {amount(floor, d)} to {amount(ceiling, d)} {sym}, rest to Venus, until {until}</p>
          <button type="button" className={styles.primary} disabled={Boolean(blocker) || grant.checking} onClick={() => void start()}>Grant a charter</button>
        </div>
      ) : null}
      <Seal open={grant.grant !== null} phase={grant.phase} lines={lines} steps={grant.steps}
        wallet={{ pass: who.pass, words: who.pass ? 'One touch signs all three steps.' : 'Your wallet opens with the two allowances and the sweep, in that order.' }}
        primary={grant.phase === 'sealed' || grant.phase === 'signing' ? null : grant.phase === 'failed' ? 'Try again' : who.pass ? 'Seal with your fingerprint' : 'Open your wallet'}
        onPrimary={() => void grant.sign()} onClose={grant.close} error={grant.error} note={grant.note}
        explorerTx={(h) => `${CHARTER_CHAINS[chainId].explorer}/tx/${h}`}
        done={grant.granted ? { href: `/charters/${chainId}/${grant.granted}`, label: 'Open the charter' } : null} />
    </div>
  )
}
