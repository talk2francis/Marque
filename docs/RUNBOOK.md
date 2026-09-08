# Marque operations runbook

Written for whoever operates this next — assume that is not the person who built
it. If BNB or anyone else adopts Marque, they run it from this page.

Everything is one VPS: Caddy → PM2 → Node + a native PostgreSQL 16 and Redis 7.
No containers, no cloud control plane.

---

## 0. Where things are

| | |
|---|---|
| Repo | `/root/marque` (lowercase — `ecosystem.config.cjs` hardcodes it) |
| Env / secrets | `/root/.marque/secrets.env` (0600, **not** in git) |
| Process manager | PM2 as root; config `ecosystem.config.cjs`; logs `/root/.pm2/logs/` |
| Web server | Caddy, `/etc/caddy/Caddyfile`, proxies `marque.trade` → `127.0.0.1:3200` |
| Database | PostgreSQL 16, local socket, db `marque`, role `marque` (NOT superuser) |
| Superuser | `sudo -u postgres psql` (peer auth) — for CREATE/DROP DATABASE only |
| Backups | `/root/marque-backups/` + `/var/backups/marque/`, 7-day rotation |
| Ops scripts | `/root/marque/ops/` |
| Deploy | `scripts/deploy-web.sh` (build + `pm2 delete && pm2 start` + asset verify) |
| Live | https://marque.trade |
| Reference agents | served on paths `/agents/<slug>/*` → local ports 8610–8614 |

---

## 1. How to restart

**One app:**
```
pm2 restart marque-web            # or marque-ingest, marque-probe, marque-bound, ...
pm2 logs marque-web --lines 100   # tail its log
```

**Everything:**
```
cd /root/marque
pm2 restart ecosystem.config.cjs
```

**After editing `ecosystem.config.cjs` or when `pm2 reload` won't pick up a new
`server.js`** — `reload`/`restart` do NOT reliably swap the Next standalone
build:
```
pm2 delete marque-web && pm2 start ecosystem.config.cjs --only marque-web
pm2 save
```

**After a reboot** — systemd unit `pm2-root.service` runs `pm2 resurrect`
automatically from `/root/.pm2/dump.pm2`. If it didn't:
```
systemctl status pm2-root
pm2 resurrect
```
Verified: `pm2 kill && pm2 resurrect` brings all 12 apps back and the site
returns 200 (2026-09-08).

**Caddy:**
```
systemctl reload caddy      # after a Caddyfile edit
caddy validate --config /etc/caddy/Caddyfile
```

---

## 2. How to deploy a change

```
cd /root/marque
git pull
set -a && . /root/.marque/secrets.env && set +a
bash scripts/deploy-web.sh      # builds, swaps the PM2 app, verifies an asset resolves 200
```
`deploy-web.sh` is the only correct path. A bare `pnpm build` rewrites
`apps/web/.next` while the running server serves `_next/static` from it → the
live site 400s its CSS/JS for the ~3 minutes of the build. Always build **through
the deploy script**, which builds then swaps atomically.

During judging (Sep 9–23) assume **FROZEN**: uptime, monitoring, security
patches and bug fixes only. Data accrual — the index staying fresh, probes,
sealed calls resolving, self-serve listings, real hires — is the product
operating normally and continues regardless. No new features or redesigns
without a written yes from Francis. See `docs/SUBMISSION.md` for the standing
post-deadline rule and the organisers' answer once it arrives.

---

## 3. Backups and restore

**Nightly** (cron, 03:17 UTC): `ops/pg-backup.sh` → `pg_dump | gzip` to both
backup dirs, 7-day rotation. If `MARQUE_BACKUP_REMOTE` (an rclone `remote:path`)
is set and `rclone` is installed, it also pushes offsite — **do this**: a
single-disk VPS has no real offsite by itself. `rclone config` a Backblaze B2 or
S3 bucket, put `MARQUE_BACKUP_REMOTE=b2:marque-backups` in `secrets.env`.

**Restore-test** (cron, Mondays 04:42 UTC): `ops/pg-restore-test.sh` restores
the newest dump into a throwaway database, compares row counts against
production, checks every first-party table came back non-empty, drops the
scratch db. Last run: PASS (2026-09-08, 45 MB dump, all tables match).

