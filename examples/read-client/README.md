# Read client example

This private TypeScript example consumes local checkout subpath exports. These packages are not published to npm. Use the repository's existing Node22, pnpm9 and installed workspace dependencies; no wallet, key, database URL or Redis configuration is required. Do not run package installation in production. For an external copied project, resolve the same reviewed checkout packages and existing dependencies first. The checkpoint records the exact temporary consumer setup used for validation.

From this directory, using the repository tools:

```
pnpm exec tsx server.ts catalog https://marque.trade
pnpm exec tsx server.ts receipt /absolute/path/to/captured-receipt-bundle.json
pnpm exec tsx server.ts job /absolute/path/to/captured-job-bundle.json
pnpm exec tsx server.ts plan /absolute/path/to/reviewed-plan-input.json
pnpm exec tsx server.ts payment-capture /absolute/path/to/captured-response.json
pnpm exec tsc --noEmit -p tsconfig.json
```

Only `catalog` makes a network request: one GET, no credentials, no redirects, at most 2 MiB, 15s timeout, no retry or automatic pagination. Limit 10 is a request cap, not a population count. A cold 503 means unavailable, never zero supply. On 429 inspect bounded Retry-After and request budget before a later explicit retry. Never replay a write or provider task automatically.

`browser.ts` exports the same one-request catalog read, pure plan and captured-payment inspection for an application's own bundler. It must not import the Node-only receipt verifier. Browser requests require a same-origin API or an expressly configured CORS origin. Server-supplied URLs are not safe outbound targets; server-side agent reads must use the shared SSRF guard.

`plan` takes `{quote,intent,expected}` as defined by the existing `hirePlanInputSchema`. Obtain saved terms through the existing buyer-controlled flow. Choose `expected` independently: wallet, chain, exact canonical identity/service/provider, quote commitment, raw amount/token/decimals, task and description commitment. No example creates an intent, refreshes a quote, signs, simulates or sends a transaction. Expired or mismatched inputs fail. A valid result is `UNSIGNED`, with simulation NOT_RUN, signature replay not performed, fresh chain checks and recovery required. No blindly repeated createJob.

`receipt` and `job` check offline content only. Receipt sorted-JSON SHA-256 differs from SDK deliverable semantic Keccak. Matching bytes do not authenticate the issuer or prove current chain, paid settlement, quality, authority or independent people. Existing `scripts/verify-receipt.mts` is the separately budgeted read-only chain replay path; it never buys a new job.

`payment-capture` accepts `{status,headers,body}`. It does not fetch a URL, choose an offer, log into a wallet, infer decimals or pay. All offers remain server claims; executionAllowed is always false. x402 observation is beta, and paid execution remains unavailable. MPP needs a separate inspector. HTTP 200 discovery and HTTP 4xx/5xx are not evidence of free task execution.

Builder schema examples are at `/api/v1/schemas/seller-examples.v1.json`; every `.invalid` hostname is deliberately non-live illustrative configuration. Use the existing `/docs/sellers` and official BNB Studio v4/current deployment links before exposing a real service. Hosting, consent, pricing and ownership proof remain the seller's responsibility.
