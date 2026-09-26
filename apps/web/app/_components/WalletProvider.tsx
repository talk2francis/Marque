'use client'

import '@rainbow-me/rainbowkit/styles.css'
import {
  RainbowKitProvider, connectorsForWallets, darkTheme, type Theme,
} from '@rainbow-me/rainbowkit'
import {
  injectedWallet, rabbyWallet, walletConnectWallet, metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The wallet layer. RainbowKit for the connect UI (it speaks EIP-6963 and, with a
 * project id, WalletConnect for phones); wagmi for the connection.
 *
 * A user's wallet signs and funds their own ERC-8183 hires, rates the agents
 * they paid, and revokes allowances (invariant 22). Looking around never needs
 * a wallet. WalletConnect is included only when NEXT_PUBLIC_WC_PROJECT_ID is set,
 * so the app never ships a dead relay dependency.
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

/**
 * RainbowKit themed from the site tokens (DESIGN-SYSTEM.md section 6,
 * ConnectButton). Every colour is a CSS variable, resolved where RainbowKit
 * mounts its modal, so the connect dialog follows Night, Day and System with no
 * JavaScript theme tracking at all.
 */
const base = darkTheme()
const marqueTheme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    accentColor: 'var(--brass)',
    accentColorForeground: 'var(--ink-inverse)',
    actionButtonBorder: 'var(--hair)',
    actionButtonBorderMobile: 'var(--hair)',
    actionButtonSecondaryBackground: 'var(--panel-2)',
    closeButton: 'var(--ink-2)',
    closeButtonBackground: 'var(--panel-2)',
    connectButtonBackground: 'var(--panel)',
    connectButtonBackgroundError: 'var(--oxide)',
    connectButtonInnerBackground: 'var(--panel-2)',
    connectButtonText: 'var(--ink)',
    connectButtonTextError: 'var(--ink-inverse)',
    connectionIndicator: 'var(--moss)',
    error: 'var(--oxide)',
    generalBorder: 'var(--hair-2)',
    generalBorderDim: 'var(--hair)',
    menuItemBackground: 'var(--panel-2)',
    modalBackdrop: 'var(--scrim)',
    modalBackground: 'var(--canvas)',
    modalBorder: 'var(--hair-2)',
    modalText: 'var(--ink)',
    modalTextDim: 'var(--ink-3)',
    modalTextSecondary: 'var(--ink-2)',
    profileAction: 'var(--panel)',
    profileActionHover: 'var(--panel-2)',
    profileForeground: 'var(--canvas)',
    selectedOptionBorder: 'var(--brass)',
    standby: 'var(--amber)',
  },
  fonts: { body: 'var(--font-sans)' },
  radii: { actionButton: '8px', connectButton: '999px', menuButton: '8px', modal: '14px', modalMobile: '18px' },
  shadows: {
    ...base.shadows,
    dialog: 'var(--elev-3)',
    connectButton: 'none',
    profileDetailsAction: 'none',
    selectedOption: 'none',
    selectedWallet: 'none',
    walletLogo: 'none',
  },
  blurs: { modalOverlay: 'blur(6px)' },
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact" theme={marqueTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
