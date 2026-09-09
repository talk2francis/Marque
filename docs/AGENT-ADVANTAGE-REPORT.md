# Agent Advantage Report

For the TermiX Challenge. Audited against the production Ledger and all 26 stored benchmark runs on **9 September 2026**.

## Verified status

All four tasks have **two submitted human repetitions each**, and all eight human repetitions have blind quality grades. This is complete human-side recording and grading, not proof that all four comparisons are valid.

The published agent batches still contain **five ungraded repetitions**: two in ADV-01, one in ADV-02, and two in ADV-04. ADV-01 and ADV-04 also have one separately graded reproduction each; reproductions do not replace the published benchmark sitting. All eight human run records contain block `0` and an empty manifest block. Their prose may name a historical block, but the stored provenance does not establish it. No records have been rewritten to fill that gap.

**No same-task, same-block speed, cost or quality advantage is established by this report.** Recorded timings and scores remain available below and in the public manifests. A fast refusal is not a completed yield recommendation.

## P8b repair — 9 September 2026

The gaps above are recoverable without fabricating anything, because the evidence
that was missing is derivable from evidence that was kept.

**Every frozen benchmark task pins exactly one BSC block**, and every human
run&rsquo;s manifest `task_hash` matches that frozen task:

| Benchmark | Frozen task hash | Block pinned in the frozen task |
|---|---|---|
| ADV-01 | `0xfb984f66…` | 120123441 |
| ADV-02 | `0xdb4c04f5…` | 120077706 |
| ADV-03 | `0x32ad0004…` | 120077706 |
| ADV-04 | `0x695b260f…` | 120707631 |

The repair, in order:

1. **Runner fixed.** One comparison sitting now resolves its block, block hash
   and frozen task ONCE — repetitions no longer each fetch a fresh head, and a
   repetition no longer re-registers (and so no longer can rewrite) the frozen
   benchmark. `packages/ledger/src/runner.ts`.
2. **No silent historical fallback.** `resolveBlock` replaces `readableBlock`:
   a pinned block older than the public window with no archive endpoint is an
   explicit `unavailable`, and every engine returns `HISTORICAL_STATE_UNAVAILABLE`
   rather than reading head. `packages/agent-engines/src/{parse,historical}.ts`.
3. **Block provenance, append-only.** `benchmark_run_provenance` records the
   block recovered from the frozen task for the eight human runs that stored
   `0`. The raw `block_number` is never changed; `/ledger` shows both
   (`not recorded → effective 120…`) with the source task hash. Tool:
   `scripts/advantage-repair.mjs` (`--dry-run` default, `--apply` to write).
4. **Historical agent replay.** Where the agent arm needs a second repetition at
   the pinned block, it is replayed against that exact block through a BSC
   archive endpoint (`BSC_ARCHIVE_RPC_URL`, server-side). A repetition is
   rejected unless the engine reports it read the pinned block. A replay is a
   `replay-` batch — eligible to become the published agent sitting, unlike a
   visitor `repro-` reproduction. Tool: `scripts/advantage-replay.mts`.
5. **`comparisonMissing` unchanged in strictness.** It now reads the *effective*
   block (raw when valid, else the provenance-recovered value) but still
   requires two graded repetitions per arm, matching task/input/rubric hashes,
   a verifiable block in every run, and one pinned block across the sitting.

**Status after the repair is recorded in the live Ledger and `/api/v1/ledger`.**
Any benchmark that still cannot be made a valid same-block comparison stays
marked incomplete with the specific blocker; it is not forced green.

## Recorded repetitions

These are the currently published batches returned by `/api/v1/ledger`, not a selection of the best scores. Costs are the stored spend lines; missing values remain missing. Earlier figures that described quoted fees as paid costs or claimed a quality tie on health-factor work are superseded.

| Task | Arm | Run ID | Rep | Recorded block | Elapsed ms | Blind grade |
|---|---|---:|---:|---|---:|---|
| ADV-01 | agent | 9 | 1 | 120077702 | 445 | Not recorded |
| ADV-01 | agent | 10 | 2 | 120077704 | 112 | Not recorded |
| ADV-01 | manual | 18 | 1 | Not recorded (stored as 0) | 547000 | 100/100 |
| ADV-01 | manual | 23 | 2 | Not recorded (stored as 0) | 382000 | 0/100 |
| ADV-02 | agent | 11 | 1 | 120077704 | 862 | Not recorded |
| ADV-02 | agent | 12 | 2 | 120077706 | 374 | 60/100 |
| ADV-02 | manual | 19 | 1 | Not recorded (stored as 0) | 206000 | 60/100 |
| ADV-02 | manual | 24 | 2 | Not recorded (stored as 0) | 177000 | 45/100 |
| ADV-03 | agent | 13 | 1 | 120077706 | 26 | 15/100 |
| ADV-03 | agent | 14 | 2 | 120077706 | 22 | 15/100 |
| ADV-03 | manual | 20 | 1 | Not recorded (stored as 0) | 478000 | 60/100 |
| ADV-03 | manual | 25 | 2 | Not recorded (stored as 0) | 313000 | 0/100 |
| ADV-04 | agent | 15 | 1 | 120077707 | 1140 | Not recorded |
| ADV-04 | agent | 16 | 2 | 120077710 | 587 | Not recorded |
| ADV-04 | manual | 22 | 1 | Not recorded (stored as 0) | 522000 | 60/100 |
| ADV-04 | manual | 26 | 2 | Not recorded (stored as 0) | 362000 | 15/100 |

## ADV-03 reconciliation

The database contains four historical ADV-03 agent runs: IDs 5, 6, 13 and 14. The newest are IDs 13 and 14, recorded on 5 September at block 120077706. Both return the refusal that the task does not state the currently earned APR. Both later received a blind score of 15/100. There is **no subsequent ADV-03 agent rerun** in the stored evidence.

The current registered task explicitly says the holder earns 0% APR, and its structured input includes `currentAprPct: 0`. The stored task/input hashes match the current registration. Consequently, the previous assertion that the refusal definitely came from an earlier task revision is not substantiated by the stored hashes. The response, task interpretation and executed input need reconciliation; completing a grade does not prove that a corrected task was executed.

The report therefore does **not** call ADV-03 complete. Its human submissions and refusal outputs remain available, unchanged. A valid future comparison needs documented execution of the intended task at the same pinned block and complete manifest provenance; a new run must be added, never substituted for an old observation.

## Method and limits

The rubric uses correctness, completeness, provenance, actionability and stated limits. Scores are language-model judgments produced by `scripts/ledger-grade.mjs` using DeepSeek, with arm labels removed and repeated grading. They are not deterministic MCS results. A zero score is a recorded grade, not missing data. Differences between terse and detailed responses are observable; this alone does not prove systematic grader bias.

Rubric registration dates are preserved. The benchmark registration row can change when a task is rerun, so compare each run’s task, input and rubric hashes with the current registration. Completion also requires two distinct repetitions per arm, blind scores and matching positive chain blocks in each run and manifest. Missing provenance is displayed rather than inferred from prose.

## Evidence

- [Live Ledger](https://marque.trade/ledger) and [machine-readable records](https://marque.trade/api/v1/ledger).
- [ADV-01: security triage](https://marque.trade/ledger/ADV-01).
- [ADV-02: rebalancing](https://marque.trade/ledger/ADV-02).
- [ADV-03: yield](https://marque.trade/ledger/ADV-03).
- [ADV-04: health factor](https://marque.trade/ledger/ADV-04).
- [Methodology](https://marque.trade/ledger/methodology).

No historical output, timing, score, hash or run was changed by this audit. Prior report wording remains in Git history.
