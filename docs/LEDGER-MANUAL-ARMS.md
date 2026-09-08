# Running the Ledger's manual arms

*A practical guide for the human analyst. Read once, then keep it open while you run.*

---

## Why this exists and why it can't be automated

The **Standard** (MCS) asks whether an agent is *correct*. The **Ledger** asks whether
hiring it *beats doing the work yourself* — and that question has no answer until a person
actually does the work yourself, by hand, with a stopwatch running.

Every agent arm is already recorded (`pnpm tsx scripts/p8b-run.mts --arms`). What is
missing is the other half of each experiment: **you, timed, answering the same task at the
same block.** Simulating that — guessing "a human would take about 20 minutes" — would be
an estimate rendered as a measurement, which is the one thing this project never does. The
whole value of the manual arm is that someone held a real stopwatch.

You need **two repetitions of each of the four benchmarks — eight runs total.** Budget
about **two hours.** It is boring and it is the point.

---

## Before you start

### The four benchmarks

| ID | Category | What it asks |
|---|---|---|
| **ADV-01** | Security | Triage a live BSC contract: list its privileged functions and who can call them, from the verified source. |
| **ADV-02** | Rebalancing | A PancakeSwap V3 re-centre decision on a live position, at a pinned block, under a supplied ±% policy. Report tick, in-range, distance to bound, proposed ticks, token amounts, slippage bound. |
| **ADV-03** | Yield | Best net route for 1,000 USDT across BNB Chain venues — net APR *at that size*, after gas and swap cost, every rate sourced. |
| **ADV-04** | Health factor | The exact repayment, to the token, to restore a Venus position to a target health factor, at a pinned block. |

Open each task in full at **`/ledger/intake`** — the exact text, the pinned block, the
policy, and the fields it wants back are all there. Read the task before the clock starts;
reading time is not run time.

### Tools you may use

Anything a competent analyst would reach for: BscScan, the verified contract source,
PancakeSwap's and Venus's own UIs, a calculator or a spreadsheet, the V3 math from
`packages/positions/src/v3-math.ts` if you want to check your tick arithmetic, an RPC
console. **You may use more than the agent can** — the agent reads raw bytecode and storage
at one block; you can read verified source and use a browser. That asymmetry is
acknowledged in every rubric and is deliberate: it is the human's home advantage, and the
experiment is fair precisely because it is stated.

You may **not** look at the agent's answer for that benchmark before you finish yours. If
you have already seen it, you are the wrong person to run that arm — get someone who
hasn't.

### The block problem

Each task names a block (e.g. ADV-02 is block 120077706). BSC keeps ~64 blocks of state
(~30 seconds), so you **cannot** read that block from a public node now. Two options:

- Use an **archive RPC** (Ankr / QuickNode / Alchemy archive tier) that can `eth_call` at a
  historical block. Put its URL in `BSC_RPC_URLS` for the session.
- Or reconstruct the state from the transaction history up to that block on BscScan.

If neither is available for a given benchmark, record that in the `note` field of your
submission and answer for the **current** block instead, stating clearly that you did so.
An honest deviation is fine; a silent one is not.

---

## Running one arm

1. **Set up.** Task open, tools open, a real stopwatch app (phone, `timer` CLI, a kitchen
   timer — anything you will not fudge). **Start a screen recording** now (QuickTime, OBS,
   `wf-recorder`, Loom — whatever). The recording is your evidence that the elapsed time is
   real; it does not need to be pretty.

2. **Start the clock** the moment you begin working the problem — not when you open the
   page, and not after you have already half-solved it in your head.

3. **Do the work.** Produce every field the task asks for. Where a number comes from a
   contract read or a block, note the source inline — the rubric scores provenance, and an
   unsourced figure scores zero on that criterion even when it is right. State a slippage
   bound where the task asks for one; its absence is an incomplete answer, not a neutral
   omission. If you would refuse to act (data missing, contract paused), say so and say
   why — that is a valid answer.

4. **Stop the clock** when your analysis is complete — when you would hand it to someone to
   execute. Note the elapsed time to the second. Stop the recording.

