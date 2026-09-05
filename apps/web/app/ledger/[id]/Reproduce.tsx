'use client'

import { useState } from 'react'
import { Button } from '@marque/ui'
import styles from '../ledger.module.css'

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; elapsedMs: number; outputHash: string; manifestHash: string }
  | { kind: 'error'; message: string }

/**
 * Re-run the agent arm, live, against today's chain state.
 *
 * The result is recorded as its own reproduction — it never replaces the
 * registered sitting, because the published comparison was run at a pinned
 * block and a visitor pressing a button must not be able to overwrite it.
 * A reproduction that disagrees with the published run is a real finding, not
 * something to hide, so the hashes are shown either way.
 */
export function Reproduce({ benchmarkId }: { benchmarkId: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function run() {
    setState({ kind: 'running' })
    try {
      const res = await fetch('/api/v1/ledger/reproduce', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ benchmarkId }),
      })
      const body = (await res.json()) as {
        elapsedMs?: number; outputHash?: string; manifestHash?: string; error?: string; detail?: string
      }
      if (!res.ok) {
        setState({ kind: 'error', message: body.error ?? body.detail ?? `request failed (${res.status})` })
        return
      }
      setState({
        kind: 'done',
        elapsedMs: body.elapsedMs ?? 0,
        outputHash: body.outputHash ?? '',
        manifestHash: body.manifestHash ?? '',
      })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'the request failed' })
    }
  }

  return (
    <div className={styles.actions}>
      <Button variant="secondary" size="sm" onClick={run} disabled={state.kind === 'running'}>
        {state.kind === 'running' ? 'Running the agent arm…' : 'Reproduce this run'}
      </Button>

      {state.kind === 'done' && (
        <span className={styles.note}>
          Answered in {state.elapsedMs} ms at today&rsquo;s block. Output hash{' '}
          <code>{state.outputHash.slice(0, 18)}…</code>. Recorded as a reproduction, not as the
          published result.
        </span>
      )}
      {state.kind === 'error' && (
        <span className={styles.note}>Could not reproduce: {state.message}</span>
      )}
    </div>
  )
}
