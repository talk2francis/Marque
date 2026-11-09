'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { simulateAct, WAD } from '@marque/charters/client'
import { useWidth } from './useWidth'
import styles from './hub.module.css'

/**
 * Night Replay (03_EXPERIENCE section 4): a deterministic, simulated night on a labelled example loan. BNB falls
 * 40% between 22:00 and 06:00; without a guard health just falls, with one the guard's own act() arithmetic
 * (simulateAct, parity-tested against the contract) repays back to the target each time the trigger is crossed.
 * Plays once when it scrolls into view, 9 seconds; Replay repeats; reduced motion shows the final frame.
 * A simulation, labelled as one: no number here is a record.
 */
const EXAMPLE = { bnb: 3.4, lt: 0.8, debt: 1000, trigger: 1.3, target: 1.8, budget: 500, start: 600, end: 361 }
const STEPS = 160
const PAD = { l: 8, r: 8, t: 12, b: 22 }
const big = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n // 18-decimal fixed point from a float
const num = (b: bigint) => Number((b * 10_000n) / WAD) / 10_000

/** The night, computed once: a falling price with a few relief rallies, from a fixed seed. */
function night() {
  let seed = 7
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const prices: number[] = []
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS
    const base = EXAMPLE.start + (EXAMPLE.end - EXAMPLE.start) * (f < 0.35 ? f * 0.6 / 0.35 : 0.6 + (f - 0.35) * 0.4 / 0.65)
    const wobble = (rand() - 0.5) * 8 + Math.sin(f * 19) * 4
    prices.push(i === STEPS ? EXAMPLE.end : i === 0 ? EXAMPLE.start : base + wobble)
  }
  let debt = big(EXAMPLE.debt)
  let left = big(EXAMPLE.budget)
  let repaidTotal = 0n
  const frames: Array<{ price: number; without: number; with: number; acted: number | null; repaidTotal: number }> = []
  let liquidatedAt: number | null = null
  for (const p of prices) {
    const coll = big(EXAMPLE.bnb * p * EXAMPLE.lt)
    const without = num((coll * WAD) / big(EXAMPLE.debt))
    if (without < 1 && liquidatedAt === null) liquidatedAt = p
    const r = simulateAct({
      health: { collateralUsd: coll, debtUsd: debt }, debtInMarket: debt, price: WAD, trigger: big(EXAMPLE.trigger), target: big(EXAMPLE.target),
      budget: left, spent: 0n, allowance: left, balance: left, tip: 0n, callerIsOwner: false,
    })
    let acted: number | null = null
    if (r.state === 'would_act') { debt -= r.repaid; left -= r.repaid; repaidTotal += r.repaid; acted = num(r.repaid) }
    frames.push({ price: p, without, with: num((coll * WAD) / debt), acted, repaidTotal: num(repaidTotal) })
  }
  return { frames, liquidatedAt, unused: num(left) }
}

