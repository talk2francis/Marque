/** Node-only offline receipt checks. Hash agreement is not issuer, payment, quality or authority proof. */
export { inspectReceiptBundle, buildReceiptBundle, receiptBindings } from './portable-receipt.js'
export { verifyReceiptIntegrity, RECEIPT_DIGEST_CONTRACT } from './receipt-integrity.js'
