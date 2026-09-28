'use client'

import { WalletButton } from '../shell/WalletButton'
import { WalletProvider } from './WalletProvider'

/** The header's real Connect, with its own wallet layer unless the page already has one. */
export default function WalletIsland({ compact, openOnLoad, bare }: { compact?: boolean; openOnLoad?: boolean; bare?: boolean }) {
  const button = <WalletButton compact={compact} openOnLoad={openOnLoad} />
  return bare ? button : <WalletProvider>{button}</WalletProvider>
}
