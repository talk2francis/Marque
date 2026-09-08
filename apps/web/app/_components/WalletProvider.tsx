'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { useEffect, useState } from 'react'
import {
  RainbowKitProvider, connectorsForWallets, darkTheme, lightTheme,
} from '@rainbow-me/rainbowkit'
import {
  injectedWallet, rabbyWallet, walletConnectWallet, metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The wallet layer. RainbowKit for the connect UI; wagmi for the connection.
 *
 * Marque needs a wallet for exactly one thing — signing a charter grant — so
 * this is deliberately injected-first. WalletConnect (and MetaMask mobile via
 * it) is included only when NEXT_PUBLIC_WC_PROJECT_ID is set, so the app never
 * ships a dead relay dependency.
 */
const WC_PROJECT_ID = process.env['NEXT_PUBLIC_WC_PROJECT_ID']

const walletGroups = [
  {
    groupName: 'Recommended',
    wallets: WC_PROJECT_ID
      ? [injectedWallet, rabbyWallet, metaMaskWallet, walletConnectWallet]
      : [injectedWallet, rabbyWallet],
  },
]

const connectors = connectorsForWallets(walletGroups, {
  appName: 'Marque',
  projectId: WC_PROJECT_ID ?? 'marque-injected-only',
})

const config = createConfig({
  connectors,
  chains: [bsc, bscTestnet],
  transports: {
    [bsc.id]: http('https://bsc-dataseed.bnbchain.org'),
    [bscTestnet.id]: http('https://bsc-testnet-rpc.publicnode.com'),
  },
  ssr: true,
})

const queryClient = new QueryClient()

/** Track the effective theme so RainbowKit's modal matches the site. */
function useEffectiveDark() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const read = () => {
      const attr = document.documentElement.getAttribute('data-theme')
      if (attr === 'dark') return true
      if (attr === 'light') return false
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    setDark(read())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMq = () => setDark(read())
    mq.addEventListener('change', onMq)
    const obs = new MutationObserver(() => setDark(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { mq.removeEventListener('change', onMq); obs.disconnect() }
  }, [])
  return dark
}

const brand = {
  accentColor: '#b0892c',
  accentColorForeground: '#15160f',
  borderRadius: 'medium' as const,
  fontStack: 'system' as const,
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const dark = useEffectiveDark()
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={dark ? darkTheme(brand) : lightTheme(brand)}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
