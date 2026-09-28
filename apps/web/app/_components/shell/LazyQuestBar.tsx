'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { connectedBefore, useWalletReady } from '../wallet/ready'

const Island = dynamic(() => import('../wallet/QuestBarIsland'), { ssr: false, loading: () => null })

/**
 * The quest bar only matters to a connected wallet, so it loads with the wallet:
 * at once for a wallet that connected before, otherwise when the header's wallet
 * island arrives (the `marque:wallet` event).
 */
export function LazyQuestBar() {
  const onPage = useWalletReady()
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (onPage || connectedBefore()) { setOn(true); return }
    const go = () => setOn(true)
    window.addEventListener('marque:wallet', go, { once: true })
    return () => window.removeEventListener('marque:wallet', go)
  }, [onPage])
  return on ? <Island bare={onPage} /> : null
}
