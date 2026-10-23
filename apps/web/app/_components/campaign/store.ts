'use client'
/**
 * Per-viewer conveniences for the quest companion, in localStorage (every read and write is
 * wrapped: a private window or blocked storage must never break the page).
 *   address   the connected or last-checked wallet the Dock follows
 *   dock      collapsed / hidden-until / last auto-expand
 *   notify    "Remind me here" opt-in and which marks already fired
 *   declared  the "I registered this wallet" tick, per address (Declared, never green)
 */
const KEY = { address: 'marque:quest:address', dock: 'marque:quest:dock', notify: 'marque:quest:notify', declared: 'marque:quest:declared' }
export const ADDRESS_EVENT = 'marque:quest-address'
const ADDR = /^0x[0-9a-fA-F]{40}$/

function read<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function write(k: string, v: unknown): void {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable: the page still works */ }
}

export function questAddress(): string | null {
  const v = read<string | null>(KEY.address, null)
  return v && ADDR.test(v) ? v : null
}
export function rememberQuestAddress(address: string): void {
  if (!ADDR.test(address) || questAddress()?.toLowerCase() === address.toLowerCase()) return
  write(KEY.address, address)
  try { window.dispatchEvent(new CustomEvent(ADDRESS_EVENT, { detail: address })) } catch { /* no window */ }
}

export interface DockPrefs { collapsed: boolean; hiddenUntil: number; autoExpandedAt: number }
export const dockPrefs = (): DockPrefs => read<DockPrefs>(KEY.dock, { collapsed: false, hiddenUntil: 0, autoExpandedAt: 0 })
export const saveDockPrefs = (p: DockPrefs): void => write(KEY.dock, p)

export interface NotifyPrefs { on: boolean; fired: string[] }
export const notifyPrefs = (): NotifyPrefs => read<NotifyPrefs>(KEY.notify, { on: false, fired: [] })
export const saveNotifyPrefs = (p: NotifyPrefs): void => write(KEY.notify, p)

export const declaredFor = (address: string): boolean => read<string[]>(KEY.declared, []).includes(address.toLowerCase())
export function setDeclared(address: string, on: boolean): void {
  const list = new Set(read<string[]>(KEY.declared, []))
  if (on) list.add(address.toLowerCase()); else list.delete(address.toLowerCase())
  write(KEY.declared, [...list])
}

/** The deadline marks shared by the calendar file, the in-page reminder and the bot. */
export const REMIND_MARKS: Array<{ key: string; beforeMs: number; text: string }> = [
  { key: 'r7d', beforeMs: 7 * 86_400_000, text: 'Set and Earn closes in 7 days.' },
  { key: 'r2d', beforeMs: 2 * 86_400_000, text: 'Set and Earn closes in 2 days.' },
  { key: 'r1d', beforeMs: 86_400_000, text: 'Set and Earn closes in 24 hours.' },
  { key: 'r3h', beforeMs: 3 * 3_600_000, text: 'Set and Earn closes in 3 hours.' },
]
export const TELEGRAM_BOT = 'MarqueTradeBot'
