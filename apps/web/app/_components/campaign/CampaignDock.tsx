'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { CAMPAIGN, clockShort, clockWords } from '@marque/commerce/rules'
import { Dial } from './Dial'
import { useCampaignClock } from './Countdown'
import { RemindMenu, useInPageReminders } from './Reminders'
import { ADDRESS_EVENT, dockPrefs, questAddress, saveDockPrefs, type DockPrefs } from './store'
import styles from './campaign.module.css'

/** What the Dock needs from /api/v1/quest/{address}; the rest of the payload is ignored. */
interface DockQuest {
  excluded: { team: boolean }
  hire: { status: string; distinctAgents: number; required: { agents: number; marketplaces: number }; marketplaces: { named: string[] } }
  build: { agents: Array<{ name: string | null; tokenId: string; observed: number; of: number }> }
  next: Array<{ action: string; label: string; href: string }>
  suggestion: { name: string | null; free: boolean; href: string } | null
}

const HIDDEN_ROUTES = [/^\/quest(\/|$)/, /^\/_ui/]
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * The Campaign Dock (SPEC-ADOPTION 4, DESIGN-V4 2): a small companion in the bottom-right corner
 * with the Set and Earn countdown and, for the connected or last-checked wallet, its progress.
 * Hidden on /quest (the page is the full view), under any open dialog or hire sheet, and when
 * the compare tray would share its edge on a phone.
 */
