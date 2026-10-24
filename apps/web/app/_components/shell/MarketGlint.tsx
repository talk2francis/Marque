'use client'
import { useEffect, useRef } from 'react'
import { usePulse } from './usePulse'

/** Raises the ambient "market moved" event once per new indexed hire or settlement seen during this visit (DESIGN-V4 6, 7). */
export const MARKET_EVENT = 'marque:pulse-new'
export function MarketGlint() {
  const { data } = usePulse()
  const first = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const at = data?.market?.latestAt ?? null
    if (data === undefined) return
    if (first.current === undefined) { first.current = at; return }
    if (at && at !== first.current) { first.current = at; window.dispatchEvent(new Event(MARKET_EVENT)) }
  }, [data])
  return null
}