export function NightReplay() {
  const { frames, liquidatedAt, unused } = useMemo(night, [])
  const box = useRef<HTMLDivElement>(null)
  const [svgBox, W] = useWidth<HTMLDivElement>(520)
  const H = W < 420 ? 180 : 220
  const [t, setT] = useState(0) // 0..1 through the night
  const [run, setRun] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setT(1); return }
    if (run === 0) {
      // First play waits until the replay scrolls into view.
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); setRun(1) } }, { threshold: 0.4 })
      if (box.current) io.observe(box.current)
      return () => io.disconnect()
    }
    const start = performance.now()
    const step = (now: number) => {
      const f = Math.min(1, (now - start) / 9000)
      setT(f)
      if (f < 1) raf.current = requestAnimationFrame(step)
    }
    setT(0)
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [run])

  const shown = Math.max(1, Math.round(t * STEPS))
  const cur = frames[Math.min(shown, STEPS)]!
  const lo = 0.8, hi = 2.0
  const x = (i: number) => PAD.l + (i / STEPS) * (W - PAD.l - PAD.r)
  const y = (h: number) => PAD.t + (1 - (Math.max(lo, Math.min(hi, h)) - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const path = (k: 'with' | 'without') => frames.slice(0, shown + 1).map((f, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f[k]).toFixed(1)}`).join('')
  const acts = frames.map((f, i) => ({ ...f, i })).filter((f) => f.acted !== null && f.i <= shown)
  const lastAct = acts.at(-1)
  const done = t >= 1
  const clock = (() => { const m = 22 * 60 + Math.round(t * 8 * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` })()

  return (
    <div className={styles.replay} ref={box} aria-label="Simulation: a night BNB fell 40%, with and without a Loan Guard">
      <div className={styles.replayHead}>
        <span className={styles.replayTitle}>A night BNB fell 40%</span>
        <span className={styles.sim}>Simulation</span>
        <button type="button" className={styles.replayBtn} onClick={() => setRun((r) => r + 1)}>Replay</button>
      </div>
      <dl className={styles.readouts} aria-live="off">
        <div><dt>BNB price</dt><dd className="mono">${cur.price.toFixed(0)}</dd></div>
        <div><dt>Loan health</dt><dd className="mono" data-tone={cur.with < EXAMPLE.trigger ? 'amber' : undefined}>{cur.with.toFixed(2)}</dd></div>
        <div><dt>Repaid by the guard</dt><dd className="mono">{cur.repaidTotal.toFixed(0)}</dd></div>
      </dl>
      <div ref={svgBox}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={styles.replaySvg} aria-hidden="true">
        <line x1={PAD.l} x2={W - PAD.r} y1={y(EXAMPLE.target)} y2={y(EXAMPLE.target)} className={styles.rTarget} />
        <line x1={PAD.l} x2={W - PAD.r} y1={y(EXAMPLE.trigger)} y2={y(EXAMPLE.trigger)} className={styles.rTrigger} />
        <line x1={PAD.l} x2={W - PAD.r} y1={y(1)} y2={y(1)} className={styles.rLiq} />
        <text x={W - PAD.r} y={y(EXAMPLE.target) - 4} textAnchor="end" className={styles.rLabel}>1.80</text>
        <text x={W - PAD.r} y={y(EXAMPLE.trigger) - 4} textAnchor="end" className={styles.rLabel}>1.30</text>
        <text x={W - PAD.r} y={y(1) - 4} textAnchor="end" className={styles.rLabel}>1.00</text>
        <path d={path('without')} className={styles.rWithout} />
        <path d={path('with')} className={styles.rWith} />
        {acts.map((a) => <circle key={a.i} cx={x(a.i)} cy={y(a.with)} r={4} className={styles.rAct} />)}
        <text x={PAD.l} y={H - 6} className={styles.rLabel}>22:00</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className={styles.rLabel}>06:00</text>
      </svg>
      </div>
      <ul className={styles.legend} aria-hidden="true">
        <li data-k="with">Health with the guard</li><li data-k="without">Without it</li><li data-k="trigger">Your trigger</li><li data-k="target">Your target</li>
      </ul>
      <div className={styles.eventCard} aria-live="polite">
        {done
          ? <p><b>Morning.</b> Without the guard this loan was liquidated at ${liquidatedAt?.toFixed(0) ?? 'n/a'}. With it, health {frames[STEPS]!.with.toFixed(2)} and {unused.toFixed(0)} USDT of budget unused.</p>
          : lastAct ? <p><b>{clock}.</b> Keel repaid {lastAct.acted!.toFixed(0)} USDT. BNB had fallen to ${lastAct.price.toFixed(0)}; health went back to {lastAct.with.toFixed(2)}.</p>
            : <p><b>{clock}.</b> Health {cur.with.toFixed(2)}. The guard watches; nothing has moved.</p>}
      </div>
      <div className={styles.moneyLine} data-lit={lastAct && !done && shown - lastAct.i < 8 ? 'true' : undefined}>
        <span>Your wallet<small>{Math.max(0, 500 - cur.repaidTotal).toFixed(0)} USDT</small></span>
        <i aria-hidden="true" />
        <span>Guard<small>holds nothing</small></span>
        <i aria-hidden="true" />
        <span>Your loan<small>{(EXAMPLE.debt - cur.repaidTotal).toFixed(0)} USDT</small></span>
      </div>
      <p className={styles.example}>Example loan: {EXAMPLE.bnb} BNB supplied, {EXAMPLE.debt.toLocaleString('en-US')} USDT borrowed, trigger 1.30, target 1.80, budget 500 USDT. Computed with the guard&apos;s own repayment math.</p>
    </div>
  )
}
