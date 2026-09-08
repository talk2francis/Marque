'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Chip } from '@marque/ui'
import { network } from '../../lib/network'
import styles from './site.module.css'

/**
 * The nav's right side: a chain badge and a Connect control, rendered through
 * RainbowKit's headless API so it matches the site rather than dropping in a
 * foreign button.
 *
 * The wallet is never required (invariant 2) — connecting only enables the one
 * signature a charter grant needs. When nothing is connected the badge shows
 * the chain the marketplace indexes; connected, it shows the wallet's chain and
 * a warning if that is not a supported one.
 */
export function NavWallet() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted
        const connected = ready && account && chain
        const net = connected ? network(chain.id) : network(56)

        return (
          <div
            className={styles.navRight}
            {...(!ready && { 'aria-hidden': true, style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' } })}
          >
            {connected && chain.unsupported ? (
              <button type="button" className={styles.navConnect} onClick={openChainModal}>
                Wrong network
              </button>
            ) : connected ? (
              <button type="button" className={styles.chainPill} onClick={openChainModal} aria-label="Network">
                <Chip tone="chain">{net.short}</Chip>
              </button>
            ) : (
              <span className={styles.chainPill}><Chip tone="chain">BSC · 56</Chip></span>
            )}

            {connected ? (
              <button type="button" className={styles.navConnect} onClick={openAccountModal}>
                {account.displayName}
              </button>
            ) : (
              <button type="button" className={styles.navConnect} onClick={openConnectModal}>
                Connect
              </button>
            )}
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
