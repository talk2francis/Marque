# DESIGN-SYSTEM.md
## Marque Phase 2: the Kerbstone transplant

Marque keeps its identity: the negative-space mark, the wordmark, brass, the Field / Passage / Chamber art, the MeasureRule, provenance chips, and the idea that the interface darkens when money moves. It takes Kerb's engineering of the experience: type stack, scale, component set, status pill, three-state theme, toasts, the transaction stepper, the error map, skeletons, the footer. Claude Code built Kerb (`github.com/Franlinozz/Kerb`, V2 and V3 web app); port the patterns and code shapes from there, never Kerb's brand, mark, art or copy.

The Phase 2 audience is different from Phase 1. Judges read evidence. Quest users want to hire four agents and leave satisfied. So the hierarchy flips: **the action first, the evidence one tap away, never removed.**

---

## 1. Principles

1. **One primary action per screen.** On the home page it is "Start the Set and Earn quest". On a storefront it is "Hire". In the hire sheet it is the next signature.
2. **Plain words on the money path.** A user never sees `setBudget`, `registerJob`, `JobFunded`, `ERC-8183` or an address before they choose to look. Technical names live in "Details" disclosures and tooltips.
3. **Every number has a source.** Provenance chips stay (`ONCHAIN`, `MEASURED`, `TESTED`, `CLAIMED`), smaller and quieter than in Phase 1.
4. **Say what happens next.** Every state, empty state and error ends with the next action.
5. **Light for looking, dark for doing.** Browsing uses the active theme. The hire sheet and the Job Room drop into the Chamber surface (deep ground, brass hairline) in both themes. That transition means "money is moving now".
6. **Honest and warm.** Failures stay visible, in calm language, lower on the page.

## 2. Themes

| Theme | Behaviour |
|---|---|
| **Night** (default) | Current Marque dark, tuned to the tokens below |
| **Day** | Current Marque daylight, tuned below |
| **System** | Follows `prefers-color-scheme` |