**To actually restore production** (only if the database is lost):
```
set -a && . /root/.marque/secrets.env && set +a
# stop writers first
pm2 stop marque-ingest marque-probe marque-classify marque-conform marque-pancake-watch marque-web
# recreate the db (as the superuser) and restore as the marque role
sudo -u postgres psql -c "DROP DATABASE IF EXISTS marque WITH (FORCE);"
sudo -u postgres psql -c "CREATE DATABASE marque OWNER marque;"
LATEST=$(ls -1t /root/marque-backups/marque-*.sql.gz | head -1)
gunzip -c "$LATEST" | psql "$DATABASE_URL"
pm2 start ecosystem.config.cjs
```

### Two data tiers — treat them differently (AGENTS.md invariant 12)

- **Derived state** — `agent`, `agent_service`, `agent_category`, `ingest_cursor`
  (and `funnel_snapshot`, append-only). Rebuildable by running ingest from
  cursor zero. `ops/rebuild-drill.sh` proves this into a scratch db and confirms
  the ingest code path has **no** insert/update/delete against any first-party
  table. Last run: PASS.
- **First-party observations** — `probe`, `conformance_result`, `receipt`,
  `run`, `run_event`, `benchmark_run`, `sealed_call`, `pool_tick_observation`,
  `builder_listing`, `product_event`. **These cannot be reconstructed from
  anything.** They are measurements Marque made. They are covered only by the
  nightly dump + the restore test. **No code path may delete one.** If you find
  one, remove it.

---

## 4. Monitoring and alerts

`marque-health` (PM2) runs `ops/health-monitor.sh` on a 60s loop. It checks
`/status`, `/api/v1/funnel`, and each reference agent's `/health`. On **two
consecutive failures** of any check it sends one Telegram message; it sends one
recovery message when the check clears.

**To arm Telegram alerts** — add to `/root/.marque/secrets.env`:
```
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_CHAT_ID=<your numeric chat id — message @userinfobot to get it>
```
then `pm2 restart marque-health`. Without them it still logs failures to
`/root/.pm2/logs/marque-health-out.log`; it just can't page anyone.

### What each alert means

| Alert | Likely cause | First move |
|---|---|---|
| `status failing` | web process down, or DB unreachable | `pm2 restart marque-web`; `pm2 logs marque-web`; `psql "$DATABASE_URL" -c "select 1"` |
| `api-funnel failing` | DB slow / out of connections | check `pg_stat_activity`; `systemctl status postgresql`; restart web |
| `agent-<name> failing` | that agent process crashed or its port is stuck | `pm2 restart marque-<name>`; `pm2 logs marque-<name>`; check `WALLET_PASSWORD` / keystore in `agents/<name>/.studio/` |
| several at once | RPC pool exhausted, or the box is out of memory | `free -m`; `pm2 logs`; see §6 |

### An agent is down at 3am

1. `pm2 restart marque-<name>` and watch `pm2 logs marque-<name> --lines 50`.
2. If it dies on boot: the usual cause is the Web3 keystore or `WALLET_PASSWORD`
   in `agents/<name>/.studio/.env.local`. `node scripts/make-agent-keystores.mjs`
   regenerates all five keystores (new addresses — then re-fund with tBNB and
   re-run `scripts/register-agents-direct.mjs --go`).
3. If only the *path* 502s but the process is up: Caddy lost the upstream —
   `systemctl reload caddy`.
4. The site works without any agent. The marketplace still lists third parties;
   the affected category just loses its reference counterparty until it is back.
   Do not stay up all night for it.

---

## 5. Rotating keys

Private keys live only in `/root/.marque/secrets.env` and the agent keystores.
None is in git.

| Key | Where | To rotate |
|---|---|---|
| `MARQUE_TESTNET_PK` (operator, anchors + seals + charter grants) | `secrets.env` | `bag wallet new` or generate fresh; fund with tBNB; update `secrets.env`; `pm2 restart all`. Old anchors stay valid; new ones use the new signer. |
| Reference-agent wallets | `agents/<slug>/.studio/wallets/*.json` + `WALLET_PASSWORD` in `.env.local` | `node scripts/make-agent-keystores.mjs`, re-fund, re-register (`scripts/register-agents-direct.mjs --go`), `pm2 restart marque-<slug>` |
| Deployer PK (mainnet proof) | never written to disk — passed inline as `PROOF_PK=0x…` | generate fresh, move funds, use the new one inline |
| `SCAN_API_KEY` (8004scan) | `secrets.env` | reissue in the 8004scan dashboard; `pm2 restart marque-ingest marque-web` |
| `DEEPSEEK_API_KEY` (classifier only — never signs, never prices) | `secrets.env` | reissue at DeepSeek; `pm2 restart marque-classify` |
| DB password | `secrets.env` `DATABASE_URL` | `sudo -u postgres psql -c "ALTER ROLE marque PASSWORD '…'"`; update `secrets.env`; `pm2 restart all` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `secrets.env` (optional) | public value; set it to enable WalletConnect mobile in the nav wallet, then redeploy |

