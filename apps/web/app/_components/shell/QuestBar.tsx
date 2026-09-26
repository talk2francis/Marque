'use client'
import { useAccount } from 'wagmi'
import { questStates, useWalletQuest } from './useQuest'

/**
 * A thin bar under the header while a connected wallet's quest is in progress:
 * n of 5, filled from the Quest API. Absent before the first hire and after the
 * fifth step, so it never nags.
 */
export function QuestBar() {
  const { address } = useAccount()
  const { data } = useWalletQuest(address)
  const states = questStates(data)
  const done = states.filter((s) => s === 'done').length
  const started = data?.hires.some((h) => h.state !== 'CANCELLED') ?? false
  if (!data || !started || done === 5) return null
  return (
    <a href="/quest" className="questbar" aria-label={`Set and Earn quest: ${done} of 5 done. Continue`}>
      <span className="questbar-track" aria-hidden="true">
        {states.map((s, i) => <span key={i} data-state={s} />)}
      </span>
    </a>
  )
}
