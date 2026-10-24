import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * A quote held for a human to sign later (MCP plan_hire, SPEC-ACCESS 3.2): the exact PublicQuote and task, sealed with
 * an HMAC so the hire sheet can adopt it as the Tender does. The quote's own expiry still applies; the seal only
 * proves Marque issued this pairing of quote and task.
 */
const SECRET = process.env['MARQUE_CLAIM_SECRET'] ?? ''
const mac = (b: string) => createHmac('sha256', SECRET).update(`held-quote-v1\n${b}`).digest('base64url')

export function sealHeld(v: { quote: unknown; task: string }): string {
  if (!SECRET) throw new Error('MARQUE_CLAIM_SECRET is not set')
  const b = Buffer.from(JSON.stringify(v)).toString('base64url')
  return `${b}.${mac(b)}`
}

export function openHeld(s: string): { quote: { expiresAt: number; agentId: string }; task: string } | null {
  const [b, sig] = s.split('.')
  if (!b || !sig || !SECRET) return null
  const want = Buffer.from(mac(b)), got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try { return JSON.parse(Buffer.from(b, 'base64url').toString('utf8')) } catch { return null }
}