After any `secrets.env` change: `pm2 restart all` (env is read at process start).

---

## 6. Circuit breakers and rate limits (already in place)

- **RPC** — `packages/chain/src/pool.ts` `RpcPool`: round-robins 6 endpoints,
  benches one for 30s after 2 consecutive faults, distinguishes an endpoint
  fault from a revert (a revert is not retried elsewhere). `maxAttempts` per
  request = min(pool size, 4). This is the RPC circuit breaker; a dead endpoint
  fast-fails to the next.
- **Reads never fail on one bad item** — `multicallAllowFailure` returns per-call
  status, so reading 300 positions does not blow up on one stale NFT.
- **8004scan** — the ingest worker runs on a per-minute / per-day request
  budget (`budgetMinute` / `budgetDay` in its logs); when 8004scan errors it
  logs and sleeps to the next tick rather than hammering. The marketplace reads
  from our own DB, never live from 8004scan, so an 8004scan outage degrades
  *freshness*, not availability.
- **LLM (DeepSeek)** — used only by `marque-classify`, on a small per-run USD cap
  (`classifySemanticPass({ usdCap })`). It never signs and never prices. An LLM
  outage stops new semantic reclassification; nothing else.
- **Rate limits** — `apps/web/lib/limits.ts`: charter grants 2/min per IP and a
  Postgres-durable daily ceiling (`MARQUE_DAILY_GRANT_CAP`, default 40); the free
  conformance test 6/min; the claim rail 15/min. The `/api/v1/ledger/manual`
  intake and `/api/v1/events` have their own burst limiter.
- **Position reads** — a 12s in-process response cache on
  `/api/v1/pancakeswap/<address>` collapses concurrent reads of the same address.

### Load

`ops/load-test.sh` — 50 concurrent position reads for arbitrary addresses. Last
run (2026-09-08): 50/50 returned 200, site healthy immediately after, latency
p50 ~17s / max ~32s under 50× concurrency (single-request baseline ~2s). It does
not fall over; latency degrades gracefully because the RpcPool spreads load and
benches slow endpoints. A production deployment should add a paid archive RPC
and lengthen the position-read cache.

### Out of memory

The box has 12 GB. The build (`next build`) plus a headless-Chromium audit
running together can OOM. Symptoms: workers logging one line then dying, the
audit tool being "stopped for low memory". `free -m`; kill any stray
`node .../audit*.mjs`; never run an audit during a deploy.

---

## 7. Security posture (summary — full detail in `docs/SECURITY.md`)

- Reads are unprivileged — browsing, comparing, previewing sign nothing.
- The only signature is a charter grant, and it is scoped (allowlist + cap +
  expiry) enforced *before* signing.
- The LLM never signs and never prices.
- Every outbound call to an agent endpoint goes through `safeFetch()` with the
  SSRF guard: no private / loopback / link-local / CGNAT / cloud-metadata
  targets, no redirects, a hard timeout, a size cap.
- Agent-supplied metadata is untrusted and never rendered as HTML.
- Headers: CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, COOP — set in `apps/web/next.config.mjs`.
- SSH: root password login disabled would be ideal; currently `fail2ban`
  (12h bans, 4 retries), `ufw` (SSH rate-limited, C2 IPs blocked outbound),
  an immutable empty `/etc/ld.so.preload`, and `marque-janitor.service` (a 20s
  watchdog). This box was root-compromised via SSH brute-force before the
  hardening; the recovery and the eradication are in
  `docs/DEVIATIONS.md` (REC-01..06) and the janitor log has stayed empty since.

---

## 8. Quick diagnostics

```
pm2 status                                   # every process, restart counts
pm2 logs --lines 60                          # everything, tail
curl -s https://marque.trade/status          # the honest degradation page
curl -s https://marque.trade/api/v1/funnel   # is the DB answering
psql "$DATABASE_URL" -c "select now()"        # is the DB up
free -m ; df -h /                             # memory, disk
systemctl status caddy postgresql pm2-root marque-janitor
tail /var/log/marque-backup.log /var/log/marque-restore-test.log
sudo fail2ban-client status sshd
```
