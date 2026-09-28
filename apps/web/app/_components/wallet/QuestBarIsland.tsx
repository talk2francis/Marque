'use client'

import { QuestBar } from '../shell/QuestBar'
import { WalletProvider } from './WalletProvider'

export default function QuestBarIsland({ bare }: { bare?: boolean }) {
  return bare ? <QuestBar /> : <WalletProvider><QuestBar /></WalletProvider>
}
