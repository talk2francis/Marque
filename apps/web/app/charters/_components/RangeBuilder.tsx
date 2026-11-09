'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfig } from 'wagmi'
import { getPublicClient } from '@wagmi/core'
import { ArrowRight, ShieldCheck, X } from 'lucide-react'
import { getAddress, keccak256, toBytes, type Address } from 'viem'
import { CHARTER_CHAINS, V2, rangeKeeperFactoryAbi, type CharterChainId, type ReviewedPool } from '@marque/charters/client'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { AddressChip } from '../../_components/ui'
import {
  RANGE_DEFAULTS, centeredRange, isFullRange, dateWords, defaultExecutors, expiryFor, fmtPrice, KIND_DURATIONS, minRangeWidth, newSalt, priceAt, rangeGrantCall, rangeSentence,
} from '../../../lib/charters-builder-v2'
import { BandRule } from './BandRule'
import { CHAIN_NAME, FixtureNote, WhoBar, ago, promptWords, useWho } from './BuilderShell'
import { Seal } from './Seal'
import { useGrantSteps } from './useGrantSteps'
import styles from './builder.module.css'

/**
 * Range Keeper builder (11_EXPERIENCE): the range band. The position NFT moves into the owner's own keeper contract
 * (the only custody in Charters, C4), said above the Grant button in plain words. Ranges are shown in price, never
 * ticks; the re-centred range is a preview of what the contract would do at today's average, labelled as such.
 */
interface Position { tokenId: string; pool: ReviewedPool; token0: Address; token1: Address; fee: number; lower: number; upper: number; liquidity: string; spotTick: number; twapTick600: number | null; inRange: boolean }
interface Quote { positionsOnReviewedPools: Position[]; positionsTotal: number; blockNumber: string; readAt: string; factory: Address | null; npm: Address }
const SPACING: Record<number, number> = { 100: 1, 500: 10, 2500: 50, 10000: 200 }
const TRANSFER = keccak256(toBytes('Transfer(address,address,uint256)'))

/** Base price for a pool tick (base may be token0 or token1). */
const basePrice = (tick: number, baseIs0: boolean) => priceAt(baseIs0 ? tick : -tick)

