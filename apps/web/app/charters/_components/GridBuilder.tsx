'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfig } from 'wagmi'
import { getPublicClient } from '@wagmi/core'
import { ArrowRight, ShieldCheck, X } from 'lucide-react'
import { encodeFunctionData, parseAbi, type Address, type Hex } from 'viem'
import { CHARTER_CHAINS, V2, gridBandFactoryAbi, type CharterChainId, type ReviewedPool } from '@marque/charters/client'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { AddressChip } from '../../_components/ui'
import {
  GRID_DEVIATION, GRID_MIN_FILL, GRID_SLIP, GRID_WINDOW, amount, dateWords, defaultExecutors, expiryFor, fmtPrice, fullFromFor, gridCalls,
  gridSentence, KIND_DURATIONS, minStepFor, newSalt, pctOfTicks, planGrid, priceAt, toBt, units,
} from '../../../lib/charters-builder-v2'
import { GridReplay } from './GridReplay'
import { BandRule } from './BandRule'
import { CHAIN_NAME, FixtureNote, WhoBar, ago, promptWords, useWho } from './BuilderShell'
import { checkStartingFunds, gridStartingFunds } from '../../../lib/charter-funding'
import { Seal } from './Seal'
import { useGrantSteps } from './useGrantSteps'
import styles from './builder.module.css'

/**
 * Grid Band builder (11_EXPERIENCE): the price ladder. Buys a fixed order at each level as the price falls and sells
 * it one level higher, on one reviewed PancakeSwap v3 pool. Spacing never goes below the factory's safe minimum;
 * ticks never appear. Every price shown is the pool's own 5-minute average or spot, read on chain with its block.
 */
