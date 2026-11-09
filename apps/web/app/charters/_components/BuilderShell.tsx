'use client'
import { useEffect, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { switchChain } from '@wagmi/core'
import { getAddress, isAddress, type Address } from 'viem'
import type { CharterChainId } from '@marque/charters/client'
import styles from './builder.module.css'

export const CHAIN_NAME: Record<CharterChainId, string> = { 56: 'BNB Smart Chain', 97: 'BSC testnet' }
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
export const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}

/** Whose position the builder reads: the connected wallet, an address someone pasted, or the demo (invariant 2). */
export function useWho(initialChain: CharterChainId, initialAccount: string | null, demo: Record<CharterChainId, string>) {
  const { address: wallet, chainId: walletChain, connector } = useAccount()
  const { openConnectModal } = useConnectModal()
  const config = useConfig()
  const [chainId, setChainId] = useState<CharterChainId>(initialChain)
  const [chosen, setChosen] = useState<Address | null>(initialAccount && isAddress(initialAccount) ? getAddress(initialAccount) : null)
  const [typed, setTyped] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t) }, [])
  const account = (chosen ?? wallet ?? demo[chainId]) as Address
  const isDemo = !chosen && !wallet
  const isOwner = Boolean(wallet && wallet.toLowerCase() === account.toLowerCase())
  const pass = connector?.id === 'marque-pass'
  /** Why Grant cannot be pressed for wallet reasons, in plain words; null when the wallet is ready. */
  const walletBlocker = (what: string): { words: string; action?: { label: string; run: () => void } } | null => {
    if (!wallet) return { words: `Connect the wallet that owns this ${what} to grant a charter. You can explore everything without one.`, action: openConnectModal ? { label: 'Connect', run: openConnectModal } : undefined }
    if (!isOwner) return { words: `This ${what} belongs to ${short(account)}. Switch to that wallet to grant a charter for it.`, action: { label: `Show my own`, run: () => setChosen(null) } }
    if (walletChain !== chainId) return { words: `This is on ${CHAIN_NAME[chainId]}. Your wallet is on ${walletChain === 56 || walletChain === 97 ? CHAIN_NAME[walletChain] : 'another network'}.`, action: { label: 'Switch network', run: () => { void switchChain(config, { chainId }).catch(() => undefined) } } }
    return null
  }
  return { wallet, walletChain, chainId, setChainId, chosen, setChosen, typed, setTyped, account, isDemo, isOwner, pass, now, walletBlocker }
}
export type Who = ReturnType<typeof useWho>

export function WhoBar({ who, placeholder, onChain }: { who: Who; placeholder: string; onChain?: () => void }) {
  return (
    <form className={styles.who} onSubmit={(e) => { e.preventDefault(); const v = who.typed.trim(); if (isAddress(v)) { who.setChosen(getAddress(v)); who.setTyped('') } }}>
      <div className={styles.seg} role="group" aria-label="Network">
        {([56, 97] as const).map((c) => (
          <button key={c} type="button" aria-pressed={who.chainId === c} onClick={() => { who.setChainId(c); onChain?.() }}>{CHAIN_NAME[c]}</button>
        ))}
      </div>
      <label className={styles.addr}>
        <span className="sr-only">{placeholder}</span>
        <input value={who.typed} onChange={(e) => who.setTyped(e.target.value)} placeholder={`${placeholder} (now ${short(who.account)})`} spellCheck={false} autoComplete="off" aria-invalid={who.typed.trim() !== '' && !isAddress(who.typed.trim())} />
      </label>
      <button type="submit" className={styles.ghost} disabled={!isAddress(who.typed.trim())}>Read</button>
      {who.chosen && who.wallet && who.chosen.toLowerCase() !== who.wallet.toLowerCase() ? <button type="button" className={styles.link} onClick={() => who.setChosen(null)}>My wallet</button> : null}
    </form>
  )
}

/** Prompt counts in words. Pass batching is measured (P5); browser wallets ask once if they can batch. */
export function promptWords(pass: boolean, steps: number, what: string): string {
  if (steps === 1) return `Your wallet asks once: ${what}.`
  return pass
    ? `Marque Pass: one confirmation and one passkey touch sign all ${steps} steps.`
    : `Your wallet asks once if it can batch the ${steps} steps, otherwise ${steps === 3 ? 'three times' : 'twice'}: ${what}.`
}

/** A fixture pool is labelled wherever it appears (C11). */
export function FixtureNote({ show }: { show: boolean }) {
  if (!show) return null
  return <p className={styles.fixture} role="note">Testnet fixture pool: prices are moved by Marque&apos;s test market maker.</p>
}
