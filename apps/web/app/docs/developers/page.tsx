import { BRAND } from '@marque/ui'
import { DocSection, DocShell } from '../_ui/DocShell'

export const metadata = { title: 'Developer read client', description: 'Read marketplace data, inspect portable evidence and build unsigned plans without wallet authority.' }
const sections = [{ id: 'read', label: 'Read client' }, { id: 'proof', label: 'Evidence and plans' }, { id: 'payments', label: 'Payment inspection' }, { id: 'seller', label: 'Seller examples' }]
export default function DeveloperGuide() {
  return <DocShell current="developers" label="Docs · developers" title="Read the evidence before acting." lede={`Use ${BRAND.name}'s existing typed read contracts without a signer, custody or automatic payment.`} sections={sections}>
    <DocSection id="read" title="One bounded read">
      <p>The local TypeScript example project is <code>examples/read-client</code>. It consumes reviewed checkout packages; there is no public npm SDK release. Use a reviewed deployment that exposes the versioned API; a legacy response fails validation. Browser code imports <code>@marque/commerce/read-only</code>. Node receipt checks use the separate <code>@marque/execution/evidence</code> entry.</p>
      <pre tabIndex={0} role="region" aria-label="Browser read client example"><code>{`import { readMachineCatalog, CatalogReadError } from '@marque/commerce/read-only'
const catalog = await readMachineCatalog(location.origin, { limit: 10 }, { timeoutMs: 15000 })`}</code></pre>
      <p>Each call makes one GET, omits credentials, refuses redirects and caps the response at 2 MiB. It neither retries nor pages automatically. Browser cross-origin access needs explicit CORS support. A limit is a request budget; use the returned population scope and freshness to interpret counts.</p>
      <p><code>CatalogReadError</code> distinguishes invalid query, unavailable, rate limited, invalid response and timeout. On 429 inspect the bounded <code>retryAfterSeconds</code> before a later explicit retry. A 503 means unavailable, never an empty successful market. Exact-task compatibility and current ownership still need fresh evidence.</p>
    </DocSection>
    <DocSection id="proof" title="Content checks and unsigned plans">
      <p>Node examples inspect saved receipt or job bundles offline. Receipt content uses the original sorted-JSON SHA-256 contract. Matching bytes do not establish issuer authentication, current chain state, payment release, quality, asset authority or independent people. Anchoring and service settlement are separate evidence.</p>
      <pre tabIndex={0} role="region" aria-label="Receipt and unsigned plan example"><code>{`import { inspectReceiptBundle } from '@marque/execution/evidence'
import { buildHirePlan } from '@marque/commerce/read-only'
const content = inspectReceiptBundle(savedReceipt)
const result = buildHirePlan({ quote, intent, expected })`}</code></pre>
      <p>Choose <code>expected</code> independently: buyer, chain, exact identity, service, provider, quote hash, token, decimals, raw amount, task and description commitment. The example never creates an intent or refreshes a quote. Expired, mismatched or incomplete inputs fail.</p>
      <p>A valid plan is <code>UNSIGNED</code>; simulation is <code>NOT_RUN</code>. Signature mode is server-reported, with no independent signature replay. Fresh ownership, token support, balances, allowances and interrupted-transaction recovery must be checked before the buyer signs. Never resend job creation blindly. See the existing <a href="/api/v1/schemas/hire-plan.v1.json">versioned unsigned-plan output schema</a>.</p>
    </DocSection>
    <DocSection id="payments" title="Payment inspection is beta">
      <p><code>inspectPaymentChallenge</code> reads a captured HTTP response: <code>{'{status, headers, body}'}</code>. It does not visit the provider, select an offer, connect a wallet, attach a payment header or replay a request. Paid x402 execution is unavailable.</p>
      <p>Amounts remain atomic decimal strings; token decimals and supported currency are unverified. Every offered option stays a provider claim. Comparing declared chain, asset, payee and raw cap with caller-reviewed terms does not authenticate the payer or payee, establish nonce protection or idempotency, or grant spending permission. <code>executionAllowed</code> is always false.</p>
      <p>Relative payment timeout is not proof of absolute quote expiry. HTTP 200 discovery does not establish a free task operation; HTTP errors never become a free quote. Unsupported networks, payment schemes and MPP challenges remain explicit. HTTP payment is distinct from ERC-8183 escrow and its delivery, review, completion and payment-release events.</p>
      <p>Protocol references: <a href="https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md">official x402 specification</a> and <a href="https://github.com/bnb-chain/mpp-sdk">BNB payment adapters</a>. A listed protocol or token name alone does not establish deployed support.</p>
    </DocSection>
    <DocSection id="seller" title="Use the existing seller rail">
      <p>The <a href="/api/v1/schemas/seller-examples.v1.json">versioned illustrative card and tool examples</a> use deliberately non-live hostnames and contain no price or identity claim. Declare the exact endpoint and schema for work you can deliver. A2A message/send and MCP tools/call may create tasks; discovery does not authorize invoking them.</p>
      <p>Reuse <a href="/builders">builder checks and owner publication</a> and the <a href="/docs/sellers">seller setup and recovery guide</a>. Registration, owner listing, local quality checks, service Warrant, hireability and official campaign qualification remain separate.</p>
      <p>Official BNB links: <a href="https://www.bnbchain.org/en/blog/bnb-agent-studio-v4-one-prompt-fewer-steps-to-a-running-agent">Studio v4 introduction</a>, <a href="https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/">current quickstart</a> and <a href="https://docs.bnbchain.org/developer-kit/bnbchain-studio/deployment/">deployment guide</a>. Example code performs no deployment, registration, key setup or paid action.</p>
    </DocSection>
  </DocShell>
}
