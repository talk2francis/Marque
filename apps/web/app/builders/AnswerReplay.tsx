'use client'
import { useState } from 'react'
import { z } from 'zod'
import { ProvenanceChip } from '@marque/ui'
import type { ReplayTarget } from '../../lib/bench-replay'
import { Button } from '../_components/ui'
import styles from './bench.module.css'

const Result = z.object({ kind: z.enum(['case', 'job']), at: z.string().datetime(), block: z.string(), source: z.string(), rows: z.array(z.object({ field: z.string(), label: z.string(), actual: z.string().nullable(), expected: z.string().nullable(), pass: z.boolean().nullable(), detail: z.string() })).max(100) })
export function AnswerReplay({ target, block }: { target: ReplayTarget; block: string | null }) {
  const [text, setText] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false)
  const [result, setResult] = useState<z.infer<typeof Result> | null>(null), [error, setError] = useState<string | null>(null)
  const run = async () => {
    setBusy(true); setError(null)
    try {
      const answer: unknown = JSON.parse(text)
      const r = await fetch('/api/v1/builders/bench/replay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, answer, consent }), signal: AbortSignal.timeout(9500) })
      if (!r.ok) throw new Error('unavailable')
      setResult(Result.parse(await r.json()))
    } catch { setError('The supplied JSON could not be compared. Check its format and recorded block, or try again after archive reads recover. No original result was changed.') }
    finally { setBusy(false) }
  }
  return <section className={styles.replay} aria-label="Replay supplied answer">
    <h4>Replay this recorded case</h4>
    <p>Original block {block ?? 'read from the saved case'}. Paste your corrected answer JSON. This compares its fields against the recorded case or the chain at that block. It does not call your endpoint, pay an agent or publish a new grade.</p>
    <label>Answer JSON<textarea value={text} maxLength={30000} rows={7} spellCheck={false} onChange={e => { setText(e.target.value); setConsent(false) }} /></label>
    <label className={styles.consent}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Compare this supplied answer at the original recorded block.</label>
    <Button size="sm" disabled={!consent || !text.trim()} loading={busy} onClick={() => void run()}>Replay checks</Button>
    {error ? <p role="status">{error}</p> : null}
    {result ? <div aria-live="polite"><p><ProvenanceChip provenance="TESTED" /> Replay at block {result.block} · {result.at.replace('T', ' ').slice(0, 19)} UTC. The original result is unchanged.</p><dl className={styles.diffs}>{result.rows.map(row => <div key={row.field}><dt>{row.label} · {row.pass === null ? 'Unavailable' : row.pass ? 'Agrees' : 'Differs'}</dt><dd>Your supplied answer: {row.actual ?? 'not given'}</dd><dd>Expected: {row.expected ?? 'not available'}</dd><dd>{row.detail}</dd></div>)}</dl>{!result.rows.length ? <p>No applicable checks were found in the supplied answer. This is not a passing result.</p> : null}</div> : null}
  </section>
}
