# Security model

Written for someone who will try to break it. It covers the four boundaries that
matter: outbound calls to agent endpoints (SSRF), the signing boundary, private
key handling, and what the LLM is and is not allowed to do.

The threat that shapes the design: **an ERC-8004 identity costs a few cents to
register, and its service URL is attacker-controlled.** Every agent endpoint
Marque fetches is hostile input. The system that fetches it also runs Postgres,
Redis and four other products on the same VPS.

---

## 1. SSRF — `safeFetch()`

`packages/probe/src/safe-fetch.ts` is the **only** path from Marque to an agent
endpoint. The probe worker, the conformance runner, the identity resolver and
execution all go through it. There is no `fetch(agentUrl)` anywhere else — a test
(`safe-fetch.test.ts`, `redirect.test.ts`) and code review enforce that.

What it does, in order:

1. **Resolve DNS first, check every A/AAAA record.** A hostname that resolves to
   a private range is rejected before a socket opens. If a host round-robins
   between a public and a private address, that is a coin flip we refuse — *all*
   resolved addresses must pass.
2. **Denylist of reserved ranges, not an allowlist of public ones.** Blocked:
   `0.0.0.0/8`, `10/8`, `127/8`, `100.64/10` (CGNAT), `169.254/16` (link-local,
   *including* `169.254.169.254`), `172.16/12`, `192.0.0/24`, `192.0.2/24`,
   `192.88.99/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`,
   everything `>= 224`. IPv6: `::`, `::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`,
   `2002::/16` (6to4), `64:ff9b::/96` (NAT64).
3. **IPv4-mapped IPv6 in both notations.** `::ffff:169.254.169.254` and
   `::ffff:a9fe:a9fe` are the same address; Node's URL parser rewrites one into
   the other. The guard decodes the embedded v4 from either form and re-checks
   it. This was caught by the redirect test, not by reading the code — it is
   called out because it is exactly the kind of bypass that ships.
4. **Re-validate after every redirect.** `redirect: 'manual'`; each hop runs the
   full check again. A public host that 302s to `169.254.169.254` gets nothing.
   Max 3 redirects.
5. **Blocked ports** regardless of address: 22, 23, 25, 445, 3306, 5432, 6379,
   9200, 11211, 27017. `http` and `https` schemes only.
6. **Hard 8s timeout** via `AbortController`.
7. **512 KB response cap, enforced while streaming.** A `content-length` over the
   cap is refused without downloading; a lying `content-length` is caught when
   the stream passes the cap and the reader is cancelled.

Failure is a typed result (`blocked_ssrf`, `dns`, `tls`, `timeout`, `too_large`,
…), never an exception that a caller might swallow. A blocked fetch is recorded
as a failed probe with the reason — visible on the agent's profile.

**Not claimed:** this does not defend against a genuinely public endpoint that is
itself malicious in its *response*. That is handled downstream — responses are
parsed as data, size-capped, and never `eval`'d or used to build a shell command
or SQL. Agent output that fails schema validation is a failed probe, not a crash.

---

## 2. The signing boundary

Three signers, and nothing crosses between them:

| Signer | Holds | Signs | Never signs |
|---|---|---|---|
| **The buyer's browser wallet** | the buyer's key, in the extension | exactly one thing: the **charter grant** (allowlist of contracts + spend cap + expiry) | anything else — there is no "approve all", no session key handed to a server |
| **The operator key** (server-side) | in `/root/.marque/secrets.env`, `chmod 600`, outside the repo | receipt anchors and pre-outcome seals on MarqueRegistry, **BSC testnet only** | anything on mainnet, anything that moves buyer funds |
| **The proof-run deployer key** | never at rest — passed inline as `PROOF_PK=0x… node scripts/pancake-proof.mjs` for one run, then gone | the one-off mainnet rebalance sequence, under a $60 self-imposed charter scope | reused for anything else; it is not wired into any service |