type Pool = ReviewedPool & { spotTick: number; twapTick300: number | null; minStepAtSlip30: number | null; quoteBalance: string; baseBalance: string; baseIsToken0: boolean }
interface Quote { account: string; chainId: number; pools: Pool[]; blockNumber: string; readAt: string; factory: Address | null }
const E18 = 10n ** 18n
const WBNB: Record<CharterChainId, Address> = { 56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 97: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd' }

export function GridBuilder({ initialChain, initialAccount, demo }: { initialChain: CharterChainId; initialAccount: string | null; demo: Record<CharterChainId, string> }) {
  const who = useWho(initialChain, initialAccount, demo)
  const config = useConfig()
  const { chainId, account } = who
  const [quote, setQuote] = useState<Quote | null>(null)
  const [load, setLoad] = useState<'loading' | 'ok' | 'error'>('loading')
  const [poolAt, setPoolAt] = useState(0)
  const [band, setBand] = useState<{ low: number; high: number } | null>(null)
  const [levels, setLevels] = useState(8)
  const [order, setOrder] = useState('50')
  const [buyCap, setBuyCap] = useState('')
  const [twoSided, setTwoSided] = useState(false)
  const [backup, setBackup] = useState(true)
  const [days, setDays] = useState(30)
  const grant = useGrantSteps()

  // Only the newest read may land: switching account or network while one is in flight must never show the old one.
  const seq = useRef(0)
  const read = useCallback(async () => {
    const my = ++seq.current
    setLoad('loading')
    try {
      const r = await fetch(`/api/v1/guards/quote?kind=grid&chainId=${chainId}&account=${account}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('read')
      const q = await r.json() as Quote
      if (my !== seq.current) return
      setQuote(q); setLoad('ok')
    } catch { if (my === seq.current) setLoad('error') }
  }, [chainId, account])
  useEffect(() => { void read() }, [read])

  const pool = quote?.pools[poolAt] ?? null
  const twapBt = pool && pool.twapTick300 !== null ? toBt(pool.twapTick300, pool.baseIsToken0) : null
  const price = twapBt !== null ? priceAt(twapBt) : null
  const spot = pool ? priceAt(toBt(pool.spotTick, pool.baseIsToken0)) : null
  useEffect(() => { if (price) { setBand({ low: price * 0.9, high: twoSided ? price * 1.05 : price * 0.995 }) } }, [pool?.address, twoSided])
  useEffect(() => { setBuyCap(String(Number(order || 0) * levels * 3)) }, [order, levels])

  const minStep = pool ? (pool.minStepAtSlip30 ?? minStepFor(pool.fee)) : 72
  const plan = band && pool ? planGrid(band.low, band.high, levels, minStep) : null
  const fullFrom = plan && twapBt !== null ? fullFromFor(plan, twapBt) : 0
  const full = plan ? plan.slots - fullFrom : 0
  const orderU = units(order || '0', 18) ?? 0n
  const buyCapU = units(buyCap || '0', 18) ?? 0n
  // The base each starting-full level holds: one order's worth at today's average price.
  const baseOrder = full > 0 && price ? (orderU * E18) / units(price.toFixed(8), 18)! : 0n
  const sellCap = plan ? (baseOrder > 0n ? baseOrder : price ? (orderU * E18) / units(price.toFixed(8), 18)! : 0n) * BigInt(plan.slots) * 2n : 0n
  const baseBal = pool ? BigInt(pool.baseBalance) : 0n
  const quoteBal = pool ? BigInt(pool.quoteBalance) : 0n
  const needBase = baseOrder * BigInt(full)
  const isWbnb = pool?.base.toLowerCase() === WBNB[chainId].toLowerCase()
  const wrapNeed = isWbnb && needBase > baseBal ? needBase - baseBal : 0n
  const expiresAt = useMemo(() => expiryFor(days, Math.floor(Date.now() / 1000)), [days])
  const until = dateWords(expiresAt)
  const pair = pool ? `${pool.baseSymbol.replace(/^W/, '')}/${pool.quoteSymbol}` : 'the pair'
  const factory = V2[chainId].gridFactory
  const minOrder = chainId === 56 ? 5 : 1

  const blocker = (() => {
    if (load !== 'ok' || quote?.chainId !== chainId || quote.account.toLowerCase() !== account.toLowerCase()) return { words: 'Read your wallet successfully before granting.' }
    if (!factory) return { words: `Grid Band is not on ${CHAIN_NAME[chainId]} yet.` }
    if (!pool || !plan || price === null) return { words: pool && pool.twapTick300 === null ? 'This pool has no 5-minute history to read yet.' : 'Reading the pool.' }
    if (Number(order) < minOrder) return { words: `Use an order of at least ${minOrder} ${pool.quoteSymbol}: below that, the caller's gas outweighs the trade.` }
    if (buyCapU < orderU) return { words: 'The buy limit must cover at least one order.' }
    if (!twoSided && full > 0) return { words: `${full} of your levels sit above today's average price of ${fmtPrice(price)}. Lower the highest level, or turn on two-sided to start them holding ${pool.baseSymbol}.` }
    if (twoSided && full > 0 && !isWbnb && baseBal < needBase) return { words: `Two-sided needs ${amount(needBase, 18)} ${pool.baseSymbol} for the levels above the price; this wallet holds ${amount(baseBal, 18)}.` }
    if (plan.slots > full && quoteBal < orderU) return { words: `Add enough ${pool.quoteSymbol} for at least one ${amount(orderU, 18)} ${pool.quoteSymbol} buy before granting, then read your wallet again.` }
    return who.walletBlocker('wallet')
  })()

  const start = async () => {
    if (blocker || !pool || !plan || !factory || !who.wallet) return
    const pub = getPublicClient(config, { chainId })!
    const p = { pool: pool.address, base: pool.base, lowerBt: plan.lowerBt, stepTicks: plan.stepTicks, slots: plan.slots, orderQuote: orderU, baseOrder: full > 0 ? baseOrder : 0n,
      buyCap: buyCapU, sellCap, twapWindow: GRID_WINDOW, maxDeviation: GRID_DEVIATION, slipTicks: GRID_SLIP, minFillBps: GRID_MIN_FILL }
    const executors = defaultExecutors('grid', backup)
    try {
      // The factory decides which levels start full from its own average; the address commits to that number.
      const ff = await pub.readContract({ address: factory, abi: gridBandFactoryAbi, functionName: 'fullFromNow', args: [p] })
      const salt = newSalt()
      const create = { p, expiresAt, tipToken: pool.quote, tipPerAction: 0n, tipBudget: 0n, executors, fullFrom: ff }
      const predicted = await pub.readContract({ address: factory, abi: gridBandFactoryAbi, functionName: 'predict', args: [who.wallet, create, salt] })
      const calls = gridCalls(factory, pool, predicted, p, expiresAt, executors, ff, salt as Hex)
      const steps = [
        ...(wrapNeed > 0n ? [{ label: `Wrap ${amount(wrapNeed, 18)} BNB into WBNB for the levels above the price`, to: WBNB[chainId], data: encodeFunctionData({ abi: parseAbi(['function deposit() payable']), functionName: 'deposit' }), value: wrapNeed }] : []),
        { label: `Allow up to ${amount(buyCapU, 18)} ${pool.quoteSymbol} for buys, this grid only`, to: calls[0]!.to as Address, data: calls[0]!.data as Hex },
        { label: `Allow up to ${amount(sellCap, 18)} ${pool.baseSymbol} for sells, this grid only`, to: calls[1]!.to as Address, data: calls[1]!.data as Hex },
        { label: 'Create the grid', to: calls[2]!.to as Address, data: calls[2]!.data as Hex },
      ]
      await grant.prepare({
        chainId, owner: who.wallet, steps, gasFallback: [...(wrapNeed > 0n ? [50_000n] : []), 70_000n, 70_000n, 3_200_000n],
        preflight: () => checkStartingFunds(pub, who.wallet!, gridStartingFunds(pool, plan.slots, Number(ff), orderU, baseOrder, wrapNeed)),
        verify: async () => ((await pub.readContract({ address: factory, abi: gridBandFactoryAbi, functionName: 'isCharter', args: [predicted] })) ? predicted : null),
      })
    } catch (e) { grant.setPreError(e instanceof Error ? e.message.slice(0, 200) : 'The factory could not be read.') }
  }

  const lines = pool && plan ? [
    { label: 'Trades', value: `${pair} on PancakeSwap v3, ${pool.fee / 10_000}% pool${pool.fixture ? ' (testnet fixture)' : ''}` },
    { label: 'Where', value: `${CHAIN_NAME[chainId]}; straight from and to your wallet` },
    { label: 'Levels', value: `${plan.slots} between ${fmtPrice(plan.prices[0]!)} and ${fmtPrice(plan.prices[plan.slots]!)}, one every ${plan.stepPct.toFixed(2)}%, ${amount(orderU, 18)} ${pool.quoteSymbol} each` },
    { label: 'Can buy in total', value: `${amount(buyCapU, 18)} ${pool.quoteSymbol}, recycled proceeds counted again` },
    { label: 'Can sell in total', value: `${amount(sellCap, 18)} ${pool.baseSymbol}` },
    { label: 'Ends', value: `${until}, or when you end it` },
  ] : []

  const marks = plan && twapBt !== null ? plan.prices.slice(0, plan.slots).map((p, s) => ({ at: p, state: (s >= fullFrom ? 'hold' : 'buy') as 'hold' | 'buy', label: `${s >= fullFrom ? 'Holding, sells at' : 'Buys at'} ${fmtPrice(s >= fullFrom ? plan.prices[s + 1]! : p)}` })) : []
  return (
    <div className={styles.builder}>
      <WhoBar who={who} placeholder="Paste any address" onChain={() => setPoolAt(0)} />
      <div className={styles.grid}>
        <div className={styles.left}>
          <section className={`${styles.panel} ${styles.position}`} aria-labelledby="gb-h" aria-busy={load === 'loading'}>
            <div className={styles.posTop}>
              <div>
                <h2 id="gb-h" className={styles.panelTitle}>{pair} on PancakeSwap</h2>
                <div className={styles.meta}>
                  <AddressChip value={account} chainId={chainId} />
                  {quote ? <span className={styles.prov} title={`Read from chain at block ${quote.blockNumber}`}>Onchain, read {ago(quote.readAt, who.now)}</span> : null}
                </div>
              </div>
              <div className={styles.hfBig}>
                <span className={`mono ${styles.hfValue}`}>{price !== null ? fmtPrice(price) : '…'}</span>
                <span className={styles.caption}>5-minute average price</span>
              </div>
            </div>
            {pool ? <FixtureNote show={pool.fixture} /> : null}
            {load === 'error' ? (
              <div className={styles.empty}><p>The pools could not be read on {CHAIN_NAME[chainId]} just now.</p><button type="button" className={styles.ghost} onClick={() => void read()}>Read again</button></div>
            ) : quote && pool && plan && band && price !== null ? (
              <>
                {quote.pools.length > 1 ? (
                  <div className={styles.chips} role="group" aria-label="Pool">
                    {quote.pools.map((x, i) => <button key={x.address} type="button" aria-pressed={i === poolAt} onClick={() => setPoolAt(i)}>{x.baseSymbol.replace(/^W/, '')}/{x.quoteSymbol} {x.fee / 10_000}%</button>)}
                  </div>
                ) : null}
                <div className={styles.legs}>
                  <div><b className="mono">{amount(quoteBal, 18, 2)} {pool.quoteSymbol}</b><span>In this wallet</span></div>
                  <div><b className="mono">{amount(baseBal, 18, 4)} {pool.baseSymbol}</b><span>{isWbnb ? 'Wrapped BNB in this wallet' : 'In this wallet'}</span></div>
                  <div><b className="mono">{spot !== null ? fmtPrice(spot) : 'n/a'}</b><span>Spot price now</span></div>
                </div>
                <BandRule min={price * 0.7} max={price * 1.3} low={band.low} high={band.high} onChange={setBand} step={price / 1000} bigStep={price / 100} minGap={price * pctOfTicks(minStep) / 100}
                  format={fmtPrice} words={(w, v) => (w === 'low' ? `Lowest level ${fmtPrice(v)}` : `Highest level ${fmtPrice(v)}`)} lowName="lowest" highName="highest"
                  now={price} nowLabel={`Now ${fmtPrice(price)}`} marks={marks} label={`Price ladder for ${pair}: drag the lowest and highest level`} tones={['moss', 'brass']} />
                <div className={styles.notes}>
                  <div data-tone="moss"><b>Buys {amount(orderU, 18)} {pool.quoteSymbol} of {pool.baseSymbol} at each level down</b><span>{plan.slots} levels, one every {plan.stepPct.toFixed(2)}%.{fullFrom < plan.slots ? ` ${plan.slots - fullFrom} start holding ${pool.baseSymbol} to sell.` : ''}</span></div>
                  <div data-tone="amber"><b>Sells each one a level higher</b><span>At the worst prices the contract allows, fees included, a round trip still returns at least what it spent.</span></div>
                </div>
                <div className={styles.field}>
                  <div className={styles.row}><span className={styles.label}>Levels</span><span className={styles.caption}>{plan.clamped ? 'Closer levels could lose money on a round trip after fees' : `One every ${plan.stepPct.toFixed(2)}%`}</span></div>
                  <div className={styles.chips} role="group" aria-label="Number of levels">
                    <button type="button" aria-label="Fewer levels" onClick={() => setLevels((n) => Math.max(1, n - 1))}>−</button>
                    <span className="mono" aria-live="polite">{plan.slots}</span>
                    <button type="button" aria-label="More levels" disabled={plan.clamped} onClick={() => setLevels((n) => Math.min(40, n + 1))}>+</button>
                  </div>
                </div>
                <label className={styles.toggle}><input type="checkbox" checked={twoSided} onChange={(e) => setTwoSided(e.target.checked)} /> <span>Two-sided: place {pool.baseSymbol} in the levels above the price, sold from your wallet as the price rises</span></label>
                {isWbnb ? <p className={styles.fine}>The grid trades wrapped BNB (WBNB). {wrapNeed > 0n ? `The Seal adds one step to wrap ${amount(wrapNeed, 18)} BNB.` : `${amount(baseBal, 18)} of your BNB is wrapped${full > 0 ? ': enough for the starting levels' : ''}.`}</p> : null}
              </>
            ) : <div className={styles.skeleton} aria-hidden="true" />}
          </section>
          {plan && price !== null ? <GridReplay key={pool?.address} plan={plan} start={price} /> : null}
          <section className={styles.panel} aria-labelledby="gb-left">
            <h2 id="gb-left" className={styles.panelTitle}>What remains</h2>
            <p className={styles.fine}>In a long fall the grid holds {pool?.baseSymbol ?? 'the base token'} bought above the price until the price recovers to the next level. That is the strategy, not a fault. The average price can be pushed by sustained trading in a shallow pool, which is why only reviewed deep pools are offered. Contracts are unaudited.</p>
          </section>
        </div>

        <aside className={`${styles.panel} ${styles.paper}`} aria-labelledby="gb-charter">
          <h2 id="gb-charter" className={styles.panelTitle}>Your charter</h2>
          {plan && pool ? <p className={styles.sentence}>{gridSentence({ low: fmtPrice(plan.prices[0]!), high: fmtPrice(plan.prices[plan.slots]!), pair, order: amount(orderU, 18), quote: pool.quoteSymbol, levels: plan.slots, base: pool.baseSymbol, buyCap: amount(buyCapU, 18), sellCap: amount(sellCap, 18), until })}</p> : <div className={styles.skeleton} aria-hidden="true" />}
          <div className={styles.field}>
            <div className={styles.row}><span className={styles.label}>Order at each level</span><span className={styles.caption}>Paid straight from your wallet to the pool</span></div>
            <div className={styles.chips} role="group" aria-label="Order size">{['25', '50', '100'].map((o) => <button key={o} type="button" aria-pressed={order === o} onClick={() => setOrder(o)}>{o} {pool?.quoteSymbol ?? ''}</button>)}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.row}><label htmlFor="gb-cap">Most it can buy, in total</label><span className={styles.caption}>Enough for {orderU > 0n ? String(buyCapU / orderU) : '0'} orders</span></div>
            <div className={styles.amount}><input id="gb-cap" inputMode="decimal" value={buyCap} onChange={(e) => setBuyCap(e.target.value)} /><span>{pool?.quoteSymbol ?? ''}</span></div>
            <p className={styles.fine}>And it can sell at most {amount(sellCap, 18)} {pool?.baseSymbol ?? ''} in total. Recycled proceeds count again.{quoteBal < buyCapU ? ` This wallet holds ${amount(quoteBal, 18, 2)}: a level with too little waiting in the wallet does not trade.` : ''}</p>
          </div>
          <div className={styles.field}>
            <div className={styles.row}><span className={styles.label}>Ends</span><span className={styles.caption}>{until}</span></div>
            <div className={styles.chips} role="group" aria-label="Duration">{KIND_DURATIONS.grid.map((x) => <button key={x} type="button" aria-pressed={days === x} onClick={() => setDays(x)}>{x} days</button>)}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.row}><span className={styles.label}>Who may trade</span><span className={styles.caption}>Only agents you name</span></div>
            <ul className={styles.watchers}>
              <li><AgentAvatar id="lattice" reference size={28} /><span><b>Lattice</b>, named by you, through a key for this grid only</span></li>
              <li><span className={styles.dotIcon} aria-hidden="true"><ShieldCheck /></span><span><label><input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} /> <b>Marque backup</b>, named by you, if Lattice is quiet</label></span></li>
              <li><span className={styles.dotIcon} aria-hidden="true"><ArrowRight /></span><span><b>You</b>, with Trade now</span></li>
            </ul>
            <p className={styles.fine}>No one else can: whoever picks the moment of a trade could profit from it, so only agents you name may choose it.</p>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>This charter can never</span>
            <ul className={styles.never}>
              <li><X aria-hidden="true" />Trade any other pair or pool</li>
              <li><X aria-hidden="true" />Hold your funds: everything goes straight from and to your wallet</li>
              <li><X aria-hidden="true" />Buy more than {amount(buyCapU, 18)} {pool?.quoteSymbol ?? ''} or sell more than {amount(sellCap, 18)} {pool?.baseSymbol ?? ''} in total</li>
              <li><X aria-hidden="true" />Trade between levels, or further than {(GRID_SLIP / 100).toFixed(1)}% from the 5-minute average</li>
            </ul>
            <div className={styles.money} aria-label="Where money can go: from your wallet, at a level, through the pool, back to your wallet"><span>Your wallet</span><span className={styles.moneyLine} aria-hidden="true"><i>at a level</i></span><span>The pool, then your wallet</span></div>
          </div>
          <div className={styles.grant}>
            <button type="button" className={styles.primary} disabled={Boolean(blocker) || grant.checking} onClick={() => void start()}>{grant.checking ? 'Checking the network fee…' : 'Grant a charter'}</button>
            {blocker ? <p className={styles.blocker} role="status">{blocker.words}{blocker.action ? <> <button type="button" className={styles.link} onClick={blocker.action.run}>{blocker.action.label}</button></> : null}</p>
              : <p className={styles.fine}>{promptWords(who.pass, wrapNeed > 0n ? 4 : 3, `${wrapNeed > 0n ? 'the wrap, ' : ''}the two allowances, then the grid`)}</p>}
            {grant.preError ? <p className={styles.error} role="alert">{grant.preError}</p> : null}
          </div>
        </aside>
      </div>
      {plan && pool ? (
        <div className={styles.sticky} data-bottom-bar="" aria-hidden={grant.grant ? true : undefined}>
          <p>{plan.slots} levels, {fmtPrice(plan.prices[0]!)} to {fmtPrice(plan.prices[plan.slots]!)}, until {until}</p>
          <button type="button" className={styles.primary} disabled={Boolean(blocker) || grant.checking} onClick={() => void start()}>Grant a charter</button>
        </div>
      ) : null}
      <Seal open={grant.grant !== null} phase={grant.phase} lines={lines} steps={grant.steps}
        wallet={{ pass: who.pass, words: who.pass ? 'One touch signs every step.' : 'Your wallet opens with each step in order. Trades go straight from and to your wallet.' }}
        primary={grant.phase === 'sealed' || grant.phase === 'signing' ? null : grant.phase === 'failed' ? 'Try again' : who.pass ? 'Seal with your fingerprint' : 'Open your wallet'}
        onPrimary={() => void grant.sign()} onClose={grant.close} error={grant.error} note={grant.note}
        explorerTx={(h) => `${CHARTER_CHAINS[chainId].explorer}/tx/${h}`}
        done={grant.granted ? { href: `/charters/${chainId}/${grant.granted}?granted=1`, label: 'Open the charter' } : null} />
    </div>
  )
}

