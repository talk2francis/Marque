'use client'
import { useEffect, useState } from 'react'
import { ArrowUpRight, BookOpen, Check, FlaskConical, Hammer, Link2, Plus } from 'lucide-react'
import { AgentAvatar } from '../_components/AgentAvatar'
import { Skeleton } from '../_components/ui'
import { toast } from '../../lib/toast'
import { copyText } from '../../lib/clipboard'
import { journeyOf, standingOf, type JourneyAgent, type JourneyStep } from '../../lib/builder-journey'
import styles from './workshop.module.css'

/**
 * The Workshop: My Marque's building side. Where the hiring side counts jobs and money, the Workshop answers one
 * question per agent: what is the next thing to do. Each agent's road (Yours, Answers, Tested, Priced, Listed,
 * Hired) is read from the owner API's own checks, quote samples and job cohort; the next step carries the button.
 */
export type WorkshopAgent = JourneyAgent & { agentKey: string; name: string; imageUrl?: string | null; firstParty?: boolean }

/** The road as a row of six marks; the next one is lit. Compact for tiles, full (with names) in an agent card. */
export function JourneyRail({ steps, compact = false }: { steps: JourneyStep[]; compact?: boolean }) {
  const done = steps.filter((s) => s.state === 'done').length
  return (
    <ol className={styles.rail} data-compact={compact ? 'true' : undefined} aria-label={`${done} of ${steps.length} steps done`}>
      {steps.map((s) => (
        <li key={s.id} data-state={s.state} title={compact ? `${s.label}: ${s.state === 'done' ? 'done' : s.state === 'next' ? 'next step' : 'later'}` : undefined}>
          <span className={styles.mark} aria-hidden="true">{s.state === 'done' ? <Check /> : null}</span>
          {compact ? <span className="sr-only">{s.label}: {s.state === 'done' ? 'done' : s.state === 'next' ? 'next step' : 'later'}</span> : <span className={styles.railLabel}>{s.label}</span>}
        </li>
      ))}
    </ol>
  )
}

/** The next step, in a sentence, with its one button; the technical reason behind Why. */
export function NextStep({ step, onTest }: { step: JourneyStep; onTest: () => void }) {
  const a = step.action
  const share = async (href: string) => { if (await copyText(`https://marque.trade${href}`)) toast({ tone: 'success', title: 'Link copied' }) }
  return (
    <div className={styles.next}>
      <span className={styles.nextLabel}>Next step</span>
      <p>{step.headline}</p>
      <div className={styles.nextRow}>
        {a?.kind === 'bench' ? <button type="button" className="btn btn--primary" onClick={onTest}><FlaskConical aria-hidden="true" />{a.label}</button> : null}
        {a?.kind === 'link' ? <a className="btn btn--primary" href={a.href}>{a.label}<ArrowUpRight aria-hidden="true" /></a> : null}
        {a?.kind === 'share' ? <button type="button" className="btn btn--primary" onClick={() => void share(a.href)}><Link2 aria-hidden="true" />{a.label}</button> : null}
        {step.why ? <details className={styles.why}><summary>Why?</summary><p>{step.why}</p></details> : null}
      </div>
    </div>
  )
}

/** The strip under the Workshop's title: a tile per agent with where it stands, then "Build another". */
export function WorkshopStrip({ address, onOpen }: { address: string; onOpen: (agentKey: string, tab: 'agents' | 'bench') => void }) {
  const [agents, setAgents] = useState<WorkshopAgent[] | null>(null)
  const [total, setTotal] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setAgents(null); setFailed(false)
    fetch(`/api/v1/phase2/owner/${address}`).then((r) => (r.ok ? r.json() : null)).then((j: { agents?: WorkshopAgent[]; page?: { total: number } } | null) => {
      if (!live) return
      if (!j) { setFailed(true); return }
      setAgents(j.agents ?? []); setTotal(j.page?.total ?? (j.agents ?? []).length)
    }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [address])
  if (failed) return <p className={styles.stripNote}>Your agents could not be read just now.</p>
  if (agents === null) return <div className={styles.strip}>{[0, 1].map((i) => <Skeleton key={i} h={112} />)}</div>
  const shown = agents.slice(0, 3)
  return (
    <section className={styles.strip} aria-label="Your agents at a glance">
      {shown.map((a) => {
        const steps = journeyOf(a, address)
        const standing = standingOf(steps)
        return (
          <button key={a.agentKey} type="button" className={styles.tile} onClick={() => onOpen(a.agentKey, 'agents')}>
            <span className={styles.tileTop}>
              <AgentAvatar id={a.agentKey} reference={Boolean(a.firstParty)} imageUrl={a.imageUrl ?? null} size={32} />
              <span className={styles.tileName}><b>{a.name}</b><small>{a.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'} · #{a.agentId}</small></span>
              <span className={styles.standing} data-tone={standing.tone}>{standing.word}</span>
            </span>
            <JourneyRail steps={steps} compact />
            <span className={styles.tileNext}>{steps.find((s) => s.state === 'next')?.action?.label ?? 'Nothing left to do'}</span>
          </button>
        )
      })}
      {agents.length === 0 ? (
        <a className={styles.tile} data-empty="true" href="/builders">
          <span className={styles.plus} aria-hidden="true"><Plus /></span>
          <span className={styles.tileName}><b>Build your first agent</b><small>Agent Forge walks you through it: register, connect, test, list.</small></span>
        </a>
      ) : (
        <a className={styles.tile} data-empty="true" href="/builders">
          <span className={styles.plus} aria-hidden="true"><Plus /></span>
          <span className={styles.tileName}><b>{total > shown.length ? `${total - shown.length} more, or build another` : 'Build another agent'}</b><small>In Agent Forge</small></span>
        </a>
      )}
    </section>
  )
}

/** The Workshop's aside: the builder's tools, in the order they are reached for. */
export function WorkshopTools({ onTest }: { onTest: () => void }) {
  return (
    <nav className={styles.tools} aria-label="Workshop tools">
      <span className={styles.toolsHead}>Workshop tools</span>
      <a href="/builders"><Hammer aria-hidden="true" /><span><b>Agent Forge</b><small>Make, register and list an agent</small></span></a>
      <button type="button" onClick={onTest}><FlaskConical aria-hidden="true" /><span><b>Test bench</b><small>Practice tasks, checked against the chain</small></span></button>
      <a href="/builders/test"><FlaskConical aria-hidden="true" /><span><b>Test any endpoint</b><small>Before it is registered</small></span></a>
      <a href="/docs/sellers"><BookOpen aria-hidden="true" /><span><b>Builder guide</b><small>Get hired, get paid, keep a clean record</small></span></a>
    </nav>
  )
}
