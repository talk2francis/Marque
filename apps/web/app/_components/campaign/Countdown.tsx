'use client'
import { useEffect, useState } from 'react'
import { campaignClock, clockShort, clockWords, CAMPAIGN, type CampaignClock } from '@marque/commerce/rules'

/** "Thu 5 Nov, 12:00 UTC", from the campaign's absolute end. */
const CLOSE_WORDS = (() => {
  const d = new Date(CAMPAIGN.end)
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${d.toISOString().slice(11, 16)} UTC`
})()

/**
 * The time left, from the absolute UTC end. Renders nothing on the server (the first client
 * paint fills it in), so the countdown can never mismatch on hydration; updates once a minute.
 */
export function useCampaignClock(): CampaignClock | null {
  const [c, setC] = useState<CampaignClock | null>(null)
  useEffect(() => {
    const tick = () => setC(campaignClock(Date.now()))
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])
  return c
}

export function Countdown({ words = false, className }: { words?: boolean; className?: string }) {
  const c = useCampaignClock()
  const [hourly, setHourly] = useState('')
  useEffect(() => {
    if (!c) return
    // Screen readers hear the hour change, not every minute.
    const h = c.closed ? 'Set and Earn has closed.' : `${clockWords(c)} left in Set and Earn.`
    if (c.minutes === 0 || hourly === '') setHourly(h)
  }, [c, hourly])
  return (
    <span className={className} suppressHydrationWarning>
      {/* Before the clock is known (the server HTML, read by link previews and AI assistants that run no scripts), the
          absolute close stands in: true at any hour, so it never reads as a wrong countdown (3 Nov). */}
      <span aria-hidden={c ? 'true' : undefined}>{c ? (words ? clockWords(c) : clockShort(c)) : campaignClock(Date.now()).closed ? `Closed ${CLOSE_WORDS}` : `until ${CLOSE_WORDS}`}</span>
      <span className="sr-only" aria-live="polite">{hourly}</span>
    </span>
  )
}
