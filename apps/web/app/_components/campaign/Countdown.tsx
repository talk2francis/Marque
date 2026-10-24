'use client'
import { useEffect, useState } from 'react'
import { campaignClock, clockShort, clockWords, type CampaignClock } from '@marque/commerce/rules'

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
      {/* Before the clock is known, an invisible placeholder holds the width so the line does not reflow (layout shift). */}
      <span aria-hidden="true">{c ? (words ? clockWords(c) : clockShort(c)) : <span style={{ visibility: 'hidden' }}>{words ? '12 days 23 hours' : '12d 23h 59m'}</span>}</span>
      <span className="sr-only" aria-live="polite">{hourly}</span>
    </span>
  )
}
