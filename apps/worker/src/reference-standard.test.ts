import { describe, expect, it } from 'vitest'
import { declaredReferenceTest } from './reference-standard.js'

const card = (category: string, standard: string | null) => ({ 'x-marque': { referenceAgent: true, category, standard } })

describe('reference conformance selects a declared compatible task', () => {
  it('does not send a quoted-rate task to Tidemark, whose realised-yield engine declares no standard', () => {
    expect(declaredReferenceTest(card('yield', null), 'yield', 'MCS-YIELD-1')).toBeNull()
  })
  it('continues to test a yield engine that implements the quoted-rate task', () => {
    expect(declaredReferenceTest(card('yield', 'MCS-YIELD-1'), 'yield', 'MCS-YIELD-1')).toBe('MCS-YIELD-1')
  })
  it('does not treat a different test or category as compatible', () => {
    expect(declaredReferenceTest(card('yield', 'MCS-HF-1'), 'yield', 'MCS-YIELD-1')).toBeNull()
    expect(declaredReferenceTest(card('health_factor', 'MCS-YIELD-1'), 'yield', 'MCS-YIELD-1')).toBeNull()
  })
  it('fails closed when the card or its declaration is missing or malformed', () => {
    for (const value of [null, [], {}, { 'x-marque': [] }, { 'x-marque': { standard: 'MCS-YIELD-1' } }]) {
      expect(declaredReferenceTest(value, 'yield', 'MCS-YIELD-1')).toBeNull()
    }
  })
  it('does not invent a standard for a category without a published test', () => {
    expect(declaredReferenceTest(card('security', 'MCS-SECURITY-1'), 'security', undefined)).toBeNull()
  })
})
