'use client'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { dismiss, useToasts, type Toast } from '../../../lib/toast'

function ToastItem({ t }: { t: Toast }) {
  // Timed toasts pause while the pointer rests on them, so a link can be read and clicked.
  const left = useRef(t.ttl)
  const started = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const run = () => {
    if (left.current === null) return
    started.current = Date.now()
    timer.current = setTimeout(() => dismiss(t.id), left.current)
  }
  const pause = () => {
    if (timer.current === null || left.current === null) return
    clearTimeout(timer.current)
    timer.current = null
    left.current = Math.max(0, left.current - (Date.now() - started.current))
  }
  // Start once on mount; run and pause manage the timer after that.
  useEffect(() => { run(); return () => { if (timer.current) clearTimeout(timer.current) } }, [])

  const Icon = t.tone === 'success' ? Check : t.tone === 'error' || t.tone === 'warn' ? AlertTriangle : Info
  return (
    <div className="toast" data-tone={t.tone} role={t.tone === 'error' ? 'alert' : 'status'} onMouseEnter={pause} onMouseLeave={run}>
      <span className="toast-ico" aria-hidden="true"><Icon strokeWidth={2.4} /></span>
      <span className="toast-title">{t.title}</span>
      <button type="button" className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X /></button>
      {t.body || t.href ? (
        <span className="toast-body">
          {t.body}
          {t.href ? <>{t.body ? ' ' : ''}<a href={t.href} target="_blank" rel="noreferrer">{t.hrefLabel ?? 'View on BscScan'}</a></> : null}
        </span>
      ) : null}
      {t.ttl !== null ? <span className="toast-life" aria-hidden="true" style={{ animationDuration: `${t.ttl}ms` }} /> : null}
    </div>
  )
}

/** Bottom right on desktop, top on phones. Polite, never raw error text. */
export function Toaster() {
  const toasts = useToasts()
  return (
    <div className="toaster" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  )
}
