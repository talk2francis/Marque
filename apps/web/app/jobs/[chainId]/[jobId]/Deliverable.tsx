import { MeasureRule, ProvenanceChip } from '@marque/ui'
import styles from './job.module.css'

/**
 * What the agent delivered, rendered for its category (DESIGN-SYSTEM.md 8.6):
 * health factor with the exact repay, a range plan with its ticks, a yield route
 * with its sources, grid levels with the fee drag. Values are the agent's answer,
 * shown as it gave them; the raw file and its hash check sit below.
 */
type Json = Record<string, unknown>
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const usd = (v: number | null, dp = 2) => (v === null ? 'not given' : `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`)
const pct = (v: number | null, dp = 2) => (v === null ? 'not given' : `${v.toFixed(dp)}%`)
const big = (v: number | null, dp = 4) => (v === null ? 'not given' : v.toLocaleString('en-US', { maximumFractionDigits: dp }))

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return <div className={styles.dRow}><dt>{k}</dt><dd className={mono ? styles.mono : undefined}>{v}</dd></div>
}

function Assumptions({ c }: { c: Json }) {
  const a = Array.isArray(c['assumptions']) ? (c['assumptions'] as unknown[]).filter((x): x is string => typeof x === 'string') : []
  if (!a.length) return null
  return (
    <div className={styles.assume}>
      <span className="t-label">Settings the task left out, and what it used</span>
      <ul>{a.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  )
}

function Source({ c }: { c: Json }) {
  const src = s(c['source'])
  const block = s(c['blockNumber']) ?? (n(c['blockNumber']) !== null ? String(c['blockNumber']) : null)
  if (!src && !block) return null
  return <p className={styles.dSource}><ProvenanceChip provenance="CLAIMED" title="The agent's own answer. Marque shows it as delivered and checks the file against the hash on chain." /> {src}{block ? ` · block ${Number(block).toLocaleString('en-US')}` : ''}</p>
}

function HealthFactor({ c }: { c: Json }) {
  const hf = n(c['healthFactor'])
  const target = n(c['targetHealthFactor'])
  const repay = n(c['repayUsdToReachTarget'])
  const upper = Math.max(3, (target ?? 2.5) + 0.5, hf !== null ? Math.min(hf, 6) + 0.2 : 0)
  const state = hf === null ? 'neutral' : hf < 1.1 ? 'breach' : target !== null && hf < target ? 'watch' : 'holds'
  return (
    <div className={styles.dBody}>
      <div className={styles.dHero}>
        <div>
          <span className="t-label">Health factor</span>
          <span className={styles.dBig} data-state={state}>{hf === null ? 'not given' : hf.toFixed(3)}</span>
        </div>
        <div>
          <span className="t-label">Repay to reach {target ?? 'target'}</span>
          <span className={styles.dBig}>{usd(repay)}</span>
        </div>
      </div>
      {hf !== null ? (
        <MeasureRule label={`Health factor ${hf.toFixed(3)}; liquidation at 1.00${target ? `, target ${target}` : ''}`}
          value={Math.min(hf, upper)} lower={1} upper={upper} threshold={target ?? undefined} thresholdLabel={target ? `target ${target}` : undefined}
          lowerLabel="1.00 liquidation" upperLabel={upper.toFixed(2)} valueLabel={`HF ${hf.toFixed(3)}`} state={state} />
      ) : null}
      <dl className={styles.dList}>
        <Row k="Largest collateral" v={`${s(c['primaryCollateralSymbol']) ?? 'not given'}${n(c['primaryCollateralFactor']) !== null ? `, collateral factor ${n(c['primaryCollateralFactor'])}` : ''}`} />
        <Row k="Liquidation price" v={usd(n(c['primaryLiquidationPriceUsd']))} />
      </dl>
      <Assumptions c={c} /><Source c={c} />
    </div>
  )
}

function Rebalance({ c }: { c: Json }) {
  const cur = n(c['currentTick']), lo = n(c['proposedTickLower']), hi = n(c['proposedTickUpper'])
  const inRange = c['inRange'] === true
  return (
    <div className={styles.dBody}>
      <div className={styles.dHero}>
        <div><span className="t-label">Position</span><span className={styles.dBig}>#{s(c['tokenId']) ?? '?'}</span><span className={styles.dSub}>{s(c['pair']) ?? ''}{n(c['feeTier']) !== null ? ` · ${(n(c['feeTier'])! / 10000).toFixed(2)}% tier` : ''}</span></div>
        <div><span className="t-label">Now</span><span className={styles.dBig} data-state={inRange ? 'holds' : 'breach'}>{inRange ? 'In range' : 'Out of range'}</span><span className={styles.dSub}>{pct(n(c['pctToNearestBound']))} to the nearest bound</span></div>
      </div>
      {cur !== null && lo !== null && hi !== null ? (
        <MeasureRule label={`Current tick ${cur} against the proposed range ${lo} to ${hi}`} value={Math.max(lo, Math.min(hi, cur))} lower={lo} upper={hi}
          lowerLabel={`${lo}`} upperLabel={`${hi}`} valueLabel={`tick ${cur}`} state="holds" />
      ) : null}
      <dl className={styles.dList}>
        <Row k="Proposed range" v={lo !== null && hi !== null ? `ticks ${lo} to ${hi} (spacing ${n(c['tickSpacing']) ?? '?'})` : 'not given'} mono />
        <Row k="Range width" v={n(c['rangeHalfWidthPct']) !== null ? `±${n(c['rangeHalfWidthPct'])}% of price` : 'not given'} />
        <Row k="To mint it" v={`${big(n(c['amount0']), 8)} and ${big(n(c['amount1']), 4)}${s(c['pair']) ? ` (${s(c['pair'])})` : ''}`} />
        <Row k="Slippage bound" v={n(c['maxSlippageBps']) !== null ? `${n(c['maxSlippageBps'])} bps${s(c['slippageBasis']) ? `: ${s(c['slippageBasis'])}` : ''}` : 'not given'} />
      </dl>
      <Assumptions c={c} /><Source c={c} />
    </div>
  )
}

function Yield({ c }: { c: Json }) {
  const recommend = c['recommend'] === true
  const net = n(c['netAprPct']) ?? n(c['netRealisedAprPct'])
  const ranking = Array.isArray(c['ranking']) ? (c['ranking'] as Json[]) : null
  const sources = Array.isArray(c['aprSources']) ? (c['aprSources'] as Json[]) : null
  const cost = (c['switchingCost'] ?? null) as Json | null
  return (
    <div className={styles.dBody}>
      <div className={styles.dHero}>
        <div><span className="t-label">{recommend ? 'Recommended' : 'Recommendation'}</span><span className={styles.dBig}>{recommend ? s(c['venue']) ?? 'a venue' : 'Stay put'}</span>{!recommend && s(c['declineReason']) ? <span className={styles.dSub}>{s(c['declineReason'])}</span> : null}</div>
        <div><span className="t-label">{ranking ? 'Net realised APR' : 'Net APR at your size'}</span><span className={styles.dBig} data-state="holds">{pct(net)}</span><span className={styles.dSub}>on {usd(n(c['sizeUsd']), 0)}</span></div>
      </div>
      {ranking ? (
        <div className={styles.dTableWrap}><table className={styles.dTable}>
          <thead><tr><th scope="col">Venue</th><th scope="col">Realised</th><th scope="col">Quoted</th><th scope="col">Net</th></tr></thead>
          <tbody>{ranking.slice(0, 8).map((r, i) => <tr key={i}><th scope="row">{s(r['venue'])}</th><td>{pct(n(r['realisedAprPct']))}</td><td>{pct(n(r['quotedAprPct']))}</td><td>{pct(n(r['netRealisedAprPct']))}</td></tr>)}</tbody>
        </table></div>
      ) : null}
      {sources ? (
        <dl className={styles.dList}>
          {sources.map((x, i) => <Row key={i} k={`${pct(n(x['value']))}`} v={s(x['source'])} />)}
        </dl>
      ) : null}
      {cost ? <dl className={styles.dList}><Row k="Switching cost" v={`gas ${usd(n(cost['gasUsd']))}, swap ${usd(n(cost['swapUsd']))}, exit ${usd(n(cost['exitUsd']))}`} /></dl> : null}
      {c['window'] && typeof c['window'] === 'object' ? <dl className={styles.dList}><Row k="Measured over" v={`${n((c['window'] as Json)['days']) ?? '?'} days of on-chain exchange-rate growth`} /></dl> : null}
      <Assumptions c={c} /><Source c={c} />
    </div>
  )
}

function Grid({ c }: { c: Json }) {
  const levels = Array.isArray(c['levels']) ? (c['levels'] as Json[]).map((l) => ({ p: n(l['price']), a: n(l['allocationUsd']) })).filter((l): l is { p: number; a: number } => l.p !== null && l.a !== null) : []
  const lo = n(c['bandLow']) ?? levels[0]?.p ?? null
  const hi = n(c['bandHigh']) ?? levels[levels.length - 1]?.p ?? null
  return (
    <div className={styles.dBody}>
      <div className={styles.dHero}>
        <div><span className="t-label">Grid</span><span className={styles.dBig}>{levels.length} levels</span><span className={styles.dSub}>{s(c['spacingType']) ?? ''} spacing, {big(lo)} to {big(hi)}</span></div>
        <div><span className="t-label">Fee drag</span><span className={styles.dBig} data-state="watch">{pct(n(c['feeDragPct']))}</span><span className={styles.dSub}>{s(c['feeDragBasis']) ?? ''}</span></div>
      </div>
      {lo !== null && hi !== null && hi > lo ? (
        <div className={styles.ladder} role="img" aria-label={`${levels.length} grid levels from ${lo} to ${hi}`}>
          <span className={styles.ladderRule} />
          {levels.map((l, i) => <span key={i} className={styles.ladderTick} style={{ left: `${((l.p - lo) / (hi - lo)) * 100}%` }} />)}
          <span className={styles.ladderLo}>{big(lo, 2)}</span><span className={styles.ladderHi}>{big(hi, 2)}</span>
        </div>
      ) : null}
      <div className={styles.dTableWrap}><table className={styles.dTable}>
        <thead><tr><th scope="col">Level</th><th scope="col">Price</th><th scope="col">Allocation</th></tr></thead>
        <tbody>{levels.map((l, i) => <tr key={i}><th scope="row">{i + 1}</th><td>{big(l.p, 4)}</td><td>{usd(l.a)}</td></tr>)}</tbody>
      </table></div>
      <dl className={styles.dList}><Row k="Capital" v={usd(n(c['capitalUsd']), 0)} /><Row k="Allocated" v={usd(n(c['allocationTotalUsd']))} /></dl>
      <Assumptions c={c} /><Source c={c} />
    </div>
  )
}

export function DeliverableView({ category, content }: { category: string | null; content: Json }) {
  if (category === 'health_factor' || 'healthFactor' in content) return <HealthFactor c={content} />
  if (category === 'rebalancing' || 'proposedTickLower' in content) return <Rebalance c={content} />
  if (category === 'grid' || 'levels' in content) return <Grid c={content} />
  if (category === 'yield' || 'recommend' in content) return <Yield c={content} />
  return <pre className={styles.raw}>{JSON.stringify(content, null, 2)}</pre>
}
