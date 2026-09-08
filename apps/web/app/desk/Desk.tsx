'use client'

import { useCallback, useEffect, useState } from 'react'
import { MeasureRule, Chip, DataCell, ProvenanceChip, EmptyState, Button } from '@marque/ui'
import styles from './desk.module.css'

/**
 * The Desk — an address and its live positions.
 *
 * This is the hero, and it is the product rather than a picture of the product.
 * No wallet is involved anywhere in this component: it takes a string, reads
 * the chain, and renders what is actually there (AGENTS.md invariant 2).
 *
 * Every number carries provenance and a block. Where a position type is absent
 * the Desk says so plainly instead of showing a zero, because a zero and an
 * absence are different facts.
 */

interface V3Position {
  tokenId: string; pair: string; fee: number; inRange: boolean
  priceLower: number; priceUpper: number; priceCurrent: number; priceUnit: string
  pctToLower: number; pctToUpper: number; rangePosition: number
  amount0: number; amount1: number; token0: string; token1: string
  fees0: number; fees1: number
}

interface VenusMarket {
  symbol: string; collateralFactor: number; priceUsd: number
  suppliedUsd: number; borrowedUsd: number
  liquidationPriceUsd: number | null; pctDropToLiquidation: number | null
}

interface PositionsResponse {
  address: string
  blockNumber: string
  readAt: string
  elapsedMs: number
  pancakeV3: { ok: boolean; error: string | null; emptyPositions: number; positions: V3Position[] }
  venus: {
    ok: boolean; error: string | null; hasPosition: boolean
    healthFactor: number | null; weightedCollateralUsd: number; totalBorrowedUsd: number
    markets: VenusMarket[]
  }
  spot: {
    ok: boolean; totalValueUsd: number; idleStableUsd: number
    balances: Array<{ symbol: string; amount: number; priceUsd: number | null; valueUsd: number | null }>
  }
  bestYield: { protocol: string; asset: string; netAprPct: number; grossAprPct: number; breakEvenUsd: number } | null
  error?: string
  detail?: string
}

