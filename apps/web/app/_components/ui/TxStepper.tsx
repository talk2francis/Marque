'use client'
import { AlertTriangle, Check, CornerDownRight, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { explorerTx } from '../../../lib/network'
import { middle } from './AddressChip'
import { Button } from './Button'

/**
 * The heart of the hire sheet (DESIGN-SYSTEM.md sections 6 and 8.5).
 *
 * A vertical list of named steps. Each one is waiting, in the wallet,
 * confirming (with its transaction link), done, failed (the mapped reason and
 * Retry), or skipped (with why). Rows hold a fixed rhythm so the list keeps its
 * height as states change: nothing on the money path jumps.
 */
export type TxStepState = 'waiting' | 'wallet' | 'confirming' | 'done' | 'failed' | 'skipped'

export interface TxStep {
  id: string
  /** Plain words: "Pay 0.05 USDT into escrow". */
  label: string
  state: TxStepState
  /** Needs no signature (for example "Tell Keel to start"). */
  offchain?: boolean
  txHash?: string
  chainId?: number
  /** Shown under the label, for example why a step was skipped. */
  detail?: ReactNode
  /** Mapped error: a sentence and the next step. Never raw text. */
  error?: { title: string; action: string } | null
  /** Batch mode: the calls folded into this one signature. */
  calls?: string[]
}

const STATUS: Record<TxStepState, string> = {
  waiting: '',
  wallet: 'Check your wallet',
  confirming: 'Confirming',
  done: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
}

export function TxStepper({ steps, onRetry, label = 'Transaction steps' }: { steps: TxStep[]; onRetry?: (id: string) => void; label?: string }) {
  const live = steps.find((s) => s.state === 'wallet' || s.state === 'confirming' || s.state === 'failed')
  return (
    <div>
      <ol className="txs" aria-label={label}>
        {steps.map((s, i) => (
          <li key={s.id} className="txs-step" data-state={s.state}>
            <span className="txs-mark" aria-hidden="true">
              {s.state === 'done' ? <Check strokeWidth={2.5} />
                : s.state === 'failed' ? <AlertTriangle />
                : s.state === 'wallet' ? <Wallet />
                : s.state === 'skipped' ? <CornerDownRight />
                : i + 1}
            </span>
            <div className="txs-body">
              <div className="txs-label">
                <span>{s.label}</span>
                <span className="txs-status">
                  {s.state === 'done' && s.offchain ? 'Sent' : STATUS[s.state]}
                  {s.state === 'waiting' && s.offchain ? 'No signature' : ''}
                </span>
              </div>
              <div className="txs-detail">
                {s.txHash && s.chainId && (s.state === 'confirming' || s.state === 'done')
                  ? <a href={explorerTx(s.chainId, s.txHash)} target="_blank" rel="noreferrer">{s.state === 'done' ? 'Confirmed' : 'Pending'} · {middle(s.txHash, 6, 4)}</a>
                  : s.detail ?? null}
              </div>
              {s.calls?.length ? <ul className="txs-sub">{s.calls.map((c) => <li key={c}>{c}</li>)}</ul> : null}
              {s.state === 'failed' && s.error ? (
                <div className="txs-error" role="alert">
                  <p>{s.error.title}</p>
                  <p>{s.error.action}</p>
                  {onRetry ? <Button size="sm" onClick={() => onRetry(s.id)}>Try again</Button> : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {live ? `${live.label}: ${live.state === 'failed' ? (live.error?.title ?? 'failed') : STATUS[live.state]}` : ''}
      </p>
    </div>
  )
}
