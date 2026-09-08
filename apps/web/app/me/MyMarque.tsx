'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Statement, LinkButton, EmptyState, Chip } from '@marque/ui'
import { Desk } from '../desk/Desk'
import styles from './me.module.css'

interface CharterLite {
  id: string
  status: string
  agentName: string | null
  category: string
  ownerAddress: string
  label: string | null
  expiresAt: string
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function MyMarque() {
  const { address, isConnected } = useAccount()
  const [charters, setCharters] = useState<CharterLite[] | null>(null)

  useEffect(() => {
    if (!isConnected) return
    let live = true
    fetch('/api/v1/charters')
      .then((r) => (r.ok ? r.json() : { charters: [] }))
      .then((d: { charters?: CharterLite[] }) => {
        if (live) setCharters(Array.isArray(d.charters) ? d.charters : [])
      })
      .catch(() => live && setCharters([]))
    return () => {
      live = false
    }
  }, [isConnected])

  if (!isConnected || !address) {
    return (
      <div className={styles.gate}>
        <span className={styles.eyebrow}>My Marque</span>
        <Statement as="h1" size="page">Your positions, and what can act on them.</Statement>
        <p className={styles.lede}>
          Connect a wallet and Marque reads its live positions straight from chain — the same
          read the <a href="/positions">Positions</a> page does for a pasted address — then shows
          the agents warranted to work on each one. Nothing is signed until you choose to grant a
          charter.
        </p>
        <div className={styles.gateAct}>
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => (
              <button
                type="button"
                className={styles.connectBtn}
                onClick={openConnectModal}
                disabled={!mounted}
              >
                Connect wallet
              </button>
            )}
          </ConnectButton.Custom>
          <LinkButton href="/positions" variant="quiet">Read any address instead</LinkButton>
        </div>
      </div>
    )
  }

  const mine = (charters ?? []).filter(
    (c) => c.ownerAddress?.toLowerCase() === address.toLowerCase(),
  )
  const active = (charters ?? []).filter((c) => c.status === 'active')

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <span className={styles.eyebrow}>My Marque</span>
        <Statement as="h1" size="page">Connected as {shortAddr(address)}</Statement>
        <p className={styles.lede}>
          Read live from chain at load. Nothing here is stored — the wallet is the identity.
        </p>
      </header>

      <section className={styles.block} aria-labelledby="pos-h">
        <h2 className={styles.blockHead} id="pos-h">Your positions</h2>
        <Desk initialAddress={address} />
      </section>

      <section className={styles.block} aria-labelledby="ch-h">
        <h2 className={styles.blockHead} id="ch-h">
          Your charters
          {mine.length > 0 && <span className={`mono ${styles.count}`}>{mine.length}</span>}
        </h2>
        {mine.length > 0 ? (
          <ul className={styles.charterList}>
            {mine.map((c) => (
              <li key={c.id} className={styles.charterRow}>
                <span className={styles.charterName}>{c.label ?? c.agentName ?? c.category}</span>
                <Chip tone={c.status === 'active' ? 'holds' : 'neutral'}>{c.status}</Chip>
                <a className={styles.charterLink} href="/app/charters">open</a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No charter granted from this wallet yet.">
            <p>
              A charter is a spend-capped, revocable grant an agent acts inside. Grant one from the
              Charter Desk and it will appear here with a live countdown and a revoke button.
            </p>
            <p className={styles.charterMeta}>
              {active.length > 0
                ? `${active.length} charter${active.length === 1 ? '' : 's'} active across Marque right now — see the full ledger at `
                : 'The full ledger of every charter Marque has granted is at '}
              <a href="/app/charters">/app/charters</a>.
            </p>
            <p><LinkButton href="/app/charter" variant="primary">Grant a charter</LinkButton></p>
          </EmptyState>
        )}
      </section>

      <p className={styles.foot}>
        Looking for an agent? The <a href="/register">marketplace</a> ranks every one we can find,
        warranted at the top.
      </p>
    </div>
  )
}
