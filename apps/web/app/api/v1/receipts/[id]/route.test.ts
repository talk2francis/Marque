import { beforeEach, describe, expect, it, vi } from 'vitest'
const { readReceipt } = vi.hoisted(() => ({ readReceipt: vi.fn() }))
vi.mock('../../../../../lib/runs', () => ({ readReceipt }))
import { GET } from './route'
import { receiptHash, type Receipt } from '@marque/execution'
import vectors from '../../../../../../../packages/execution/src/receipt-vectors.fixture.json'

const invoke = () => GET(new Request('https://candidate.invalid/api/v1/receipts/synthetic'), { params: Promise.resolve({ id: 'synthetic' }) })
beforeEach(() => readReceipt.mockReset())

describe('receipt GET additive integrity projection', () => {
  it('preserves every legacy field, body and hash without any writes or fetch', async () => {
    const receipt = structuredClone(vectors[1]!.receipt) as Receipt
    const row = { id: 'synthetic', hash: receiptHash(receipt), body: receipt, anchorTxHash: '0x' + 'a'.repeat(64), anchorBlock: '200', issuedAt: '2026-01-01T00:00:01.000Z' }
    readReceipt.mockResolvedValue(row)
    const before = JSON.stringify(row)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      for (let i = 0; i < 2; i++) {
        const response = await invoke()
        expect(response.status).toBe(200)
        const { evidence, ...legacy } = await response.json()
        expect(legacy).toEqual({ id: row.id, hash: row.hash, receipt, anchorTxHash: row.anchorTxHash, anchorBlock: row.anchorBlock, issuedAt: row.issuedAt })
        expect(evidence).toMatchObject({ version: 1, digest: { status: 'MATCH', algorithm: 'SHA-256' }, execution: { chainId: 56, verification: 'NOT_CHECKED' }, quality: { testVersion: null, verification: 'NOT_CHECKED' }, anchor: { chainId: null, verification: 'NOT_CHECKED' }, independence: 'UNKNOWN' })
      }
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(JSON.stringify(row)).toBe(before)
    } finally { fetchSpy.mockRestore() }
  })
  it('does not validate unrelated anchor references by copying execution chain/block', async () => {
    const body = structuredClone(vectors[1]!.receipt)
    readReceipt.mockResolvedValue({ id: 'synthetic', hash: vectors[1]!.hash, body, anchorTxHash: 'unrelated', anchorBlock: '999999999', issuedAt: body.issuedAt })
    const { evidence } = await (await invoke()).json()
    expect(evidence.digest.status).toBe('MATCH')
    expect(evidence.anchor).toMatchObject({ chainId: null, blockNumber: '999999999', blockHash: null, verification: 'NOT_CHECKED' })
  })
  it('reports tampering without rewriting the historical payload or promoting truth', async () => {
    const body = structuredClone(vectors[1]!.receipt)
    body.commercial.settled = true
    readReceipt.mockResolvedValue({ id: 'synthetic', hash: vectors[1]!.hash, body, anchorTxHash: null, anchorBlock: null, issuedAt: body.issuedAt })
    const data = await (await invoke()).json()
    expect(data.evidence.digest.status).toBe('MISMATCH')
    expect(data.receipt.commercial.settled).toBe(true)
    expect(data.evidence.execution.verification).toBe('NOT_CHECKED')
  })
  it('returns invalid and unknown versions safely, retaining original data', async () => {
    for (const body of [{ version: '0' }, { version: '2', execution: null }]) {
      readReceipt.mockResolvedValue({ id: 'synthetic', hash: vectors[1]!.hash, body, anchorTxHash: null, anchorBlock: null })
      const data = await (await invoke()).json()
      expect(data.receipt).toEqual(body)
      expect(data.evidence.digest.status).toBe(body.version === '0' ? 'UNSUPPORTED_VERSION' : 'INVALID_RECEIPT')
    }
  })
  it('keeps the existing 404 response', async () => {
    readReceipt.mockResolvedValue(null)
    const response = await invoke()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'no such receipt' })
  })
})
