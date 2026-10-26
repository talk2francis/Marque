import 'server-only'
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto'

/**
 * A progress link that does not show the wallet (Set and Earn share card). The address is sealed with AES-256-GCM under
 * a key derived from the server secret; the link carries only the sealed bytes, so a reader sees the progress Marque
 * read from chain, never the address. The same address always gives the same link (the IV is derived from it), which
 * keeps a shared link stable. Unsealing fails for anything Marque did not issue.
 */
const secret = () => process.env['MARQUE_ACTION_SECRET'] ?? process.env['MARQUE_CLAIM_SECRET'] ?? ''
const key = () => createHash('sha256').update(`quest-share:v1:${secret()}`).digest()

export function sealAddress(address: string): string | null {
  if (!secret() || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  const raw = Buffer.from(address.slice(2).toLowerCase(), 'hex')
  const iv = createHash('sha256').update(`iv:${secret()}:${address.toLowerCase()}`).digest().subarray(0, 12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(raw), c.final()])
  return Buffer.concat([iv, body, c.getAuthTag()]).toString('base64url')
}

export function unsealAddress(token: string): string | null {
  if (!secret() || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null
  try {
    const b = Buffer.from(token, 'base64url')
    if (b.length !== 12 + 20 + 16) return null
    const d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12))
    d.setAuthTag(b.subarray(32))
    return `0x${Buffer.concat([d.update(b.subarray(12, 32)), d.final()]).toString('hex')}`
  } catch { return null }
}
