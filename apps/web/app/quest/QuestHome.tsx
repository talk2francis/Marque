'use client'
import { useEffect, useState } from 'react'
import { ADDRESS_EVENT, questAddress } from '../_components/campaign/store'
import { QuestBoard } from './QuestBoard'
import type { QuestResult } from '../../lib/quest-api'
import styles from './quest.module.css'

/**
 * /quest without an address: the last wallet this browser checked or connected, read from the
 * public quest API; with none, the two tracks in plain words.
 */
export function QuestHome() {
  const [address, setAddress] = useState<string | null>(null)
  const [q, setQ] = useState<QuestResult | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setAddress(questAddress()); setReady(true)
    const on = () => setAddress(questAddress())
    window.addEventListener(ADDRESS_EVENT, on)
    return () => window.removeEventListener(ADDRESS_EVENT, on)
  }, [])
  useEffect(() => {
    if (!address) return
    let live = true
    setFailed(false)
    fetch(`/api/v1/quest/${address}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: QuestResult) => { if (live) setQ(j) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [address])
  if (!ready) return null
  if (!address) return <Rules />
  if (failed) return <p className={styles.loading} role="status">Progress for {address.slice(0, 6)}…{address.slice(-4)} could not be read from chain just now. Try again in a minute.</p>
  if (!q) return <p className={styles.loading} role="status">Reading {address.slice(0, 6)}…{address.slice(-4)} from BSC mainnet and testnet…</p>
  return (
    <>
      <p className={styles.whoRow}><span className={styles.whoMeta}>Last checked in this browser</span><a className={styles.whoAddr} href={`/quest/${q.address}`}>{q.address}</a></p>
      <QuestBoard q={q} />
    </>
  )
}

function Rules() {
  return (
    <div className={styles.rules2}>
      <section className={styles.rule2}>
        <h2>Hire</h2>
        <p>Hire 3 different agents across at least 2 shortlisted marketplaces. A hire counts once it is funded on chain; approval alone does not. Mainnet and testnet both count.</p>
      </section>
      <section className={styles.rule2}>
        <h2>Build</h2>
        <p>Own one agent that meets six criteria:</p>
        <ol>
          <li>Registered on ERC-8004, owned and listed</li>
          <li>An agent card at its own domain saying what it does</li>
          <li>Answers when invoked</li>
          <li>3 completed hires from 3 wallets that are not yours</li>
          <li>5 onchain actions on 3 separate days</li>
          <li>Actions that match its category</li>
        </ol>
      </section>
    </div>
  )
}
