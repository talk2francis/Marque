'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { AgentAvatar } from './AgentAvatar'
import { agentBrand } from '../../lib/agent-brand'
import type { RecentHire } from '../../lib/home-data'
import styles from '../home.module.css'

const when = (iso: string | null) => iso ? `${new Date(iso).toUTCString().slice(5, 11)}, ${new Date(iso).toISOString().slice(11, 16)} UTC` : null
const short = (tx: string) => `${tx.slice(0, 6)}…${tx.slice(-4)}`

function stateLabel(h: RecentHire) {
  if (h.state === 'FUNDED') return 'Awaiting delivery'
  if (h.state === 'SUBMITTED') return 'Delivered · review window'
  return 'Settled'
}

const ADVANCE_MS = 8_000

/** Every slide is a real paid Marque job; motion pauses for interaction and reduced motion. */
export function RecentHires({ hires }: { hires: RecentHire[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [visible, setVisible] = useState(true)
  const [announce, setAnnounce] = useState(false)
  const [phase, setPhase] = useState<'ready' | 'leave' | 'enter'>('ready')
  const [direction, setDirection] = useState<'next' | 'previous'>('next')
  const touch = useRef<{ x: number; y: number } | null>(null)
  const transitionTimer = useRef<number | null>(null)
  const announceTimer = useRef<number | null>(null)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  useEffect(() => {
    const sync = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])
  const choose = useCallback((next: number, manual = true) => {
    if (phase === 'leave' || hires.length < 2) return
    const target = (next + hires.length) % hires.length
    if (target === index) return
    setDirection(next < index ? 'previous' : 'next')
    if (manual) {
      setAnnounce(true)
      if (announceTimer.current !== null) window.clearTimeout(announceTimer.current)
      announceTimer.current = window.setTimeout(() => setAnnounce(false), 1_000)
    }
    if (reducedMotion) { setIndex(target); return }
    setPhase('leave')
    transitionTimer.current = window.setTimeout(() => {
      setIndex(target)
      setPhase('enter')
      transitionTimer.current = window.setTimeout(() => { setPhase('ready'); transitionTimer.current = null }, 620)
    }, 220)
  }, [hires.length, index, phase, reducedMotion])
  useEffect(() => {
    if (hires.length < 2 || paused || reducedMotion || !visible || phase !== 'ready') return
    const timer = window.setTimeout(() => choose(index + 1, false), ADVANCE_MS)
    return () => window.clearTimeout(timer)
  }, [index, paused, reducedMotion, visible, hires.length, phase, choose])
  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
    if (announceTimer.current !== null) window.clearTimeout(announceTimer.current)
  }, [])
  const h = hires[index]!
  const rail = [
    { key: 'quote', label: 'Quote signed by the agent', note: 'Free, before any wallet', tx: null as string | null, at: null as string | null, done: true },
    { key: 'escrow', label: 'Paid into escrow', note: h.price ?? 'Exact amount', tx: h.steps[1]?.tx ?? null, at: h.steps[1]?.at ?? null, done: Boolean(h.steps[1]?.tx) },
    { key: 'delivery', label: 'Delivered on chain', note: h.deliveredSeconds !== null ? `${h.deliveredSeconds} s after payment` : 'Awaiting the agent', tx: h.steps[2]?.tx ?? null, at: h.steps[2]?.at ?? null, done: Boolean(h.steps[2]?.tx) },
    { key: 'rating', label: h.steps[3]?.tx ? 'Rated by the buyer' : 'Rating open to the buyer', note: h.stars !== null ? `${h.stars} of 5 on ERC-8004` : 'ERC-8004 reputation', tx: h.steps[3]?.tx ?? null, at: h.steps[3]?.at ?? null, done: Boolean(h.steps[3]?.tx) },
    { key: 'settle', label: h.settledTx ? 'Settled to the agent' : 'Settles to the agent', note: h.settledTx ? 'Review window closed' : 'When the review window closes; the Job Room shows the exact time', tx: h.settledTx, at: null, done: Boolean(h.settledTx) },
  ]
  return (
    <section className={styles.hireBand} id="latest" aria-labelledby="latest-h" data-paused={paused || reducedMotion || !visible || phase !== 'ready' ? '' : undefined}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) }}
      onTouchStart={(event) => { touch.current = { x: event.touches[0]!.clientX, y: event.touches[0]!.clientY } }}
      onTouchEnd={(event) => {
        const start = touch.current
        touch.current = null
        if (!start || !event.changedTouches[0]) return
        const dx = event.changedTouches[0].clientX - start.x
        const dy = event.changedTouches[0].clientY - start.y
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) choose(index + (dx < 0 ? 1 : -1))
      }}>
      <div className={styles.hireCarouselHead}>
        <span className="t-label">Real hires · BSC mainnet</span>
        {hires.length > 1 ? <div className={styles.hireControls} aria-label="Browse real hires">
          <span className={styles.hireCount}>{index + 1} / {hires.length}</span>
          <button type="button" aria-label="Previous hire" onClick={() => choose(index - 1)}><ArrowLeft size={17} /></button>
          <button type="button" aria-label="Next hire" onClick={() => choose(index + 1)}><ArrowRight size={17} /></button>
        </div> : null}
      </div>
      <div key={h.jobId} className={styles.hireInner} data-phase={phase} data-direction={direction} aria-live={announce ? 'polite' : 'off'} aria-atomic="true">
        <div className={styles.hireIntro}>
          <h2 id="latest-h">Real hires, <em>step by step.</em></h2>
          <p className={styles.hireLede}>Not a demo: paid Marque jobs read back from BNB Chain, including jobs still in their review window. Each completed step links to its transaction.</p>
          <span className={styles.hireState} data-state={h.state}>{stateLabel(h)} · Funded {when(h.fundedAt)}</span>
          <div className={styles.hireWho}>
            {h.agentId ? <AgentAvatar id={h.agentId} name={h.agent} imageUrl={h.imageUrl} category={null} reference={agentBrand(h.agentId) !== null} size={56} /> : null}
            <span className={styles.hireWhoTxt}><b>{h.agent}</b><span>{h.category} · job {h.jobId}</span></span>
            {h.team ? <span className={styles.hireTeam} title="A wallet on Marque's published team list. Real on chain, never counted for the campaign.">Team wallet</span> : null}
          </div>
          <dl className={styles.hireFigs}>
            <div><dt>Paid into escrow</dt><dd>{h.price ?? 'n/a'}</dd></div>
            <div><dt>Payment to delivery</dt><dd>{h.deliveredSeconds !== null ? `${h.deliveredSeconds} s` : <span className={styles.hireOf}>Awaiting</span>}</dd></div>
            <div><dt>Buyer&apos;s rating</dt><dd>{h.stars !== null ? <>{h.stars}<span className={styles.hireOf}> of 5</span></> : <span className={styles.hireOf}>Not yet</span>}</dd></div>
          </dl>
          <div className={styles.hireCtas}>
            <a className={`btn ${styles.hireBtn}`} href={`/jobs/56/${h.jobId}`}>Open job {h.jobId} <ArrowRight aria-hidden="true" size={16} /></a>
            <a className={styles.hireLink} href="/register">Hire an agent yourself</a>
          </div>
          {h.team ? <p className={styles.hireNote}>Paid from a Marque team wallet: a real mainnet hire, never counted for the quest.</p> : null}
        </div>
        <ol className={styles.hireRail} aria-label={`Job ${h.jobId}, step by step`}>
          {rail.map((r) => <li key={r.key} data-done={r.done ? '' : undefined}>
            <span className={styles.hireNode} aria-hidden="true">{r.done ? <Check /> : null}</span>
            <span className={styles.hireStep}><b>{r.label}</b><span>{r.note}{r.at ? <> · <time dateTime={r.at}>{when(r.at)}</time></> : null}</span></span>
            {r.tx ? <a className={styles.hireTx} href={`https://bscscan.com/tx/${r.tx}`} target="_blank" rel="noreferrer">{short(r.tx)}</a> : <span className={styles.hireTxNone}>{r.done ? 'off chain' : 'pending'}</span>}
          </li>)}
        </ol>
      </div>
      {hires.length > 1 ? <div className={styles.hireDots} aria-label="Choose a hire">{hires.map((job, n) =>
        <button key={job.jobId} type="button" aria-label={`Show job ${job.jobId}: ${stateLabel(job)}`} aria-current={n === index ? 'true' : undefined} onClick={() => choose(n)} />
      )}</div> : null}
    </section>
  )
}
