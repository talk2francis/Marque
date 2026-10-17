import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({ledger:vi.fn(),seals:vi.fn(),outcomes:vi.fn()}))
vi.mock('../../../../lib/ledger',()=>({readLedger:mocks.ledger,readSeals:mocks.seals}))
vi.mock('../../../../lib/ledger-outcomes',()=>({readLedgerOutcomeReferences:mocks.outcomes}))
import { GET } from './route'
beforeEach(()=>vi.resetAllMocks())
it('preserves the default Ledger body and does not compute opt-in references',async()=>{
  mocks.ledger.mockResolvedValue([{id:'existing'}]);mocks.seals.mockResolvedValue([])
  expect(await (await GET(new Request('https://candidate.invalid/api/v1/ledger'))).json()).toEqual({benchmarks:[{id:'existing'}],seals:[]})
  expect(mocks.outcomes).not.toHaveBeenCalled()
})
it('opt-in references use a separate versioned body and no-store, without reading full raw observations',async()=>{
  const body={schema:'marque.ledger-outcome-references.v1',state:'UNAVAILABLE',verifiedReceiptLinkedOutcome:null}
  mocks.outcomes.mockResolvedValue(body)
  const res=await GET(new Request('https://candidate.invalid/api/v1/ledger?format=outcomes'))
  expect(await res.json()).toEqual(body);expect(res.headers.get('cache-control')).toBe('no-store')
  expect(mocks.ledger).not.toHaveBeenCalled();expect(mocks.seals).not.toHaveBeenCalled()
})
it('timeout is unavailable, never an empty success',async()=>{
  mocks.outcomes.mockRejectedValue(new Error('synthetic timeout'))
  const res=await GET(new Request('https://candidate.invalid/api/v1/ledger?format=outcomes'))
  expect(res.status).toBe(503);expect(await res.json()).toEqual({error:'ledger_outcomes_unavailable'})
})
