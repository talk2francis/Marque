import { readMachineCatalog, buildHirePlan, inspectPaymentChallenge, CatalogReadError } from '@marque/commerce/read-only'
import { inspectReceiptBundle } from '@marque/execution/evidence'
import { inspectCommerceContent } from '@marque/commerce/evidence'
import { open } from 'node:fs/promises'

async function jsonFile(path: string | undefined): Promise<unknown> {
  if (!path) throw new Error('Supply an existing captured JSON file.')
  const file = await open(path, 'r')
  try {
    const metadata = await file.stat()
    if (!metadata.isFile() || metadata.size > 2 * 1024 * 1024) throw new Error('File budget exceeded.')
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, null)
      if (!read.bytesRead) break
      length += read.bytesRead
    }
    if (length > 2 * 1024 * 1024) throw new Error('File budget exceeded.')
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))) as unknown
  } finally { await file.close() }
}
async function main() {
  const [operation, input] = process.argv.slice(2)
  switch (operation) {
    case 'catalog':
      if (!input) throw new Error('Supply the reviewed candidate base URL; no default network request is made.')
      return readMachineCatalog(input, { tab: 'tested', limit: 10 }, { timeoutMs: 15_000 })
    case 'receipt': return inspectReceiptBundle(await jsonFile(input))
    case 'job': return inspectCommerceContent(await jsonFile(input))
    case 'plan': return buildHirePlan(await jsonFile(input))
    case 'payment-capture': return inspectPaymentChallenge(await jsonFile(input))
    default: throw new Error('Choose catalog, receipt, job, plan or payment-capture. Only catalog makes one GET.')
  }
}
main().then(result => {
  console.log(JSON.stringify(result, null, 2))
  if (result && typeof result === 'object' && (('ok' in result && result.ok === false) || ('state' in result && ['INVALID', 'FAILED', 'UNSUPPORTED', 'UNAVAILABLE'].includes(String(result.state))))) process.exitCode = 2
}).catch(error => {
  console.error(JSON.stringify(error instanceof CatalogReadError ? { error: error.code, retryAfterSeconds: error.retryAfterSeconds, automaticRetry: false } : { error: 'invalid_input_or_read_failure' }))
  process.exitCode = 1
})
