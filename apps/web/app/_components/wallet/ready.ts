'use client'
import { createContext, useContext } from 'react'

/**
 * True inside a WalletProvider. Light on purpose (no wagmi import), so the header
 * and the hire sheet gate can ask "is the wallet stack already on this page?"
 * without pulling it in.
 */
export const WalletReady = createContext(false)
export const useWalletReady = () => useContext(WalletReady)

/** A wallet connected on this browser before: load the island at once, not on idle. */
export function connectedBefore(): boolean {
  try {
    return Boolean(localStorage.getItem('wagmi.recentConnectorId'))
      || /"connections":\{"__type":"Map","value":\[\[/.test(localStorage.getItem('wagmi.store') ?? '')
  } catch { return false }
}

/** Fetch the wallet chunks without mounting anything (hover, focus, idle). */
export const warmWallet = (): Promise<unknown> => import('./WalletProvider')