export function CampaignDock() {
  const pathname = usePathname() ?? '/'
  const clock = useCampaignClock()
  const [address, setAddress] = useState<string | null>(null)
  const [quest, setQuest] = useState<DockQuest | null>(null)
  const [prefs, setPrefs] = useState<DockPrefs | null>(null)
  const [open, setOpen] = useState(false)
  const [covered, setCovered] = useState(false)
  const [tray, setTray] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  useInPageReminders(clock)

  // Address and preferences live in this browser only.
  useEffect(() => {
    setAddress(questAddress())
    const p = dockPrefs()
    const now = Date.now()
    const first = p.autoExpandedAt === 0
    // Desktop opens itself on the first visit and at most once a day; a phone keeps the 40 px bar
    // until it is tapped, so a bottom sheet never covers the page uninvited.
    const wide = window.matchMedia('(min-width: 641px)').matches
    const autoOpen = wide && p.hiddenUntil < now && (first || now - p.autoExpandedAt > 86_400_000)
    const next = autoOpen ? { ...p, autoExpandedAt: now } : p
    if (autoOpen) saveDockPrefs(next)
    setPrefs(next)
    setOpen(autoOpen)
    const onAddr = () => setAddress(questAddress())
    window.addEventListener(ADDRESS_EVENT, onAddr)
    window.addEventListener('storage', onAddr)
    return () => { window.removeEventListener(ADDRESS_EVENT, onAddr); window.removeEventListener('storage', onAddr) }
  }, [])

  // Progress for that address, every five minutes while the page is open.
  useEffect(() => {
    if (!address) { setQuest(null); return }
    let live = true
    const load = () => fetch(`/api/v1/quest/${address}`).then((r) => (r.ok ? r.json() : null)).then((j: DockQuest | null) => { if (live && j) setQuest(j) }).catch(() => undefined)
    void load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5 * 60_000)
    return () => { live = false; clearInterval(t) }
  }, [address])

  // Ambient motion pauses with the tab (invariant 38).
  useEffect(() => {
    const vis = () => { if (document.hidden) document.documentElement.setAttribute('data-hidden', ''); else document.documentElement.removeAttribute('data-hidden') }
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])

  // Never over a dialog, the hire sheet or a full-screen overlay; make room for the compare tray.
  useEffect(() => {
    const check = () => {
      setCovered(Boolean(document.querySelector('[aria-modal="true"], [data-hire-sheet], dialog[open]')))
      setTray(Boolean(document.querySelector('[data-compare-tray]')))
    }
    check()
    const mo = new MutationObserver(check)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'open', 'data-compare-tray'] })
    return () => mo.disconnect()
  }, [])

  const collapse = useCallback(() => {
    setOpen(false)
    setPrefs((p) => { const n = { ...(p ?? dockPrefs()), collapsed: true }; saveDockPrefs(n); return n })
  }, [])
  const hide = useCallback(() => {
    setOpen(false)
    setPrefs((p) => { const n = { ...(p ?? dockPrefs()), collapsed: true, hiddenUntil: Date.now() + 86_400_000 }; saveDockPrefs(n); return n })
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') collapse() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, collapse])

  if (!clock || !prefs) return null
  if (HIDDEN_ROUTES.some((r) => r.test(pathname)) || covered) return null
  if (prefs.hiddenUntil > Date.now()) return null
  if (clock.closed && clock.afterCloseDays >= 7) return null

  const team = quest?.excluded.team ?? false
  const agents = Math.min(quest?.hire.distinctAgents ?? 0, CAMPAIGN.required.agents)
  const best = quest?.build.agents[0] ?? null
  const buildObserved = best?.observed ?? 0
  const hireMet = quest?.hire.status === 'met'
  const warn = clock.under24h
  const pill = clock.closed ? 'Closed. Winners after 13 Nov.' : `Set and Earn · ${clockShort(clock)}${quest && !team ? ` · ${agents}/${CAMPAIGN.required.agents}` : ''}`
  const next = team ? null : quest?.next[0] ?? null
  const suggestion = team ? null : quest?.suggestion ?? null
  const details = address ? `/quest/${address}` : '/quest'

  return (
    <div className={styles.dock} data-open={open || undefined} data-warn={warn || undefined} data-tray={tray || undefined} role="complementary" aria-label="Set and Earn companion">
      {!open ? (
        <button type="button" className={styles.pill} onClick={() => setOpen(true)} aria-expanded="false" aria-label={`${pill}. Open the Set and Earn companion`}>
          <Dial hire={agents} build={buildObserved} warn={warn} team={team} size={28} />
          <span className={styles.pillText}>{pill}</span>
          <span className={styles.pillGlow} aria-hidden="true" />
        </button>
      ) : (
        <div className={styles.panel} ref={panelRef}>
          <span className={styles.aura} aria-hidden="true" />
          <div className={styles.panelHead}>
            <Dial hire={agents} build={buildObserved} days={clock.closed ? null : clock.days} warn={warn} team={team} size={52} />
            <div className={styles.panelTitle}>
              <span className={styles.kicker}>BNB Chain quest</span>
              <strong>Set and Earn</strong>
            </div>
            <button type="button" className={styles.iconBtn} onClick={collapse} aria-label="Collapse"><ChevronDown aria-hidden="true" /></button>
          </div>
          {clock.closed ? <p className={styles.clock}>Closed. BNB Chain announces winners after 13 November.</p> : (
            <div className={styles.face} data-warn={warn || undefined} role="timer" aria-label={`${clockWords(clock)} left. Closes Thursday 5 November, 12:00 UTC`}>
              {([[clock.days, 'days'], [clock.hours, 'hours'], [clock.minutes, 'min']] as const).map(([v, u]) => (
                <span key={u} className={styles.unit}><b>{String(v).padStart(2, '0')}</b><small>{u}</small></span>
              ))}
              <span className={styles.closes}>Closes Thu 5 Nov, 12:00 UTC</span>
            </div>
          )}

          {address && quest ? (
            <>
              <p className={styles.who}>{short(address)}{team ? ' · Team wallet, excluded' : ''}</p>
              <DockRule label="Hire" value={agents} of={CAMPAIGN.required.agents} met={!team && hireMet} />
              <DockRule label="Build" value={buildObserved} of={6} met={!team && buildObserved === 6} sub={best ? (best.name ?? `#${best.tokenId}`) : 'no agent yet'} />
              {next ? <p className={styles.next}>Next: {next.label}</p> : null}
              <div className={styles.actions}>
                {suggestion && next?.action === 'hire' ? <Link className="btn btn--sm btn--primary" href={suggestion.href} scroll={false}>Hire {suggestion.name ?? 'an agent'}{suggestion.free ? ' free' : ''}</Link> : null}
                <Link className="btn btn--sm" href={details}>Details</Link>
              </div>
            </>
          ) : (
            <div className={styles.actions}>
              <Link className="btn btn--sm btn--primary" href={details}>{address ? 'Show progress' : 'Check your progress'}</Link>
            </div>
          )}

          <div className={styles.panelFoot}>
            <RemindMenu address={address} compact />
            <button type="button" className={styles.textBtn} onClick={hide}><X aria-hidden="true" />Hide 24 h</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DockRule({ label, value, of, met, sub }: { label: string; value: number; of: number; met: boolean; sub?: string }) {
  return (
    <div className={styles.rule} data-met={met || undefined}>
      <span className={styles.ruleLabel}>{label}</span>
      <span className={styles.ruleTrack} aria-hidden="true"><span style={{ width: `${(Math.min(value, of) / of) * 100}%` }} /></span>
      <span className={styles.ruleValue}>{value} of {of}</span>
      {sub ? <span className={styles.ruleSub}>{sub}</span> : null}
    </div>
  )
}
