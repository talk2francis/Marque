import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { imageUrlOf } from './profile-model'

/**
 * Portraits an agent's owner set on Marque (28 Oct), by agent id. The owner proved control with a signed session and
 * an on-chain ownerOf read at the time. Shown in place of the registry image on Marque only; the hosted URL can be put
 * in the registration file to carry it everywhere. Before migration 0028 there are none and nothing changes.
 */
export async function agentPortraits(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  try {
    const res = await db().execute(sql`select agent_id, image_id from agent_portrait where agent_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    const list = ((res as unknown as { rows?: unknown[] }).rows ?? res) as Array<Record<string, unknown>>
    for (const r of list) out.set(String(r['agent_id']), imageUrlOf(String(r['image_id'])))
  } catch { /* no table yet, or a slow read: the registry image shows as before */ }
  return out
}
