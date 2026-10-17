/** Browser-safe entry: GET discovery, pure unsigned plan, captured-response inspection. No signer or automatic retry. */
export { readMachineCatalog, CatalogReadError, machineCatalogSchema, catalogQuerySchema, type CatalogQuery, type MachineCatalog } from './catalog-client.js'
export { buildHirePlan, hirePlanInputSchema, type HirePlan } from './hire-plan.js'
export { inspectPaymentChallenge, type ExpectedPaymentTerms } from '@marque/probe/payment-challenge'