export function RangeBuilder({ initialChain, initialAccount, demo }: { initialChain: CharterChainId; initialAccount: string | null; demo: Record<CharterChainId, string> }) {
  const who = useWho(initialChain, initialAccount, demo)
  const config = useConfig()
  const { chainId, account } = who
  const [quote, setQuote] = useState<Quote | null>(null)
  const [load, setLoad] = useState<'loading' | 'ok' | 'error'>('loading')
  const [pick, setPick] = useState<string | null>(null)
  const [exit, setExit] = useState(false)
  const [feesToOwner, setFeesToOwner] = useState(true)
  const [hours, setHours] = useState(6)
  const [moves, setMoves] = useState(10)
  const [lossBps, setLossBps] = useState<number>(RANGE_DEFAULTS.maxLossBps)
  const [days, setDays] = useState(30)
  const [backup, setBackup] = useState(true)
  const grant = useGrantSteps()

  // Only the newest read may land: switching account or network while one is in flight must never show the old one.
  const seq = useRef(0)
  const read = useCallback(async () => {
    const my = ++seq.current
    setLoad('loading')
    try {
      const r = await fetch(`/api/v1/guards/quote?kind=range&chainId=${chainId}&account=${account}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('read')
      const q = await r.json() as Quote
      if (my !== seq.current) return
      setQuote(q); setLoad('ok')
      const keepable = q.positionsOnReviewedPools.filter((x) => !isFullRange(x.lower, x.upper))
      setPick((p) => (p && keepable.some((x) => x.tokenId === p) ? p : keepable[0]?.tokenId ?? null))
    } catch { if (my === seq.current) setLoad('error') }
  }, [chainId, account])
  useEffect(() => { void read() }, [read])

  const pos = quote?.positionsOnReviewedPools.find((x) => x.tokenId === pick) ?? null
  const baseIs0 = pos ? pos.pool.base.toLowerCase() === pos.token0.toLowerCase() : true
  const spacing = pos ? SPACING[pos.fee] ?? 10 : 10
  const width = pos ? pos.upper - pos.lower : 0
  const twap = pos?.twapTick600 ?? null
  const lowP = pos ? Math.min(basePrice(pos.lower, baseIs0), basePrice(pos.upper, baseIs0)) : 0
  const highP = pos ? Math.max(basePrice(pos.lower, baseIs0), basePrice(pos.upper, baseIs0)) : 0
  const nowP = pos && twap !== null ? basePrice(twap, baseIs0) : null
  const next = pos && twap !== null ? centeredRange(twap, width, spacing) : null
  const nextLow = next ? Math.min(basePrice(next.lower, baseIs0), basePrice(next.upper, baseIs0)) : null
  const nextHigh = next ? Math.max(basePrice(next.lower, baseIs0), basePrice(next.upper, baseIs0)) : null
  const p = { pool: (pos?.pool.address ?? '0x0000000000000000000000000000000000000000') as Address, mode: exit ? 1 : 0, feesToOwner, twapWindow: RANGE_DEFAULTS.twapWindow, maxDeviation: RANGE_DEFAULTS.maxDeviation,
    slipTicks: RANGE_DEFAULTS.slipTicks, bufferTicks: Math.max(spacing, Math.round(width * 0.1)), maxLossBps: lossBps, maxLeftoverBps: RANGE_DEFAULTS.maxLeftoverBps, minInterval: hours * 3600, maxRebalances: exit ? 1 : moves }
  const tooNarrow = pos ? width < minRangeWidth(p) : false
  const expiresAt = useMemo(() => expiryFor(days, Math.floor(Date.now() / 1000)), [days])
  const until = dateWords(expiresAt)
  const pair = pos ? `${pos.pool.baseSymbol.replace(/^W/, '')}/${pos.pool.quoteSymbol}` : 'the pair'
  const factory = V2[chainId].rangeFactory

  const blocker = (() => {
    if (!factory) return { words: `Range Keeper is not on ${CHAIN_NAME[chainId]} yet.` }
    if (load === 'loading') return { words: 'Reading your PancakeSwap positions.' }
    if (!pos) return { words: quote?.positionsOnReviewedPools.length ? 'Every position here is full range, so it is always in range: there is nothing for a keeper to do.' : `No PancakeSwap v3 position with liquidity on a reviewed pool was found for this address on ${CHAIN_NAME[chainId]}.` }
    if (twap === null) return { words: 'This pool has no 10-minute history to read yet.' }
    if (tooNarrow && !exit) return { words: `This range is too narrow for a keeper to re-centre it within its limits (it needs a range at least ${(Math.pow(1.0001, minRangeWidth(p)) * 100 - 100).toFixed(1)}% wide). Widen the position in PancakeSwap, or choose Close it if it leaves.` }
    return who.walletBlocker('position')
  })()

  const start = async () => {
    if (blocker || !pos || !factory || !who.wallet || !quote) return
    const pub = getPublicClient(config, { chainId })!
    const call = rangeGrantCall(quote.npm, who.wallet, factory, BigInt(pos.tokenId), {
      p, expiresAt, tipToken: pos.pool.quote, tipPerAction: 0n, tipBudget: 0n, executors: defaultExecutors('range', backup), userSalt: newSalt(),
    })
    await grant.prepare({
      chainId, owner: who.wallet, gasFallback: [3_500_000n],
      steps: [{ label: `Send position #${pos.tokenId} to the Range Keeper factory, which makes your keeper in the same transaction`, to: call.to, data: call.data }],
      // The keeper is the NFT's new holder: the factory forwards it in the same transaction.
      verify: async (rs) => {
        const r = await pub.getTransactionReceipt({ hash: rs[0]!.transactionHash })
        const t = r.logs.filter((l) => l.address.toLowerCase() === quote.npm.toLowerCase() && l.topics[0] === TRANSFER && BigInt(l.topics[3] ?? '0x0') === BigInt(pos.tokenId))
        const keeper = t.length ? getAddress(`0x${t[t.length - 1]!.topics[2]!.slice(26)}`) : null
        if (!keeper) return null
        return (await pub.readContract({ address: factory, abi: rangeKeeperFactoryAbi, functionName: 'isCharter', args: [keeper] })) ? keeper : null
      },
    })
  }

  const lines = pos ? [
    { label: 'Keeps', value: `position #${pos.tokenId}, ${pair}, ${fmtPrice(lowP)} to ${fmtPrice(highP)}` },
    { label: 'Pool', value: `PancakeSwap v3, ${pos.fee / 10_000}%, ${CHAIN_NAME[chainId]}${pos.pool.fixture ? ' (testnet fixture)' : ''}` },
    { label: 'Moves', value: exit ? 'once: closes the position and sends everything to you when it leaves its range' : 'the range back around the 10-minute average when the price has left it, same width' },
    { label: 'Limits', value: exit ? 'one move' : `at most ${moves} moves, one every ${hours} hours at most, each losing at most ${(lossBps / 100).toFixed(2)}% at the average price` },
    { label: 'Fees', value: feesToOwner ? 'sent to your wallet at each move' : 'added to the position' },
    { label: 'Ends', value: `${until}, or when you end it: the position comes back to you` },
  ] : []

  return (
    <div className={styles.builder}>
      <WhoBar who={who} placeholder="Paste any address" onChain={() => setPick(null)} />
      <div className={styles.grid}>
        <div className={styles.left}>
          <section className={`${styles.panel} ${styles.position}`} aria-labelledby="rk-h" aria-busy={load === 'loading'}>
            <div className={styles.posTop}>
              <div>
                <h2 id="rk-h" className={styles.panelTitle}>{who.isDemo ? 'Example PancakeSwap positions' : 'Your PancakeSwap positions'}</h2>
                <div className={styles.meta}>
                  <AddressChip value={account} chainId={chainId} />
                  {quote ? <span className={styles.prov} title={`Read from chain at block ${quote.blockNumber}`}>Onchain, read {ago(quote.readAt, who.now)}</span> : null}
                </div>
              </div>
              <div className={styles.hfBig}>
                <span className={`mono ${styles.hfValue}`}>{nowP !== null ? fmtPrice(nowP) : load === 'loading' ? '…' : 'n/a'}</span>
                <span className={styles.caption}>10-minute average price</span>
              </div>
            </div>
            {pos ? <FixtureNote show={pos.pool.fixture} /> : null}
            {load === 'error' ? (
              <div className={styles.empty}><p>The positions could not be read on {CHAIN_NAME[chainId]} just now.</p><button type="button" className={styles.ghost} onClick={() => void read()}>Read again</button></div>
            ) : quote && quote.positionsOnReviewedPools.length === 0 ? (
              <div className={styles.empty}><p>{quote.positionsTotal > 0 ? `This address has ${quote.positionsTotal} PancakeSwap v3 position${quote.positionsTotal === 1 ? '' : 's'}, none with liquidity on a reviewed pool.` : 'No PancakeSwap v3 position found for this address.'} A Range Keeper manages one position on a reviewed pool. Positions staked in PancakeSwap farms must be unstaked first, and a kept position does not earn CAKE.</p></div>
            ) : quote && pos ? (
              <>
                <ul className={styles.positions} aria-label="Positions">
                  {quote.positionsOnReviewedPools.map((x) => {
                    const b0 = x.pool.base.toLowerCase() === x.token0.toLowerCase()
                    const a = basePrice(x.lower, b0), b = basePrice(x.upper, b0)
                    const full = isFullRange(x.lower, x.upper)
                    return (
                      <li key={x.tokenId}><button type="button" aria-pressed={x.tokenId === pick} disabled={full} onClick={() => setPick(x.tokenId)}>
                        <span>#{x.tokenId}, {x.pool.baseSymbol.replace(/^W/, '')}/{x.pool.quoteSymbol} {x.fee / 10_000}%</span>
                        <span>{full ? 'Full range' : x.inRange ? 'In range' : 'Out of range'}</span>
                        <small>{full ? 'Always in range: nothing to keep' : `${fmtPrice(Math.min(a, b))} to ${fmtPrice(Math.max(a, b))}`}</small>
                      </button></li>
                    )
                  })}
                </ul>
                {nowP !== null ? (
                  <BandRule variant="read" min={Math.min(lowP, nextLow ?? lowP, nowP) * 0.97} max={Math.max(highP, nextHigh ?? highP, nowP) * 1.03} low={lowP} high={highP} step={1} bigStep={10} minGap={0}
                    format={fmtPrice} words={(w, v) => (w === 'low' ? `Range from ${fmtPrice(v)}` : `Range to ${fmtPrice(v)}`)} lowName="from" highName="to"
                    now={nowP} nowLabel={`Average ${fmtPrice(nowP)}`} ghost={nextLow !== null && nextHigh !== null && !pos.inRange ? { from: nextLow, to: nextHigh, label: 'Where a move would put it now' } : null}
                    label={`Range of position ${pos.tokenId} in price`} tones={['brass', 'brass']} />
                ) : null}
                <div className={styles.notes}>
                  <div data-tone={pos.inRange ? 'moss' : 'amber'}>
                    <b>{pos.inRange ? 'In range. Earning fees.' : 'Out of range now'}</b>
                    <span>{nextLow !== null && nextHigh !== null ? `A move today would centre it at ${fmtPrice(nextLow)} to ${fmtPrice(nextHigh)}, same width.` : 'The average price could not be read.'}</span>
                  </div>
                  <div data-tone="moss"><b>Each move is bounded</b><span>Value after (new position and leftovers, at the average price) at least {(100 - lossBps / 100).toFixed(2)}% of value before, or the move is cancelled.</span></div>
                </div>
                <div className={styles.chips} role="group" aria-label="Mode">
                  <button type="button" aria-pressed={!exit} onClick={() => setExit(false)}>Keep it in range</button>
                  <button type="button" aria-pressed={exit} onClick={() => setExit(true)}>Close it if it leaves range</button>
                </div>
              </>
            ) : <div className={styles.skeleton} aria-hidden="true" />}
          </section>
          <section className={styles.panel} aria-labelledby="rk-left">
            <h2 id="rk-left" className={styles.panelTitle}>What remains</h2>
            <p className={styles.fine}>Re-centring realises impermanent loss: if the price trends, each move sells the token that gained. A position kept in range earns fees but can be worth less than holding. The bound limits the cost of each move, not market movement. Contracts are unaudited.</p>
          </section>
        </div>

        <aside className={`${styles.panel} ${styles.paper}`} aria-labelledby="rk-charter">
          <h2 id="rk-charter" className={styles.panelTitle}>Your charter</h2>
          {!pos && load !== 'loading' ? <p className={styles.fine}>Pick a position on a reviewed pool to see its charter. Mint one in PancakeSwap first if this address has none.</p> : null}
          {pos ? <p className={styles.sentence}>{rangeSentence({ pair, low: fmtPrice(lowP), high: fmtPrice(highP), minutes: RANGE_DEFAULTS.twapWindow / 60, moves, hours, lossPct: (lossBps / 100).toFixed(2), until, exit })}</p> : load === 'loading' ? <div className={styles.skeleton} aria-hidden="true" /> : null}
          {!exit ? (
            <>
              <div className={styles.field}>
                <div className={styles.row}><span className={styles.label}>Most moves</span></div>
                <div className={styles.chips} role="group" aria-label="Most moves">{[5, 10, 20].map((n) => <button key={n} type="button" aria-pressed={moves === n} onClick={() => setMoves(n)}>{n}</button>)}</div>
              </div>
              <div className={styles.field}>
                <div className={styles.row}><span className={styles.label}>At most one move every</span></div>
                <div className={styles.chips} role="group" aria-label="Interval">{[1, 6, 24].map((n) => <button key={n} type="button" aria-pressed={hours === n} onClick={() => setHours(n)}>{n} {n === 1 ? 'hour' : 'hours'}</button>)}</div>
              </div>
              <div className={styles.field}>
                <div className={styles.row}><span className={styles.label}>Most it may lose per move</span><span className={styles.caption}>At the average price</span></div>
                <div className={styles.chips} role="group" aria-label="Loss limit">{[25, 50, 100].map((n) => <button key={n} type="button" aria-pressed={lossBps === n} onClick={() => setLossBps(n)}>{(n / 100).toFixed(2)}%</button>)}</div>
              </div>
            </>
          ) : null}
          <div className={styles.field}>
            <div className={styles.row}><span className={styles.label}>Fees</span></div>
            <div className={styles.chips} role="group" aria-label="Fees">
              <button type="button" aria-pressed={feesToOwner} onClick={() => setFeesToOwner(true)}>Send to my wallet at each move</button>
              <button type="button" aria-pressed={!feesToOwner} onClick={() => setFeesToOwner(false)}>Add to the position</button>
            </div>
          </div>
          <div className={styles.field}>
            <div className={styles.row}><span className={styles.label}>Ends</span><span className={styles.caption}>{until}</span></div>
            <div className={styles.chips} role="group" aria-label="Duration">{KIND_DURATIONS.range.map((x) => <button key={x} type="button" aria-pressed={days === x} onClick={() => setDays(x)}>{x} days</button>)}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.row}><span className={styles.label}>Who may move it</span><span className={styles.caption}>Only agents you name</span></div>
            <ul className={styles.watchers}>
              <li><AgentAvatar id="bound" reference size={28} /><span><b>Bound</b>, named by you, through a key for this keeper only</span></li>
              <li><span className={styles.dotIcon} aria-hidden="true"><ShieldCheck /></span><span><label><input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} /> <b>Marque backup</b>, named by you, if Bound is quiet</label></span></li>
              <li><span className={styles.dotIcon} aria-hidden="true"><ArrowRight /></span><span><b>You</b>, with Rebalance now</span></li>
            </ul>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>This charter can never</span>
            <ul className={styles.never}>
              <li><X aria-hidden="true" />Send your position or tokens anywhere but back to you</li>
              <li><X aria-hidden="true" />Use another pool</li>
              {!exit ? <li><X aria-hidden="true" />Move more often than once every {hours} {hours === 1 ? 'hour' : 'hours'} or more than {moves} times</li> : null}
              {!exit ? <li><X aria-hidden="true" />Lose more than {(lossBps / 100).toFixed(2)}% per move at the average price: the move is cancelled</li> : null}
            </ul>
          </div>
          <p className={styles.custody} role="note"><b>Your position NFT moves into your own Range Keeper contract while the charter runs. Take it back any time with End.</b>Every new position it makes is held there too. Take it back any time with End; after {until} anyone can send it back to you. Your wallet will show this step as sending an NFT to the Range Keeper factory: that is the grant, and in the same transaction it becomes your keeper&apos;s.</p>
          <div className={styles.grant}>
            <button type="button" className={styles.primary} disabled={Boolean(blocker) || grant.checking} onClick={() => void start()}>{grant.checking ? 'Checking the network fee…' : 'Grant a charter'}</button>
            {blocker ? <p className={styles.blocker} role="status">{blocker.words}{blocker.action ? <> <button type="button" className={styles.link} onClick={blocker.action.run}>{blocker.action.label}</button></> : null}</p>
              : <p className={styles.fine}>{promptWords(who.pass, 1, 'sending the position NFT')}</p>}
            {grant.preError ? <p className={styles.error} role="alert">{grant.preError}</p> : null}
          </div>
        </aside>
      </div>
      {pos ? (
        <div className={styles.sticky} data-bottom-bar="" aria-hidden={grant.grant ? true : undefined}>
          <p>Keep #{pos.tokenId} in range{exit ? ' or close it' : `, ${moves} moves at most`}, until {until}</p>
          <button type="button" className={styles.primary} disabled={Boolean(blocker) || grant.checking} onClick={() => void start()}>Grant a charter</button>
        </div>
      ) : null}
      <Seal open={grant.grant !== null} phase={grant.phase} lines={lines} steps={grant.steps}
        wallet={{ pass: who.pass, words: 'Your wallet shows this as sending an NFT. That is the grant: it becomes your keeper’s in the same transaction.' }}
        primary={grant.phase === 'sealed' || grant.phase === 'signing' ? null : grant.phase === 'failed' ? 'Try again' : who.pass ? 'Seal with your fingerprint' : 'Open your wallet'}
        onPrimary={() => void grant.sign()} onClose={grant.close} error={grant.error} note={grant.note}
        explorerTx={(h) => `${CHARTER_CHAINS[chainId].explorer}/tx/${h}`}
        done={grant.granted ? { href: `/charters/${chainId}/${grant.granted}`, label: 'Open the charter' } : null} />
    </div>
  )
}
