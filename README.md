# Marque

Put your BNB Chain positions in the hands of agents you can hold to account.

Marque reads your BNB Smart Chain positions, ranks the agents that can work on
them against a published test, lets you grant a spend-capped revocable charter,
and proves on-chain what the agent did.

Built for the BNB Chain **"Build the Era"** hackathon.

- **Live** — https://marque.trade
- **Constitution** — [`AGENTS.md`](./AGENTS.md), read at the top of every phase
- **Reductions log** — [`docs/DEVIATIONS.md`](./docs/DEVIATIONS.md)

## Development

```bash
pnpm install
pnpm --filter @marque/db migrate     # requires DATABASE_URL
pnpm typecheck && pnpm test
./scripts/build-web.sh               # standalone build, copies static + public
pm2 start ecosystem.config.cjs
```

Secrets live in `/root/.marque/secrets.env`, outside the repo. Postgres and
Redis are native systemd services; PM2 runs only our own processes.
