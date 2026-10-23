import { prfSalt, accountFromPrf } from './derive.js'
import type { PrivateKeyAccount } from 'viem/accounts'

/**
 * Passkeys with the WebAuthn PRF extension (SPEC-ACCESS 2.2). Browser only. Every call here needs
 * the user's face, finger or PIN at that moment; nothing signs silently. Only public data is kept:
 * { credentialId, address, createdAt, version } in localStorage.
 */

export const UNSUPPORTED_REASON = "This device's passkeys cannot hold a wallet. Use a wallet app, or try Chrome or Safari on a recent phone."

export interface PassRecord { credentialId: string; address: `0x${string}`; createdAt: string; version: 1 }
const KEY = 'marque:pass:v1'

export function loadRecord(): PassRecord | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PassRecord | null
    return r && r.version === 1 && /^0x[0-9a-fA-F]{40}$/.test(r.address) && typeof r.credentialId === 'string' ? r : null
  } catch { return null }
}
export function saveRecord(r: PassRecord): void { try { localStorage.setItem(KEY, JSON.stringify(r)) } catch { /* private window: the Pass still works this session */ } }
export function forgetRecord(): void { try { localStorage.removeItem(KEY) } catch { /* nothing kept */ } }

/** "marque.trade" on the site and its subdomains, so one passkey opens the same wallet everywhere; the host elsewhere (local tests). */
export function rpId(): string {
  const h = location.hostname
  return h === 'marque.trade' || h.endsWith('.marque.trade') ? 'marque.trade' : h
}

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))

/**
 * Whether this browser can hold a Pass. `true` means the browser says PRF is supported; `null` means
 * it cannot say until a passkey is created (the creation result is checked and nothing is kept on
 * failure); `false` hides the option, with UNSUPPORTED_REASON.
 */
export async function prfAvailability(): Promise<boolean | null> {
  if (typeof window === 'undefined' || !('PublicKeyCredential' in window) || !navigator.credentials) return false
  const PKC = window.PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>>; isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> }
  try {
    const caps = await PKC.getClientCapabilities?.()
    if (caps && 'extension:prf' in caps) return Boolean(caps['extension:prf'])
  } catch { /* fall through */ }
  return null
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }

async function getPrf(credentialId: string | null): Promise<{ prf: Uint8Array; credentialId: string }> {
  const salt = await prfSalt()
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: rpId(),
      userVerification: 'required',
      ...(credentialId ? { allowCredentials: [{ type: 'public-key' as const, id: fromB64url(credentialId) }] } : {}),
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('No passkey was chosen.')
  const out = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first
  if (!out) throw new Error(UNSUPPORTED_REASON)
  return { prf: new Uint8Array(out), credentialId: b64url(cred.rawId) }
}

/** Create a new Pass: a discoverable passkey with PRF, then the address it opens. */
export async function createPass(label = 'Marque Pass'): Promise<PassRecord> {
  const salt = await prfSalt()
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: rpId(), name: 'Marque' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: label, displayName: label },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('No passkey was created.')
  const ext = cred.getClientExtensionResults() as PrfResults
  if (ext.prf?.enabled === false) throw new Error(UNSUPPORTED_REASON)
  const credentialId = b64url(cred.rawId)
  // Some platforms return the PRF output at creation; the rest need one assertion.
  const first = ext.prf?.results?.first
  const prf = first ? new Uint8Array(first) : (await getPrf(credentialId)).prf
  const account = await accountFromPrf(prf)
  prf.fill(0)
  const record: PassRecord = { credentialId, address: account.address, createdAt: new Date().toISOString(), version: 1 }
  saveRecord(record)
  return record
}

/** "I already have a Marque Pass": any passkey for this site (discoverable), then its address. */
export async function restorePass(): Promise<PassRecord> {
  const { prf, credentialId } = await getPrf(null)
  const account = await accountFromPrf(prf)
  prf.fill(0)
  const record: PassRecord = { credentialId, address: account.address, createdAt: new Date().toISOString(), version: 1 }
  saveRecord(record)
  return record
}

/** One passkey prompt, then the account for this action. The caller drops it when done. */
export async function unlockPass(record: PassRecord): Promise<PrivateKeyAccount> {
  const { prf } = await getPrf(record.credentialId)
  const account = await accountFromPrf(prf)
  prf.fill(0)
  if (account.address.toLowerCase() !== record.address.toLowerCase()) throw new Error('This passkey opens a different wallet than the one shown. Choose the passkey you created this Pass with.')
  return account
}

/** Export: a fresh passkey prompt, then the hex key, for the caller to show masked and briefly. */
export async function exportKey(record: PassRecord): Promise<`0x${string}`> {
  const { prf } = await getPrf(record.credentialId)
  const { derivePrivateKey } = await import('./derive.js')
  const key = await derivePrivateKey(prf)
  prf.fill(0)
  return key
}
