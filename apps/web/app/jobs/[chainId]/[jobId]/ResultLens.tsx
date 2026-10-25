import type { GridLens, HfLens, Lens, RebLens, RebPosition, SecurityLens, YieldLens } from '@marque/commerce'
import { Limits } from '@marque/ui'
import type { JobLens, LensCheck } from '../../../../lib/lens'
import styles from './lens.module.css'

/**
 * The Result Lens (SPEC-WORKSPACE 2.1): what the agent delivered, drawn for its category, with
 * Marque's checks laid over it. Every value comes from the agent's answer (marked as the agent's);
 * a check says whether Marque recomputed it from BNB Chain or asserted it arithmetically.
 */

const n = (v: number | null | undefined, dp = 2) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: Math.min(dp, 2) }))
const usd = (v: number | null | undefined, dp = 2) => (v === null || v === undefined || !Number.isFinite(v) ? 'not given' : `$${v.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp })}`)
const short = (a: string | null) => (a && /^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)
const human = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\busd\b/i, 'USD').replace(/\bapr\b/i, 'APR').replace(/\bhf\b/i, 'HF').replace(/^./, (c) => c.toUpperCase())

function CheckMark({ state }: { state: LensCheck['state'] }) {
  const good = state === 'match' || state === 'holds'
  const bad = state === 'differs' || state === 'fails'
  return (
    <span className={styles.mark} data-state={good ? 'good' : bad ? 'bad' : 'none'} aria-hidden="true">
      <svg viewBox="0 0 16 16" width="16" height="16">
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity={good || bad ? 1 : 0.25} />
        {good ? <path d="M4.8 8.3l2.1 2.1 4.3-4.6" stroke="var(--panel)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {bad ? <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--panel)" strokeWidth="1.8" strokeLinecap="round" /> : null}
      </svg>
    </span>
  )
}

const STATE_WORD: Record<LensCheck['state'], string> = { match: 'Matches Marque’s read', differs: 'Differs from Marque’s read', holds: 'Holds', fails: 'Does not hold', unavailable: 'Could not be checked' }

/* ------------------------------------------------------------------ health factor */

