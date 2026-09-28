'use client'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useWalletReady, warmWallet } from './wallet/ready'

const Island = dynamic(() => import('./wallet/HireSheetIsland'), { ssr: false, loading: () => null })

/**
 * The hire sheet opens over any page from `?hire=<agentKey>`. Its code (and the
 * wallet stack under it) loads the first time a hire is asked for, and is fetched
 * ahead the moment a pointer rests on any Hire or Try free link, so the sheet
 * opens without a wait. Once loaded it stays mounted and follows the URL itself.
 */
export function HireSheetGate() {
  const onPage = useWalletReady()
  const asked = useSearchParams().has('hire')
  const [on, setOn] = useState(false)
  useEffect(() => { if (asked) setOn(true) }, [asked])
  useEffect(() => {
    const warm = (e: PointerEvent | FocusEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href*="hire="]')
      if (a) { void import('./wallet/HireSheetIsland'); void warmWallet() }
    }
    document.addEventListener('pointerover', warm, { passive: true })
    document.addEventListener('focusin', warm)
    return () => { document.removeEventListener('pointerover', warm); document.removeEventListener('focusin', warm) }
  }, [])
  return on || asked ? <Island bare={onPage} /> : null
}
