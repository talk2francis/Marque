/** The browser's existing BSC contract reads use POST without changing chain state. */
export function isVerificationRpcRead(url, data) {
  try {
    if (new URL(url).href !== 'https://bsc-dataseed.bnbchain.org/') return false
    const body = JSON.parse(data)
    const calls = Array.isArray(body) ? body : [body]
    return calls.length > 0 && calls.every(call =>
      call && typeof call === 'object' && !Array.isArray(call)
      && call.jsonrpc === '2.0' && call.method === 'eth_call'
      && (typeof call.id === 'string' || typeof call.id === 'number')
      && Array.isArray(call.params) && call.params.length >= 1 && call.params.length <= 3
      && call.params[0] && typeof call.params[0] === 'object' && !Array.isArray(call.params[0]))
  } catch {
    return false
  }
}
