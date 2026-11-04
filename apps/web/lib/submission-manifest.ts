import 'server-only'
import { decodeFunctionData, hexToBytes, parseAbi, parseEventLogs, type Hex } from 'viem'
import { chainClient, isSupportedChain, network } from '@marque/commerce'
import { deliveryContent, deliveryDigest, MAX_DELIVERY_BYTES } from './delivery-bytes'
import type { Manifest } from './manifest'

// Read-only ABI for the public kernel entry point, absent from the pinned buyer SDK's limited ABI.
const SUBMIT = parseAbi([
  'function submit(uint256 jobId, bytes32 deliverable, bytes optParams)',
  'event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)',
])

/** Decode a direct kernel submission only. A matching digest is necessary but not sufficient; the receipt is checked too. */
/** The deliverable_url an SDK seller writes into optParams when the answer itself is stored elsewhere (4 Nov). */
export function submissionUrl(input: Hex, jobId: string, expectedHash: string): string | null {
  try {
    const decoded = decodeFunctionData({ abi: SUBMIT, data: input })
    const [id, hash, data] = decoded.args
    if (decoded.functionName !== 'submit' || id.toString() !== jobId || hash.toLowerCase() !== expectedHash.toLowerCase()) return null
    const bytes = hexToBytes(data)
    if (!bytes.length || bytes.length > 8 * 1024) return null
    const doc = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)) as Record<string, unknown>
    const fields = ['deliverable_url', 'deliverableUrl', 'url', 'uri', 'manifest_url', 'manifestUrl', 'result_url', 'resultUrl', 'location']
    const url = doc && typeof doc === 'object' ? fields.map((f) => doc[f]).find((v) => typeof v === 'string') : null
    return typeof url === 'string' && /^(https|ipfs|ar):\/\//i.test(url) && url.length < 2048 ? url : null
  } catch {
    return null
  }
}

export function submissionPayload(
  input: Hex,
  jobId: string,
  expectedHash: string,
): Manifest | null {
  if (input.length > (MAX_DELIVERY_BYTES + 1024) * 2 + 2) return null
  try {
    const decoded = decodeFunctionData({ abi: SUBMIT, data: input })
    const [id, hash, data] = decoded.args
    if (
      decoded.functionName !== 'submit' ||
      id.toString() !== jobId ||
      hash.toLowerCase() !== expectedHash.toLowerCase()
    )
      return null
    const bytes = hexToBytes(data)
    if (bytes.length > MAX_DELIVERY_BYTES) return null
    const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    const doc: unknown = JSON.parse(raw)
    const content = deliveryContent(doc)
    const digest = deliveryDigest(raw, expectedHash)
    if (!content || digest.matches !== true) return null
    return { raw, ...digest, content, pretty: JSON.stringify(doc, null, 2) }
  } catch {
    return null
  }
}

const FOUND = new Map<string, { until: number; manifest: Manifest }>()
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
    const client = chainClient(chainId)
    const result = await Promise.race([
      Promise.all([
        client.getTransaction({ hash: txHash as Hex }),
        client.getTransactionReceipt({ hash: txHash as Hex }),
      ]),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 8000)
        timer.unref?.()
      }),
    ])
    if (!result) return null
    const [tx, receipt] = result
    const escrow = network(chainId).commerce
    if (
      receipt.status !== 'success' ||
      (tx.chainId !== undefined && tx.chainId !== chainId) ||
      !same(tx.hash, txHash) ||
      !same(receipt.transactionHash, txHash) ||
      tx.blockHash === null ||
      tx.blockHash !== receipt.blockHash ||
      !same(tx.to, escrow) ||
      !same(receipt.to, escrow) ||
      !same(tx.from, provider)
    )
      return null
    const submitted = parseEventLogs({
      abi: SUBMIT,
      eventName: 'JobSubmitted',
      logs: receipt.logs.filter((l) => same(l.address, escrow)),
      strict: true,
    }).some(
      (e) =>
        e.args.jobId.toString() === jobId &&
        same(e.args.provider, provider) &&
        same(e.args.deliverable, hash),
    )
    if (!submitted) return null
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