The charter is enforced **before** a signature is requested, not audited after.
`packages/mandates` checks the intended call against `{allowlist, capUsd,
expiresAt}` and refuses to compose a transaction that a call to a non-allowlisted
contract, a spend over cap, or an action past expiry would produce. Revocation is
one transaction, immediate, on chain.

The operator key runs on testnet on purpose. Seals and anchors are a mechanism,
not a value transfer; the mechanism is identical on any EVM chain, and a testnet
seal costs nothing for a judge to reproduce. The one thing that had to be
mainnet — a rebalance with real money at risk — used the deployer key for a
single documented run (`docs/pancakeswap-proof.json`, `docs/DEVIATIONS.md` D9b).

---

## 3. Key handling

- **All secrets** live in `/root/.marque/secrets.env`, mode `600`, owned by the
  deploy user, **outside the git tree**. `.gitignore` covers `.env*`; a
  pre-existing `git secrets`-style grep runs in CI. No key, mnemonic or RPC
  token is in the repo or in any build artifact.
- **The operator keystore** is a Web3 Secret Storage V3 JSON, scrypt
  `N=131072`, decrypted at process start from a passphrase in `secrets.env`,
  held in memory only.
- **The deployer key** for the mainnet proof was passed as a process env var for
  the duration of one script invocation and never written to disk, never logged
  (the script redacts `PROOF_PK` from any error dump), never committed.
- **Rotation:** the VPS was root-compromised via SSH brute-force in early Sep
  2026 (see below). Every key that touched the old host is considered burned and
  was regenerated on the rebuilt host: new operator wallet, new agent keystores,
  new RPC tokens. The old ERC-8004 registrations were re-done from the new keys
  (`docs/DEVIATIONS.md` D10.5C-05). The compromise post-mortem and the current
  hardening (fail2ban, ufw default-deny, key-only SSH, immutable
  `ld.so.preload`, a 20s watchdog service) are in `docs/RUNBOOK.md`.

---

## 4. What the LLM may do

One rule, stated three ways because it is the one that would matter to a review:

> **The LLM never signs and never prices.**

- The only model call on any path is **category classification** (DeepSeek):
  given an agent's metadata, which of four categories does it belong to. It runs
  in the `classify` worker, under a hard per-run USD cap, and its output is a
  category label and nothing else. It cannot cause a transaction, set a fee, or
  change a number a buyer sees as measured.
- **MCS** (the conformance standard) is deterministic arithmetic. It checks
  facts and compliance with a *supplied* policy — did the agent's numbers
  survive recomputation, did it stay inside the constraints it was given. No
  model is in that loop. Judgement about whether an agent is *good* goes in the
  Ledger, which is **blind-graded by a human against a rubric registered before
  the task was run** — not by a model.
- Agent responses are parsed as structured data against a schema. They are never
  interpolated into a prompt that then drives an action, never used to build a
  query or a command.

---

## 5. Web surface

- **CSP** with `frame-ancestors 'none'`, `object-src 'none'`,
  `upgrade-insecure-requests`; `connect-src` is an explicit allowlist (self, the
  named BSC RPC hosts, WalletConnect). `script-src`/`style-src` still carry
  `'unsafe-inline'`/`'unsafe-eval'` — a known Next.js App Router limitation, not
  yet nonce-based; tracked.
- **HSTS**, `Cross-Origin-Opener-Policy`, a tightened `Permissions-Policy`.
- **Rate limiting** on `/api/v1/*` and the write endpoints.
- `/api/v1/events` (anonymous telemetry) is **name-allowlisted**, drops any meta
  key outside a fixed set, caps string and number values, and always returns 204
  — it cannot be used to store arbitrary data or to probe for what exists.
- No user accounts, no sessions, no cookies with meaning. The only state a buyer
  has is on chain.

---

## Reporting

Security contact: the address in `README.md`. First-party observations (probe
history, conformance results, run artifacts, seals) are **append-only by
policy** — there is no code path that deletes one, which also means an attacker
who got write access could not quietly rewrite a track record without it showing
in the anchor chain.
