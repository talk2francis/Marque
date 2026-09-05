'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Statement, Chip, Button } from '@marque/ui'
import type { CharterTemplate } from '../../../lib/charter-templates'
import { scanAddress, scanTx } from '../../../lib/charter-templates'
import styles from './charter.module.css'

/**
 * The grant flow, and the Seal.
 *
 * THE SEAL is the one bold moment in the product (AGENTS.md, Motion). It is not
 * decoration: it is the beat that marks the exact moment authority changes
 * hands, and it composes the charter in the order the bounds actually apply —
 * what may be touched, then how much, then for how long — so the last thing a
 * person reads before the mark presses is the thing that ends it.
 *
 *   dim to cockpit          260ms
 *   charter composes        60ms stagger, one line at a time
 *   the brass mark presses  a short bloom, then it stays
 *   the transaction hash    writes in character by character as it confirms
 *
 * Under prefers-reduced-motion there is no dim, no press and no typing. The
 * same final frame appears at once. That is a state change either way; only the
 * theatre is optional.
 */

interface AgentOption {
  agentId: string
  tokenId: string
  name: string
  kind: string
  host: string
  latencyMs: number | null
  isReference: boolean
}

interface Granted {
  id: string
  grantTxHash: string | null
  policyHash: string
  expiresAt: string
  caps: Array<{ symbol: string; limit: number }>
  agentName: string | null
}

type Phase = 'idle' | 'dim' | 'compose' | 'press' | 'writing' | 'sealed' | 'failed'

