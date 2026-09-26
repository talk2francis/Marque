'use client'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ArrowUpRight, Check, ChevronDown, Copy, LogOut, Repeat, ShieldCheck, Target, User, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDisconnect } from 'wagmi'
import { explorerAddress } from '../../../lib/network'
import { copyText } from '../../../lib/clipboard'
import { QuestProgress } from '../ui/QuestTracker'
import { questStates, useWalletQuest } from './useQuest'

const CHAIN_SHORT: Record<number, string> = { 56: 'BSC', 97: 'BSC testnet' }

/**
 * Connect, themed from tokens through RainbowKit's headless API. Connected, it
 * shows the short address, the wallet's network and quest progress, and opens
 * an account menu (My Marque, the quest, spending controls, explorer, switch
 * network, disconnect). A wallet is never needed to look around (invariant 2).
 */
export function WalletButton({ compact }: { compact?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain
        if (!mounted) return <span className="wallet-slot" data-compact={compact ? '' : undefined} aria-hidden="true" />
        if (!connected) {
          return (
            <button type="button" className="btn btn--sm wallet-connect" onClick={openConnectModal} data-compact={compact ? '' : undefined} aria-label="Connect wallet">
              <Wallet aria-hidden="true" />{compact ? null : <span>Connect</span>}
            </button>
          )
        }
        if (chain.unsupported) {
          return (
            <button type="button" className="btn btn--sm wallet-wrong" onClick={openChainModal}>
              Switch to BNB Smart Chain
            </button>
          )
        }
        return <AccountMenu address={account.address} display={account.displayName} chainId={chain.id} compact={compact} openChainModal={openChainModal} />
      }}
    </ConnectButton.Custom>
  )
}

function AccountMenu({ address, display, chainId, compact, openChainModal }: { address: string; display: string; chainId: number; compact?: boolean; openChainModal: () => void }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { disconnect } = useDisconnect()
  const quest = useWalletQuest(address)
  const states = questStates(quest.data)
  const done = states.filter((s) => s === 'done').length

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  const copy = async () => {
    if (await copyText(address)) { setCopied(true); setTimeout(() => setCopied(false), 1400) }
  }

  return (
    <div className="acct" ref={ref}>
      <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-compact={compact ? '' : undefined}
        aria-label={`Wallet ${display} on ${CHAIN_SHORT[chainId] ?? 'chain ' + chainId}, quest ${done} of 5. Open account menu`}>
        <span className="acct-dot" aria-hidden="true" />
        <span className="acct-addr">{display}</span>
        {compact ? null : <span className="acct-net">{CHAIN_SHORT[chainId] ?? chainId}</span>}
        {compact || !quest.data ? null : <span className="acct-quest">Quest {done}/5</span>}
        <ChevronDown className="acct-chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu acct-menu" role="menu" aria-label="Account">
          <div className="menu-head">
            <div className="acct-menu-addr">{address.slice(0, 8)}…{address.slice(-6)}</div>
            <div className="acct-menu-net">{CHAIN_SHORT[chainId] ?? `Chain ${chainId}`} · {chainId}</div>
            <div className="acct-menu-quest">
              <QuestProgress states={states} label="Set and Earn" />
            </div>
          </div>
          <div className="menu-sep" />
          <a role="menuitem" className="menu-item" href="/me"><User />My Marque</a>
          <a role="menuitem" className="menu-item" href="/quest"><Target />Set and Earn quest</a>
          <a role="menuitem" className="menu-item" href="/me#controls"><ShieldCheck />Spending controls</a>
          <div className="menu-sep" />
          <button role="menuitem" type="button" className="menu-item" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy address'}</button>
          <a role="menuitem" className="menu-item" href={explorerAddress(chainId, address)} target="_blank" rel="noreferrer"><ArrowUpRight />View on BscScan</a>
          <button role="menuitem" type="button" className="menu-item" onClick={() => { setOpen(false); openChainModal() }}><Repeat />Switch network</button>
          <button role="menuitem" type="button" className="menu-item" onClick={() => { setOpen(false); disconnect() }}><LogOut />Disconnect</button>
        </div>
      ) : null}
    </div>
  )
}
