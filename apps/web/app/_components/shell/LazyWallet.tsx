'use client'
import dynamic from 'next/dynamic'
import { Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { connectedBefore, useWalletReady, warmWallet } from '../wallet/ready'

const Island = dynamic(() => import('../wallet/WalletIsland'), { ssr: false, loading: () => null })
const fetchIsland = () => Promise.all([import('../wallet/WalletIsland'), warmWallet()])

/**
 * The header's wallet control, as an island. The wallet stack is the heaviest
 * script on the site and most visitors only read: it loads at once for a wallet
 * that connected before (or on a page that already carries it), on the first
 * pointer or focus on the button, or when the browser is idle about twelve
 * seconds after load, once the page has settled. Until then this button is real: pressing it loads the island and
 * opens the connect dialog. `ready` flips only once the code is in the browser,
 * so the button never disappears under the pointer.
 */
export function LazyWallet({ compact = false }: { compact?: boolean }) {
  const onPage = useWalletReady()
  const [ready, setReady] = useState(false)
  const [pressed, setPressed] = useState(false)
  const warm = () => { void fetchIsland().then(() => { setReady(true); window.dispatchEvent(new Event('marque:wallet')) }) }
  useEffect(() => {
    if (onPage || connectedBefore()) { warm(); return }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    const t = setTimeout(() => { if (w.requestIdleCallback) w.requestIdleCallback(warm, { timeout: 4000 }); else warm() }, 12000)
    return () => clearTimeout(t)
  }, [onPage])
  if (ready) return <Island compact={compact} openOnLoad={pressed} bare={onPage} />
  const press = () => { setPressed(true); warm() }
  return (
    <button type="button" className="btn btn--sm wallet-connect" data-compact={compact ? '' : undefined} aria-label="Connect wallet"
      onPointerEnter={warm} onFocus={warm} onClick={press}>
      <Wallet aria-hidden="true" />{compact ? null : <span>Connect</span>}
    </button>
  )
}