const DIM_MS = 260
const STAGGER_MS = 60
const PRESS_MS = 420

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** The hash writes in as it confirms. Instant when motion is reduced. */
function useTypedHash(hash: string | null, active: boolean, reduced: boolean): string {
  const [shown, setShown] = useState('')
  useEffect(() => {
    if (!hash || !active) { setShown(''); return }
    if (reduced) { setShown(hash); return }
    let i = 0
    setShown('')
    const id = setInterval(() => {
      i += 2
      setShown(hash.slice(0, i))
      if (i >= hash.length) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [hash, active, reduced])
  return shown
}

export function CharterDesk({
  category, template, universalMayNot, agents, preselectedAgentId, chainName,
}: {
  category: string
  template: CharterTemplate
  universalMayNot: string[]
  agents: AgentOption[]
  preselectedAgentId: string | null
  chainName: string
}) {
  const reduced = usePrefersReducedMotion()
  const [agentId, setAgentId] = useState(preselectedAgentId ?? '')
  const [capBnb, setCapBnb] = useState(template.defaultCapBnb)
  const [minutes, setMinutes] = useState(String(template.defaultMinutes))
  const [phase, setPhase] = useState<Phase>('idle')
  const [granted, setGranted] = useState<Granted | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  const sealActive = phase !== 'idle' && phase !== 'failed'

  // The Seal covers the viewport, so the page behind it must not scroll. A
  // dimmed page that still scrolls under an overlay is how the one bold moment
  // in this product turns into a bug report.
  useEffect(() => {
    if (!sealActive) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [sealActive])

  const agent = useMemo(
    () => agents.find((a) => a.agentId === agentId) ?? agents[0] ?? null,
    [agents, agentId],
  )
  const who = agent?.name ?? 'This agent'

  /** Every line of the charter, in the order the bounds apply. */
  const lines = useMemo(() => {
    const out: Array<{ key: string; label: string; value: string; href?: string }> = []
    for (const call of template.calls) {
      out.push({
        key: `call-${call.to}`,
        label: 'May call',
        value: `${call.contract} · ${call.to.slice(0, 10)}…${call.to.slice(-6)}`,
        href: scanAddress(call.to),
      })
    }
    out.push({ key: 'cap', label: 'May spend up to', value: `${capBnb} tBNB, once` })
    out.push({
      key: 'expiry',
      label: 'Expires',
      value: `${minutes} minutes from the moment it is granted`,
    })
    out.push({ key: 'revoke', label: 'Revocable', value: 'immediately, in one transaction' })
    return out
  }, [template, capBnb, minutes])

  /**
   * Once the dim has finished, every line is marked shown and CSS staggers them
   * with animation-delay. Driving the stagger from state would put a React
   * render on every 60ms beat for no gain.
   */
  const composed = phase !== 'idle' && phase !== 'dim' && phase !== 'failed'

  const txHash = granted?.grantTxHash ?? null
  const typed = useTypedHash(txHash, phase === 'writing' || phase === 'sealed', reduced)

  const grant = useCallback(async () => {
    if (!agent) return
    setError(null)
    setGranted(null)

    const cap = Number(capBnb)
    const mins = Number(minutes)
    if (!Number.isFinite(cap) || cap <= 0) { setError('Set a cap above zero.'); return }
    if (!Number.isFinite(mins) || mins < 5) { setError('A charter must run for at least five minutes.'); return }

    // The request goes out first and the animation runs over it. Sequencing the
    // other way would make the Seal a countdown to a request that has not been
    // sent, which is the kind of small lie that makes an interface untrustworthy.
    const request = fetch('/api/v1/charters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category,
        agentId: agent.agentId,
        agentName: agent.name,
        capBnb: cap,
        minutes: mins,
        label: template.name,
      }),
    })

    if (reduced) {
      setPhase('writing')
    } else {
      setPhase('dim')
      const composeAt = setTimeout(() => setPhase('compose'), DIM_MS)
      const pressAt = setTimeout(() => setPhase('press'), DIM_MS + lines.length * STAGGER_MS + 120)
      const writeAt = setTimeout(() => setPhase('writing'), DIM_MS + lines.length * STAGGER_MS + 120 + PRESS_MS)
      timers.current.push(composeAt, pressAt, writeAt)
    }

    try {
      const res = await request
      const data = (await res.json()) as { charter?: Granted; error?: string }
      if (!res.ok || !data.charter) {
        timers.current.forEach(clearTimeout)
        setError(data.error ?? 'the grant did not land')
        setPhase('failed')
        return
      }
      setGranted(data.charter)
      setPhase((p) => (p === 'failed' ? p : 'writing'))
      // The mark is not final until the transaction is. Sealing before the
      // chain confirms would be a mark for something that might not exist.
      const settle = setTimeout(() => setPhase('sealed'), reduced ? 0 : 900)
      timers.current.push(settle)
    } catch {
      timers.current.forEach(clearTimeout)
      setError('the network request failed before the grant could be sent')
      setPhase('failed')
    }
  }, [agent, capBnb, minutes, category, template.name, reduced, lines.length])

  const sealing = sealActive

  return (
    <div
      className={styles.desk}
      data-surface={sealing ? 'cockpit' : undefined}
      data-phase={phase}
    >
      {/* ---- The two columns. This is the whole decision. ---- */}
      <div className={styles.columns}>
        <section className={styles.column} aria-labelledby="may">
          <h2 className={styles.columnHead} id="may">
            <span className={styles.columnMark} data-tone="may" aria-hidden="true" />
            {who} may
          </h2>
          <ul className={styles.list}>
            {template.calls.flatMap((call) =>
              call.may.map((line) => (
                <li key={`${call.to}-${line}`} className={styles.item}>
                  <span className={styles.itemText}>{line}</span>
                  <a className={styles.itemWhere} href={scanAddress(call.to)} target="_blank" rel="noreferrer">
                    {call.contract}
                  </a>
                </li>
              )),
            )}
          </ul>
          <span className={styles.columnClose}>
            {(() => {
              const fns = template.calls.reduce((n, c) => n + c.selectors.length, 0)
              const contracts = template.calls.length
              return `That is the whole list: ${fns} function${fns === 1 ? '' : 's'} on ${contracts} contract${contracts === 1 ? '' : 's'}. Anything else is refused before it is signed.`
            })()}
          </span>
        </section>

        <section className={styles.column} aria-labelledby="maynot">
          <h2 className={styles.columnHead} id="maynot">
            <span className={styles.columnMark} data-tone="maynot" aria-hidden="true" />
            {who} may not
          </h2>
          <ul className={styles.list}>
            {[...universalMayNot, ...template.mayNot].map((line) => (
              <li key={line} className={styles.item}>
                <span className={styles.itemText}>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ---- The three bounds the person actually sets ---- */}
      <div className={styles.controls}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Agent</span>
          <select
            className={styles.select}
            value={agent?.agentId ?? ''}
            onChange={(e) => setAgentId(e.target.value)}
            disabled={sealing}
          >
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.name} — {a.kind}{a.latencyMs !== null ? ` · ${a.latencyMs}ms` : ''}
              </option>
            ))}
          </select>
          {agent?.isReference && (
            <span className={styles.fieldNote}>
              <Chip tone="watch">Marque reference agent</Chip> First-party, and here to keep the
              category callable rather than to win it.
            </span>
          )}
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Most it may spend</span>
          <span className={styles.inputRow}>
            <input
              className={`mono ${styles.input}`}
              inputMode="decimal"
              value={capBnb}
              onChange={(e) => setCapBnb(e.target.value)}
              disabled={sealing}
              aria-describedby="cap-note"
            />
            <span className={styles.unit}>tBNB</span>
          </span>
          <span className={styles.fieldNote} id="cap-note">
            This cap also pays the fee for every transaction the agent sends. A cap set to almost
            nothing produces a charter that can never execute at all.
          </span>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>How long it lasts</span>
          <span className={styles.inputRow}>
            <input
              className={`mono ${styles.input}`}
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              disabled={sealing}
            />
            <span className={styles.unit}>minutes</span>
          </span>
          <span className={styles.fieldNote}>
            After this it cannot act, with no further step from you.
          </span>
        </label>
      </div>

      <div className={styles.act}>
        <Button variant="primary" onClick={() => void grant()} disabled={sealing || !agent}>
          {phase === 'idle' || phase === 'failed' ? 'Grant a charter' : 'Granting…'}
        </Button>
        <span className={styles.actNote}>
          Signed by Marque&rsquo;s testnet wallet on {chainName}. You will get a transaction you can
          open, and a revoke button that works.
        </span>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          The charter was not granted. {error}
        </p>
      )}

      {/* ---- THE SEAL ---- */}
      {sealing && (
        <div className={styles.seal} role="status" aria-live="polite">
          <div className={styles.sealDoc}>
            <Statement as="h2" className={styles.sealTitle}>Charter</Statement>
            <p className={styles.sealWho}>
              {who} · {agent ? `${agent.kind} · ${agent.host}` : ''}
            </p>

            <dl className={styles.sealLines}>
              {lines.map((line, i) => (
                <div
                  key={line.key}
                  className={styles.sealLine}
                  data-shown={composed ? 'true' : 'false'}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <dt className={styles.sealLabel}>{line.label}</dt>
                  <dd className={`mono ${styles.sealValue}`}>
                    {line.href
                      ? <a href={line.href} target="_blank" rel="noreferrer">{line.value}</a>
                      : line.value}
                  </dd>
                </div>
              ))}
            </dl>

            {/* The mark. Typographic, pressed — never a wax seal. */}
            <div className={styles.mark} data-pressed={phase === 'press' || phase === 'writing' || phase === 'sealed'}>
              <span className={styles.markGlyph} aria-hidden="true">M</span>
              <span className={styles.markText}>
                {phase === 'sealed' ? 'Granted' : phase === 'writing' ? 'Writing to the chain' : 'Sealing'}
              </span>
            </div>

            <div className={styles.sealTx}>
              {txHash ? (
                <>
                  <span className={styles.sealLabel}>Transaction</span>
                  <a className={`mono ${styles.sealHash}`} href={scanTx(txHash)} target="_blank" rel="noreferrer">
                    {typed}
                    {typed.length < txHash.length && <span className={styles.caret} aria-hidden="true" />}
                  </a>
                </>
              ) : (
                <span className={styles.sealPending}>waiting for the grant transaction to confirm</span>
              )}
            </div>

            {phase === 'sealed' && granted && (
              <div className={styles.sealDone}>
                <a className={styles.sealGo} href="/app/charters">Watch it and revoke it</a>
                <a className={styles.sealGo} href={`/app/charters#${encodeURIComponent(granted.id)}`}>
                  Put it to work
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
