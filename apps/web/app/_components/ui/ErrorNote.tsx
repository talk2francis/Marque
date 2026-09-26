import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * A mapped failure (packages/commerce/src/errors.ts): what happened, then what
 * to do. Never raw library, RPC or contract text (invariant 31).
 */
export function ErrorNote({ error, action }: { error: { title: string; action: string }; action?: ReactNode }) {
  return (
    <div className="txs-error" role="alert" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', alignItems: 'start' }}>
      <AlertTriangle aria-hidden="true" style={{ width: 16, height: 16, color: 'var(--oxide)', marginTop: 2, gridRow: 'span 2' }} />
      <p>{error.title}</p>
      <p>{error.action}</p>
      {action ? <div style={{ gridColumn: 2 }}>{action}</div> : null}
    </div>
  )
}
