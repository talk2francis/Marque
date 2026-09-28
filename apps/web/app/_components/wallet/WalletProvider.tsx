'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { marqueTheme, wagmiConfig } from './config'
import { WalletReady } from './ready'

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
        <WalletReady.Provider value={true}>{children}</WalletReady.Provider>
      </RainbowKitProvider>
    </WagmiProvider>
  )
}
