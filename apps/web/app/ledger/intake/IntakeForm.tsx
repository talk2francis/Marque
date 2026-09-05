'use client'

import { useState } from 'react'
import { Button } from '@marque/ui'
import styles from '../ledger.module.css'

interface BenchOption { id: string; title: string; task: string; manualReps: number }

type State =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; outputHash: string; manifestHash: string }
  | { kind: 'error'; message: string }

/**
 * The elapsed time is entered as minutes and seconds and is REQUIRED. There is
 * no default and no placeholder value: an arm whose duration nobody measured
 * is not a slow arm, it is an unmeasured one, and the two must never be
 * recorded the same way.
 */
export function IntakeForm({ benchmarks }: { benchmarks: BenchOption[] }) {
  const [benchmarkId, setBenchmarkId] = useState(benchmarks[0]?.id ?? '')
  const [rep, setRep] = useState(1)
  const [output, setOutput] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [timingMethod, setTimingMethod] = useState('')
  const [rate, setRate] = useState('')
  const [outOfPocket, setOutOfPocket] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  const selected = benchmarks.find((b) => b.id === benchmarkId)
  const elapsedSeconds = (Number(minutes || 0) * 60) + Number(seconds || 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (elapsedSeconds <= 0) {
      setState({ kind: 'error', message: 'Enter the elapsed time your stopwatch recorded. It is not optional and it is never defaulted.' })
      return
    }
    if (timingMethod.trim().length < 3) {
      setState({ kind: 'error', message: 'Say how you measured the time. It is published alongside the result.' })
      return
    }
    setState({ kind: 'saving' })
    try {
      const res = await fetch('/api/v1/ledger/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          benchmarkId, rep, output, elapsedSeconds, timingMethod: timingMethod.trim(),
          humanRateUsdPerHour: rate === '' ? null : Number(rate),
          outOfPocketUsd: outOfPocket === '' ? null : Number(outOfPocket),
          evidenceUrl: evidenceUrl.trim() === '' ? null : evidenceUrl.trim(),
          note: note.trim() === '' ? null : note.trim(),
        }),
      })
      const body = (await res.json()) as { outputHash?: string; manifestHash?: string; error?: string }
      if (!res.ok) { setState({ kind: 'error', message: body.error ?? `request failed (${res.status})` }); return }
      setState({ kind: 'saved', outputHash: body.outputHash ?? '', manifestHash: body.manifestHash ?? '' })
      setOutput(''); setMinutes(''); setSeconds('')
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'the request failed' })
    }
  }

  if (benchmarks.length === 0) {
    return <p className={styles.muted}>No benchmark has been registered yet, so there is nothing to record against.</p>
  }

  return (
    <form onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="benchmark">Benchmark</label>
        <select id="benchmark" value={benchmarkId} onChange={(e) => setBenchmarkId(e.target.value)}>
          {benchmarks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id} — {b.title} ({b.manualReps} of 2 manual repetitions recorded)
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className={styles.field}>
          <label>The task you answered</label>
          <pre className={styles.output}>{selected.task}</pre>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="rep">Repetition</label>
        <select id="rep" value={rep} onChange={(e) => setRep(Number(e.target.value))}>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="output">Your analysis, verbatim</label>
        <textarea id="output" value={output} onChange={(e) => setOutput(e.target.value)} required
          placeholder="Paste exactly what you produced. It is stored and published whole." />
        <span className={styles.hint}>Stored and hashed as written. Nothing is tidied or reworded.</span>
      </div>

      <div className={styles.field}>
        <label htmlFor="minutes">Elapsed time on your own stopwatch</label>
        <div style={{ display: 'flex', gap: 'var(--s3)' }}>
          <input id="minutes" type="number" min="0" max="1440" value={minutes}
            onChange={(e) => setMinutes(e.target.value)} placeholder="minutes" required />
          <input id="seconds" type="number" min="0" max="59" value={seconds}
            onChange={(e) => setSeconds(e.target.value)} placeholder="seconds" />
        </div>
        <span className={styles.hint}>Required. An unmeasured arm and a slow arm are different facts.</span>
      </div>

      <div className={styles.field}>
        <label htmlFor="timing">How you measured it</label>
        <input id="timing" value={timingMethod} onChange={(e) => setTimingMethod(e.target.value)} required
          placeholder="e.g. phone stopwatch, started at the task, stopped when I wrote the last number" />
        <span className={styles.hint}>Published with the result, in your words.</span>
      </div>

      <div className={styles.field}>
        <label htmlFor="rate">Your hourly rate in USD (optional)</label>
        <input id="rate" type="number" min="0" step="1" value={rate} onChange={(e) => setRate(e.target.value)} />
        <span className={styles.hint}>Used only to price your time as a separate cost line, so a reader can re-price it against their own.</span>
      </div>

      <div className={styles.field}>
        <label htmlFor="pocket">Anything you paid out of pocket, USD (optional)</label>
        <input id="pocket" type="number" min="0" step="0.01" value={outOfPocket} onChange={(e) => setOutOfPocket(e.target.value)} />
      </div>

      <div className={styles.field}>
        <label htmlFor="evidence">Screen recording URL (optional)</label>
        <input id="evidence" type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
      </div>

      <div className={styles.field}>
        <label htmlFor="note">Note (optional)</label>
        <input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className={styles.actions}>
        <Button variant="primary" size="md" type="submit" disabled={state.kind === 'saving'}>
          {state.kind === 'saving' ? 'Recording…' : 'Record this arm'}
        </Button>
        {state.kind === 'saved' && (
          <span className={styles.note}>
            Recorded. Output hash <code>{state.outputHash.slice(0, 18)}…</code>, manifest{' '}
            <code>{state.manifestHash.slice(0, 18)}…</code>.
          </span>
        )}
        {state.kind === 'error' && <span className={styles.note}>{state.message}</span>}
      </div>
    </form>
  )
}
