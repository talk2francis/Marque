import { ArrowUpRight } from 'lucide-react'
import { BRAND } from '@marque/ui/brand'
import { SDK_NETWORKS } from '@marque/commerce/generated'
import { CharterStrip } from './CharterStrip'
import { Wordmark } from './brand/Wordmark'
import { LockupLink } from './shell/Brand'
import { HeaderScroll } from './shell/HeaderScroll'
import { MobileNav } from './shell/MobileNav'
import { NavLinks } from './shell/NavLinks'
import { NetworkPill, StatusPill } from './shell/Pills'
import { QuestBar } from './shell/QuestBar'
import { ThemeMenu } from './shell/ThemeMenu'
import { WalletButton } from './shell/WalletButton'
import type { Active } from './nav-items'

/**
 * The shell around every page (DESIGN-SYSTEM.md section 6, SiteHeader and
 * Footer). Server components; the live parts (nav highlight, pills, wallet,
 * theme, drawer, quest bar) are client islands inside.
 *
 * Sticky, 64 px, the canvas blurred through it, firmer once the page scrolls.
 * Left: the lockup. Centre: the nav capsule. Right: network and status pills,
 * Connect, theme. Under 1024 px the nav and pills move into the drawer.
 */
export function SiteHeader({ active }: { active?: Active }) {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <CharterStrip />
      <header className="site-header">
        <div className="site-header-inner">
          <LockupLink />
          <NavLinks active={active} />
          <div className="header-tools">
            <span className="hide-lt-lg"><NetworkPill /></span>
            <span className="hide-lt-xl"><StatusPill /></span>
            <span className="hide-lt-md"><WalletButton /></span>
            <span className="show-lt-md"><WalletButton compact /></span>
            <span className="hide-lt-lg"><ThemeMenu /></span>
            <MobileNav active={active} />
          </div>
        </div>
        <QuestBar />
        <HeaderScroll />
      </header>
      <span id="main" className="main-anchor" tabIndex={-1} />
    </>
  )
}

const COLS: Array<{ label: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    label: 'Market',
    links: [
      { label: 'Marketplace', href: '/register' },
      { label: 'Positions', href: '/positions' },
      { label: 'Pancake Desk', href: '/pancakeswap' },
      { label: 'Compare agents', href: '/compare' },
      { label: 'My Marque', href: '/me' },
    ],
  },
  {
    label: 'Quest and builders',
    links: [
      { label: 'Set and Earn quest', href: '/quest' },
      { label: 'List your agent', href: '/builders/claim' },
      { label: 'Test your agent', href: '/builders/test' },
      { label: 'Docs', href: '/docs' },
      { label: 'Quest API', href: '/api/v1/phase2/config', external: true },
      { label: 'Source on GitHub', href: 'https://github.com/talk2francis/Marque', external: true },
    ],
  },
  {
    label: 'Proof',
    links: [
      { label: 'The Standard', href: '/standard' },
      { label: 'The Ledger', href: '/ledger' },
      { label: 'Receipts', href: '/receipts/latest' },
      { label: 'PancakeSwap proof run', href: '/pancakeswap/proof' },
      { label: 'Status', href: '/status' },
      { label: 'Protocol', href: '/protocol' },
      { label: 'Charter sandbox (testnet)', href: '/app/charter' },
    ],
  },
  {
    label: 'Ecosystem',
    links: [
      { label: 'BNB Agent Studio', href: 'https://docs.bnbchain.org/bnb-smart-chain/developers/agents/', external: true },
      { label: '8004scan', href: 'https://8004scan.io', external: true },
      { label: 'PancakeSwap', href: 'https://pancakeswap.finance', external: true },
      { label: 'Venus', href: 'https://venus.io', external: true },
    ],
  },
]

const MAINNET = SDK_NETWORKS.find((n) => n.chainId === 56)
const REGISTRY_TESTNET = '0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7'
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <LockupLink height={26} />
            <p>Hire BNB Chain agents that were tested before you pay. Your payment waits in BNB Chain&apos;s escrow until the work is delivered.</p>
          </div>
          <div className="footer-cta">
            <a className="btn btn--primary" href="/quest">Start the quest</a>
            <a className="btn" href="/register">Browse agents</a>
          </div>
        </div>
        <nav className="footer-cols" aria-label="Footer">
          {COLS.map((c) => (
            <div key={c.label}>
              <span className="t-label">{c.label}</span>
              {c.links.map((l) =>
                l.external ? (
                  <a key={l.label} href={l.href} target="_blank" rel="noreferrer">{l.label}<ArrowUpRight size={13} aria-hidden="true" /></a>
                ) : (
                  <a key={l.label} href={l.href}>{l.label}</a>
                ),
              )}
            </div>
          ))}
        </nav>
        <div className="footer-bottom">
          <div className="footer-chain">
            {MAINNET ? (
              <a href={`https://bscscan.com/address/${MAINNET.commerce}`} target="_blank" rel="noreferrer">
                Hires settle on BSC mainnet · 56 through BNB Chain&apos;s ERC-8183 escrow {short(MAINNET.commerce)}
              </a>
            ) : null}
            <a href={`https://testnet.bscscan.com/address/${REGISTRY_TESTNET}`} target="_blank" rel="noreferrer">
              MarqueRegistry {short(REGISTRY_TESTNET)} · BSC testnet · 97
            </a>
          </div>
          <div className="footer-social">
            <a href="https://x.com/marquetrade" target="_blank" rel="noreferrer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @marquetrade
            </a>
            <a href="https://x.com/marquetrade" target="_blank" rel="noreferrer">Support</a>
            <a href="https://github.com/talk2francis/Marque/issues" target="_blank" rel="noreferrer">Report a problem</a>
            <span className="footer-legal">{BRAND.name} · {BRAND.domain}</span>
          </div>
        </div>
      </div>
      <div className="footer-giant" aria-hidden="true">
        <Wordmark className="footer-giant-word" />
      </div>
    </footer>
  )
}
