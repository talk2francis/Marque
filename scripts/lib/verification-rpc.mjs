/**
 * The browser's existing BSC reads use POST without changing chain state: contract reads on mainnet, and (since V4)
 * balance and contract reads on BSC testnet for the practice lane. Only pure read methods, only these exact endpoints.
 */
const ENDPOINTS = new Set(['https://bsc-dataseed.bnbchain.org/', 'https://bsc-testnet-rpc.publicnode.com/'])
const READS = new Set(['eth_call', 'eth_getBalance', 'eth_chainId', 'eth_blockNumber'])
const PARAMS = { eth_call: [1, 3], eth_getBalance: [1, 2], eth_chainId: [0, 0], eth_blockNumber: [0, 0] }

export function isVerificationRpcRead(url, data) {
  try {
    if (!ENDPOINTS.has(new URL(url).href)) return false
    const body = JSON.parse(data)
    const calls = Array.isArray(body) ? body : [body]
    return calls.length > 0 && calls.every(call => {
      if (!call || typeof call !== 'object' || Array.isArray(call) || call.jsonrpc !== '2.0' || !READS.has(call.method)) return false
      if (typeof call.id !== 'string' && typeof call.id !== 'number') return false
      const params = call.params ?? []
      const [lo, hi] = PARAMS[call.method]
      if (!Array.isArray(params) || params.length < lo || params.length > hi) return false
      if (call.method === 'eth_call') return Boolean(params[0]) && typeof params[0] === 'object' && !Array.isArray(params[0])
      if (call.method === 'eth_getBalance') return typeof params[0] === 'string' && /^0x[0-9a-fA-F]{40}$/.test(params[0])
      return true
    })
  } catch {
    return false
  }
}
