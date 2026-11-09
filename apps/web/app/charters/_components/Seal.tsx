'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Fingerprint, X } from 'lucide-react'
import { useFocusTrap } from '../../_components/ui'
import { MarqueMark } from '../../_components/MarqueMark'
import styles from './Seal.module.css'

/**
 * The Seal for a charter (03_EXPERIENCE sections 4 and 6), after the one on the earlier grant page
 * (app/charter/CharterDesk.tsx), whose page is unchanged: the chamber dims in 260ms, the charter's lines compose at
 * a 60ms stagger, the brass mark presses when the guard exists, and each transaction hash writes in as it
 * confirms. Reduced motion shows the same frames without the theatre. Escape closes it before signing, never
 * during. It renders state; the builder owns the transactions.
 */
export type SealPhase = 'review' | 'signing' | 'sealed' | 'failed'
export type StepState = 'waiting' | 'signing' | 'pending' | 'done' | 'failed'
export interface SealStep { key: string; label: string; state: StepState; hash?: string | null }

function useReducedMotion(): boolean {
  const [r, setR] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setR(mq.matches)
    const on = () => setR(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return r
}

function Typed({ text, reduced }: { text: string; reduced: boolean }) {
  const [n, setN] = useState(reduced ? text.length : 0)
  useEffect(() => {
    if (reduced) { setN(text.length); return }
    setN(0)
    const id = setInterval(() => setN((i) => { if (i + 2 >= text.length) clearInterval(id); return Math.min(text.length, i + 2) }), 16)
    return () => clearInterval(id)
  }, [text, reduced])
  return <>{text.slice(0, n)}{n < text.length ? <span className={styles.caret} aria-hidden="true" /> : null}</>
}

const STEP_WORDS: Record<StepState, string> = { waiting: 'Next', signing: 'Waiting for your signature', pending: 'Confirming on chain', done: 'Confirmed', failed: 'Did not complete' }

export function Seal({
  open, phase, lines, steps, wallet, primary, onPrimary, onClose, error, note, explorerTx, done,
}: {
  open: boolean
  phase: SealPhase
  lines: Array<{ label: string; value: string }>
  steps: SealStep[]
  /** How this charter will be signed, in words ("Marque Pass: one touch signs both steps"). */
  wallet: { pass: boolean; words: string }
  /** The main button's words for this phase ("Seal with your fingerprint", "Try again"), or null for none. */
  primary: string | null
  onPrimary: () => void
  onClose: () => void
  error: string | null
  /** A line under the steps (the failure explanation, or what happens next). */
  note: string | null
  explorerTx: (hash: string) => string
  done: { href: string; label: string } | null
}) {
  const reduced = useReducedMotion()
  const doc = useRef<HTMLDivElement>(null)
  const signing = phase === 'signing'
  useFocusTrap(doc, open, () => { if (!signing) onClose() })
  const [composed, setComposed] = useState(false)
  useEffect(() => {
    if (!open) { setComposed(false); return }
    const t = setTimeout(() => setComposed(true), reduced ? 0 : 260)
    return () => clearTimeout(t)
  }, [open, reduced])
  if (!open || typeof document === 'undefined') return null
  const pressed = phase === 'sealed'

  return createPortal(
    <div className={styles.chamber} onMouseDown={(e) => { if (e.target === e.currentTarget && !signing) onClose() }}>
      <div className={styles.doc} ref={doc} role="dialog" aria-modal="true" aria-labelledby="seal-title" data-phase={phase}>
        <div className={styles.head}>
          <h2 id="seal-title" className={styles.title}>{phase === 'sealed' ? 'Charter granted' : 'Seal your charter'}</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={signing} aria-label={signing ? 'Signing: the Seal stays open until the wallet answers' : 'Close'}><X aria-hidden="true" /></button>
        </div>

        <dl className={styles.lines}>
          {lines.map((l, i) => (
            <div key={l.label} className={styles.line} data-shown={composed ? 'true' : 'false'} style={{ '--i': i } as React.CSSProperties}>
              <dt>{l.label}</dt>
              <dd>{l.value}</dd>
            </div>
          ))}
        </dl>

        <ol className={styles.steps} aria-live="polite">
          {steps.map((s, i) => (
            <li key={s.key} className={styles.step} data-state={s.state}>
              <span className={styles.stepDot} aria-hidden="true">{s.state === 'done' ? <Check /> : i + 1}</span>
              <span className={styles.stepBody}>
                <span className={styles.stepLabel}>{s.label}</span>
                <span className={styles.stepState}>{STEP_WORDS[s.state]}</span>
                {s.hash ? <a className={`mono ${styles.hash}`} href={explorerTx(s.hash)} target="_blank" rel="noreferrer"><Typed text={s.hash} reduced={reduced} /></a> : null}
              </span>
            </li>
          ))}
        </ol>

        <div className={styles.mark} data-pressed={pressed ? 'true' : 'false'}>
          <span className={styles.markGlyph} aria-hidden="true"><MarqueMark size={24} /></span>
          <span className={styles.markText}>{pressed ? 'Granted' : signing ? 'Writing to the chain' : phase === 'failed' ? 'Not granted yet' : 'Not yet signed'}</span>
        </div>

        {phase === 'review' ? (
          <p className={styles.wallet}>{wallet.pass ? <Fingerprint className={styles.print} aria-hidden="true" /> : null}<span>{wallet.words}</span></p>
        ) : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {note ? <p className={styles.note}>{note}</p> : null}

        <div className={styles.actions}>
          {done ? <a className={styles.primary} href={done.href} data-autofocus="">{done.label}</a> : null}
          {primary ? <button type="button" className={styles.primary} onClick={onPrimary} disabled={signing} data-autofocus="">{primary}</button> : null}
          {phase !== 'signing' && !done ? <button type="button" className={styles.secondary} onClick={onClose}>{phase === 'failed' ? 'Close' : 'Not now'}</button> : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
