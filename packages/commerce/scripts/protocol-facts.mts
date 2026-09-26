/**
 * P2-00 protocol facts. READ ONLY: no transaction is signed or sent.
 *
 * Measures, on BSC mainnet (56) and testnet (97), the live values the Phase 2 pack assumed:
 * dispute window, payment tokens, fees, ReputationRegistry code, and one real log per
 * tracked event (topic0 checked against SPEC-TRACKING section 2).
 *
 * Addresses come from @bnbagent/sdk 0.6.0 (NETWORKS / BNB_CHAIN_ADDRESSES / listAssets).
 * The ReputationRegistry is not in the SDK; its CREATE2 address is the ERC-8004 canonical one
 * and is verified here by bytecode and by selector presence, never assumed.
 *
 *   pnpm tsx scripts/phase2/protocol-facts.mts > docs/phase2/evidence/protocol-facts.json
 */
import { createPublicClient, http, fallback, keccak256, toHex, toFunctionSelector, type Hex, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { NETWORKS } from '@bnbagent/sdk';
import { BNB_CHAIN_ADDRESSES, listAssets } from '@bnbagent/sdk/networks';

const REPUTATION: Record<number, Address> = {
  56: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  97: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
};

// Event signatures per SPEC-TRACKING section 2, with the topic0 the pack printed.
const EVENTS = [
  ['commerce', 'JobCreated(uint256,address,address,address,uint256,address)', '0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9'],
  ['commerce', 'BudgetSet(uint256,uint256)', '0x869e2577b006bf47ee981cf6fec2e25583548081c14b98deab587f77b5068038'],
  ['commerce', 'JobFunded(uint256,address,address,uint256)', '0xbdb056de345bfeadca7c9fd7df6430bdb83c677c8eefbb601dff56f34d3dac52'],
  ['commerce', 'JobSubmitted(uint256,address,bytes32)', '0x80c17db79857f338a6a6df68a6883ecc0ce78e2202fe61ed979733573f40538e'],
  ['commerce', 'JobCompleted(uint256,address,bytes32)', '0x0fd54bd364fa9e67f17b091aefe930932c09fe7651cf5ad02c71a418f3341444'],
  ['commerce', 'PaymentReleased(uint256,address,uint256)', '0x21d71db5be59bb9fa133895586b7404307dd33fb93b16db09dc6f1d9d7d231b0'],
  ['commerce', 'JobRejected(uint256,address,bytes32)', '0xae7362b1af91f4492868987b9c73990d780060811551b58728fbe96fd1bab275'],
  ['commerce', 'JobExpired(uint256)', '0x97237956f8810192811e2c3f273fd02c5d6295206fdd9c62e6fe2bfc19ba9232'],
  ['commerce', 'Refunded(uint256,address,uint256)', '0x7ca5472b7ea78c2c0141c5a12ee6d170cf4ce8ed06be3d22c8252ddfc7a6a2c4'],
  ['router', 'JobRegistered(uint256,address,address)', '0xab6d9121f9311dd45d0b932fc9fb1a6562295bda63d5bab95e364ff926515715'],
  ['router', 'JobSettled(uint256,address,uint8,bytes32)', '0x771fbd01246ab044986d0a55b6d9b732fcfd6d7eaa5ee0d05110b0d23cf496fc'],
  ['policy', 'Disputed(uint256,address)', '0xcde8e21e97a7f6ec4bbf0ee44450212e0ba73be8fdfbfb2b155e861d86756bac'],
  ['reputation', 'NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)', '0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc'],
  ['reputation', 'FeedbackRevoked(uint256,address,uint64)', '0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d'],
] as const;

const REP_SELECTORS = [
  'giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)',
  'revokeFeedback(uint256,uint64)',
  'getSummary(uint256,address[],string,string)',
  'readFeedback(uint256,address,uint64)',
  'getClients(uint256)',
  'getLastIndex(uint256,address)',
];

const commerceAbi = [
  { type: 'function', name: 'paymentToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'jobCounter', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'platformFeeBP', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'platformTreasury', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'MAX_EXPIRY_DURATION', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isPaymentTokenSupported', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
] as const;
const policyAbi = [
  { type: 'function', name: 'disputeWindow', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'voteQuorum', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'activeVoterCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;
const routerAbi = [
  { type: 'function', name: 'policyWhitelist', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
] as const;

function rpcs(chainId: number): string[] {
  const raw = chainId === 56 ? process.env.BSC_RPC_URLS : process.env.BSC_TESTNET_RPC;
  const list = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : [chainId === 56 ? NETWORKS['bsc-mainnet']!.rpcUrl : NETWORKS['bsc-testnet']!.rpcUrl];
}

function clientFor(chainId: number) {
  return createPublicClient({
    chain: chainId === 56 ? bsc : bscTestnet,
    transport: fallback(rpcs(chainId).map((u) => http(u, { timeout: 15_000, retryCount: 1 }))),
  });
}

// eth_getLogs support differs by provider (measured 26 Sep: bnbchain dataseed refuses, blockrazor caps
// at 25 blocks, publicnode serves 5,000). Logs go through publicnode, then the archive endpoint.
function logClientFor(chainId: number) {
  // The archive endpoint is on a plan that caps eth_getLogs at 5 blocks, so it is not used for logs.
  const pool = rpcs(chainId).filter((u) => u.includes('publicnode'));
  return createPublicClient({
    chain: chainId === 56 ? bsc : bscTestnet,
    transport: fallback((pool.length ? pool : rpcs(chainId)).map((u) => http(u, { timeout: 20_000, retryCount: 4, retryDelay: 800 }))),
  });
}

// Never let an RPC URL (the archive URL carries its own key) reach the evidence file.
const redact = (m: string) => m.replace(/https?:\/\/[^\s"']+/g, '<rpc>').split('\n')[0]!.slice(0, 160);

const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const;

// Scan backwards for the newest log with this topic0 at this address, 2 windows in flight (publicnode rate-limits wider fan-out).
async function newestLog(client: ReturnType<typeof logClientFor>, address: Address, topic0: Hex, head: bigint, maxBlocks: bigint) {
  const window = 5_000n;
  const floor = head > maxBlocks ? head - maxBlocks : 0n;
  let to = head;
  while (to > floor) {
    const batch: Array<[bigint, bigint]> = [];
    for (let i = 0; i < 2 && to > floor; i++) {
      const from = to - window + 1n > floor ? to - window + 1n : floor;
      batch.push([from, to]);
      to = from - 1n;
    }
    const results = await Promise.all(
      batch.map(([from, t]) =>
        client.request({ method: 'eth_getLogs', params: [{ address, topics: [topic0], fromBlock: toHex(from), toBlock: toHex(t) }] }) as Promise<
          Array<{ transactionHash: Hex; blockNumber: Hex; topics: Hex[] }>
        >,
      ),
    );
    for (let i = 0; i < results.length; i++) {
      const logs = results[i]!;
      if (logs.length) {
        const l = logs[logs.length - 1]!;
        return { tx: l.transactionHash, block: Number(BigInt(l.blockNumber)), topic0: l.topics[0], scannedFrom: Number(batch[i]![0]) };
      }
    }
  }
  return { tx: null, block: null, topic0: null, scannedFrom: Number(floor), note: `no log in the last ${maxBlocks} blocks` };
}

async function measure(chainId: 56 | 97) {
  const net = chainId === 56 ? NETWORKS['bsc-mainnet']! : NETWORKS['bsc-testnet']!;
  const dep = BNB_CHAIN_ADDRESSES[chainId]!;
  const c = clientFor(chainId);
  const head = await c.getBlockNumber();
  const commerce = net.commerceContract as Address;
  const policy = net.policyContract as Address;
  const router = net.routerContract as Address;
  const rep = REPUTATION[chainId]!;

  const [paymentToken, jobCounter, fee, treasury, maxExpiry, paused, disputeWindow, quorum, voters, routerPaused, policyListed] =
    await Promise.all([
      c.readContract({ address: commerce, abi: commerceAbi, functionName: 'paymentToken' }),
      c.readContract({ address: commerce, abi: commerceAbi, functionName: 'jobCounter' }),
      c.readContract({ address: commerce, abi: commerceAbi, functionName: 'platformFeeBP' }),
      c.readContract({ address: commerce, abi: commerceAbi, functionName: 'platformTreasury' }),
      c.readContract({ address: commerce, abi: commerceAbi, functionName: 'MAX_EXPIRY_DURATION' }),
      c.readContract({ address: commerce, abi: commerceAbi, functionName: 'paused' }),
      c.readContract({ address: policy, abi: policyAbi, functionName: 'disputeWindow' }),
      c.readContract({ address: policy, abi: policyAbi, functionName: 'voteQuorum' }),
      c.readContract({ address: policy, abi: policyAbi, functionName: 'activeVoterCount' }),
      c.readContract({ address: router, abi: routerAbi, functionName: 'paused' }),
      c.readContract({ address: router, abi: routerAbi, functionName: 'policyWhitelist', args: [policy] }),
    ]);

  const assets = listAssets(chainId);
  const tokens = await Promise.all(
    assets.map(async (a) => ({
      symbol: a.symbol,
      address: a.address,
      decimals: a.decimals,
      kernelDefault: a.isDefault,
      supported: await c.readContract({ address: commerce, abi: commerceAbi, functionName: 'isPaymentTokenSupported', args: [a.address as Address] }),
    })),
  );

  const [repCode, idCode, repSlot] = await Promise.all([
    c.getCode({ address: rep }),
    c.getCode({ address: net.registryContract as Address }),
    c.getStorageAt({ address: rep, slot: IMPL_SLOT }),
  ]);
  const repImpl = repSlot && BigInt(repSlot) !== 0n ? (`0x${repSlot.slice(-40)}` as Address) : null;
  const implCode = repImpl ? await c.getCode({ address: repImpl }) : null;
  const repHex = (implCode ?? repCode ?? '0x').toLowerCase();
  const selectors = Object.fromEntries(REP_SELECTORS.map((s) => [s, repHex.includes(toFunctionSelector(s).slice(2))]));

  const addr: Record<string, Address> = { commerce, router, policy, reputation: rep };
  const lc = logClientFor(chainId);
  const maxBlocks = chainId === 56 ? 2_500_000n : 5_000_000n;
  const events = [];
  for (const [where, sig, packTopic] of EVENTS) {
    const computed = keccak256(toHex(sig));
    let found = null;
    let error: string | null = null;
    try {
      found = await newestLog(lc, addr[where]!, computed, head, maxBlocks);
    } catch (e) {
      error = redact((e as Error).message);
    }
    events.push({
      contract: where,
      signature: sig,
      topic0Computed: computed,
      topic0Pack: packTopic,
      packMatches: computed === packTopic,
      liveLog: found,
      liveTopicMatches: found?.tx ? found.topic0 === computed : null,
      error,
    });
  }

  return {
    chainId,
    network: net.name,
    headBlock: Number(head),
    measuredAt: new Date().toISOString(),
    contracts: {
      identityRegistry: net.registryContract,
      identityRegistryHasCode: (idCode ?? '0x').length > 2,
      reputationRegistry: rep,
      reputationRegistryProxyCodeBytes: ((repCode ?? '0x').length - 2) / 2,
      reputationRegistryImplementation: repImpl,
      reputationImplCodeBytes: (repHex.length - 2) / 2,
      reputationSelectors: selectors,
      agenticCommerce: commerce,
      commerceImpl: dep.commerceImpl,
      evaluatorRouter: router,
      optimisticPolicy: policy,
      sdkPaymentToken: dep.paymentToken,
    },
    commerce: {
      paymentToken,
      paymentTokenMatchesSdk: paymentToken.toLowerCase() === dep.paymentToken.toLowerCase(),
      jobCounter: jobCounter.toString(),
      platformFeeBP: fee.toString(),
      platformTreasury: treasury,
      maxExpiryDurationSeconds: Number(maxExpiry),
      maxExpiryDurationHours: Number(maxExpiry) / 3600,
      paused,
      tokens,
    },
    policy: {
      disputeWindowSeconds: Number(disputeWindow),
      disputeWindowHours: Number(disputeWindow) / 3600,
      voteQuorum: Number(quorum),
      activeVoterCount: Number(voters),
      whitelistedOnRouter: policyListed,
    },
    router: { paused: routerPaused },
    paymaster: { url: net.paymasterUrl, usePaymaster: net.usePaymaster },
    events,
  };
}

const out = { sdk: '@bnbagent/sdk@0.6.0', chains: [await measure(56), await measure(97)] };
console.log(JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
