'use client'
import { useEffect, useRef, useState } from 'react'
import { Bell, CalendarPlus, ChevronDown, Send } from 'lucide-react'
import { campaignEndMs, type CampaignClock } from '@marque/commerce/client'
import { notifyPrefs, saveNotifyPrefs, REMIND_MARKS, TELEGRAM_BOT } from './store'
import styles from './campaign.module.css'

/**
 * Reminders (SPEC-ADOPTION 5): a calendar file (nothing kept), a browser notification while
 * Marque is open (nothing on the server), and @MarqueTradeBot on Telegram (chat id and address,
 * deleted on /stop). No email.
 */
const CAL = '/quest/calendar.ics'
const telegramHref = (address: string | null) => `https://t.me/${TELEGRAM_BOT}${address ? `?start=${address}` : ''}`

function notificationsSupported(): boolean {
  try { return typeof window !== 'undefined' && 'Notification' in window } catch { return false }
}

/** Ask once, then mark every reminder that has already passed as fired, so none arrives late. */
async function enableInPage(): Promise<'on' | 'denied' | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (p !== 'granted') return 'denied'
  const now = Date.now()
  saveNotifyPrefs({ on: true, fired: REMIND_MARKS.filter((m) => now >= campaignEndMs - m.beforeMs).map((m) => m.key) })
  return 'on'
}

/** While any Marque page is open: fire each reminder mark once, at its time. */
export function useInPageReminders(clock: CampaignClock | null): void {
  useEffect(() => {
    if (!clock || !notificationsSupported()) return
    const prefs = notifyPrefs()
    if (!prefs.on || Notification.permission !== 'granted') return
    const now = Date.now()
    const due = REMIND_MARKS.filter((m) => now >= campaignEndMs - m.beforeMs && !prefs.fired.includes(m.key))
    if (!due.length) return
    const latest = due[due.length - 1]!
    try { new Notification('Marque', { body: `${latest.text} Thu 5 Nov, 12:00 UTC.`, tag: `marque-${latest.key}` }) } catch { /* some browsers need a service worker */ }
    saveNotifyPrefs({ on: true, fired: [...prefs.fired, ...due.map((m) => m.key)] })
  }, [clock])
}

export function RemindMenu({ address, compact = false }: { address: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'on' | 'denied' | 'unsupported'>('idle')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try { if (notifyPrefs().on && notificationsSupported() && Notification.permission === 'granted') setState('on') } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className={styles.remind} ref={ref}>
      <button type="button" className={compact ? styles.textBtn : 'btn btn--sm'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell aria-hidden="true" />Remind me<ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.remindMenu} role="menu">
          <a role="menuitem" href={CAL} download="set-and-earn.ics" onClick={() => setOpen(false)}><CalendarPlus aria-hidden="true" />Add to calendar<span>7 days, 2 days, 1 day and 3 hours before</span></a>
          <button role="menuitem" type="button" disabled={state === 'on' || state === 'unsupported'} onClick={async () => setState(await enableInPage())}>
            <Bell aria-hidden="true" />{state === 'on' ? 'Reminders on in this browser' : 'Remind me here'}
            <span>{state === 'denied' ? 'Notifications are blocked for marque.trade in this browser.' : state === 'unsupported' ? 'This browser does not show notifications.' : 'While Marque is open in this browser'}</span>
          </button>
          <a role="menuitem" href={telegramHref(address)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}><Send aria-hidden="true" />Telegram<span>@{TELEGRAM_BOT}: reminders and job updates. /stop deletes them.</span></a>
        </div>
      ) : null}
    </div>
  )
}

/** The quest page's row: the same three, side by side. */
export function RemindersRow({ address }: { address: string }) {
  const [state, setState] = useState<'idle' | 'on' | 'denied' | 'unsupported'>('idle')
  useEffect(() => {
    try { if (notifyPrefs().on && notificationsSupported() && Notification.permission === 'granted') setState('on') } catch { /* ignore */ }
  }, [])
  return (
    <div className={styles.remindRow}>
      <a className="btn btn--sm" href={CAL} download="set-and-earn.ics"><CalendarPlus aria-hidden="true" />Add to calendar</a>
      <button type="button" className="btn btn--sm" disabled={state === 'on' || state === 'unsupported'} onClick={async () => setState(await enableInPage())}>
        <Bell aria-hidden="true" />{state === 'on' ? 'Reminders on here' : 'Remind me here'}
      </button>
      <a className="btn btn--sm" href={telegramHref(address)} target="_blank" rel="noreferrer"><Send aria-hidden="true" />Telegram</a>
      {state === 'denied' ? <span className={styles.muted}>Notifications are blocked for marque.trade in this browser.</span> : null}
    </div>
  )
}