function HfGauge({ hf, target }: { hf: number; target: number | null }) {
  // A half dial from 0.8 to 3.0+: under 1.0 liquidation, up to the target watch, above holds.
  const lo = 0.8, hi = Math.max(3, (target ?? 0) + 0.5)
  const at = (v: number) => Math.PI * (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo))
  const pt = (v: number, r: number) => [100 + r * Math.cos(at(v)), 100 - r * Math.sin(at(v))] as const
  const arc = (a: number, b: number, r: number) => { const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r); return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}` }
  const t = target ?? 1.5
  const [nx, ny] = pt(hf, 64)
  const state = hf < 1.0 ? 'breach' : hf < 1.2 ? 'watch' : 'holds'
  return (
    <svg className={styles.gauge} viewBox="8 8 184 100" role="img" aria-label={`Health factor ${hf.toFixed(3)}, liquidation at 1.00${target ? `, target ${target}` : ''}`}>
      <path d={arc(lo, hi, 82)} className={styles.gTrack} />
      <path d={arc(lo, 1.0, 82)} className={styles.gBreach} />
      <path d={arc(1.0, Math.min(1.2, hi), 82)} className={styles.gWatch} />
      {t > 1.2 ? <path d={arc(1.2, Math.min(t, hi), 82)} className={styles.gSafe} /> : null}
      <path d={arc(Math.min(Math.max(t, 1.2), hi), hi, 82)} className={styles.gHolds} />
      {/* Ticks only: their meaning is in the legend under the dial, so no label can fall outside the card. */}
      {target ? (() => { const [a, b] = pt(target, 90), [c, d] = pt(target, 74); return <line x1={a} y1={b} x2={c} y2={d} className={styles.gTick} /> })() : null}
      {(() => { const [a, b] = pt(1.0, 90), [c, d] = pt(1.0, 74); return <line x1={a} y1={b} x2={c} y2={d} className={styles.gTick} /> })()}
      <line x1="100" y1="100" x2={nx} y2={ny} className={styles.gNeedle} data-state={state} />
      <circle cx="100" cy="100" r="4.5" className={styles.gHub} data-state={state} />
    </svg>
  )
}

function HfView({ l }: { l: HfLens }) {
  if (l.healthFactor === null) {
    return (
      <div className={styles.calm}>
        <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><circle cx="24" cy="24" r="21" className={styles.calmRing} /><path d="M15 25l6 6 12-13" className={styles.calmTick} /></svg>
        <div>
          <p className={styles.calmTitle}>{l.hasPosition === false ? 'No Venus borrowing on this account' : 'No health factor in the answer'}</p>
          <p className={styles.calmBody}>{l.hasPosition === false ? 'Nothing borrowed means nothing can be liquidated. The agent read the account and said so.' : 'The agent answered without a health factor.'}{l.account ? ` Account ${short(l.account)}.` : ''}</p>
        </div>
      </div>
    )
  }
  // The number's colour is liquidation risk (under 1 can be liquidated, under 1.2 close); the words say where it sits
  // against the buyer's own target, so a safe 4.0 below an ambitious target of 8 reads safe, not alarming.
  const state = l.healthFactor < 1 ? 'breach' : l.healthFactor < 1.2 ? 'watch' : 'holds'
  const belowTarget = l.target !== null && l.healthFactor < l.target
  const borrowed = l.markets.reduce((s, m) => s + (m.borrowedUsd ?? 0), 0)
  const supplied = l.markets.reduce((s, m) => s + (m.suppliedUsd ?? 0), 0)
  const scale = Math.max(borrowed, supplied, 1)
  return (
    <div className={styles.hf}>
      <div className={styles.hfDial}>
        <HfGauge hf={l.healthFactor} target={l.target} />
        <div className={styles.hfReading}>
          <span className={styles.hfValue} data-state={state}>{l.healthFactor.toFixed(3)}</span>
          <span className={styles.hfWord}>{state === 'breach' ? 'Can be liquidated now' : belowTarget ? `Below the ${l.target} target` : l.target ? `At or above the ${l.target} target` : state === 'watch' ? 'Close to liquidation' : 'Safe from liquidation'}</span>
        </div>
        <p className={styles.gLegend}><i data-k="breach" />liquidation below 1.00{l.target ? <><i data-k="target" />target {l.target}</> : null}</p>
      </div>
      <div className={styles.tiles}>
        <div className={styles.tile} data-tone="primary">
          <span className={styles.tileLabel}>Repay to reach {l.target ?? 'the target'}</span>
          <span className={styles.tileValue}>{l.repayUsd === 0 ? 'Nothing' : usd(l.repayUsd)}</span>
          <span className={styles.tileSub}>{l.repayUsd === 0 ? 'already at or above the target' : 'of debt, in USD'}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>{l.collateralSymbol ?? 'Collateral'} liquidates at</span>
          <span className={styles.tileValue}>{usd(l.liquidationPriceUsd)}</span>
          <span className={styles.tileSub}>{l.collateralFactor !== null ? `threshold ${n(l.collateralFactor * 100, 0)}%` : 'price of the main collateral'}</span>
        </div>
      </div>
      {l.markets.length ? (
        <div className={styles.markets}>
          {l.markets.slice(0, 6).map((m) => (
            <div key={m.symbol} className={styles.market}>
              <span className={styles.marketName}>{m.symbol}</span>
              <span className={styles.bars}>
                {m.suppliedUsd ? <i className={styles.barSupply} style={{ width: `${(m.suppliedUsd / scale) * 100}%` }} title={`supplied ${usd(m.suppliedUsd)}`} /> : null}
                {m.borrowedUsd ? <i className={styles.barBorrow} style={{ width: `${(m.borrowedUsd / scale) * 100}%` }} title={`borrowed ${usd(m.borrowedUsd)}`} /> : null}
              </span>
              <span className={styles.marketVals}>{m.suppliedUsd ? `${usd(m.suppliedUsd, 0)} in` : ''}{m.borrowedUsd ? ` · ${usd(m.borrowedUsd, 0)} out` : ''}</span>
            </div>
          ))}
          <p className={styles.legend}><i className={styles.barSupply} /> supplied <i className={styles.barBorrow} /> borrowed</p>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ rebalancing */

function RangeTrack({ p }: { p: RebPosition }) {
  const ticks = [p.current, ...(p.range ?? []), ...(p.proposed ?? [])].filter((x): x is number => x !== null)
  if (ticks.length < 2) return null
  const min = Math.min(...ticks), max = Math.max(...ticks)
  const pad = Math.max((max - min) * 0.18, 4)
  const lo = min - pad, hi = max + pad
  const x = (t: number) => ((t - lo) / (hi - lo)) * 100
  return (
    <div className={styles.track} role="img" aria-label={`Current range ${p.range?.join(' to ') ?? 'unknown'}, price tick ${p.current ?? 'unknown'}, proposed ${p.proposed?.join(' to ') ?? 'none'}`}>
      <div className={styles.lane}>
        <span className={styles.laneLabel}>Now</span>
        <div className={styles.rail}>{p.range ? <i className={styles.rangeNow} data-in={p.inRange === null ? undefined : String(p.inRange)} style={{ left: `${x(p.range[0])}%`, width: `${Math.max(x(p.range[1]) - x(p.range[0]), 0.8)}%` }} /> : null}</div>
      </div>
      <div className={styles.lane}>
        <span className={styles.laneLabel}>Plan</span>
        <div className={styles.rail}>{p.proposed ? <i className={styles.rangePlan} style={{ left: `${x(p.proposed[0])}%`, width: `${Math.max(x(p.proposed[1]) - x(p.proposed[0]), 0.8)}%` }} /> : <span className={styles.none}>no new range proposed</span>}</div>
      </div>
      {p.current !== null ? <i className={styles.price} style={{ left: `calc(56px + (100% - 56px) * ${x(p.current) / 100})` }}><span>price</span></i> : null}
      <div className={styles.axis}><span>{Math.round(lo)}</span><span>tick</span><span>{Math.round(hi)}</span></div>
    </div>
  )
}

function RebView({ l }: { l: RebLens }) {
  if (!l.positions.length) return <p className={styles.calmBody}>The answer names no PancakeSwap V3 position.</p>
  const out = l.positions.filter((p) => p.inRange === false).length
  return (
    <div className={styles.reb}>
      <p className={styles.headline}>{l.positions.length === 1 ? `Position #${l.positions[0]!.id}` : `${l.positions.length} positions`}{l.owner ? ` of ${short(l.owner)}` : ''}{out ? ` · ${out} out of range` : ' · all in range'}</p>
      {l.positions.slice(0, 4).map((p, i) => (
        <div key={`${p.id ?? 'p'}-${i}`} className={styles.position}>
          <div className={styles.posHead}>
            <span className={styles.posId}>#{p.id}</span>
            <span className={styles.posPair}>{p.pair ?? ''}</span>
            {p.inRange !== null ? <span className={styles.pill} data-tone={p.inRange ? 'good' : 'bad'}>{p.inRange ? 'In range' : 'Out of range'}</span> : null}
            {p.closed ? <span className={styles.pill}>closed</span> : null}
          </div>
          <RangeTrack p={p} />
          <dl className={styles.facts}>
            {p.range ? <div><dt>Now</dt><dd>{p.range[0]} to {p.range[1]}</dd></div> : null}
            {p.proposed ? <div><dt>Proposed</dt><dd>{p.proposed[0]} to {p.proposed[1]}</dd></div> : null}
            {p.amount0 !== null || p.amount1 !== null ? <div><dt>Amounts</dt><dd>{n(p.amount0, 4)} / {n(p.amount1, 4)}</dd></div> : null}
            {p.slippageBps !== null ? <div><dt>Max slippage</dt><dd>{p.slippageBps} bps</dd></div> : null}
          </dl>
          {p.note ? <p className={styles.note}>{p.note}</p> : null}
        </div>
      ))}
      {l.positions.length > 4 ? <p className={styles.more}>{l.positions.length - 4} more positions in the original answer.</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ grid */

function GridView({ l }: { l: GridLens }) {
  const lv = l.levels
  // The ladder spans the grid itself; a current price far outside it is pinned to the edge with its value, so the
  // levels keep the full height instead of crowding into a corner.
  const gridPrices = [...lv.map((x) => x.price), l.stop, l.lower, l.upper].filter((x): x is number => x !== null && Number.isFinite(x))
  const gMin = gridPrices.length ? Math.min(...gridPrices) : 0, gMax = gridPrices.length ? Math.max(...gridPrices) : 0
  const span = gMax - gMin || 1
  const outside = l.price !== null && lv.length >= 2 && (l.price > gMax + span * 0.35 || l.price < gMin - span * 0.35) ? (l.price > gMax ? 'above' : 'below') : null
  const prices = [...gridPrices, ...(l.price !== null && !outside ? [l.price] : [])]
  const ladder = lv.length >= 2 && prices.length >= 2
  const min = Math.min(...prices), max = Math.max(...prices)
  const pad = (max - min) * 0.06 || 1
  const y = (p: number) => 100 - ((p - (min - pad)) / (max + pad - (min - pad))) * 100
  const maxAlloc = Math.max(...lv.map((x) => x.allocationUsd ?? 0), 1)
  const shown = lv.length > 24 ? lv.filter((_, i) => i % Math.ceil(lv.length / 24) === 0 || i === lv.length - 1) : lv
  return (
    <div className={styles.grid}>
      {l.signal ? <p className={styles.signal}><span>Signal now</span>{l.signal}</p> : null}
      <div className={styles.gridBody}>
        {ladder ? (
          <div className={styles.ladder} role="img" aria-label={`${lv.length} grid levels from ${n(lv[0]!.price)} to ${n(lv[lv.length - 1]!.price)}`}>
            {l.lower !== null && l.upper !== null ? <i className={styles.band} style={{ top: `${y(l.upper)}%`, height: `${y(l.lower) - y(l.upper)}%` }} /> : null}
            {shown.map((x, i) => {
              const side = x.side ?? (l.price !== null ? (x.price < l.price ? 'buy' : 'sell') : null)
              return (
                <div key={i} className={styles.rung} data-side={side ?? undefined} style={{ top: `${y(x.price)}%` }}>
                  <span className={styles.rungPrice}>{n(x.price, x.price < 10 ? 4 : 2)}</span>
                  <i className={styles.rungLine} />
                  {x.allocationUsd ? <i className={styles.rungAlloc} style={{ width: `${(x.allocationUsd / maxAlloc) * 22}%` }} /> : null}
                </div>
              )
            })}
            {l.price !== null && !outside ? <div className={styles.now} style={{ top: `${y(l.price)}%` }}><span>now {n(l.price)}</span></div> : null}
            {l.price !== null && outside ? <div className={styles.nowEdge} data-edge={outside}><span>{outside === 'above' ? '↑' : '↓'} now {n(l.price)}, {outside} the grid</span></div> : null}
            {l.stop !== null ? <div className={styles.stopLine} style={{ top: `${y(l.stop)}%` }}><span>stop {n(l.stop)}</span></div> : null}
          </div>
        ) : null}
        <div className={styles.tiles}>
          {l.policy ? (
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Its standing grid</span>
              <span className={styles.tileValue}>{l.policy.levelsEachSide ?? '?'} levels each side</span>
              <span className={styles.tileSub}>{l.policy.anchorUsd !== null ? `around ${usd(l.policy.anchorUsd)}` : ''}{l.policy.stepBps !== null ? `, every ${n(l.policy.stepBps / 100, 2)}%` : ''}{l.policy.clip ? `, ${l.policy.clip} per clip` : ''}</span>
            </div>
          ) : lv.length ? <div className={styles.tile}><span className={styles.tileLabel}>Levels</span><span className={styles.tileValue}>{lv.length}</span><span className={styles.tileSub}>{l.spacing ? `${l.spacing} spacing` : 'spacing not stated'}</span></div> : null}
          {l.capitalUsd !== null ? <div className={styles.tile}><span className={styles.tileLabel}>Capital</span><span className={styles.tileValue}>{usd(l.capitalUsd, 0)}</span></div> : null}
          {l.feeDragPct !== null ? <div className={styles.tile}><span className={styles.tileLabel}>Fee drag</span><span className={styles.tileValue}>{n(l.feeDragPct)}%</span><span className={styles.tileSub}>per round trip</span></div> : null}
          {l.record ? (
            <div className={styles.tile} data-tone="primary">
              <span className={styles.tileLabel}>Its own track record</span>
              <span className={styles.tileValue}>{l.record.pnlUsd !== null ? `${l.record.pnlUsd < 0 ? '−' : '+'}${usd(Math.abs(l.record.pnlUsd))}` : `${l.record.fills ?? 'n/a'} fills`}</span>
              <span className={styles.tileSub}>{[l.record.fills !== null ? `${l.record.fills} fills` : null, l.record.roundTrips != null ? `${l.record.roundTrips} round trip${l.record.roundTrips === 1 ? '' : 's'}` : null, l.record.winRate != null ? `${n(l.record.winRate * 100, 0)}% won` : null, l.record.maxDrawdownUsd != null ? `worst dip ${usd(l.record.maxDrawdownUsd)}` : null, l.record.gasUsd !== null ? `gas ${usd(l.record.gasUsd)}` : null].filter(Boolean).join(' · ')}</span>
            </div>
          ) : null}
        </div>
      </div>
      {l.fills && l.fills.length ? (
        <div className={styles.fills}>
          <span className={styles.tileLabel}>Its fills, on chain</span>
          <ul>
            {l.fills.map((f, i) => (
              <li key={i}>
                <span className={styles.fillSide} data-side={f.side ?? undefined}>{f.side ?? 'trade'}</span>
                <span className={styles.fillAmt}>{f.base !== null ? n(f.base, 4) : ''}{f.quote !== null ? <small> for {usd(f.quote)}</small> : null}</span>
                <span className={styles.fillPrice}>{f.price !== null ? `at ${usd(f.price)}` : ''}</span>
                <span className={styles.fillAt}>{f.at && !Number.isNaN(Date.parse(f.at)) ? new Date(f.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : ''}</span>
                {f.tx && /^0x[0-9a-fA-F]{64}$/.test(f.tx) ? <a className={styles.fillTx} href={`https://bscscan.com/tx/${f.tx}`} target="_blank" rel="noreferrer">tx</a> : <span />}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {l.record?.verify ? (
        <details className={styles.verify}>
          <summary>Check its record yourself</summary>
          <p className={styles.legend}>{l.record.source ?? ''}</p>
          <code>{l.record.verify}</code>
        </details>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ yield */

function YieldView({ l }: { l: YieldLens }) {
  const costs = [['Gas', l.switching.gasUsd], ['Swap', l.switching.swapUsd], ['Exit', l.switching.exitUsd]] as const
  const totalCost = costs.reduce((s, [, v]) => s + (v ?? 0), 0)
  const alts = [...(l.netAprPct !== null && l.venue ? [{ venue: `${l.venue}${l.asset ? ` ${l.asset}` : ''}`, netAprPct: l.netAprPct, chosen: true }] : []), ...l.alternatives.map((a) => ({ ...a, chosen: false }))].filter((a) => a.netAprPct !== null)
  const top = Math.max(...alts.map((a) => a.netAprPct!), l.grossAprPct ?? 0, 0.01)
  return (
    <div className={styles.yield}>
      <div className={styles.yHero}>
        <span className={styles.pill} data-tone={l.recommend ? 'good' : 'neutral'}>{l.recommend ? 'Move' : l.recommend === false ? 'Stay put' : 'No call'}</span>
        <span className={styles.yVenue}>{l.venue ? `${l.venue.charAt(0).toUpperCase()}${l.venue.slice(1)}` : 'No venue'}{l.asset ? ` · ${l.asset}` : ''}</span>
        <span className={styles.yApr}>{l.netAprPct !== null ? `${n(l.netAprPct)}%` : 'n/a'}<span>net APR{l.sizeUsd !== null ? ` at ${usd(l.sizeUsd, 0)}` : ''}</span></span>
        {l.declineReason ? <p className={styles.note}>{l.declineReason}</p> : null}
      </div>
      {alts.length ? (
        <div className={styles.ranking}>
          {alts.slice(0, 6).map((a) => (
            <div key={a.venue} className={styles.rankRow} data-chosen={a.chosen || undefined}>
              <span className={styles.rankName}>{a.venue}</span>
              <span className={styles.rankBar}><i style={{ width: `${(a.netAprPct! / top) * 100}%` }} /></span>
              <span className={styles.rankVal}>{n(a.netAprPct)}%</span>
            </div>
          ))}
          {l.grossAprPct !== null && l.netAprPct !== null ? <p className={styles.legend}>Gross {n(l.grossAprPct)}% before switching costs, {n(l.netAprPct)}% after.</p> : null}
        </div>
      ) : null}
      <div className={styles.waterfall}>
        <span className={styles.tileLabel}>Cost to switch, once</span>
        <div className={styles.costs}>
          {costs.map(([k, v]) => <span key={k} className={styles.cost}><b>{v === null ? 'n/a' : usd(v, v < 1 ? 4 : 2)}</b>{k}</span>)}
          <span className={styles.cost} data-total=""><b>{usd(totalCost, totalCost < 1 ? 4 : 2)}</b>total</span>
        </div>
        {l.breakEvenUsd !== null ? <p className={styles.legend}>Pays for itself on deposits above {usd(l.breakEvenUsd)}.</p> : null}
      </div>
      {l.sources.length ? (
        <ul className={styles.sources}>{l.sources.map((s, i) => <li key={i}><b>{s.value !== null ? `${n(s.value, 3)}%` : 'n/a'}</b> {s.label}</li>)}</ul>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ security */

const SEV = ['critical', 'high', 'medium', 'low', 'info']
function SecurityView({ l }: { l: SecurityLens }) {
  const counts = l.counts ?? Object.fromEntries(SEV.map((s) => [s, l.findings.filter((f) => f.severity === s).length]))
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <div className={styles.sec}>
      <div className={styles.secHero}>
        <span className={styles.secSubject}>{l.symbol ?? 'Contract'} <span>{short(l.subject)}</span></span>
        <p className={styles.secVerdict}>{l.verdict ?? (total ? `${total} findings` : 'No findings reported')}</p>
        <div className={styles.sevRow}>{SEV.map((s) => <span key={s} className={styles.sev} data-sev={s} data-zero={!counts[s] || undefined}><b>{counts[s] ?? 0}</b>{s}</span>)}</div>
      </div>
      <dl className={styles.facts}>
        {l.proxy !== null ? <div><dt>Upgradeable proxy</dt><dd>{l.proxy ? 'Yes' : 'No'}</dd></div> : null}
        <div><dt>Owner</dt><dd>{l.owner ? short(l.owner) : 'none found'}</dd></div>
      </dl>
      {l.findings.length ? <ul className={styles.findings}>{l.findings.slice(0, 10).map((f, i) => <li key={i} data-sev={f.severity}><b>{f.title}</b>{f.detail ? <span>{f.detail}</span> : null}</li>)}</ul> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ anything else: an outline, never raw JSON first */

/* Any answer Marque has no picture for, read as plainly as possible: summaries first, lists of records as tables,
   units from the field names, dates and links readable, plumbing folded away. Nothing is computed or re-scored. */
const PLUMBING = new Set(['contracts', 'kernel', 'chain_id', 'chainid', 'version', 'metadata', 'job', 'agent', 'reconciliation', 'integerreplica', 'emode'])
const LEAD = ['summary', 'verdict', 'signal', 'recommendation', 'headline', 'status', 'result', 'message']
const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !Number.isNaN(Date.parse(v))
const when = (v: string) => new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
function asJson(v: string): unknown {
  const t = v.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return undefined
  try { return JSON.parse(t) } catch { return undefined }
}
function numberIn(key: string, v: number) {
  const k = key.toLowerCase()
  if (/(usd|price)$/.test(k) || k.endsWith('_usd')) return Math.abs(v) >= 1000 ? `$${n(v, 0)}` : `$${n(v, Math.abs(v) < 1 ? 4 : 2)}`
  if (/(pct|percent|apr|apy)$/.test(k)) return `${n(v, 2)}%`
  if (/bps$/.test(k)) return `${n(v, 0)} bps`
  if (/(rate|ratio)$/.test(k) && v >= 0 && v <= 1) return `${n(v * 100, 1)}%`
  if (/(block|blocknumber)$/.test(k)) return v.toLocaleString('en-US')
  if (/(timestamp|time)$/.test(k) && v > 1.5e9 && v < 2.5e9) return when(new Date(v * 1000).toISOString())
  return Number.isInteger(v) ? v.toLocaleString('en-US') : n(v, Math.abs(v) < 1 ? 6 : 4)
}
function Leaf({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined || v === '') return <span className={styles.nil}>none</span>
  if (typeof v === 'boolean') return <span>{v ? 'Yes' : 'No'}</span>
  if (typeof v === 'number') return <span className={styles.mono}>{numberIn(k, v)}</span>
  if (typeof v === 'string') {
    if (/^0x[0-9a-fA-F]{64}$/.test(v)) return <a className={styles.mono} href={`https://bscscan.com/tx/${v}`} target="_blank" rel="noreferrer">{`${v.slice(0, 10)}…${v.slice(-6)}`}</a>
    if (/^0x[0-9a-fA-F]{40}$/.test(v)) return <a className={styles.mono} href={`https://bscscan.com/address/${v}`} target="_blank" rel="noreferrer">{short(v)}</a>
    if (/^https:\/\//.test(v)) return <a href={v} rel="nofollow noreferrer" target="_blank">{v.length > 60 ? `${v.slice(0, 57)}…` : v}</a>
    if (isIso(v)) return <span>{when(v)}</span>
    return <span>{v.length > 400 ? `${v.slice(0, 400)}…` : v}</span>
  }
  return null
}
function Outline({ value, depth = 0, k = '' }: { value: unknown; depth?: number; k?: string }) {
  if (typeof value === 'string') { const j = asJson(value); if (j !== undefined) return <Outline value={j} depth={depth} k={k} /> }
  if (value === null || typeof value !== 'object') return <Leaf k={k} v={value} />
  if (Array.isArray(value)) {
    if (!value.length) return <span className={styles.nil}>none</span>
    if (value.every((x) => x === null || typeof x !== 'object')) return <span className={styles.chipsRow}>{value.slice(0, 16).map((x, i) => <span key={i} className={styles.pill}><Leaf k={k} v={x} /></span>)}{value.length > 16 ? <span className={styles.nil}>{value.length - 16} more</span> : null}</span>
    const rows = value.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    const cols = [...new Set(rows.slice(0, 12).flatMap((r) => Object.keys(r)))].filter((c) => rows.slice(0, 12).every((r) => r[c] === null || typeof r[c] !== 'object')).slice(0, 6)
    if (rows.length >= 2 && cols.length >= 2) {
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr>{cols.map((c) => <th key={c}>{human(c)}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 12).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}><Leaf k={c} v={r[c]} /></td>)}</tr>)}</tbody>
          </table>
          {rows.length > 12 ? <span className={styles.nil}>{rows.length - 12} more in the original answer</span> : null}
        </div>
      )
    }
    if (depth > 2) return <span className={styles.nil}>{value.length} items</span>
    return <ol className={styles.outlineList}>{value.slice(0, 8).map((v, i) => <li key={i}><Outline value={v} depth={depth + 1} k={k} /></li>)}{value.length > 8 ? <li className={styles.nil}>{value.length - 8} more</li> : null}</ol>
  }
  if (depth > 3) return <span className={styles.nil}>more detail in the original answer</span>
  const entries = Object.entries(value as Record<string, unknown>).filter(([key, v]) => !(depth === 0 && PLUMBING.has(key.toLowerCase())) && v !== undefined)
  const lead = depth === 0 ? entries.find(([key, v]) => LEAD.includes(key.toLowerCase()) && typeof v === 'string' && v.length > 3) : undefined
  return (
    <>
      {lead ? <p className={styles.signal}><span>{human(lead[0])}</span>{String(lead[1])}</p> : null}
      <dl className={styles.outline}>
        {entries.filter((e) => e !== lead).slice(0, 28).map(([key, v]) => <div key={key}><dt>{human(key)}</dt><dd><Outline value={v} depth={depth + 1} k={key} /></dd></div>)}
      </dl>
    </>
  )
}

/* ------------------------------------------------------------------ the frame */

export function ResultLens({ data, agentName, content }: { data: JobLens; agentName: string; content: unknown }) {
  const l = data.lens
  const checks = data.checks
  const verdict = data.summary.checked === 0 ? null : data.summary.agreed === data.summary.checked ? 'good' : 'mixed'
  return (
    <section className={styles.lens} aria-labelledby="lens-title">
      <header className={styles.lensHead}>
        <h2 id="lens-title" className={styles.lensTitle}>What {agentName} delivered</h2>
        <div className={styles.badges}>
          {verdict ? <span className={styles.badge} data-tone={verdict}><CheckMark state={verdict === 'good' ? 'match' : 'differs'} />Checked against the chain: {data.summary.agreed} of {data.summary.checked} agree</span>
            : <span className={styles.badge}>Not checked: Marque has no check for this answer</span>}
          {data.manifest?.matches === true ? <span className={styles.badge} data-tone="good"><CheckMark state="match" />File matches the hash on chain</span> : data.manifest?.matches === false ? <span className={styles.badge} data-tone="mixed"><CheckMark state="differs" />File differs from the hash on chain</span> : null}
        </div>
      </header>

      {l?.error ? <p className={styles.errorNote}>The agent reported an error: {l.error}</p> : null}
      <div className={styles.view}>
        {l?.kind === 'health_factor' ? <HfView l={l} /> : l?.kind === 'rebalancing' ? <RebView l={l} /> : l?.kind === 'grid' ? <GridView l={l} /> : l?.kind === 'yield' ? <YieldView l={l} /> : l?.kind === 'security' ? <SecurityView l={l} />
          : <div><p className={styles.calmBody}>Shown as delivered. Marque has no picture for this format yet, so here is what the agent sent, in plain words.</p><Outline value={content} /></div>}
      </div>

      {checks.length ? (
        <div className={styles.checks}>
          <span className={styles.tileLabel}>Marque&apos;s checks{data.checkedAtBlock ? ` · at block ${Number(data.checkedAtBlock).toLocaleString('en-US')}` : ''}</span>
          <ul>
            {checks.map((c) => (
              <li key={c.key} data-state={c.state}>
                <CheckMark state={c.state} />
                <div>
                  <span className={styles.checkLabel}>{c.label}</span>
                  <span className={styles.checkVals}>{STATE_WORD[c.state]}{c.agent ? ` · ${agentName} ${c.agent}` : ''}{c.marque ? ` · ${c.how === 'chain' ? 'Marque' : 'check'} ${c.marque}` : ''}</span>
                </div>
                <span className={styles.how}>{c.how === 'chain' ? 'read on chain' : 'arithmetic'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.foot}>
        {l && (l.meta.source || l.meta.readAt) ? <p className={styles.legend}>The agent&apos;s own answer{l.meta.source ? `: ${l.meta.source}` : ''}{l.meta.block ? `, block ${Number(l.meta.block).toLocaleString('en-US')}` : ''}{l.meta.readAt && !Number.isNaN(Date.parse(l.meta.readAt)) ? `, read ${new Date(l.meta.readAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : ''}.</p> : null}
        {l && (l.meta.assumptions.length || l.meta.limitations.length || l.meta.method) ? (
          <Limits label="Assumptions and limits the agent stated">
            <ul>{[...l.meta.assumptions, ...l.meta.limitations, ...(l.meta.method ? [l.meta.method] : [])].map((x) => <li key={x}>{x}</li>)}</ul>
          </Limits>
        ) : null}
        {data.manifest?.raw ? (
          <details className={styles.original}>
            <summary>Original answer</summary>
            <pre tabIndex={0}>{data.manifest.raw.length > 40_000 ? `${data.manifest.raw.slice(0, 40_000)}\n…` : data.manifest.raw}</pre>
            <p className={styles.legend}>{data.manifest.url ? <a href={data.manifest.url} rel="nofollow noreferrer" target="_blank" download>Download the file</a> : null}{data.manifest.hash ? <> · keccak256 <code>{short(data.manifest.hash)}</code></> : null}{data.manifest.source === 'agent_announced' ? ' · published by the agent, location from its answer to Marque' : ''}</p>
          </details>
        ) : null}
      </div>
    </section>
  )
}

export type { Lens }
