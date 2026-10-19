import type { TestId } from '@marque/conformance'

/** A category alone does not declare that an engine implements its MCS task. */
export function declaredReferenceTest(card: unknown, category: string, expected: TestId | undefined): TestId | null {
  if (!expected || !card || typeof card !== 'object' || Array.isArray(card)) return null
  const declaration = (card as Record<string, unknown>)['x-marque']
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) return null
  const meta = declaration as Record<string, unknown>
  return meta['referenceAgent'] === true && meta['category'] === category && meta['standard'] === expected ? expected : null
}
