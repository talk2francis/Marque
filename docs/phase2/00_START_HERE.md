# MARQUE PHASE 2: START HERE
### Set and Earn build pack · written Sat 26 Sep 2026 · for Francis

Handoff deadline: **Sun 27 Sep 12:00 UTC** (13:00 Lagos). Internal target: **10:00 UTC**.
Public launch: **Wed 30 Sep** (tentative). Feature freeze: **Tue 29 Sep 18:00 UTC**.
Mainnet is required for final selection, so Marque launches on mainnet.

---

## 1. What is in this pack

| File | Who reads it | What it is |
|---|---|---|
| `00_START_HERE.md` | You | This page. Schedule, your decisions, cut order |
| `MASTER_PROMPT.md` | Claude Code, first, every session | The Phase 2 product in one document and the read order |
| `AGENTS-PHASE2.md` | Claude Code | Append to `AGENTS.md` as section 13. Invariants, lanes, gates, ladders, kill list |
| `REQUIREMENTS-MATRIX.md` | Both | Every line of Damian's doc mapped to current state, target, evidence, phase |
| `SPEC-COMMERCE.md` | Lane A | ERC-8183 buyer rail, supply model, quotes, network and token rules |
| `SPEC-TRACKING.md` | Lane A | Quest Index, exact events and topics, APIs, anti-wash, ratings |
| `DESIGN-SYSTEM.md` | Lane B | Kerbstone transplant for Marque, every page, copy rules |
| `BUILD-PROMPTS.md` | You paste, Claude Code runs | Phases P2-00 to P2-13, paste-ready, each with CHECKPOINT and STOP |
| `HANDOFF-BNB.md` | You send | The technical packet for Damian and Gwen, fields to fill from measured facts |
| `LAUNCH-RUNBOOK.md` | Both | Launch gates, monitoring, incident playbooks, support replies, Crucible checklist |
| `DECISIONS.md` | Both | Every strategic decision with the reason, including what I took and rejected from ChatGPT |
| `ROADMAP.md` | Both | The post-judging roadmap we built together, preserved so nothing is lost |

Commit all of it to `docs/phase2/` in the repo. Append `AGENTS-PHASE2.md` to `AGENTS.md`. The first prompt (P2-00) does both for you if you prefer.

---

## 2. What changes in one paragraph

Today Marque is an excellent verification layer with a Hire button that moves no money: a free agent call under a charter that Marque's own testnet wallet signs. Phase 2 sends real users with real wallets. So Marque becomes a working market: the user's wallet hires an agent through BNB's own ERC-8183 escrow contract on mainnet, pays in a stablecoin they already hold if the contract allows it, watches the job in a Job Room, rates the agent through ERC-8004, and every one of those steps is an on-chain event BNB can count. The verification moat stays and gets sharper: an agent can be **Hireable** without being **Warranted**, and the page says which. A `/quest` page walks Set and Earn users through all four categories plus the builder task in one place, because the marketplace that makes the quest easiest gets the traffic.

---

## 3. Schedule (UTC)

Two Claude Code sessions in separate git worktrees: **Lane A** (commerce, tracking, reliability) and **Lane B** (supply, UX, builder, handoff). If you only run one session, use the single-lane order in `BUILD-PROMPTS.md` section 0.

| When | Lane A | Lane B | You |
|---|---|---|---|
| Sat 26, now | P2-00 together (2h) | | Send Damian the ack. Send Gwen the questions (section 5) |
| Sat 26, +2h | P2-02 ERC-8183 buyer rail | P2-01 canonical supply | Reply to any P2-00 escalation |
| Sat 26 night | P2-03 Quest Index + API | P2-07 Kerbstone foundation | Sleep. The bots do not need you until the mainnet gate |
| Sun 27 04:00 | P2-04 ratings, testnet 4-category run | P2-06 handoff draft | |
| **Sun 27 08:00** | P2-05 mainnet cutover | | **Write "approved, mainnet" and fund the wallets it names** |
| **Sun 27 10:00** | | P2-06 finalise | **Send the handoff to Damian and Gwen** |
| Sun 27 to Mon 28 | P2-11 reliability | P2-08 hire sheet, Job Room, /quest, /me | Test the quest yourself from a fresh wallet |
| Mon 28 to Tue 29 | P2-11 load test | P2-09 home, marketplace, storefront; P2-10 builder | |
| **Tue 29 18:00** | P2-12 Crucible (both) | | **Freeze. Walk the golden path on your phone** |
| Wed 30 | Launch per `LAUNCH-RUNBOOK.md` | | Watch support, post on X |

