'use client'
import { useEffect, useState } from 'react'
import { isSaved, toggleSaved, SAVED_EVENT } from '../../lib/local-watch'

/** The saved-agent star (SPEC-WORKSPACE 1.7), on cards and profiles. Saved on this device only. */
export function SaveStar({ agentId, name, chainId, tokenId, className }: { agentId: string; name: string; chainId: number; tokenId: string | null; className?: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const sync = () => setOn(isSaved(agentId))
    sync()
    window.addEventListener(SAVED_EVENT, sync)
    return () => window.removeEventListener(SAVED_EVENT, sync)
  }, [agentId])
  return (
    <button type="button" className={`savestar ${className ?? ''}`} aria-pressed={on} data-on={on || undefined}
      aria-label={on ? `Remove ${name} from saved agents` : `Save ${name} on this device`} title={on ? 'Saved on this device' : 'Save on this device'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOn(toggleSaved({ agentId, name, chainId, tokenId })) }}>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 2.6l2.2 4.7 5.1.6-3.8 3.5 1 5.1L10 14l-4.5 2.5 1-5.1-3.8-3.5 5.1-.6z" /></svg>
    </button>
  )
}
