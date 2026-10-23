'use client'
import { useAccount } from 'wagmi'
import { Agents } from '../me/Workspace'
import styles from './forge.module.css'

/** The connected wallet's agents, the same rows as My Marque > Agents. */
export function YourAgents() {
  const { address } = useAccount()
  if (!address) return <p className={styles.fine}>Connect the wallet that owns your agents to see their listing criteria here.</p>
  return <Agents address={address} />
}
