'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { MeasureRule, Chip, DataCell, ProvenanceChip, EmptyState, Button } from '@marque/ui'
import styles from './pancake.module.css'

interface RangeMeasure {
  hoursOutOfRange: number | null
  inRangeNow: boolean | null
  watchingSince: string | null
  atLeast: boolean
  observations: number
  lastObservedAt: string | null
}

interface Position {
  tokenId: string; pair: string; fee: number; tickSpacing: number; pool: string
  tickLower: number; tickUpper: number; tickCurrent: number
  inRange: boolean
  priceLower: number; priceUpper: number; priceCurrent: number; priceUnit: string
  rangePosition: number; pctToLower: number; pctToUpper: number
  token0: string; token1: string
  fees0: number; fees1: number
  feesUsd: number | null; positionValueUsd: number | null
  range: RangeMeasure
}

interface Agent {
  id: string; name: string; kind: 'first-party' | 'third-party'
  reasons: string[]; mcs: 'pass' | 'fail' | 'untested'
  liveness: string | null; supportsThisPool: 'yes' | 'unknown'
  price: string | null; endpoint: string | null
}

interface Payload {
  owner: string; positions: Position[]; emptyPositions: number
  agents: Agent[]; watchNote: string; thirdPartyCaveat: string
}

const num = (n: number, dp = 4): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp })

function feeTier(fee: number): string {
  return `${(fee / 10_000).toFixed(fee < 500 ? 2 : 2)}%`
}

/**
 * How long out of range, rendered honestly.
 *
 * Four distinct states, and they must not collapse into each other:
 *   never watched      -> we do not know, and say so
 *   in range           -> no loss to report
 *   measured           -> a real duration since a real in-range observation
 *   floor only         -> "at least", because it may have drifted before we looked
 */
function OutOfRange({ r }: { r: RangeMeasure }) {
  if (r.observations === 0) {
    return (
      <div>
        <dt>Out of range for</dt>
        <dd>
          <span className={styles.lossFloor}>
            not yet measured — we started watching this pool just now, and the time before that
            is not knowable from any public source
          </span>
        </dd>
      </div>
    )
  }
  if (r.inRangeNow) {
    return (
      <div>
        <dt>Out of range for</dt>
        <dd>
          <span className={styles.loss}>—</span>{' '}
          <span className={styles.lossFloor}>in range now, across {r.observations} observations</span>
        </dd>
      </div>
    )
  }
  const hours = r.hoursOutOfRange ?? 0
  const shown = hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`
  return (
    <div>
      <dt>Out of range for</dt>
      <dd>
        <span className={styles.loss}>{r.atLeast ? `≥ ${shown}` : shown}</span>
        <br />
        <span className={styles.lossFloor}>
          {r.atLeast
            ? `every one of our ${r.observations} observations was out of range, so this is a floor, not the total`
            : `measured from ${r.observations} observations since we began watching`}
        </span>
      </dd>
    </div>
  )
}

export function PancakeDesk({ demoAddress }: { demoAddress: string }) {
  const [address, setAddress] = useState('')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (addr: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/v1/pancakeswap/${addr}`, { cache: 'no-store' })
      const body = (await res.json()) as Payload & { error?: string; detail?: string }
      if (!res.ok) { setError(body.detail ?? body.error ?? `lookup failed (${res.status})`); setData(null); return }
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the lookup failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(demoAddress) }, [demoAddress, load])

  return (
    <>
      <section className={styles.section}>
        <form
          className={styles.lookup}
          onSubmit={(e) => { e.preventDefault(); void load(address.trim() || demoAddress) }}
        >
          <label htmlFor="addr">
            Any BNB Smart Chain address
            <input
              id="addr" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder={demoAddress} spellCheck={false} autoComplete="off"
            />
          </label>
          <Button variant="primary" size="md" type="submit" disabled={loading}>
            {loading ? 'Reading positions…' : 'Show positions'}
          </Button>
        </form>
        <p className={styles.note}>
          <ProvenanceChip provenance="ONCHAIN" />
          Read from the NonfungiblePositionManager and each pool directly. Uncollected fees come
          from a static <code>collect</code> call, which is the real figure rather than an estimate.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Positions</h2>

        {error && <p className={styles.warn}>{error}</p>}

        {!error && data && data.positions.length === 0 && (
          <EmptyState title="No PancakeSwap V3 liquidity at this address.">
            <p>
              {data.emptyPositions > 0
                ? `It owns ${data.emptyPositions} position NFT${data.emptyPositions === 1 ? '' : 's'} with no liquidity left, which is counted rather than hidden.`
                : 'Paste another address, or use the demo one.'}
            </p>
          </EmptyState>
        )}

        {data?.positions.map((p) => {
          const nearest = Math.min(Math.abs(p.pctToLower), Math.abs(p.pctToUpper))
          const state = !p.inRange ? 'breach' : nearest < 5 ? 'watch' : 'holds'
          return (
            <article className={styles.position} key={p.tokenId}>
              <header className={styles.positionHead}>
                <span className={styles.positionTitle}>{p.pair}</span>
                <Chip tone="chain">{feeTier(p.fee)} tier</Chip>
                <span className={styles.tokenId}>#{p.tokenId}</span>
                <Chip tone={state}>
                  {p.inRange ? `in range · ${nearest.toFixed(2)}% from a bound` : 'out of range · earning nothing'}
                </Chip>
              </header>

              <MeasureRule
                label={`${p.pair} price ${num(p.priceCurrent)} inside a range of ${num(p.priceLower)} to ${num(p.priceUpper)}`}
                value={p.priceCurrent} lower={p.priceLower} upper={p.priceUpper}
                lowerLabel={num(p.priceLower)} upperLabel={num(p.priceUpper)}
                valueLabel={`${num(p.priceCurrent)} ${p.priceUnit}`}
                state={state}
              />

              <dl className={styles.facts}>
                <OutOfRange r={p.range} />
                <div>
                  <dt>Uncollected fees</dt>
                  <dd>
                    <DataCell align="left">
                      {num(p.fees0)} {p.token0} + {num(p.fees1)} {p.token1}
                    </DataCell>
                    <br />
                    {p.feesUsd === null
                      ? <span className={styles.lossFloor}>not priced — we could not price both tokens, so no USD figure is shown</span>
                      : <span className={styles.lossFloor}>${num(p.feesUsd, 2)}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Tick range</dt>
                  <dd><DataCell align="left">{p.tickLower} … {p.tickUpper}</DataCell>
                    <br /><span className={styles.lossFloor}>now {p.tickCurrent}, spacing {p.tickSpacing}</span></dd>
                </div>
                <div>
                  <dt>Position value</dt>
                  <dd>
                    {p.positionValueUsd === null
                      ? <span className={styles.lossFloor}>not priced</span>
                      : <DataCell align="left">${num(p.positionValueUsd, 2)}</DataCell>}
                  </dd>
                </div>
              </dl>
            </article>
          )
        })}
      </section>

      {data && data.positions.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.h2}>Agents that can re-centre these positions</h2>
          <p className={styles.note}>
            Ranked by what we have measured, and every placement carries its reason. There is no
            hidden score.
          </p>
          <ul className={styles.agents}>
            {data.agents.filter((a) => a.kind === 'first-party').map((a) => (
              <li className={styles.agent} key={a.id}>
                <div className={styles.agentHead}>
                  <span className={styles.agentName}>{a.name}</span>
                  <Chip tone="chain">first-party</Chip>
                  <Chip tone="holds">MCS-REB-1 pass</Chip>
                  {a.price && <span className={styles.tokenId}>{a.price}</span>}
                </div>
                <ul className={styles.reasons}>
                  {a.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
                <div className={styles.actions}>
                  <Link href="/app/charter?category=rebalancing">Preflight and grant a charter</Link>
                </div>
              </li>
            ))}
          </ul>

          <ThirdParties agents={data.agents.filter((a) => a.kind === 'third-party')} caveat={data.thirdPartyCaveat} />
          <p className={styles.warn}>
            No third-party agent on BNB Chain has yet passed MCS-REB-1. That is the measured state
            of the supply, not a filter we applied — the failures are listed above with their
            reasons, and on <Link href="/standard">the Standard</Link>.
          </p>
        </section>
      )}
    </>
  )
}


