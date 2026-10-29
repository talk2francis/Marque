import { z } from 'zod'

const refreshed = z.object({ refreshed: z.literal(true) })
const registration = z.object({
  chainId: z.union([z.literal(56), z.literal(97)]), tokenId: z.string().regex(/^\d{1,78}$/),
  owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/), stored: z.enum(['onchain', 'hosted']),
  registration: z.record(z.unknown()),
})

/** Only edit the registration returned for the exact identity the owner opened. Preserve all metadata fields. */
export function registrationForEdit(value: unknown, chainId: 56 | 97, tokenId: string) {
  const parsed = registration.safeParse(value)
  if (!parsed.success || !/^\d{1,78}$/.test(tokenId) || parsed.data.chainId !== chainId || BigInt(parsed.data.tokenId) !== BigInt(tokenId)) {
    throw new Error('The registration response did not match this agent. Close the editor and try again.')
  }
  return parsed.data
}

/** A confirmed registry transaction stays successful even when Marque cannot refresh its index yet. */
export async function refreshRegistrationIndex(chainId: 56 | 97, tokenId: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const r = await fetcher('/api/v1/builders/registration/refresh', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chainId, tokenId }), signal: controller.signal,
    })
    return r.ok && refreshed.safeParse(await r.json()).success
  } catch { return false } finally { clearTimeout(timer) }
}
