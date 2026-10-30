'use client'
import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit'
import { ArrowUpRight, Check, ChevronDown, Copy, Info, LogOut, Pencil, Repeat, ShieldCheck, Target, User, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { KeyRound, Lock as LockIcon, Droplets, HelpCircle } from 'lucide-react'
import { MARQUE_PASS_ID } from '../pass/connector'
import { passBridge, lock as lockPass } from '../pass/bridge'
import { explorerAddress } from '../../../lib/network'
import { copyText } from '../../../lib/clipboard'
import { useOfficialQuest } from '../campaign/useOfficialQuest'
import { ProfileAvatar } from '../profile/ProfileAvatar'
import { applyPrefs, readLocalPrefs, useWalletProfile } from '../../../lib/profile-client'

const CHAIN_SHORT: Record<number, string> = { 56: 'BSC', 97: 'BSC testnet' }

/**
 * Connect, themed from tokens through RainbowKit's headless API. Connected, it
 * shows the short address, the wallet's network and quest progress, and opens
 * an account menu (My Marque, the quest, spending controls, explorer, switch
 * network, disconnect). A wallet is never needed to look around (invariant 2).
 */
export function WalletButton({ compact, openOnLoad }: { compact?: boolean; openOnLoad?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain
        if (!mounted) return <span className="wallet-slot" data-compact={compact ? '' : undefined} aria-hidden="true" />
        if (!connected) {
          return (
            <>{openOnLoad ? <OpenOnce /> : null}<button type="button" className="btn btn--sm wallet-connect" onClick={openConnectModal} data-compact={compact ? '' : undefined} aria-label="Connect wallet">
              <Wallet aria-hidden="true" />{compact ? null : <span>Connect</span>}
            </button></>
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

/**
 * The visitor pressed Connect before the island arrived: open the dialog once it can.
 * RainbowKit only hands out openConnectModal while the wallet is disconnected (not
 * while wagmi is still reconnecting), so wait for it rather than calling once blind.
 */
function OpenOnce() {
  const { openConnectModal } = useConnectModal()
  const done = useRef(false)
  useEffect(() => { if (!done.current && openConnectModal) { done.current = true; openConnectModal() } }, [openConnectModal])
  return null
}

function AccountMenu({ address, display, chainId, compact, openChainModal }: { address: string; display: string; chainId: number; compact?: boolean; openChainModal: () => void }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { disconnect } = useDisconnect()
  const { connector } = useAccount()
  const isPass = connector?.id === MARQUE_PASS_ID
  const [tokensCopied, setTokensCopied] = useState(false)
  const official = useOfficialQuest(address)
  const hired = Math.min(official?.hire.distinctAgents ?? 0, 3)
  const built = official?.build.agents[0]?.observed ?? 0
  const practice = chainId === 97
  const { profile, signedIn } = useWalletProfile(address)
  const name = profile?.displayName ?? null

  // The owner's saved preferences follow them: on a device signed in to the profile, apply them if this browser differs.
  useEffect(() => {
    if (!signedIn || !profile?.prefs) return
    if (JSON.stringify(readLocalPrefs()) !== JSON.stringify(profile.prefs)) applyPrefs(profile.prefs)
  }, [signedIn, profile])

  // With a wallet connected, its chip is the one network indicator in the header (the lane pill steps aside).
  useEffect(() => {
    document.documentElement.dataset['wallet'] = String(chainId)
    return () => { delete document.documentElement.dataset['wallet'] }
  }, [chainId])

  useEffect(() => {
    if (!open) return
    // Reveal the account card inside the drawer without scrolling the page behind it.
    const account = ref.current
    const drawer = account?.closest('.drawer')
    if (account && drawer) {
      const head = drawer.querySelector('.drawer-head')
      drawer.scrollTop += account.getBoundingClientRect().top - drawer.getBoundingClientRect().top - (head?.getBoundingClientRect().height ?? 0) - 8
    }
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
  const go = (href: string) => { setOpen(false); window.location.href = href }

  return (
    <div className="acct" ref={ref}>
      <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-compact={compact ? '' : undefined} data-lane={practice ? 'practice' : 'mainnet'}
        aria-label={`Wallet ${display} on ${CHAIN_SHORT[chainId] ?? 'chain ' + chainId}, Set and Earn: ${hired} of 3 agents hired. Open account menu`}>
        <span className="acct-face" aria-hidden="true"><ProfileAvatar address={address} profile={profile} size={22} /></span>
        <span className="acct-addr" data-name={name ? '' : undefined} title={name ? address : undefined}>{name ?? display}</span>
        <span className="acct-net" data-dot-only={compact ? '' : undefined}><i aria-hidden="true" /><span className="acct-net-word">{practice ? 'Practice' : 'Mainnet'}</span></span>
        {compact || !official ? null : <span className="acct-quest">{hired}/3</span>}
        <ChevronDown className="acct-chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu acct-menu" role="menu" aria-label="Account">
          <div className="acct-card" data-lane={practice ? 'practice' : 'mainnet'}>
            <div className="acct-card-row">
              <ProfileAvatar address={address} profile={profile} size={34} />
              <span className="acct-card-who">
                {name ? <b className="acct-card-name">{name}</b> : null}
                <span className="acct-card-addr" title={address}>{address.slice(0, 6)}…{address.slice(-4)}</span>
              </span>
              <button type="button" className="acct-icon" onClick={copy} aria-label={copied ? 'Address copied' : 'Copy address'} title={copied ? 'Copied' : 'Copy address'}>{copied ? <Check /> : <Copy />}</button>
              <a className="acct-icon" href={explorerAddress(chainId, address)} target="_blank" rel="noreferrer" aria-label="View on BscScan" title="View on BscScan"><ArrowUpRight /></a>
            </div>
            <div className="acct-card-net">
              <span className="acct-lane"><i aria-hidden="true" />{practice ? 'Practice · BSC testnet' : 'BSC mainnet'}</span>
              {isPass ? <span className="acct-pass">Marque Pass<button type="button" className="acct-info" onClick={() => { setOpen(false); passBridge.about() }} aria-label="What is Marque Pass?" title="What is Marque Pass?"><Info /></button></span> : null}
            </div>
          </div>
          <a role="menuitem" className="acct-quest-card" href="/quest">
            <span className="acct-quest-head"><b>Set and Earn</b>{official?.excluded.team ? <span>team wallet, not counted</span> : <span>Your progress</span>}</span>
            <span className="acct-quest-bars">
              <span><em style={{ ['--p' as string]: `${(hired / 3) * 100}%` }} /><small>Hire {hired} of 3</small></span>
              <span><em style={{ ['--p' as string]: `${(built / 6) * 100}%` }} /><small>Build {built} of 6</small></span>
            </span>
          </a>
          <a role="menuitem" className="menu-item" href="/me"><User />My Marque</a>
          <a role="menuitem" className="menu-item" href="/me?edit=profile"><Pencil />{profile?.saved ? 'Edit profile' : 'Make your profile'}</a>
          <a role="menuitem" className="menu-item" href="/quest"><Target />Set and Earn quest</a>
          <a role="menuitem" className="menu-item" href="/me?view=money" onClick={(e) => { e.preventDefault(); go('/me?view=money') }}><ShieldCheck />Spending controls</a>
          {isPass ? (
            <>
              <button role="menuitem" type="button" className="menu-item" onClick={async () => {
                // BNB Chain's bot sends 0.1 tBNB and 20 test U for this exact sentence (FACTS 6).
                if (await copyText(`I would like to get tBNB and U on BNB Smart Chain Testnet to my wallet ${address}`)) { setTokensCopied(true); setTimeout(() => setTokensCopied(false), 2500) }
                window.open('https://t.me/bnbchain_official_bot', '_blank', 'noopener')
              }}><Droplets />{tokensCopied ? 'Message copied: paste it to the bot' : 'Get test tokens'}</button>
              <button role="menuitem" type="button" className="menu-item" onClick={() => { setOpen(false); void passBridge.exportKey() }}><KeyRound />Export key</button>
              <button role="menuitem" type="button" className="menu-item" onClick={() => { setOpen(false); passBridge.about() }}><HelpCircle />What is Marque Pass?</button>
            </>
          ) : null}
          <div className="acct-foot" data-three={isPass || undefined}>
            <button role="menuitem" type="button" onClick={() => { setOpen(false); openChainModal() }}><Repeat />Switch network</button>
            {isPass ? <button role="menuitem" type="button" onClick={() => { lockPass(); disconnect(); setOpen(false) }}><LockIcon />Lock</button> : null}
            <button role="menuitem" type="button" onClick={() => { setOpen(false); disconnect() }}><LogOut />Disconnect</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