Stored in `localStorage` as `marque-theme`. Painted before first paint by an inline bootstrap script (port Kerb's). `data-theme` on `<html>` is always `night` or `day`. The Chamber surface is `[data-surface="chamber"]` and is theme-independent.

## 3. Tokens

Replace `packages/ui/src/tokens.css` values with this set, keeping the existing variable names as aliases so no component breaks. No raw hex outside `tokens.css`.

```css
@layer tokens {
  :root, [data-theme="night"] {
    --canvas: #0E0F0B;  --canvas-2: #12130E;  --panel: #16180F;  --panel-2: #1C1E15;
    --hair: rgba(236,232,222,.09);  --hair-2: rgba(236,232,222,.17);  --scrim: rgba(14,15,11,.74);
    --ink: #ECE8DE;  --ink-2: #B8B3A6;  --ink-3: #8C8779;  --ink-inverse: #0E0F0B;
    --brass: #D6A64F;  --brass-mark: #B0892C;  --brass-dim: #6B5428;
    --moss: #8FA35E;   --moss-dim: #56633A;     /* live, hireable, success, focus */
    --amber: #D9963A;                            /* stale, retest due, waiting */
    --oxide: #D2694C;                            /* failed, danger, refund needed */
    --chain: #7FA3C8;                            /* on-chain link accents */
    --grid-line: rgba(236,232,222,.045);  --cross: rgba(236,232,222,.28);
    color-scheme: dark;
  }
  [data-theme="day"] {
    --canvas: #F2EFE7;  --canvas-2: #EAE6DB;  --panel: #F8F6F0;  --panel-2: #FCFBF7;
    --hair: rgba(20,20,16,.10);  --hair-2: rgba(20,20,16,.18);  --scrim: rgba(242,239,231,.8);
    --ink: #17170F;  --ink-2: #4A4740;  --ink-3: #6B675E;  --ink-inverse: #F2EFE7;
    --brass: #8A6A22;  --brass-mark: #B0892C;  --brass-dim: #E6D3A8;
    --moss: #4E6128;   --moss-dim: #A9B48C;
    --amber: #8F5A14;  --oxide: #A5402A;  --chain: #2B5A85;
    --grid-line: rgba(20,20,16,.05);  --cross: rgba(20,20,16,.3);
    color-scheme: light;
  }
  [data-surface="chamber"] {
    --canvas: #0A0B07;  --panel: #12140E;  --panel-2: #1B1E15;  --ink: #E8E9E0;  --ink-2: #B0B4A1;
    --hair: rgba(214,166,79,.16);  --hair-2: rgba(214,166,79,.32);
  }
  :root {
    --font-sans: "General Sans", "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif;
    --font-serif: "Instrument Serif", "Iowan Old Style", Georgia, serif;
    --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
    --r-1: 4px; --r-2: 8px; --r-3: 14px; --r-pill: 999px;
    --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 72px; --s-9: 112px;
    --maxw: 1280px; --gutter: 24px; --margin: clamp(16px, 3.2vw, 48px);
    --ease: cubic-bezier(.2,.7,.1,1); --t-fast: 160ms; --t-panel: 320ms; --t-hero: 800ms;
  }
}
```

Contrast rule: `--ink-3` only at 13 px and above. Every pairing in use passes WCAG AA; P2-12 runs axe to prove it.

Colour meaning is fixed: **moss** = live, hireable, done. **brass** = brand, primary action, Warrant. **amber** = waiting, stale, retest due. **oxide** = failed, danger. **chain** = a link that opens an explorer. Never decorative.

## 4. Typography

| Family | Source | Use |
|---|---|---|
| General Sans 400/500/600 | Fontshare (ITF Free Font License), self-host woff2 via `next/font/local` | Everything |
| Instrument Serif 400 + italic | Google Fonts (OFL) via `next/font/local` (self-hosted, CSP stays tight) | Statement lines only: home hero, section statements, quest title, receipt title |
| IBM Plex Mono 400/500 | Google Fonts (OFL), self-host | Hashes, addresses, prices in tables, code |

Fallback rung: Hanken Grotesk for General Sans. Log it. Record licences in `docs/THIRD_PARTY.md`. Remove Geist and Fraunces only after every page is checked.

| Token | Desktop | Mobile | Weight | Use |
|---|---|---|---|---|
| `display` | 60 / 1.0 | 38 / 1.05 | serif 400 | Home hero only |
| `h1` | 40 / 1.08 | 30 / 1.1 | sans 500, −0.03em | Page titles |
| `h2` | 28 / 1.15 | 22 / 1.2 | sans 500, −0.02em | Sections |
| `h3` | 18 / 1.3 | 17 / 1.3 | sans 500 | Cards, panels |
| `body-l` | 17 / 1.55 | 16 | 400 | Ledes |
| `body` | 15 / 1.55 | 15 | 400 | Text |
| `small` | 13 / 1.45 | 13 | 400 | Notes |
| `label` | 11 / 1.2 | 11 | 500, +0.18em, uppercase | Only when it carries information (network, category, status, count) |
| `num-l` | 30 / 1.05 | 26 | 500, tabular | Prices, KPIs |
| `num` | 14.5 | 14 | 500, tabular | Table data |

## 5. Layout

- 12 columns, max 1280, gutter 24. Prose max 68 ch.
- Section rhythm: 112 px between home sections, 64 px inside pages, 24 px inside panels.
- Construction layer (Kerb): thin 12-column hairlines and corner crosshairs behind the home hero and section heads only. Never behind forms, tables or the hire sheet.
- Section head: hairline rule, crosshair at the left end, label left, annotation right (a count or time), `h2` below.

## 6. Components (build once in `packages/ui` or `apps/web/app/_components/ui`)

Port from Kerb unless noted. Each lists states.

| Component | Notes |
|---|---|
| **SiteHeader** | 64 px, sticky, blurred canvas, hairline bottom. Left: Marque mark + wordmark. Nav: Marketplace, Quest, Positions, Builders, Docs (Proof pages move under a "Proof" menu: Standard, Ledger, Receipts, Status, Protocol). Right: **Network pill** (`● BSC Mainnet`, moss; amber if the indexer lags; oxide if RPC is down), **Status pill** linking `/status`, Connect (RainbowKit themed), theme menu. When a quest is in progress: a thin progress bar under the header showing n of 5 |
| **MobileNav** | Drawer: nav, network, theme, Connect, quest progress. Focus trap, Escape closes |
| **ConnectButton** | RainbowKit `ConnectButton.Custom`, themed with tokens. Shows short address + network + quest n/5 when connected |
| **Toast / Toaster** | Bottom right desktop, top on mobile. Info 4 s, success 6 s with explorer link, error persists. `aria-live="polite"`. Never raw error text |
| **TxStepper** | The heart of the hire sheet. Vertical list of named steps with state: waiting, in wallet, confirming (with tx link), done, failed (mapped reason + Retry), skipped (with why, for example "Allowance already covers this"). Keeps its width; never jumps |
| **ErrorMap** (`packages/commerce/src/errors.ts`) | Maps every custom error of AgenticCommerce, EvaluatorRouter, OptimisticPolicy, ERC-20, and wallet codes (4001 rejected, 4902 unknown chain, -32002 pending) to a sentence with the next step. Examples in section 9 |
| **Field** | Numeric right-aligned, token suffix, helper, error |
| **Pill / Badge** | `Hireable` (moss), `Preview only` (hair outline), `Warranted 26 Sep` (brass outline), `Tested: failed repayToTarget` (oxide text, small), `Untested` (ink-3), `Retest due` (amber), `Marque reference` (brass-dim fill), network pill |
| **AgentAvatar** | Keep the existing registry image plus generated emblem fallback |
| **PriceTag** | `0.10 USDT` in `num-l`, below it `Live quote · 12:41 left` (MEASURED) or `Declared price` (CLAIMED) |
| **Stars** | 1 to 5, average with count, "verified buyers" label |
| **Kpi** | Label, value, unit, provenance chip, optional delta |
| **MeasureRule** | Keep. Used in deliverable cards (health factor, range, APR, grid band) |
| **Skeleton / EmptyState / ErrorState** | Skeletons match final geometry. Empty says what belongs here and the next action. Error names the source and whether anything changed |
| **AddressChip / HashChip** | Middle truncation, copy, explorer link with correct network |
| **SectionHead, Disclosure, Tabs, Tooltip, Drawer, Sheet, Modal** | As Kerb. `Sheet` is the bottom sheet on mobile and a right-side panel at 1024+ |
| **QuestTracker** | Five steps (four categories + list your agent), each with state and a next action; compact variant for the header and `/me` |
| **Tape** | Horizontal ticker of real recent Marque hires and ratings (agent, category, price, short tx, age), pauses on hover, static under reduced motion, hidden if empty |
| **Footer** | Four columns (Market, Quest and builders, Proof, Ecosystem), the network and contract line, socials, support link, giant wordmark clipped at the bottom (Kerb) |

## 7. Information architecture

| Route | Job | Change |
|---|---|---|
| `/` | Sell the hire in 5 seconds, route quest users | Rebuilt |
| `/quest` | Complete Set and Earn in one place | **New** |
| `/register` (label "Marketplace") | Find and compare | Consumer-first default |
| `/register/[category]` | Category shelf | Same |
| `/agents/[slug]`, `/agents/56/[tokenId]` | Storefront | Rebuilt with purchase panel |
| Hire sheet (overlay on any page, deep link `?hire=<agentKey>`) | Hire | **New** |
| `/jobs/[chainId]/[jobId]` | Job Room | **New** (Run Room stays for legacy runs) |
| `/me` | My Marque: quest, jobs, controls, listings | Rebuilt |
| `/builders` | Build, test, list | Rebuilt around a checklist |
| `/protocol` | Every contract we read and write, per network | **New** |
| `/status` | Freshness, indexer lag, quest stats | Extended |
| `/app/charter`, `/app/charters` | Charter sandbox | Relabelled "Charter sandbox (testnet)", moved under Proof |
| `/standard`, `/ledger`, `/receipts`, `/pancakeswap*`, `/docs`, `/judge` | Evidence | Kept, restyled by tokens only |

## 8. Page specifications

### 8.1 Home

```
[header]
+ ─────────────────────────────────────────────────────────────────────── +
  BNB SMART CHAIN · AGENT MARKETPLACE · SET AND EARN IS LIVE
  Hire agents that                           [Field art, right, masked]
  actually work.   (serif display)
  Marque tests BNB Chain agents before you pay, holds your
  payment in on-chain escrow until the work is delivered,
  and records every hire on chain.
  [ Start the Set and Earn quest ]  [ Browse agents ]
  No wallet needed to look around.
+ ─────────────────────────────────────────────────────────────────────── +
  THE TAPE ▸ Sluicegate · Yield · 0.10 USDT · 0x3a…080a · 2m  ·  Keel · …
```

Then, in order:

1. **Four categories** (tiles, equal size): name, one-line job ("Keeps your Venus loan away from liquidation"), `N hireable`, `from 0.05 USDT`, best rating, and a MeasureRule glyph. Click opens the category shelf.
2. **Ready to hire now**: 6 cards (section 8.3), mixing categories, Hireable only, sorted by quality then rating then price.
3. **How a hire works**: four steps in a row with small icons: Get a live quote · Pay into escrow · Agent delivers · Rate it. Under it, three protections in plain words: "Your payment sits in BNB Chain's escrow contract, not with Marque", "Exact amount only, never an open-ended approval", "If the agent doesn't deliver, you reclaim it".
4. **Why Marque** (the moat, short): "We test agents before you do" with the pass and fail pair (existing), the funnel reduced to one line and a link ("358,438 registered · 7,115 answering · N hireable · 4 warranted"), the Ledger headline.
5. **Build your own agent**: builder CTA with the checklist preview.
6. Footer.

### 8.2 `/quest`

```
SET AND EARN · BSC MAINNET
Complete the quest on Marque.
Hire one agent in each category, rate them, and list an agent you built.
                                                  [ Connect wallet ]  (if not connected)

 Your wallet  0x7a3f…c412   BNB for gas ✓ 0.004   USDT ✓ 2.10   [Get USDT]
 ───────────────────────────────────────────────────────────────────────
 ● Yield           done     Sluicegate · 0.10 USDT · rated 5★     [View job]
 ○ Grid            next     Recommended: Lattice · 0.10 USDT       [Hire]  [See all 5]
 ○ Rebalancing              Recommended: <agent> · 0.15 USDT       [Hire]
 ○ Health factor            Recommended: Keel · 0.05 USDT          [Hire]
 ○ List your agent          0 of 5 checks passed                   [Start]
 ───────────────────────────────────────────────────────────────────────
 Total to finish: about 0.40 USDT + gas · about 8 minutes
 Progress is read from the chain. Verify it: marque.trade/api/v1/phase2/wallet/0x7a3f…
```

- Recommendation: best Hireable in the category by (Warranted, verified-buyer rating, delivery time, price). "See all" opens the category shelf filtered to Hireable.
- Each row updates from the Quest Index. Pending state shows "Waiting for the chain" with the tx link.
- Optional "Hire all four" basket: one bounded approval for the sum (shown), then the four job sequences back to back in one sheet. Default off.
- When all five are done: a completion card with the five tx links and a share image. No rewards language of our own.

### 8.3 Marketplace (`/register`)

- Title "Marketplace", subline "The Marque Register", live count and freshness.
- Tabs: **Ready to hire** (default) · Try free · All tested · Registry (graveyard). The graveyard stays one tap away with its honest reasons.
- Filters: category, network, token, price max, rating min, Warranted only, first-party toggle, sort (Recommended, Cheapest, Fastest, Best rated, Recently tested).
- Card:

```
[avatar] Sluicegate                        [Marque reference]
 YIELD · BSC MAINNET
 Net APR at your size across Venus, Lista and PancakeSwap.
 ───────────────────────────────────────────────────────────
 ● Hireable          0.10 USDT        ★ 4.8 (23 verified)
 Warranted 26 Sep    delivers ~20 s   answered 3 min ago
 [ Try free ]                              [ Hire ]
```

Third-party failing MCS reads: `● Hireable` and below it `Tested: failed repayToTarget (26 Sep)`, still with Hire.

### 8.4 Storefront (`/agents/[slug]`)

Two columns at 1024+. Right: sticky **purchase panel** (avatar, name, category, network, PriceTag, delivery time, verified rating, jobs delivered, `Hire` primary, `Try free` secondary, "What you authorise: exactly this price, into escrow. Nothing else."). Left, in order:

1. What it does (plain language, from metadata, CLAIMED chip)
2. What you get (a rendered sample deliverable from its last public job or preview)
3. Track record: jobs funded, delivered, settled, refunded, disputed; verified-buyer rating and recent reviews; receipts
4. Marque verification: Warrant or failure with fields, date, link to the case
5. How it works: protocol, endpoint, quote rules, dispute window, refund date logic
6. Permissions: "Service fee only. This agent gets no access to your wallet or funds." (or the Charter scope for execution agents, later)
7. Identity and evidence: registry id, identity contract, registration tx, owner, agent wallet, last metadata update, last probe, last quote. All with network-correct links.

### 8.5 Hire sheet (Chamber surface)

```
 HIRE · BSC MAINNET                                              [close]
 [avatar] Keel · Health factor · #341556
 ─────────────────────────────────────────────────────────────────────
 1 What should Keel check?
   Wallet to check  [ 0x7a3f…c412 (you) ▾ ]      (category preset form)
 2 Price
   0.05 USDT  Live quote · valid 13:52          delivers in ~20 s
   Protocol fee 0.00 · Gas about $0.02
   Refund: if Keel doesn't deliver, reclaim from 1 Oct 14:02 UTC
 3 Pay and hire                                   Your controls ▸
   ✓ Open the job                    confirmed · 0x3a…
   ● Attach buyer protection         check your wallet
   ○ Lock the price at 0.05 USDT
   ○ Allow exactly 0.05 USDT         (skipped if already allowed)
   ○ Pay 0.05 USDT into escrow
   ○ Tell Keel to start              (no signature)
 [ Continue in wallet ]
```

- "Your controls" disclosure: exact amount, where the money sits (escrow contract address, linked), how to cancel before paying, how refunds work, how to revoke allowances in `/me`.
- With EIP-5792: steps 2 to 5 collapse into one "Confirm protection, price and payment (one signature)" line that expands to show the four calls.
- On success: the sheet becomes the Job Room head with "Keel is working" and a link to the full room.

### 8.6 Job Room (`/jobs/[chainId]/[jobId]`, Chamber)

Head: agent, category, network, amount, state name. Timeline from chain events (Opened, Protection attached, Price locked, Paid into escrow, Agent notified, Delivered, Window ends <time>, Settled, Paid to agent) with times and tx links. Body: the **deliverable** rendered for the category (health factor with MeasureRule and exact repay; range plan with the tick range; yield route table; grid levels with fee drag), with "View raw" for the manifest and its hash check. Actions by state:

| State | User sees | Actions |
|---|---|---|
| OPEN / REGISTERED / BUDGETED | "Finish paying to start the job" | Continue, Cancel job |
| FUNDED | "Keel is working" with elapsed time | Nothing needed; after the delivery deadline: "Keel hasn't delivered. You can reclaim on <date>" |
| SUBMITTED | "Delivered. Payment releases to Keel on <date> unless you report a problem" | Rate, Report a problem |
| COMPLETED / PAID | "Done. Keel was paid." | Rate (if not yet), Hire again |
| EXPIRED | "Reclaim your 0.05 USDT" | Reclaim payment |
| REFUNDED / REJECTED | "Refunded to your wallet" | Hire another agent |

### 8.7 My Marque (`/me`)

Sections: Quest tracker · Active jobs · History · **Spending controls** (per token: current allowance to the AgenticCommerce contract with "Revoke" to zero, and a note that funded escrow is not affected) · Ratings you gave · Your agents (from the owner API, with quality checks) · Earnings (if you own agents: jobs received, paid out).

### 8.8 Builders (`/builders`)

"List an agent you built." A five-check list that reads the connected wallet: (1) ERC-8004 identity owned, (2) ownership proved, (3) endpoint live and callable, (4) classified, (5) answered a live test. Each check shows pass, fail with the exact fix, or "not yet". Side panel: "Build one with BNB Agent Studio" (`pip install bnbagent-studio`, `bag` in Claude Code or Cursor, link to docs), a link to Marque's open-source reference agents as templates, and "Already have an agent? Claim it". The existing claim and test routes become steps inside this page.

### 8.9 Protocol (`/protocol`)

Per network: every contract (Identity, Reputation, AgenticCommerce, Router, Policy, payment tokens, MarqueRegistry), what Marque reads and writes on each, the event list with topic0, the indexer cursor and lag, and the API endpoints. This is the page we point Gwen to.

## 9. Copy and error map examples

Buttons name the action; toasts repeat the verb: "Pay 0.05 USDT into escrow" then "Paid into escrow". No em or en dashes anywhere. Empty values say what they are ("No jobs yet"), never a dash glyph.

| Code | Sentence |
|---|---|
| 4001 | "You cancelled in your wallet. Nothing was sent." |
| 4902 / wrong chain | "Your wallet is on another network. Switch to BNB Smart Chain to continue." [Switch] |
| `BudgetMismatch` | "The price changed before payment. Get a fresh quote and try again." |
| `ExpiryTooShort` / `SubmissionTooLate` | "This job's deadline is too close. We'll set a new one." (auto-retry once) |
| `UnsupportedPaymentToken` | "This agent asked for a token the escrow contract does not accept here. Choose another agent." |
| `WrongStatus` / `WrongJobStatus` | "This job has already moved on. Refreshing it." |
| `NotClient` / `NotJobClient` | "Only the wallet that opened this job can do that. Switch to 0x7a3f…c412." |
| `NotExpired` | "You can reclaim this payment from <date>." |
| `EnforcedPause` | "BNB Chain's escrow contract is paused right now. Nothing moved. Try again later." |
| ERC-20 insufficient balance | "You need 0.05 USDT and have 0.02. [Get USDT]" |
| Insufficient gas | "Add a little BNB for gas (about $0.02). [How]" |
| Quote expired | "The price expired. Here's a fresh one." |

## 10. Motion

Keep the existing loading mark and reveal. Add: TxStepper step transitions (160 ms), quest progress fill (600 ms once per change), Chamber dim when the hire sheet opens (260 ms), toast slide. Nothing on scroll. Everything off under `prefers-reduced-motion`.

## 11. Responsive

| Width | Behaviour |
|---|---|
| ≥ 1280 | Full layouts, storefront two columns |
| 1024 | Hire sheet as right panel, storefront two columns tighter |
| 768 | Single column, purchase panel becomes a sticky bottom bar with price and Hire |
| 390 | Bottom-sheet hire, 44 px touch targets, quest rows stack, wallet deep links via WalletConnect |

Zero horizontal page scroll anywhere. Long hashes truncate in the middle with copy.

## 12. Accessibility

AA contrast, visible focus (moss ring), full keyboard path through the hire sheet, tx status in `aria-live`, state never by colour alone (icon + word), charts with text equivalents, reduced motion honoured, touch targets 44 px.
