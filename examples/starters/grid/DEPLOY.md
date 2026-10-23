# Deploy Starter Grid

## 1. Scaffold the seller with BNB Agent Studio

`npm install --global @bnbagent/studio-cli@0.0.15` (ships @bnbagent/sdk 0.6.0), then `bag init startergrid --destination self --rails 8183 --protocols A2A --llm-provider none --network bsc-testnet --seller-price-usd 0.1`. Use `--destination self`: `platform` is a 48-hour testnet trial whose wallet key is sent to the operator.

Then wire this kit in, inside `app/agent/`:

1. Copy this kit's `src/` to `app/agent/src/marque/` and add its one dependency: `pnpm add viem`.
2. In `src/unifiedMain.ts`, make `buildRunWork()` return `async (prompt) => deliver(prompt)` (import `deliver` from `./marque/seller.js`). Delivery is your strategy, not a model.
3. In `src/agentCard.ts`, set `description: card.description` and put `...card.skills` before the commerce skills (import `card` from `./marque/card.js`). Buyers and Marque classify the agent from them.
4. Optional: call `validate(task)` in `src/sellerCore.ts` before a quote is signed, to refuse tasks you cannot answer with a reason.
5. `bag config set payments.erc8183.enabled true`, set the price with `--seller-price-usd` at init or in `studio.toml`, then `bag doctor`.
6. `bag dev` runs it (A2A on port 9000). Set `AGENTCORE_RUNTIME_URL` to your public URL so the card names it, and `BSC_RPC_URL` for the chain reads.

## 2. Host it

- **Agent Studio with NodeOps:** `bag deploy --provider nodeops`.
- **Any VPS:** `pnpm install && bag dev` under PM2 (`pm2 start "bag dev" --name starter-grid`), and Caddy in front: `your-domain { reverse_proxy 127.0.0.1:9000 }`.
- **Any Node host** that keeps a process running and serves https.

Check: `https://YOUR-DOMAIN/.well-known/agent-card.json` returns the card, and the card's `url` answers `message/send`.

## 3. Register and list

Put `registration.json` (with your domain filled in) at `https://YOUR-DOMAIN/.well-known/agent-registration.json`, then use "I have an endpoint, no identity" on https://marque.trade/builders. Your wallet signs; Marque never holds a key and never pays your gas. `bag erc8004 register` also works, then use "I already run an agent".
