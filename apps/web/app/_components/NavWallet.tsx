'use client'

import { useEffect, useState } from 'react'
import { Chip } from '@marque/ui'
import { network } from '../../lib/network'
import styles from './site.module.css'


const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * The nav's right side (P10.5D item 1): a chain-aware network badge and a
 * Connect wallet button.
 *
 * The wallet is never required — invariant 2. Connecting only enables the final
 * signature. The badge shows the connected chain if there is one, otherwise the
 * chain the marketplace indexes; every surface that produces a transaction
 * still carries its own badge (P10.5A item 2).
 */
export function NavWallet() {
  const [addr, setAddr] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [hasWallet, setHasWallet] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return
    setHasWallet(true)
    const eth = window.ethereum
    void eth.request({ method: 'eth_accounts' }).then((a) => {
      const list = a as string[]
      if (list[0]) setAddr(list[0])
    })
    void eth.request({ method: 'eth_chainId' }).then((c) => setChainId(Number(c)))
    eth.on?.('accountsChanged', (a) => setAddr((a as string[])[0] ?? null))
    eth.on?.('chainChanged', (c) => setChainId(Number(c)))
  }, [])

  async function connect() {
    if (!window.ethereum) return
    try {
      const a = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
      setAddr(a[0] ?? null)
      const c = (await window.ethereum.request({ method: 'eth_chainId' })) as string
      setChainId(Number(c))
    } catch { /* user rejected */ }
  }

  const net = network(chainId ?? 56)

  return (
    <div className={styles.navRight}>
      <Chip tone="chain">{chainId ? net.short : 'BSC · 56'}</Chip>
      {addr ? (
        <span className={styles.navAddr} title={addr}>{short(addr)}</span>
      ) : hasWallet ? (
        <button type="button" className={styles.navConnect} onClick={connect}>Connect wallet</button>
      ) : (
        <span className={styles.navAddr} title="Install a browser wallet to sign the final step">No wallet</span>
      )}
    </div>
  )
}
