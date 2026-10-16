# Session continuity and shared services

Owner authorized repairs after the P00 checkpoint. Applied 16 October 2026:

- Enabled root user lingering. Before `Linger=no`; after `Linger=yes`. The existing user manager, tmux server/pane, all PM2 applications and shared daemon PIDs were identical before/after. No service restart.
- Installed `/etc/needrestart/conf.d/60-protect-shared-products.conf` with narrow restart deferrals for PostgreSQL (including instances), Redis, Caddy and PM2. Security package installation stays enabled. Updated daemon libraries require a reviewed maintenance restart; this is a maintenance obligation, not a permanent exemption from patch activation.

The October 15 logs prove the root user-manager shutdown stopped six tmux scopes and killed their remaining processes after five seconds. Maintenance upgraded systemd and restarted shared database/cache services in the same interval. The exact sender of logind's preceding SIGKILL remains UNKNOWN. Lingering removes ordinary absent-session shutdown dependence but cannot guarantee survival of explicit service termination, SIGKILL, OOM or host failure. Old exited sessions cannot be reconstructed from these changes.

Validation: installed Perl override syntax checked; root lingering and identical process/service identifiers captured privately. Do not test by logging everyone out, stopping the user manager or restarting shared daemons.

Rollback: retain the installed override outside `conf.d` to restore the previous restart policy. Disable lingering only with an established real root login and after checking dependent sessions. These rollback steps are not performed during normal validation.

Proxy correlation: the three P00 asset 502s correspond to Caddy reporting TCP connection reset by the port 3201 upstream, rather than missing files. Active application PIDs did not restart; one web error records a slow agents projection. This establishes the transport failure but not its ultimate initiating cause. No speculative proxy retry/buffering change is introduced. The existing trusted Router-state mirror and HTTP transport health checks remain required.

Candidate validation uses a separate local selected-row database, a SELECT-only role with default read-only transactions and five-second statement limits, no production Redis and no production secrets. Browser results from this data subset must never be presented as live marketplace totals or proof of independent human users.

Validation build runs in its own transient user scope with MemoryMax 3 GB, MemorySwapMax 1 GB and an initial CPUQuota of 100%. The final incremental build quota was raised to 200% after observing six vCPUs and approximately 56% host idle CPU; memory/swap limits were retained. Production build/deploy scripts and Caddy configuration are unchanged. The normal build wrapper unconditionally loads production secrets, so candidate validation uses the same Next build and static/public/standard-copy steps with a sanitized snapshot-only environment. Generated next-env references are restored after verification. Dependency versions are unchanged; build warnings identify optional MetaMask React Native storage, pino-pretty and an ox tempo dynamic import. These warnings are retained, not hidden by installing or upgrading campaign dependencies.

Preview isolation correction: its first launch created a new root-owned Caddy autosave (birth/mtime matched that launch). Only the preview was stopped; that file was retained privately, and the preview relaunched with dedicated XDG config/data directories. Production Caddy runs as the separate `caddy` account with explicit `/etc/caddy/Caddyfile`, at the same PID. No production Caddy storage or configuration was changed. This correction is retained in the private execution record.
