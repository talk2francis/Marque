'use client'
import { useEffect, useState } from 'react'
import { useAccount, useConnect } from 'wagmi'
import { MARQUE_PASS_ID, passCapableBrowser } from './connector'
import styles from './pass.module.css'

/** "No wallet? Create a Marque Pass…" (SPEC-ACCESS 2.3): one line on the hire sheet and the quest page. On either network. */
export function NoWalletLine({ className, chainId = 97 }: { className?: string; chainId?: 56 | 97 }) {
  const { isConnected } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const [capable, setCapable] = useState(false)
  useEffect(() => setCapable(passCapableBrowser()), [])
  const pass = connectors.find((c) => c.id === MARQUE_PASS_ID)
  if (isConnected || !capable || !pass) return null
  return (
    <p className={`${styles.noWallet} ${className ?? ''}`}>
      No wallet? <button type="button" disabled={isPending} onClick={() => connect({ connector: pass, chainId })}>Create a Marque Pass</button> with your fingerprint or face. 10 seconds, nothing to install.
    </p>
  )
}
