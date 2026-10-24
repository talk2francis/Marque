'use client'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

export interface Pulse {
  at: string
  network: { chainId: number; state: 'ok' | 'lagging' | 'down'; lagBlocks: number | null; cursorBlock: number | null; headBlock: number | null }
  system: { state: 'ok' | 'degraded'; firstPartyFresh: number | null; firstPartyServices: number | null }
  market?: { latestAt: string | null }
}

/** The header pills' one read, shared by every consumer on the page (react-query dedupes). */
export function usePulse() {
  return useQuery<Pulse>({
    queryKey: ['pulse'],
    queryFn: async () => {
      const r = await fetch('/api/v1/pulse', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      if (!r.ok) throw new Error(String(r.status))
      return (await r.json()) as Pulse
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  })
}

/**
 * The pulse for components that render it: nothing until mounted, so the first client render matches the server's
 * "checking" state even when the shared query already resolved (another component may start it earlier), avoiding a
 * hydration mismatch.
 */
export function useRenderedPulse() {
  const q = usePulse()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? q : { ...q, data: undefined, isPending: true, isError: false }
}
