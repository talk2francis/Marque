import { readMachineCatalog, buildHirePlan, inspectPaymentChallenge, type CatalogQuery } from '@marque/commerce/read-only'

/** Call on an explicit user action. One request, no automatic retries or paging. Browser CORS still applies. */
export const browse = (base: string, query: CatalogQuery = {}) => readMachineCatalog(base, { limit: 10, ...query }, { timeoutMs: 15_000 })
/** Caller supplies separately reviewed expected terms; never copy them blindly from the same server response. */
export const unsignedPlan = (savedInput: unknown) => buildHirePlan(savedInput)
/** Captured response only. Does not visit an agent URL. */
export const inspectCapturedPayment = (capture: unknown) => inspectPaymentChallenge(capture)
