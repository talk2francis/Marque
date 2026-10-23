'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider, useConnectModal } from '@rainbow-me/rainbowkit'
import { useEffect } from 'react'
import { WagmiProvider } from 'wagmi'
import { marqueTheme, wagmiConfig } from './config'
import { WalletReady } from './ready'
import { PassHost } from '../pass/PassHost'

/**
 * The wallet layer: wagmi for the connection, RainbowKit for the connect UI (it
 * speaks EIP-6963 and, with a project id, WalletConnect for phones).
 *
 * It is the heaviest script on the site and most visitors only read, so it is
 * never in the root layout (27 Sep performance pass). It wraps the four routes
 * that sign (/quest, /me, /builders, /jobs) and loads as an island elsewhere:
 * the header's Connect, the quest bar, and the hire sheet. The react-query
 * client it needs is the site-wide one in Providers.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <RainbowKitProvider modalSize="compact" theme={marqueTheme}>
        <WalletIconAccessibility />
        <PassHost />
        <WalletReady.Provider value={true}>{children}</WalletReady.Provider>
      </RainbowKitProvider>
    </WagmiProvider>
  )
}

/** RainbowKit 2.2.11 renders unnamed role=img icons beside wallet button text.
 * Treat only those redundant icons as decorative while its portal is open.
 * Keep the visible button names and all connection behavior in RainbowKit.
 */
function WalletIconAccessibility() {
  const { connectModalOpen } = useConnectModal()
  useEffect(() => {
    if (!connectModalOpen) return
    const repair = () => {
      for (const icon of document.querySelectorAll('[data-rk] [role="dialog"] button[data-testid^="rk-wallet-option-"] [role="img"]')) {
        if (icon.closest('button')?.textContent?.trim() && !icon.hasAttribute('aria-label') && !icon.hasAttribute('aria-labelledby') && !icon.hasAttribute('title')) {
          icon.setAttribute('aria-hidden', 'true')
        }
      }
    }
    repair()
    const observer = new MutationObserver(repair)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [connectModalOpen])
  return null
}
