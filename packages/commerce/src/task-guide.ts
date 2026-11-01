/** Seller-declared guidance, never a Marque guarantee or an executable schema. */
export interface PaidTaskGuide {
  skillId: string
  title: string
  description: string | null
  example: string
  inputs: Array<{ name: string; hint: string }>
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max: number): string | null => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null

/** Only an unambiguous, explicitly escrow-enabled work skill can replace the category form. */
export function paidTaskGuide(manifest: unknown): PaidTaskGuide | null {
  if (!object(manifest) || !Array.isArray(manifest['skills']) || manifest['skills'].length > 100) return null
  const work = manifest['skills'].filter((s): s is Record<string, unknown> => object(s) && s['escrow'] === true)
  if (work.length !== 1) return null
  const skill = work[0]!
  const skillId = text(skill['id'], 120)
  const title = text(skill['name'], 160)
  const example = Array.isArray(skill['examples']) ? skill['examples'].map(v => text(v, 1200)).find(Boolean) : null
  if (!skillId || !title || !example) return null
  const inputs = object(skill['inputs']) ? Object.entries(skill['inputs']).slice(0, 12).flatMap(([k, v]) => {
    const name = text(k, 80), hint = text(v, 240)
    return name && hint ? [{ name, hint }] : []
  }) : []
  return { skillId, title, example, inputs, description: text(skill['description'], 600) }
}
