'use client'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Check, X } from 'lucide-react'
import type { ReplayTarget } from '../../lib/bench-replay'
import { Button } from '../_components/ui'
import styles from './bench.module.css'

/**
 * "Try a fix": paste the corrected answer and compare it with the exact case that failed, at the same block. It
 * does not call the agent, pay anyone or change any published result; pressing Check is the request to compare.
 */
const Result = z.object({ kind: z.enum(['case', 'job']), at: z.string().datetime(), block: z.string(), source: z.string(), rows: z.array(z.object({ field: z.string(), label: z.string(), actual: z.string().nullable(), expected: z.string().nullable(), pass: z.boolean().nullable(), detail: z.string() })).max(100) })
export function AnswerReplay({ target, block, label, onClose }: { target: ReplayTarget; block: string | null; label?: string; onClose?: () => void }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const [result, setResult] = useState<z.infer<typeof Result> | null>(null), [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLElement>(null)
  useEffect(() => { box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); box.current?.querySelector('textarea')?.focus({ preventScroll: true }) }, [])
  const run = async () => {
    setBusy(true); setError(null); setResult(null)
    let answer: unknown
    try { answer = JSON.parse(text) } catch { setError('That is not valid JSON. Paste the answer exactly as your agent returns it.'); setBusy(false); return }
    try {
      const r = await fetch('/api/v1/builders/bench/replay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, answer, consent: true }), signal: AbortSignal.timeout(9500) })
      if (!r.ok) throw new Error('unavailable')
      setResult(Result.parse(await r.json()))
    } catch { setError('The answer could not be compared just now. Check its format, or try again in a minute. Nothing was changed.') }
    finally { setBusy(false) }
  }
  const matched = result?.rows.filter(r => r.pass === true).length ?? 0
  const differs = result?.rows.filter(r => r.pass === false).length ?? 0
  return <section className={styles.replay} ref={box} aria-label="Try a fix">
    <div className={styles.cardHead}>
      <h3>Try a fix{label ? <span className={styles.muted}> · {label}</span> : null}</h3>
      {onClose ? <button type="button" className={styles.textBtn} onClick={onClose}>Close</button> : null}
    </div>
    <p className={styles.note}>Paste your agent&apos;s corrected answer. We check it against the same case{block ? ` (block ${Number(block).toLocaleString('en-US')})` : ''}. Your agent is not called and nothing public changes.</p>
    <label className={styles.field}><span>Corrected answer (JSON)</span><textarea value={text} maxLength={30000} rows={7} spellCheck={false} onChange={e => setText(e.target.value)} placeholder='{ "healthFactor": "1.284", ... }' /></label>
    <div className={styles.row}><Button size="sm" variant="primary" disabled={!text.trim()} loading={busy} onClick={() => void run()}>Check this answer</Button></div>
    {error ? <p className={styles.note} role="status">{error}</p> : null}
    {result ? <div aria-live="polite" className={styles.replayOut}>
      <p className={styles.replaySum} data-pass={differs === 0 && matched > 0 ? 'true' : 'false'}>{result.rows.length === 0 ? 'No checkable fields were found in that answer, so this is not a pass.' : differs === 0 ? `All ${matched} checked fields match.` : `${differs} field${differs === 1 ? '' : 's'} still differ${differs === 1 ? 's' : ''}, ${matched} match.`}</p>
      <ul className={styles.list}>{result.rows.map(row => (
        <li key={row.field}><div className={styles.listMain}>
          <span className={styles.verdict} data-pass={row.pass === null ? undefined : row.pass ? 'true' : 'false'}>{row.pass === null ? 'n/a' : row.pass ? <><Check aria-hidden="true" />Matches</> : <><X aria-hidden="true" />Differs</>}</span>
          <span><b>{row.label}</b>: yours {row.actual ?? 'not given'}, expected {row.expected ?? 'not available'}</span>
        </div>{row.detail ? <span className={styles.muted}>{row.detail}</span> : null}</li>
      ))}</ul>
      <p className={styles.muted}>Checked at block {Number(result.block).toLocaleString('en-US')}. The original result is unchanged.</p>
    </div> : null}
  </section>
}
