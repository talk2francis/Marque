import 'server-only'
import { decodeFunctionData, hexToBytes, parseAbi, parseEventLogs, type Hex, type TransactionReceipt } from 'viem'
import { agenticCommerceAbi, chainClient, fromAny, isSupportedChain, network } from '@marque/commerce'
import { deliveryContent, deliveryDigest, MAX_DELIVERY_BYTES } from './delivery-bytes'
import type { Manifest } from './manifest'

// Read-only ABI for the public kernel entry point, absent from the pinned buyer SDK's limited ABI.
const SUBMIT = parseAbi([
  'function submit(uint256 jobId, bytes32 deliverable, bytes optParams)',
  'event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)',
])

/**
 * The optParams bytes of a submission. A direct kernel call is decoded by its ABI. A seller whose provider is a
 * contract (a forwarder or smart account) calls its own contract, which calls the kernel, so its calldata has another
 * shape (found 4 Nov on mainnet job 57051): then every ABI-encoded bytes value in the calldata is offered, and only
 * when the job id and the deliverable hash both appear in it as words. Whatever is taken from these bytes must still
 * hash to the deliverable on chain, and the transaction must still be the job's submission (readSubmissionManifest).
 */
export function optParamsOf(input: Hex, jobId: string, expectedHash: string): Uint8Array[] {
  try {
    const decoded = decodeFunctionData({ abi: SUBMIT, data: input })
    const [id, hash, data] = decoded.args
    if (decoded.functionName !== 'submit' || id.toString() !== jobId || hash.toLowerCase() !== expectedHash.toLowerCase()) return []
    return [hexToBytes(data)]
  } catch { /* not a direct kernel call: look for the same bytes inside another contract's call */ }
  if (input.length > (MAX_DELIVERY_BYTES + 4096) * 2 + 10) return []
  const bytes = hexToBytes(input).subarray(4)
  const word = (i: number) => bytes.subarray(i, i + 32)
  const asHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  const words = new Set<string>()
  for (let i = 0; i + 32 <= bytes.length; i += 32) words.add(asHex(word(i)))
  if (!words.has(BigInt(jobId).toString(16).padStart(64, '0')) || !words.has(expectedHash.slice(2).toLowerCase())) return []
  const out: Uint8Array[] = []
  for (let i = 0; i + 32 <= bytes.length; i += 32) {
    const len = Number(BigInt('0x' + asHex(word(i))))
    if (len < 2 || len > MAX_DELIVERY_BYTES || i + 32 + len > bytes.length) continue
    const body = bytes.subarray(i + 32, i + 32 + len)
    if (body[0] === 0x7b) out.push(body) // '{': a JSON answer or a JSON pointer to one
  }
  return out
}

const decodeJson = (bytes: Uint8Array): { raw: string; doc: unknown } | null => {
  try { const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); return { raw, doc: JSON.parse(raw) } } catch { return null }
}
const URL_FIELDS = ['deliverable_url', 'deliverableUrl', 'url', 'uri', 'manifest_url', 'manifestUrl', 'result_url', 'resultUrl', 'location']

