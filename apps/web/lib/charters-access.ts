import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Who may see Charters before launch (AGENTS.md section 14, launch plan).
 *
 * CHARTERS_PUBLIC=1 opens every charter surface. Until then a surface renders only for a browser holding the
 * preview cookie, which /api/v1/guards/preview sets when it is given CHARTERS_PREVIEW_TOKEN. The cookie carries
 * the token's SHA-256, never the token, and is compared in constant time.
 *
 * One exception keeps C5 (ending always works): a guard's own page stays reachable by direct link whenever its
 * owner is outside Marque's team list, so an owner can always find the End button even with the flag off.
 */
export const PREVIEW_COOKIE = 'mq_charters_preview'
export const PREVIEW_MAX_AGE_S = 7 * 24 * 60 * 60

type Env = Record<string, string | undefined>

export const chartersPublic = (env: Env = process.env): boolean => env['CHARTERS_PUBLIC'] === '1'

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/** The cookie value for a token: its SHA-256 in hex. */
export function previewCookieValue(token: string): string {
  return digest(token).toString('hex')
}

/** A preview token is usable only when one is configured and it is long enough to resist guessing. */
function configuredToken(env: Env): string | null {
  const t = env['CHARTERS_PREVIEW_TOKEN']
  return t && t.length >= 24 ? t : null
}

/** Does `given` equal the configured preview token? Constant time; false when none is configured. */
export function previewTokenMatches(given: string | null | undefined, env: Env = process.env): boolean {
  const want = configuredToken(env)
  if (!want || typeof given !== 'string' || given.length === 0 || given.length > 512) return false
  return timingSafeEqual(digest(given), digest(want))
}

/** Does a cookie value prove the preview? Constant time; false when no token is configured. */
export function previewCookieValid(value: string | null | undefined, env: Env = process.env): boolean {
  const want = configuredToken(env)
  if (!want || typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) return false
  return timingSafeEqual(Buffer.from(value, 'hex'), digest(want))
}

/** Every discovery surface (hub, builder, nav, home band, lists, MCP tools) uses this. */
export function chartersVisible(cookieValue: string | null | undefined, env: Env = process.env): boolean {
  return chartersPublic(env) || previewCookieValid(cookieValue, env)
}

/** A single guard's page and API: visible as above, and always when its owner is not a Marque team wallet. */
export function guardPageVisible(
  cookieValue: string | null | undefined,
  owner: string | null,
  teamWallets: readonly string[],
  env: Env = process.env,
): boolean {
  if (chartersVisible(cookieValue, env)) return true
  if (!owner) return false
  const o = owner.toLowerCase()
  return !teamWallets.some((w) => w.toLowerCase() === o)
}
