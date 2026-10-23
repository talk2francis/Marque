'use client'
import type { PrivateKeyAccount } from 'viem/accounts'
import type { ConfirmRequest, PassRecord } from '@marque/pass'

/**
 * The seam between the Marque Pass provider (which must not render anything) and the dialogs
 * (PassHost), which own every passkey prompt so it always runs inside a user's click.
 *
 * The unlocked account lives here, in memory only, for at most UNLOCK_MS after the passkey prompt
 * that produced it, so the five steps of one hire need one prompt; each step still waits for an
 * explicit Confirm. It is dropped on Lock, when the tab is hidden, and when the window ends.
 */
export const UNLOCK_MS = 120_000

export interface PassHostHandlers {
  onboard: () => Promise<PassRecord>
  confirm: (req: ConfirmRequest) => Promise<PrivateKeyAccount>
  exportKey: () => Promise<void>
  about: () => void
}

let host: PassHostHandlers | null = null
let unlocked: { account: PrivateKeyAccount; until: number } | null = null
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

export function registerHost(h: PassHostHandlers): () => void {
  if (host) return () => undefined
  host = h
  return () => { if (host === h) host = null }
}

const needHost = () => { if (!host) throw Object.assign(new Error('Marque Pass is not ready on this page. Reload and try again.'), { code: 4900 }); return host }
export const passBridge = {
  onboard: () => needHost().onboard(),
  confirm: (req: ConfirmRequest) => needHost().confirm(req),
  exportKey: () => needHost().exportKey(),
  about: () => needHost().about(),
}

export function heldAccount(): PrivateKeyAccount | null {
  if (unlocked && Date.now() < unlocked.until) return unlocked.account
  unlocked = null
  return null
}
export function holdAccount(account: PrivateKeyAccount): void {
  unlocked = { account, until: Date.now() + UNLOCK_MS }
  if (timer) clearTimeout(timer)
  timer = setTimeout(lock, UNLOCK_MS)
  for (const l of listeners) l()
}
export function lock(): void {
  unlocked = null
  if (timer) clearTimeout(timer)
  timer = null
  for (const l of listeners) l()
}
export function onLockChange(l: () => void): () => void { listeners.add(l); return () => listeners.delete(l) }

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) lock() })
