'use client'
import { useEffect, useState } from 'react'
import { Check, Copy, Minus, TriangleAlert, X } from 'lucide-react'
import { Button } from '../_components/ui'
import { copyText } from '../../lib/clipboard'
import { toast } from '../../lib/toast'
import styles from './forge.module.css'

export interface CardStepView { id: string; title: string; state: 'pass' | 'warn' | 'fail' | 'skipped'; detail: string; fix?: string; example?: string; got?: string }
export interface CardCheckView { url: string; ok: boolean; category: string | null; name: string | null; endpoint: string | null; steps: CardStepView[]; checkedAt: string }

const ICON = { pass: Check, warn: TriangleAlert, fail: X, skipped: Minus }

/**
 * The agent card check (SPEC-BUILDERS 5), shared by the three doors. Every failure says what failed,
 * what Marque got (secrets redacted) and the fix, with a corrected example to copy.
 */
export function CardCheck({ initialUrl = '', category = null, onResult, compact = false }: { initialUrl?: string; category?: string | null; onResult?: (r: CardCheckView | null) => void; compact?: boolean }) {
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CardCheckView | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setUrl(initialUrl) }, [initialUrl])
  const run = async (u = url) => {
    if (!/^https?:\/\//i.test(u.trim())) { setError('Paste the full card URL, starting with https://'); return }
    setBusy(true); setError(null)
    try {
      const r = await fetch(`/api/v1/builders/card-check?url=${encodeURIComponent(u.trim())}${category ? `&category=${category}` : ''}`)
      const j = await r.json() as CardCheckView & { detail?: string }
      if (!r.ok) { setError(j.detail ?? 'The check could not run just now.'); setResult(null); onResult?.(null) }
      else { setResult(j); onResult?.(j) }
    } catch { setError('The check could not run just now.') } finally { setBusy(false) }
  }
  useEffect(() => { if (initialUrl && !compact) void run(initialUrl) }, [])
  return (
    <div className={styles.cardCheck}>
      <form className={styles.urlRow} onSubmit={(e) => { e.preventDefault(); void run() }}>
        <label className="sr-only" htmlFor="card-url">Agent card URL</label>
        <input id="card-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-domain/.well-known/agent-card.json" spellCheck={false} inputMode="url" />
        <Button type="submit" variant="primary" loading={busy}>Check the card</Button>
      </form>
      {error ? <p className={styles.err}>{error}</p> : null}
      {result ? (
        <>
          <p className={styles.verdict} data-ok={result.ok || undefined}>
            {result.ok ? `${result.name ?? 'This agent'}'s card passes. ${result.steps.some((s) => s.state === 'warn') ? 'One note below is worth fixing, but nothing blocks you.' : ''}` : 'Fix the first failing check below, then check again.'}
          </p>
          <ol className={styles.steps}>
            {result.steps.map((s) => {
              const I = ICON[s.state]
              return (
                <li key={s.id} data-state={s.state}>
                  <span className={styles.stepIcon} aria-hidden="true"><I /></span>
                  <div className={styles.stepBody}>
                    <p className={styles.stepTitle}>{s.title}<span className="sr-only">: {s.state}</span></p>
                    <p className={styles.stepDetail}>{s.detail}</p>
                    {s.fix ? <p className={styles.fix}><b>Fix:</b> {s.fix}</p> : null}
                    {s.got ? <details className={styles.got}><summary>What Marque got</summary><pre>{s.got}</pre></details> : null}
                    {s.example ? (
                      <div className={styles.example}>
                        <div className={styles.exampleHead}><span>A minimal valid card</span><button type="button" onClick={async () => { if (await copyText(s.example!)) toast({ tone: 'success', title: 'Example copied' }) }}><Copy aria-hidden="true" />Copy</button></div>
                        <pre>{s.example}</pre>
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      ) : null}
    </div>
  )
}
