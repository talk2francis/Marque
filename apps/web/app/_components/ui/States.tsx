import type { CSSProperties, ReactNode } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'

/** A placeholder in the final geometry: pass the size of what will be there. */
export function Skeleton({ w = '100%', h = 16, r, style }: { w?: number | string; h?: number | string; r?: number | string; style?: CSSProperties }) {
  return <span className="skel" aria-hidden="true" style={{ width: w, height: h, ...(r !== undefined ? { borderRadius: r } : {}), ...style }} />
}

/** What belongs here, and what to do next (principle 4). */
export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="state state-empty" role="status">
      <div className="state-head">
        <span className="state-ico" aria-hidden="true">{icon ?? <Inbox />}</span>
        <div>
          <h3>{title}</h3>
          {children ? <p>{children}</p> : null}
        </div>
      </div>
      {action ? <div className="state-actions">{action}</div> : null}
    </div>
  )
}

/**
 * Names the source, says whether anything changed, offers a way forward.
 * Never raw error text.
 */
export function ErrorState({ source, changed = 'Nothing changed on chain.', children, action }: { source: string; changed?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state state-error" role="status">
      <div className="state-head">
        <span className="state-ico" aria-hidden="true"><AlertTriangle /></span>
        <div>
          <h3>{source} is not answering right now.</h3>
          <p>{changed} {children ?? 'Marque does not show a number it could not read, so nothing is shown in its place.'}</p>
        </div>
      </div>
      {action ? <div className="state-actions">{action}</div> : null}
    </div>
  )
}
