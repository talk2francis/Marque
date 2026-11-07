import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { imageUrlOf } from './profile-model'
import { ownsAgent, storeImage, type ProfileSession } from './wallet-profile'
import { BANNER_SIZE, type AgentBanner } from './agent-banner-model'

const stamp = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>

/** Public presentation only. Callers choose an honest unavailable state or the existing default header on failure. */
export async function readAgentBanner(agentId: string): Promise<AgentBanner | null> {
  const r = rows(await db().execute(sql`select b.image_id, i.width, i.height, b.set_at
    from agent_banner b join profile_image i on i.id = b.image_id where b.agent_id = ${agentId} limit 1`))[0]
  if (!r || !/^[0-9a-f]{32}$/.test(String(r['image_id']))) return null
  return { url: imageUrlOf(String(r['image_id'])), width: Number(r['width']), height: Number(r['height']), updatedAt: stamp(r['set_at']) }
}

/** No chain write: the session proves the wallet, and ownerOf is read again for every set or clear. */
export async function saveAgentBanner(session: ProfileSession, agentId: string, dataUrl: string | null): Promise<{ ok: true; banner: AgentBanner | null } | { ok: false; status: number; detail: string }> {
  if (!(await ownsAgent(session.address, agentId))) return { ok: false, status: 403, detail: 'Current ownership could not be confirmed. Connect the agent owner and try again.' }
  let imageId: string | null = null
  if (dataUrl !== null) {
    const image = await storeImage(session.address, dataUrl, 'agent-banner')
    if (!image.ok) return { ok: false, status: 400, detail: image.detail }
    imageId = image.id
  }
  const result = rows(await db().execute(sql`insert into agent_banner(agent_id, image_id, owner, proof_message, proof_signature)
    values (${agentId}, ${imageId}, ${session.address}, ${session.message}, ${session.signature})
    on conflict (agent_id) do update set image_id = excluded.image_id, owner = excluded.owner,
      proof_message = excluded.proof_message, proof_signature = excluded.proof_signature, set_at = now() returning set_at`))
  const at = result[0]?.['set_at']
  if (!at || !Number.isFinite(Date.parse(String(at)))) throw new Error('Banner write was not confirmed.')
  return { ok: true, banner: imageId === null ? null : { url: imageUrlOf(imageId), width: BANNER_SIZE.width, height: BANNER_SIZE.height, updatedAt: stamp(at) } }
}
