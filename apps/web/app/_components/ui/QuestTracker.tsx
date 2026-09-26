import { Check, Clock } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The five quest steps (four categories and listing your own agent), each with
 * its state and a next action. States come from the Quest API only; the UI
 * never computes progress itself (SPEC-TRACKING section 7).
 */
export type QuestStepState = 'done' | 'waiting' | 'next' | 'todo'

export interface QuestStep {
  key: string
  name: string
  state: QuestStepState
  detail?: ReactNode
  actions?: ReactNode
}

const STATE_WORD: Record<QuestStepState, string> = { done: 'Done', waiting: 'Waiting for the chain', next: 'Next', todo: 'Not started' }

export function QuestTracker({ steps }: { steps: QuestStep[] }) {
  return (
    <ol className="qt" aria-label="Quest steps">
      {steps.map((s, i) => (
        <li key={s.key} className="qt-row" data-state={s.state}>
          <span className="qt-mark" aria-hidden="true">
            {s.state === 'done' ? <Check strokeWidth={2.6} /> : s.state === 'waiting' ? <Clock /> : i + 1}
          </span>
          <span className="qt-name">
            <strong>{s.name}</strong>
            <span className="qt-state">{STATE_WORD[s.state]}</span>
          </span>
          <span className="qt-detail">{s.detail}</span>
          <span className="qt-actions">{s.actions}</span>
        </li>
      ))}
    </ol>
  )
}

/** Five segments and a count, for the header and /me. */
export function QuestProgress({ states, label = 'Quest' }: { states: QuestStepState[]; label?: string }) {
  const done = states.filter((s) => s === 'done').length
  return (
    <span className="qtc" aria-label={`${label}: ${done} of ${states.length} done`}>
      <span className="qtc-bar" aria-hidden="true">
        {states.map((s, i) => <span key={i} data-state={s} />)}
      </span>
      <span aria-hidden="true">{label} {done}/{states.length}</span>
    </span>
  )
}
