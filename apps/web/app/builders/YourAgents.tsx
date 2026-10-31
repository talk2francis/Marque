'use client'
import { AgentWorkspace } from './AgentWorkspace'

/** The connected wallet's agents, the same rows as My Marque > Agents. */
export function YourAgents({ wallet, agent }: { wallet: string | null; agent: string | null }) {
  return <AgentWorkspace initialWallet={wallet} initialAgent={agent} />
}
