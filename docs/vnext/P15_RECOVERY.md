# Release recovery, 18 October 2026

At 13:22:58 UTC the host recorded an ACPI power-key event and began an orderly
power-off. It booted again at 13:45:59 UTC. The event initiator is unknown.
This ended tmux and the running local build. Persistent Codex transcripts,
phase checkpoints, the frozen source manifest and private validation logs
preserved the exact stopping point.

The interrupted source was `2eaac0775823bd94414db99434d6fbe3ae0371b0`.
Its full local run passed 891 tests in 96 files with no skips, including
isolated PostgreSQL and read-only RPC cases. Web typechecking also passed.
GitHub's typecheck/lint/test/build job passed on that source. Its separate
live smoke failed with a marketplace hydration error on the older deployed
release, so the overall workflow was not green.

After boot, Caddy still pointed to port 3201, but the saved PM2 state restored
that web slot as stopped and the older slot on port 3200 as online. Public
requests returned HTTP 502. Restarting only the existing `marque-web-b` slot
restored complete HTTP 200 responses; `pm2 save` persisted the recovery.
Marque and Kerb health were checked separately. Comparisons now use a fresh
post-reboot process baseline; pre-reboot PID continuity is historical.

The resumed local build passed in 586.98 seconds. Lint passed in 77.00 seconds,
copy checks in 15.72 seconds and standalone packaging in 1.20 seconds. All
tracked source hashes still matched the pre-shutdown freeze at that point.
These results do not themselves establish production activation.

The deployment script now saves both available web slots before deployment
or rollback switches the proxy. A failed save prevents cutover. The delayed
retirement also saves its stopped state. This keeps the reboot snapshot
consistent with the slot the proxy depends on. A reboot before retirement
may restore both slots; inspect the live upstream before retiring either.

The first private rollback proof timed out. The unchanged bounded repetition
passed: 0.617 seconds to the old slot and 5.508 seconds back to the candidate.
These are private loopback observations, not a public rollback SLA. Eleven
proxy protection cases and eleven complete-body API samples passed. No
sampled API top-level field was removed; new receipt evidence, exact-service
preflight and nullable health release metadata are additive.

A browser test initially lost a hire dialog when its accessible name changed
from "Hire an agent" to "Hire Plinth keeper" after loading. The product dialog
remained open. The corrected locator passed mobile and desktop checks in
both themes, including selected service, expired-price notice and closing.
No task request, wallet signature or transaction was sent.

The full browser matrix, final artifact binding, production cutover and live
acceptance are recorded in the final P14/P15 checkpoints. No phase is declared
complete solely from this recovery note. Keeper, seller and other-product
processes are outside the release activation scope. No database migration,
observation deletion, new paid resource or mainnet transaction is required.

A cached-client check found four live JavaScript paths returned HTTP 404 from
the new candidate. Staging now retains the previous slot's public static files
without replacing new files. Before cutover, the verifier reads the old live
page and consumes its script, style and font files from the candidate, rejecting
missing files, wrong content types and incomplete bodies. Five local HTTP-fixture
checks cover success, missing chunks, truncated 200, HTML fallback and an error
page without asset evidence. Server code and observation data are not copied.

The first production stage of release d7ee954 returned HTTP 503 for the default
catalog. The release script stopped the candidate and preserved the old live
slot. Its restored-snapshot acceptance remains dated evidence, not production
success. Production had 1,212 classified identities and 892 owners, close to the
snapshot scope. Applying the complete-owner constraint before service
aggregation returned 1,733 qualifying rows in a read-only execution plan taking
2.003 seconds, within the unchanged eight-second bound. The same owner/host
partition and result-parity regressions gate this additional repair.