/**
 * The third-party candidates.
 *
 * Every one of these is in the same state — indexed, untested, unprobed — so
 * they are summarised rather than listed twelve times over with identical
 * reasons. The ones that differ are named individually; the rest are counted,
 * because a count is the honest shape of "twelve more, all the same" and a
 * repeated paragraph is not.
 */
function ThirdParties({ agents, caveat }: { agents: Agent[]; caveat: string }) {
  const [expanded, setExpanded] = useState(false)
  if (agents.length === 0) {
    return <p className={styles.note}>No third-party rebalancing agent is indexed on BNB Chain yet.</p>
  }

  const notable = agents.filter((a) => a.mcs !== 'untested' || a.liveness === 'working')
  const uniform = agents.filter((a) => !notable.includes(a))
  const shown = expanded ? uniform : uniform.slice(0, 3)

  return (
    <>
      <p className={styles.note}>{caveat}</p>

      {notable.length > 0 && (
        <ul className={styles.agents}>
          {notable.map((a) => (
            <li className={styles.agent} key={a.id}>
              <div className={styles.agentHead}>
                <span className={styles.agentName}>{a.name}</span>
                <Chip>third-party</Chip>
                <Chip tone={a.mcs === 'pass' ? 'holds' : a.mcs === 'fail' ? 'breach' : 'watch'}>
                  {a.mcs === 'pass' ? 'MCS-REB-1 pass' : a.mcs === 'fail' ? 'MCS-REB-1 fail' : 'untested'}
                </Chip>
              </div>
              <ul className={styles.reasons}>{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </li>
          ))}
        </ul>
      )}

      {uniform.length > 0 && (
        <>
          <p className={styles.note}>
            {uniform.length} further rebalancing {uniform.length === 1 ? 'agent is' : 'agents are'}{' '}
            indexed on BNB Chain and {uniform.length === 1 ? 'is' : 'are'} in the same state: never
            tested against MCS-REB-1, and not yet probed. None can be ranked above the other on
            anything we have measured, so none is.
          </p>
          <ul className={styles.reasons}>
            {shown.map((a) => <li key={a.id}>{a.name}</li>)}
          </ul>
          {uniform.length > 3 && (
            <div className={styles.actions}>
              <Button variant="quiet" size="sm" onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Show fewer' : `Show all ${uniform.length}`}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
