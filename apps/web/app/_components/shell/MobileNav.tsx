'use client'
import { ArrowUpRight, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NAV, DOC_GROUPS, PROOF_GROUPS, type Active } from '../nav-items'
import { Drawer } from '../ui/Overlay'
import { NavGlyph } from './icons'
import { NetworkPill, StatusPill } from './Pills'
import { ThemeChoices } from './ThemeMenu'
import { WalletButton } from './WalletButton'
import { LockupLink } from './Brand'

/**
 * Below 1024 px the whole nav moves into a drawer: nav, Proof pages, network
 * and status, theme, wallet. Focus is trapped while open; Escape, the scrim, a
 * link, or widening the window closes it.
 */
export function MobileNav({ active }: { active?: Active }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const close = () => setOpen(false)
  return (
    <>
      <button type="button" className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu /></button>
      <Drawer open={open} onClose={close} label="Menu" head={<LockupLink />}>
        <nav className="dnav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.key} href={n.href} className="dnav-link" aria-current={active === n.key ? 'page' : undefined} onClick={close}>{n.label}</a>
          ))}
        </nav>
        <div className="dsec">
          <span className="t-label">Documentation</span>
          <div className="dgrid">{DOC_GROUPS.flatMap(g => g.items).map(it => <a key={it.href} href={it.href} className="dgrid-item" onClick={close}><NavGlyph name={it.icon}/>{it.label}</a>)}</div>
        </div>
        <div className="dsec">
          <span className="t-label">Proof</span>
          <div className="dgrid">
            {PROOF_GROUPS.flatMap((g) => g.items).map((it) => (
              <a key={it.href} href={it.href} className="dgrid-item" onClick={close}>
                <NavGlyph name={it.icon} />{it.label}
              </a>
            ))}
          </div>
        </div>
        <div className="dsec">
          <span className="t-label">Wallet</span>
          <div className="dsec-row"><WalletButton /></div>
        </div>
        <div className="dsec">
          <span className="t-label">Network</span>
          <div className="dsec-row"><NetworkPill /><StatusPill /></div>
        </div>
        <div className="dsec">
          <span className="t-label">Theme</span>
          <div className="dsec-row"><ThemeChoices /></div>
        </div>
        <div className="dsec dsec-foot">
          <a href="https://x.com/marquetrade" target="_blank" rel="noreferrer">@marquetrade on X<ArrowUpRight size={13} aria-hidden="true" /></a>
        </div>
      </Drawer>
    </>
  )
}