5. **Do not tidy the output afterward.** Whatever you had at the moment you stopped the
   clock is what gets submitted, warts included. Reformatting after the fact inflates the
   quality without paying the time for it.

Repeat for **rep 2** of the same benchmark (ideally not back-to-back — a second run
immediately after is faster only because you just did it, which is not a representative
number). Then move to the next benchmark.

---

## Recording it

Go to **`/ledger/intake`**. For each run:

| Field | What to put |
|---|---|
| **Benchmark** | ADV-0x |
| **Repetition** | 1 or 2 (it refuses to overwrite an existing rep — a second paste is rep 2 or an error, never a silent replace) |
| **Your analysis, verbatim** | Paste exactly what you produced. It is stored and published whole and hashed; it is not edited, reworded or scored on submission. |
| **Elapsed time** | Minutes and seconds from your stopwatch. **Required, never defaulted** — the form will reject a blank. |
| **How you measured it** | One line: "iPhone stopwatch, started at problem read, stopped at complete analysis", or similar. Published with the result. |
| **Your hourly rate (USD)** | Optional. What your time is worth, so a reader can re-price the comparison for their own cost of labour. |
| **Out-of-pocket (USD)** | Optional. Anything you paid — an archive RPC minute, a data subscription, gas. |
| **Evidence URL** | The screen recording. Upload it somewhere durable (Drive, S3, an unlisted YouTube link) and paste the URL. |
| **Note** | Anything the reader should know: a tool that was down, a block you could not reach, an assumption you made. |

On save you get back an `outputHash` and a `manifestHash`. Keep them — they are what proves
the output shown on `/ledger` is the output that was graded.

After the second rep of a benchmark lands, `/ledger` flips that benchmark from **"awaiting
the manual arm"** to a real side-by-side experiment: **TIME · COST · QUALITY**, human left,
agent right.

---

## Blind scoring (the last step, done separately)

Recording an arm does **not** score it. The intake form has no "how well did I do" field on
purpose. Scoring happens afterward, once, and blind:

1. A scorer — ideally not the person who ran the manual arm, and not the person who wrote
   the agent — takes **both** outputs for a benchmark with their **source labels stripped**
   (arm A / arm B, not "human" / "Bound").
2. They grade each against the **pre-registered rubric** for that benchmark — the one hashed
   *before any arm ran*, visible in the task's `rubric` and at `/ledger/methodology`. Five
   criteria, 100 points: Correctness (40), Completeness (15), Provenance (15),
   Actionability (15), Stated limits (15).
   - A single wrong figure a reader would act on scores **zero on Correctness**, regardless
     of the rest.
   - Proposed ticks that are not multiples of the pool spacing score **zero on
     Actionability** — the plan cannot execute.
   - An unsourced number scores **zero on Provenance** even when correct.
3. Scores go in via the scoring path (`scoreBreakdown`, `scoreTotal`, `scoredBlind: true`).
   Until that happens the QUALITY cell honestly reads *"unscored — blind scoring needs both
   arms"*.

The rubric is not negotiable after the fact. If it turns out to be a bad rubric, that is a
finding to publish, not a reason to quietly regrade.

---

## What would void a result

- An elapsed time nobody actually measured.
- An output edited, reformatted or completed after the clock stopped.
- The analyst having seen the agent's answer first.
- Scoring that was not blind.
- Regrading against a rubric written or changed after an answer was seen.

Any of these means the run is discarded and re-done, not fixed. First-party observations
are never deleted (`AGENTS.md` invariant 12) — a discarded run stays in the table, marked,
as part of the honest record.

---

## Quick checklist

- [ ] Archive RPC configured (or note the deviation per benchmark)
- [ ] Screen recording running before the clock starts
- [ ] ADV-01 rep 1, rep 2 → recorded at `/ledger/intake`
- [ ] ADV-02 rep 1, rep 2 → recorded
- [ ] ADV-03 rep 1, rep 2 → recorded
- [ ] ADV-04 rep 1, rep 2 → recorded
- [ ] Recordings uploaded, URLs in each submission
- [ ] `/ledger` now shows four real experiments
- [ ] Blind scoring scheduled with someone uninvolved
