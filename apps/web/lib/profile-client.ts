'use client'
import { useCallback, useEffect, useState } from 'react'
import { PREFS_EVENT, PREFS_KEY, storeMode } from './theme'
import { defaultProfile, type Prefs, type ProfileInput, type WalletProfile } from './profile-model'

/**
 * Profiles in the browser (28 Oct): the signed session, the API calls, and the preferences applied to the page.
 *
 * The session token is kept in this browser per address (a convenience: losing it only means signing once more).
 * Preferences are cached here too, so the page starts the way its owner likes before any request.
 */
export const PROFILE_EVENT = 'marque:profile'
const sessionKey = (a: string) => `marque:profile-session:${a.toLowerCase()}`

interface StoredSession { token: string; expiresAt: string }
export function readSession(address: string): string | null {
  try {
    const s = JSON.parse(localStorage.getItem(sessionKey(address)) ?? 'null') as StoredSession | null
    return s && Date.parse(s.expiresAt) > Date.now() + 60_000 ? s.token : null
  } catch { return null }
}
function writeSession(address: string, s: StoredSession | null) {
  try { if (s) localStorage.setItem(sessionKey(address), JSON.stringify(s)); else localStorage.removeItem(sessionKey(address)) } catch { /* this page only */ }
}

export class ProfileError extends Error { constructor(message: string, readonly status: number) { super(message) } }
async function call<T>(path: string, init: RequestInit & { session?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.session) headers['authorization'] = `Bearer ${init.session}`
  const r = await fetch(path, { ...init, headers, cache: 'no-store' })
  const j = await r.json().catch(() => ({})) as Record<string, unknown>
  if (!r.ok) throw new ProfileError(String(j['detail'] ?? 'Something went wrong. Try again.'), r.status)
  return j as T
}

/** Sign once with the wallet (no transaction, no gas): the session lasts seven days in this browser. */
export async function signInProfile(address: string, sign: (message: string) => Promise<string>): Promise<string> {
  const ch = await call<{ message: string; token: string }>('/api/v1/me/profile/challenge', { method: 'POST', body: JSON.stringify({ address }) })
  const signature = await sign(ch.message)
  const s = await call<{ session: string; expiresAt: string }>('/api/v1/me/profile/session', { method: 'POST', body: JSON.stringify({ token: ch.token, message: ch.message, signature }) })
  writeSession(address, { token: s.session, expiresAt: s.expiresAt })
  return s.session
}
export function signOutProfile(address: string) { writeSession(address, null) }

export async function fetchProfile(address: string): Promise<{ profile: WalletProfile; signedIn: boolean }> {
  const session = readSession(address)
  const r = await call<{ profile: WalletProfile; signedIn: boolean }>(`/api/v1/me/profile/${address}`, { session })
  // A token the server no longer accepts (expired, or the secret changed) is dropped, so the next edit signs again.
  if (session && !r.signedIn) writeSession(address, null)
  return r
}

export async function saveProfile(address: string, input: ProfileInput): Promise<WalletProfile> {
  const r = await call<{ profile: WalletProfile }>('/api/v1/me/profile', { method: 'PUT', body: JSON.stringify(input), session: readSession(address) })
  announce(address)
  return r.profile
}

export async function deleteProfile(address: string): Promise<void> {
  await call('/api/v1/me/profile', { method: 'DELETE', session: readSession(address) })
  announce(address)
}

export async function uploadImage(address: string, dataUrl: string): Promise<{ id: string; url: string }> {
  return call<{ id: string; url: string }>('/api/v1/me/image', { method: 'POST', body: JSON.stringify({ dataUrl }), session: readSession(address) })
}

export async function setAgentPortrait(address: string, agentId: string, image: string | null): Promise<void> {
  await call('/api/v1/me/portrait', { method: 'PUT', body: JSON.stringify({ agentId, image }), session: readSession(address) })
}

function announce(address: string) { window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: address.toLowerCase() })) }

/* ------------------------------------------------------------------ preferences */

export function readLocalPrefs(): Partial<Prefs> | null {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null } catch { return null }
}

/** Applies the owner's preferences to this page and remembers them in this browser. */
export function applyPrefs(prefs: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* this page only */ }
  const root = document.documentElement
  if (prefs.motion === 'calm') root.setAttribute('data-motion', 'calm'); else root.removeAttribute('data-motion')
  if (prefs.ambient === false) root.setAttribute('data-ambient', 'off'); else root.removeAttribute('data-ambient')
  const current = (() => { try { return localStorage.getItem('marque-theme') } catch { return null } })()
  if (current !== prefs.theme) storeMode(prefs.theme)
  window.dispatchEvent(new Event(PREFS_EVENT))
}

/* ------------------------------------------------------------------ hook */

/** The profile for an address, refreshed whenever this browser saves one. Defaults render at once, never a blank. */
export function useWalletProfile(address: string | null | undefined): { profile: WalletProfile | null; signedIn: boolean; reload: () => void } {
  const [state, setState] = useState<{ profile: WalletProfile | null; signedIn: boolean }>({ profile: address ? defaultProfile(address) : null, signedIn: false })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (!address) { setState({ profile: null, signedIn: false }); return }
    let live = true
    setState((s) => (s.profile?.address === address.toLowerCase() ? s : { profile: defaultProfile(address), signedIn: false }))
    fetchProfile(address).then((r) => { if (live) setState(r) }).catch(() => { /* the defaults stay */ })
    return () => { live = false }
  }, [address, tick])
  useEffect(() => {
    const on = (e: Event) => { if (!address || (e as CustomEvent<string>).detail === address.toLowerCase()) reload() }
    window.addEventListener(PROFILE_EVENT, on)
    return () => window.removeEventListener(PROFILE_EVENT, on)
  }, [address, reload])
  return { ...state, reload }
}
