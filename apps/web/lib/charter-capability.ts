import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env['MARQUE_ACTION_SECRET'] ?? process.env['MARQUE_CLAIM_SECRET'] ?? ''

interface CapabilityPayload {
  k: 'charter-control'
  charterId: string
  agentId: string
  exp: number
}

function mac(body: string): string {
  if (!SECRET) throw new Error('MARQUE_ACTION_SECRET or MARQUE_CLAIM_SECRET is not set')
  return createHmac('sha256', SECRET).update(`charter-control\n${body}`).digest('base64url')
}

export function issueCharterCapability(charterId: string, agentId: string, expiresAt: string): string {
  const payload: CapabilityPayload = {
    k: 'charter-control', charterId, agentId,
    // A capability need not outlive the authority it controls. The small grace
    // permits an expiry-boundary revoke request without granting execution.
    exp: new Date(expiresAt).getTime() + 5 * 60_000,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${mac(body)}`
}

export function verifyCharterCapability(token: string | null | undefined, charterId: string, agentId: string): boolean {
  if (!token) return false
  const [body, signature] = token.split('.')
  if (!body || !signature) return false
  const expected = Buffer.from(mac(body))
  const actual = Buffer.from(signature)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<CapabilityPayload>
    return payload.k === 'charter-control'
      && payload.charterId === charterId
      && payload.agentId === agentId
      && typeof payload.exp === 'number'
      && Date.now() <= payload.exp
  } catch {
    return false
  }
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get('authorization')
  return value?.startsWith('Bearer ') ? value.slice(7).trim() || null : null
}

export const __testonly = { mac }