/** The deliverable_url an SDK seller writes into optParams when the answer itself is stored elsewhere (4 Nov). */
export function submissionUrl(input: Hex, jobId: string, expectedHash: string): string | null {
  for (const bytes of optParamsOf(input, jobId, expectedHash)) {
    if (!bytes.length || bytes.length > 8 * 1024) continue
    const doc = decodeJson(bytes)?.doc as Record<string, unknown> | undefined
    const url = doc && typeof doc === 'object' ? URL_FIELDS.map((f) => doc[f]).find((v) => typeof v === 'string') : null
    if (typeof url === 'string' && /^(https|ipfs|ar):\/\//i.test(url) && url.length < 2048) return url
  }
  return null
}

/** The answer itself carried in optParams, accepted only when its bytes hash to the deliverable on chain. */
export function submissionPayload(
  input: Hex,
  jobId: string,
  expectedHash: string,
): Manifest | null {
  if (input.length > (MAX_DELIVERY_BYTES + 4096) * 2 + 10) return null
  for (const bytes of optParamsOf(input, jobId, expectedHash)) {
    if (bytes.length > MAX_DELIVERY_BYTES) continue
    const parsed = decodeJson(bytes)
    if (!parsed) continue
    const content = deliveryContent(parsed.doc)
    const digest = deliveryDigest(parsed.raw, expectedHash)
    if (content && digest.matches === true) return { raw: parsed.raw, ...digest, content, pretty: JSON.stringify(parsed.doc, null, 2) }
  }
  return null
}

const FOUND = new Map<string, { until: number; manifest: Manifest }>()
/**
 * Whether this transaction is the job's successful submission. Through its receipt and the escrow's JobSubmitted event
 * when the node still has them; BSC testnet nodes keep receipts and logs for older blocks only briefly (found 4 Nov,
 * every practice job older than a few days was unread), so otherwise through the job as the escrow holds it now: the
 * same provider and the same deliverable hash, set once by the only call that can set it, which this transaction is.
 */
async function isSubmission(client: ReturnType<typeof chainClient>, tx: Awaited<ReturnType<ReturnType<typeof chainClient>['getTransaction']>>, receipt: TransactionReceipt | null, escrow: Hex, jobId: string, hash: string, provider: string, direct: boolean): Promise<boolean> {
  if (receipt) {
    if (receipt.status !== 'success' || !same(receipt.transactionHash, tx.hash) || tx.blockHash !== receipt.blockHash || (direct && !same(receipt.to, escrow))) return false
    return parseEventLogs({ abi: SUBMIT, eventName: 'JobSubmitted', logs: receipt.logs.filter((l) => same(l.address, escrow)), strict: true })
      .some((e) => e.args.jobId.toString() === jobId && same(e.args.provider, provider) && same(e.args.deliverable, hash))
  }
  const job = await client.readContract({ address: escrow, abi: agenticCommerceAbi, functionName: 'getJob', args: [BigInt(jobId)] }).catch(() => null) as
    { provider: string; deliverable: string; submittedAt: bigint } | null
  return Boolean(job && same(job.provider, provider) && same(job.deliverable, hash) && job.submittedAt > 0n)
}

const same = (a: string | null | undefined, b: string) => a?.toLowerCase() === b.toLowerCase()

/** Public answer bytes in the successful submit transaction, tied to the exact canonical escrow event. No task is run. */
export async function readSubmissionManifest(
  chainId: number,
  jobId: string,
  hash: string,
  provider: string,
  txHash: string,
  /** Reads a URL the submission names (manifest.ts readManifest); the result must still match the hash on chain. */
  follow?: (url: string) => Promise<Manifest | null>,
): Promise<Manifest | null> {
  if (
    !isSupportedChain(chainId) ||
    !/^\d{1,30}$/.test(jobId) ||
    !/^0x[0-9a-fA-F]{64}$/.test(hash) ||
    !/^0x[0-9a-fA-F]{64}$/.test(txHash) ||
    !/^0x[0-9a-fA-F]{40}$/.test(provider)
  )
    return null
  const key = `${chainId}:${jobId}:${hash.toLowerCase()}:${provider.toLowerCase()}:${txHash.toLowerCase()}`
  const known = FOUND.get(key)
  if (known && known.until > Date.now()) return known.manifest
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const escrow = network(chainId).commerce as Hex
    const result = await Promise.race([
      fromAny(chainId, async client => {
        const [tx, receipt] = await Promise.all([
          client.getTransaction({ hash: txHash as Hex }),
          client.getTransactionReceipt({ hash: txHash as Hex }).catch(() => null),
        ])
        if ((tx.chainId !== undefined && tx.chainId !== chainId) || !same(tx.hash, txHash) || tx.blockHash === null) return null
        // A direct call comes from the provider to the kernel; a relayed one (the provider is a contract) must show the
        // kernel's own JobSubmitted event, or the job as the kernel holds it, naming this provider and this hash.
        const direct = same(tx.to, escrow) && same(tx.from, provider)
        if (same(tx.to, escrow) && !direct) return null
        return (await isSubmission(client, tx, receipt, escrow, jobId, hash, provider, direct)) ? tx : null
      }, tx => tx !== null, 150),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 8000)
        timer.unref?.()
      }),
    ])
    if (!result) return null
    const tx = result
    let manifest = submissionPayload(tx.input, jobId, hash)
    if (manifest) {
      manifest.url = `${network(chainId).explorer}/tx/${txHash}`
      manifest.source = 'submission_calldata'
    } else {
      // The verified submission names where its answer is stored: read it there, accepted only on a matching hash.
      const url = follow ? submissionUrl(tx.input, jobId, hash) : null
      const read = url ? await follow!(url) : null
      if (!read || read.matches !== true) return null
      manifest = read
    }
    FOUND.set(key, { until: Date.now() + 5 * 60_000, manifest })
    if (FOUND.size > 64) FOUND.delete(FOUND.keys().next().value!)
    return manifest
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
