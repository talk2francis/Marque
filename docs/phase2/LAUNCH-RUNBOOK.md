# LAUNCH-RUNBOOK.md
## Marque Phase 2: launch, operate, recover

---

## 1. Capacity reality

The VPS is a Contabo Cloud VPS 20 (per the invoice ChatGPT read): **6 shared vCPU, about 12 GB RAM, about 200 GB SSD, 300 Mbit/s**, not 16 GB. It runs Postgres, Redis, Caddy, the web app, six workers (ingest, probe, classify, conform, pancake-watch, indexer, plus keeper and job worker in Phase 2) and five to ten seller processes.

Rules:
- User traffic never waits on the chain or the registry: every public page reads cached projections (Redis or precomputed tables). Only the hire sheet and Job Room make live calls, and those are small.
- Probe, classify and conform run at `nice 10` and pause their cycle when load average exceeds 5 for 2 minutes.
- If the P2-11 load test fails the targets at 100 virtual users, move ingest, probe, classify and conform to a second small VPS (gate G-C1) before launch. Web, API, Postgres, Redis, indexer, keeper and sellers stay on the main box.

## 2. Launch gates (all must pass on Tue 29 Sep before the freeze)

| Gate | Pass condition |
|---|---|
| Supply | `/coverage` shows at least 3 hireable per category for 24 h without dropping below |
| Commerce | A fresh mainnet wallet completed four hires, four ratings, from `/quest`, on a phone viewport, recorded |
| Tracking | `/wallet` for that wallet returns every tx; Gwen's questions answered or defaults documented |
| Recovery | Cancel, refund (testnet acceptable), allowance revoke, tab-closed-after-fund all proven |
| Reliability | Blue/green swap under load with zero non-200s; LOAD-TEST.md within targets |
| Monitoring | Every alert in section 3 fired once in test and reached Telegram |
| Copy | lint:copy clean on the money path; claims audit done |
| Repo | Clean root; README Phase 2 section; CI green |

## 3. Monitoring and alerts

| Signal | Threshold | Alert |
|---|---|---|
| Indexer lag (56) | > 200 blocks for 2 min | Telegram, `/status` amber |
| Reference seller quote failures | any seller failing for 10 min | Telegram |
| Hireable per category | drops below 3 | Telegram |
| 5xx rate | > 1% over 5 min | Telegram |
| Keeper BNB | below P2-05 threshold | Telegram, keeper pauses |
| Seller wallet BNB (if self-paying gas) | below 20 submits | Telegram |
| Disk | > 80% | Telegram |
| Memory | any PM2 restart loop (3 in 10 min) | Telegram |
| Stuck jobs | FUNDED with no notify success for 10 min | Telegram + auto re-notify |

## 4. Launch day (Wed 30 Sep)

| When (UTC) | Action |
|---|---|
| T−3 h | `/status` all fresh; one smoke hire with the team wallet on mainnet; backups done |
| T−1 h | Freeze confirmed; rollback command tested on the idle port |
| T0 (BNB posts) | Watch `/status`, Telegram, Caddy access log rate. Francis posts on X with the `/quest` link |
| T+1 h | Check `/stats`: hires per category, error rate, median hire time |
| T+6 h | First review: top errors from the error map counts, stuck jobs, support messages. Fix only S0/S1 |
| Daily | Supply audit, outreach follow-ups, conform run, backup check, `/stats` snapshot into PROJECT_STATE |

## 5. Incident playbooks

**RPC degraded.** The failover pool rotates automatically. If all fail: set the site banner "Reading from BNB Chain is slow right now; hires still work from your wallet", pause probe and conform, keep the indexer on the healthiest endpoint.

**A reference seller is down.** PM2 restarts it. If it keeps failing: mark it "Temporarily unavailable" (the probe does this within a cycle), jobs already funded still get delivered after restart because notify is durable. If it cannot deliver before the submit deadline, the Job Room shows the reclaim date.

**Quotes failing for a third-party seller.** It drops out of Ready to hire automatically. Nothing else to do.

**Indexer behind.** Quest steps show "Waiting for the chain". Restart the indexer; it resumes from the cursor. Never insert quest rows by hand.

**A user's job looks stuck.** Look up `/api/v1/phase2/job/<chain>/<id>`. If FUNDED and no notify success: trigger notify from the worker. If the provider missed the deadline: the reclaim date is on the Job Room. Reply with the Job Room link.

**Traffic spike.** Cached pages hold. If CPU stays above 90%: pause probe, classify, conform; enable Cloudflare "under attack" only if abuse is visible.

**Bad deploy.** Run the rollback command (switch Caddy upstream back). Investigate on the idle port.

**Contract paused (`EnforcedPause`).** Banner, hire buttons disabled with the reason, message Gwen.

## 6. Support replies (paste and adapt)

- **"Where is my money?"** Your payment is in BNB Chain's ERC-8183 escrow contract, not with Marque. Your job page shows every step with links: [Job Room link]. It releases to the agent after the dispute window if the work was delivered, and you can reclaim it if it was not.
- **"The agent didn't deliver."** You can reclaim the full amount from [date] on your job page with one transaction. If you think the delivered result is wrong, use "Report a problem" before [window end].
- **"Why so many signatures?"** Each one is a separate protection: opening the job, attaching the dispute policy, locking the price, allowing exactly that amount, and paying into escrow. Nothing is approved beyond the price.
- **"My quest step didn't tick."** Steps tick when the chain confirms, usually within a minute. Check [your /me link]. If a step is still missing after 10 minutes, send us your wallet address.
- **"Which wallet do I use?"** Any BNB Smart Chain wallet: Binance Web3 Wallet, Trust Wallet, MetaMask, OKX Wallet. You need a little BNB for gas and [USDT or U] for the agent's price.

## 7. Crucible checklist (P2-12)

Mark each with evidence in `PROJECT_STATE.md`.

**A. Eligibility**: every REQUIREMENTS-MATRIX row PASS or PARTIAL with a written reason.
**B. Golden path**: land → `/quest` → four hires → four ratings → builder checks → `/me` → revoke, on mainnet, phone viewport, recorded.
**C. Protocol**: every tx on the path decodes on BscScan to the expected contract and method; no allowance above the funded amount exists after the run.
**D. Tracking**: `/wallet` matches BscScan for the golden-path wallet; topic0 verified; team wallets flagged.
**E. Security**: no user key path exists; no `maxUint256` in the codebase; safeFetch on every outbound agent call; quotes verified; SSRF test passes; secrets scan of the repo clean.
**F. UX**: 5-second test answer; every state in the Job Room table screenshotted; error map covers every code seen in testing.
**G. Responsive and a11y**: 390, 768, 1440 in both themes, zero horizontal scroll, axe zero serious or critical on 10 key routes, full keyboard path through the hire sheet.
**H. Reliability**: LOAD-TEST.md within targets; swap under load with zero non-200s; restore drill passed.
**I. Claims**: every public sentence on home, `/quest`, hire sheet and README checked against AGENTS 13.7.
**J. Handoff**: sent, answers from Gwen recorded, any required change shipped.

Verdict format: SHIP / SHIP AFTER LISTED FIXES / DO NOT SHIP, with the open risks named.