If Gwen answers a question differently from our assumption, the affected phase has an adapter seam. Nothing is rebuilt.

---

## 4. Decisions only you can make, in the order they are needed

| # | Decision | Needed by | Default if you say nothing |
|---|---|---|---|
| 1 | Public team wallet addresses (every wallet you or Marque controls) | P2-03 | Bot lists every Marque wallet from the repo; you add personal ones |
| 2 | Support channel for real users (Telegram group, X DMs, or email) | P2-06 | X DMs to @marquetrade |
| 3 | **"approved, mainnet"** for the reference sellers and the keeper wallet | Sun 27 08:00 | Launch on testnet, which cannot be selected at the end |
| 4 | Fund the wallets P2-05 names with a little BNB (only if the paymaster does not sponsor) and one test wallet with ~2 USDT or U | Sun 27 08:00 | Same as above |
| 5 | Payment token if both USDT and U are supported | P2-02 | USDT, because users already hold it |
| 6 | Accept or change the "quality agent" definition if Gwen is silent | P2-10 | Section 14 of `SPEC-TRACKING.md` |
| 7 | Approve Cloudflare in front of marque.trade (free plan) | P2-11 | Caddy only, with rate limits |

Never paste a private key, seed phrase or VPS password into any chat. The bots only need public addresses.

---

## 5. The messages to send right now

**To Damian** (ChatGPT's draft is correct, keep it):

> Hey Damian, thanks for sending this through. Received and aligned on the Phase 2 / Set and Earn requirements. I'm doing the final production and tracking pass on Marque now, around the live hire and deposit flow, category coverage, verification and traffic readiness. I'll send the technical packet before Sunday 27 September 12:00 UTC: live URL, socials, one-line description, network and contract details, event signatures and tracking endpoints, team wallets and brand assets. Implementation questions will go to Gwen so nothing blocks the handoff.

**To Gwen:**

> Hi Gwen, Marque here, shortlisted for Set and Earn. I'm wiring tracking to BNB's canonical contracts so you can verify everything on chain. Six quick confirmations:
>
> 1. Hire and deposit: we plan to report ERC-8183 `JobCreated` as the hire and `JobFunded` (amount > 0) as the deposit, on the canonical AgenticCommerce contract. Is that what you expect?
> 2. Completion: the OptimisticPolicy dispute window means `JobCompleted` lands only after the window closes, while `JobSubmitted` marks the moment the agent delivers. Which one counts for the quest? We can report both.
> 3. Rating: ERC-8004 ReputationRegistry `giveFeedback`, emitting `NewFeedback`, sent by the job's client wallet. Is that the rating primitive you want?
> 4. Attribution: every marketplace shares the same AgenticCommerce contract. Is our public per-wallet API, which lists only jobs that started on Marque with their tx hashes, the attribution source you'll use?
> 5. What counts as a "quality" agent for the builder half of the quest? Our default is: owner-verified ERC-8004 identity, live endpoint, classified into a category, and it answered a live test call on Marque.
> 6. Do you have a preferred JSON shape for the per-wallet and per-owner endpoints? Otherwise we'll document ours.

---

## 6. Cut order if the clock wins

Cut from the top, never from the bottom list.

1. EIP-5792 batching (sequential signing with the named stepper still works)
2. Builder page polish beyond claim, test and list
3. Storefront sections below the purchase panel
4. CI beyond typecheck, unit tests and one smoke test
5. Cloudflare
6. Home page art and motion beyond the hero

**Never cut:** P2-00 (probe fix, hygiene, protocol facts), at least 3 hireable agents per category, the ERC-8183 buyer rail, the Quest Index and its API, the handoff packet, the hire sheet and `/quest`.

---

## 7. How to know it worked

On Wed 30 Sep a stranger with a Trust Wallet or MetaMask on their phone, holding a few dollars of USDT and a little BNB, lands on marque.trade, taps "Start the Set and Earn quest", hires and rates one agent in each of the four categories in under ten minutes, and sees all five quest steps tick. Then Gwen pastes that wallet into `https://marque.trade/api/v1/phase2/wallet/<address>` and every step comes back with a transaction hash she can open on BscScan.
