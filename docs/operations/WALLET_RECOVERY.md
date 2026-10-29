# Wallet recovery and registration edits

Marque shares one wagmi configuration across its wallet islands. wagmi persists connector identifiers rather than executable connector methods. After a reload, a saved connection must resolve to the current connector before any wallet action can use it.

`apps/web/app/_components/wallet/repair.ts` matches a live connector by UID, then by an unambiguous ID and type. If its UID changed, both the connection map key and the current selection move together. A healthy connection keeps its accounts. An unavailable or ambiguous wallet stays unchanged until discovery provides a match; the repair does not repeatedly publish an unchanged connection map. Both state changes and connector discovery are watched. Repair itself never connects a wallet or requests a signature.

## Editing an agent

In **My Marque → Building → Agents**, the identity owner can choose **Edit name and registration**. Marque reads the registration and owner from the agent's own network. The client verifies that the response names that exact network and token before constructing a transaction.

The owner signs one ERC-8004 `setAgentURI` transaction. The updated JSON preserves services and extension fields. Clearing a description clears its indexed text as well. A network switch disables duplicate saves; cancelling during that switch invalidates the pending attempt before it can open a signature request. A failed initial read offers **Try again** and **Cancel**.

After a successful receipt, Marque requests a bounded index refresh. A successful refresh means the metadata and current service declarations were refreshed. Old service bindings and probe observations remain available as history. Public views show the new metadata as their short caches refresh.

If the chain transaction confirmed but the index request failed, timed out or was rate limited, the UI says **Saved on chain** and explains that another signature or payment is unnecessary. A confirmed chain update and an index refresh are separate outcomes.

## Verification

The focused regressions run without a wallet, RPC or database:

```sh
pnpm exec vitest run \
  apps/web/app/_components/wallet/repair.test.ts \
  apps/web/lib/registration-edit.test.ts \
  apps/web/lib/registration-index-client.test.ts
```

`apps/web/lib/registration-edit.integration.test.ts` also checks metadata clearing, current service declarations and unchanged probe history in real PostgreSQL. It runs only with `MARQUE_INTEGRATION_DB` pointing at a separate, migrated database whose name starts with `marque_vnext_fixture_`. CI creates its own fixture database for this suite.

Browser checks should cover reload, discovery, disconnect and explicit reconnect, then cancellation before confirmation. A Chromium virtual WebAuthn authenticator verifies the Marque Pass browser path; it does not establish compatibility with every physical passkey device or a real Rabby extension. Actual signing remains subject to the user's browser, authenticator and wallet.
