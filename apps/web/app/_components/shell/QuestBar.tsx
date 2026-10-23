'use client'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { rememberQuestAddress } from '../campaign/store'

/**
 * V4: the old five-step bar is retired; the Campaign Dock is the quest companion. This island
 * now only hands the connected wallet to the Dock (kept in this browser, never sent anywhere
 * but Marque's own quest API, which needs no signature).
 */
export function QuestBar() {
  const { address } = useAccount()
  useEffect(() => { if (address) rememberQuestAddress(address) }, [address])
  return null
}
