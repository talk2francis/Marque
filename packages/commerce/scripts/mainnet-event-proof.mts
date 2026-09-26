/**
 * P2-00: find one real mainnet log per core ERC-8183 event without a deep log scan.
 * READ ONLY.
 *
 * Public BSC RPCs serve eth_getLogs only for the newest ~20k blocks, and the archive plan caps
 * eth_getLogs at 5 blocks. So: binary-search historical contract state (archive eth_call) for the
 * block where a job changed status, then read that single block's logs and check topic0.
 */
import { createPublicClient, http, keccak256, toHex, type Address, type Hex } from 'viem';
import { NETWORKS } from '@bnbagent/sdk';

const url = process.env.BSC_ARCHIVE_RPC_URL;
if (!url) throw new Error('BSC_ARCHIVE_RPC_URL not set');
const c = createPublicClient({ transport: http(url, { timeout: 30_000, retryCount: 3, retryDelay: 500 }) });
const commerce = NETWORKS['bsc-mainnet']!.commerceContract as Address;
const redact = (m: string) => m.replace(/https?:\/\/[^\s"']+/g, '<rpc>').split('\n')[0]!.slice(0, 160);

const abi = [
  { type: 'function', name: 'jobCounter', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'getJob', stateMutability: 'view', inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'id', type: 'uint256' }, { name: 'client', type: 'address' }, { name: 'provider', type: 'address' },
      { name: 'evaluator', type: 'address' }, { name: 'description', type: 'string' }, { name: 'budget', type: 'uint256' },
      { name: 'expiredAt', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'hook', type: 'address' },
      { name: 'submittedAt', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' },
    ] }],
  },
] as const;

const SIGS: Record<string, string> = {
  JobCreated: 'JobCreated(uint256,address,address,address,uint256,address)',
  BudgetSet: 'BudgetSet(uint256,uint256)',
  JobFunded: 'JobFunded(uint256,address,address,uint256)',
  JobSubmitted: 'JobSubmitted(uint256,address,bytes32)',
  JobCompleted: 'JobCompleted(uint256,address,bytes32)',
  PaymentReleased: 'PaymentReleased(uint256,address,uint256)',
};
const TOPIC = Object.fromEntries(Object.entries(SIGS).map(([k, s]) => [k, keccak256(toHex(s))]));

async function status(jobId: bigint, block: bigint): Promise<number | null> {
  try {
    const j = await c.readContract({ address: commerce, abi, functionName: 'getJob', args: [jobId], blockNumber: block });
    return j.id === 0n ? null : j.status;
  } catch {
    return null; // job did not exist yet at this block
  }
}

// Smallest block in (lo, hi] where pred holds, given pred(hi) is true and pred(lo) is false.
async function firstBlock(lo: bigint, hi: bigint, pred: (b: bigint) => Promise<boolean>) {
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (await pred(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

async function logsAt(block: bigint) {
  return (await c.request({
    method: 'eth_getLogs',
    params: [{ address: commerce, fromBlock: toHex(block), toBlock: toHex(block) }],
  })) as Array<{ transactionHash: Hex; topics: Hex[]; data: Hex; logIndex: Hex }>;
}

const head = await c.getBlockNumber();
const counter = await c.readContract({ address: commerce, abi, functionName: 'jobCounter' });
const out: Record<string, unknown> = { chainId: 56, commerce, headBlock: Number(head), jobCounter: counter.toString(), found: {} };
const found = out.found as Record<string, unknown>;

// Walk back from the newest job to one that reached COMPLETED (status 3), so one job covers every event.
let target: bigint | null = null;
for (let id = counter; id > counter - 400n && id > 0n; id--) {
  const s = await status(id, head);
  if (s === 3) { target = id; break; }
}
out.jobId = target?.toString() ?? null;

if (target !== null) {
  const lookback = 12_000_000n; // ~ a few weeks of BSC blocks; widened if the job is older
  let lo = head > lookback ? head - lookback : 0n;
  while ((await status(target, lo)) !== null && lo > 0n) lo = lo > lookback ? lo - lookback : 0n;
  const transitions: Array<[string[], number]> = [
    [['JobCreated'], 0],
    [['BudgetSet', 'JobFunded'], 1],
    [['JobSubmitted'], 2],
    [['JobCompleted', 'PaymentReleased'], 3],
  ];
  for (const [names, st] of transitions) {
    try {
      const b = await firstBlock(lo, head, async (x) => {
        const s = await status(target!, x);
        return s !== null && s >= st;
      });
      const logs = await logsAt(b);
      for (const n of names) {
        // BudgetSet usually lands in its own tx before JobFunded; search back a few blocks for it.
        let hit = logs.find((l) => l.topics[0] === TOPIC[n] && BigInt(l.topics[1] ?? '0x0') === target);
        let at = b;
        for (let back = 1n; !hit && back <= 400n; back += 5n) {
          const from = b - back - 4n;
          const more = (await c.request({ method: 'eth_getLogs', params: [{ address: commerce, topics: [TOPIC[n]!, toHex(target!, { size: 32 })], fromBlock: toHex(from), toBlock: toHex(b - back) }] })) as typeof logs;
          if (more.length) { hit = more[0]; at = from; }
        }
        found[n] = hit
          ? { tx: hit.transactionHash, block: Number(at), topic0: hit.topics[0], topic0Matches: hit.topics[0] === TOPIC[n] }
          : { tx: null, note: `not found near block ${b}` };
      }
      lo = b - 1n;
    } catch (e) {
      for (const n of names) found[n] = { tx: null, error: redact((e as Error).message) };
    }
  }
}
console.log(JSON.stringify(out, null, 2));