const fmtUsd = (n: number) =>
  n >= 1000 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`
const fmtNum = (n: number, dp = 4) =>
  n === 0 ? '0' : Math.abs(n) < 0.0001 ? n.toExponential(2) : n.toLocaleString('en-US', { maximumFractionDigits: dp })

function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

/** Seconds since the read, ticking, so freshness is visible rather than claimed. */
function useAge(readAt: string | undefined) {
  const [age, setAge] = useState(0)
  useEffect(() => {
    if (!readAt) return
    const tick = () => setAge(Math.floor((Date.now() - new Date(readAt).getTime()) / 1000))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [readAt])
  return age
}

export function Desk({ initialAddress }: { initialAddress: string }) {
  const [address, setAddress] = useState(initialAddress)
  const [input, setInput] = useState('')
  const [data, setData] = useState<PositionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const age = useAge(data?.readAt)

  const load = useCallback(async (addr: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/positions/${addr}`, { cache: 'no-store' })
      const json = (await res.json()) as PositionsResponse
      if (!res.ok) {
        setError(json.detail ?? json.error ?? 'Could not read that address.')
        setData(null)
      } else {
        setData(json)
        setAddress(addr)
      }
    } catch {
      setError('Could not reach the chain reader. Nothing is shown rather than something stale.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(initialAddress) }, [initialAddress, load])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) void load(trimmed)
    else setError('That is not a BNB Smart Chain address. It should start 0x and be 42 characters long.')
  }

  const v3 = data?.pancakeV3
  const venus = data?.venus
  const spot = data?.spot

  const hfState = (hf: number) => (hf < 1.25 ? 'breach' : hf < 1.8 ? 'watch' : 'holds')

  const attention =
    (venus?.healthFactor != null && venus.healthFactor < 1.8 ? 1 : 0) +
    (v3?.positions.filter((p) => !p.inRange || Math.min(Math.abs(p.pctToLower), Math.abs(p.pctToUpper)) < 5).length ?? 0) +
    ((spot?.idleStableUsd ?? 0) > 1 ? 1 : 0)

  const positionCount = (v3?.positions.length ?? 0) + (venus?.hasPosition ? 1 : 0) + (spot?.balances.length ?? 0)

  return (
    <div className={styles.desk}>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor="desk-address">BNB Smart Chain address</label>
        <input
          id="desk-address"
          className={styles.input}
          placeholder="0x… any BNB Smart Chain address"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <Button type="submit" variant="primary">Read chain</Button>
      </form>

      <p className={styles.noWallet}>No wallet needed. Nothing is connected and nothing is signed.</p>

      <div className={styles.head}>
        <span className="mono">{shortAddress(address)}</span>
        {data && (
          <span className={styles.headMeta}>
            <span className="mono">block {Number(data.blockNumber).toLocaleString('en-US')}</span>
            <span className={styles.dot} aria-hidden="true">·</span>
            <span className="mono">{age}s ago</span>
            <ProvenanceChip provenance="ONCHAIN" />
          </span>
        )}
      </div>

      {loading && (
        <div className={styles.skeleton} aria-hidden="true">
          <span className={styles.skRow} style={{ width: '62%' }} />
          <span className={styles.skRow} style={{ width: '88%' }} />
          <span className={styles.skRow} style={{ width: '46%' }} />
          <span className={styles.skRow} style={{ width: '74%' }} />
          <span className={styles.skStatus}>Reading the chain…</span>
        </div>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}

      {data && !loading && (
        <div className={styles.positions}>
          {v3 && v3.positions.length > 0 ? (
            v3.positions.map((p) => {
              const nearest = Math.min(Math.abs(p.pctToLower), Math.abs(p.pctToUpper))
              const state = !p.inRange ? 'breach' : nearest < 5 ? 'watch' : 'holds'
              return (
                <article className={styles.position} key={p.tokenId}>
                  <header className={styles.positionHead}>
                    <span className={styles.positionTitle}>PancakeSwap V3 · {p.pair}</span>
                    <Chip tone={state}>
                      {p.inRange ? `in range · ${nearest.toFixed(2)}% from a bound` : 'out of range · earning nothing'}
                    </Chip>
                  </header>
                  <MeasureRule
                    label={`${p.pair} price ${p.priceCurrent} inside a range of ${p.priceLower} to ${p.priceUpper}`}
                    value={p.priceCurrent} lower={p.priceLower} upper={p.priceUpper}
                    lowerLabel={fmtNum(p.priceLower, 4)} upperLabel={fmtNum(p.priceUpper, 4)}
                    valueLabel={`${fmtNum(p.priceCurrent, 4)} ${p.priceUnit}`}
                    state={state}
                  />
                  <dl className={styles.facts}>
                    <div><dt>Holding</dt><dd><DataCell align="left">{fmtNum(p.amount0)} {p.token0} + {fmtNum(p.amount1)} {p.token1}</DataCell></dd></div>
                    <div><dt>Uncollected fees</dt><dd><DataCell align="left">{fmtNum(p.fees0)} {p.token0} + {fmtNum(p.fees1)} {p.token1}</DataCell></dd></div>
                  </dl>
                </article>
              )
            })
          ) : (
            <article className={styles.position}>
              <header className={styles.positionHead}>
                <span className={styles.positionTitle}>PancakeSwap V3</span>
                <Chip>none</Chip>
              </header>
              <p className={styles.absent}>
                No PancakeSwap V3 liquidity at this address
                {v3 && v3.emptyPositions > 0
                  ? `, though it owns ${v3.emptyPositions} position NFT${v3.emptyPositions === 1 ? '' : 's'} with no liquidity left.`
                  : '.'}
              </p>
            </article>
          )}

          {venus?.hasPosition && venus.healthFactor !== null ? (
            <article className={styles.position}>
              <header className={styles.positionHead}>
                <span className={styles.positionTitle}>Venus Core · lending</span>
                <Chip tone={hfState(venus.healthFactor)}>
                  {venus.healthFactor < 1.25 ? 'close to liquidation' : venus.healthFactor < 1.8 ? 'watch' : 'healthy'}
                </Chip>
              </header>
              <MeasureRule
                label={`Health factor ${venus.healthFactor}, liquidation at 1.0`}
                value={venus.healthFactor} lower={1} upper={3}
                threshold={1} thresholdLabel="liq 1.00"
                lowerLabel="1.00" upperLabel="3.00"
                valueLabel={`HF ${venus.healthFactor.toFixed(3)}`}
                state={hfState(venus.healthFactor)}
              />
              <dl className={styles.facts}>
                <div><dt>Collateral, weighted</dt><dd><DataCell align="left">{fmtUsd(venus.weightedCollateralUsd)}</DataCell></dd></div>
                <div><dt>Borrowed</dt><dd><DataCell align="left">{fmtUsd(venus.totalBorrowedUsd)}</DataCell></dd></div>
                {venus.markets.filter((m) => m.liquidationPriceUsd !== null).slice(0, 1).map((m) => (
                  <div key={m.symbol}>
                    <dt>{m.symbol} liquidation price</dt>
                    <dd><DataCell align="left">{fmtUsd(m.liquidationPriceUsd ?? 0)} · {(m.pctDropToLiquidation ?? 0).toFixed(1)}% below spot</DataCell></dd>
                  </div>
                ))}
              </dl>
            </article>
          ) : (
            <article className={styles.position}>
              <header className={styles.positionHead}>
                <span className={styles.positionTitle}>Venus Core</span>
                <Chip>none</Chip>
              </header>
              <p className={styles.absent}>No Venus lending position at this address.</p>
            </article>
          )}

          <article className={styles.position}>
            <header className={styles.positionHead}>
              <span className={styles.positionTitle}>Idle</span>
              {data.bestYield && (spot?.idleStableUsd ?? 0) > 0
                ? <Chip tone="watch">earning nothing</Chip>
                : <Chip>—</Chip>}
            </header>
            {spot && spot.balances.length > 0 ? (
              <>
                {data.bestYield && spot.idleStableUsd > 0 && (
                  <MeasureRule
                    label={`Currently earning 0 percent against a best net APR of ${data.bestYield.netAprPct.toFixed(2)} percent at this size`}
                    value={0} lower={0} upper={Math.max(data.bestYield.netAprPct, 0.01)}
                    lowerLabel="0%" upperLabel={`${data.bestYield.netAprPct.toFixed(2)}%`}
                    valueLabel="you 0.00%"
                    state="watch"
                  />
                )}
                <dl className={styles.facts}>
                  {spot.balances.map((b) => (
                    <div key={b.symbol}>
                      <dt>{b.symbol}</dt>
                      <dd>
                        <DataCell align="left">
                          {fmtNum(b.amount, 6)}
                          {b.valueUsd !== null ? ` · ${fmtUsd(b.valueUsd)}` : ' · no on-chain route to price it'}
                        </DataCell>
                      </dd>
                    </div>
                  ))}
                  {data.bestYield && (
                    <div>
                      <dt>Best net APR at this size</dt>
                      <dd>
                        <DataCell align="left">
                          {data.bestYield.netAprPct.toFixed(2)}% on {data.bestYield.protocol} · break-even {fmtUsd(data.bestYield.breakEvenUsd)}
                        </DataCell>
                      </dd>
                    </div>
                  )}
                </dl>
              </>
            ) : (
              <p className={styles.absent}>No tracked balances at this address.</p>
            )}
          </article>
        </div>
      )}

      {data && !loading && (
        <p className={styles.summary}>
          {positionCount} position{positionCount === 1 ? '' : 's'}
          {attention > 0 ? ` · ${attention} need${attention === 1 ? 's' : ''} attention` : ''}
          {' · read in '}{data.elapsedMs}ms
        </p>
      )}

      {data && !loading && v3 && !v3.ok && (
        <EmptyState title="The PancakeSwap reader did not answer.">
          <p>{v3.error}. Nothing is shown for it rather than something stale.</p>
        </EmptyState>
      )}
    </div>
  )
}
