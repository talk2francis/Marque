'use client'

import { HireSheet } from '../HireSheet'
import { WalletProvider } from './WalletProvider'

export default function HireSheetIsland({ bare }: { bare?: boolean }) {
  return bare ? <HireSheet /> : <WalletProvider><HireSheet /></WalletProvider>
}
