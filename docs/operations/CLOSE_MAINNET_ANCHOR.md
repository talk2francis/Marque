# Close record: unsigned mainnet anchor prerequisites

Prepared 6 November 2026. No mainnet transaction has been sent.

- Function: `anchor(bytes32 leaf)`, zero native value.
- Argument: `0x7ee2aa98522bb14615bd9b494ab9d08552734de4f8d21a483b7ec63ede58aa76`.
- Calldata: `0xeecdf9277ee2aa98522bb14615bd9b494ab9d08552734de4f8d21a483b7ec63ede58aa76`.
- Intended operator wallet, from the published protocol record: `0x2e010AaDFdFEbC2AdFCAFA5F83e9687ffA47C573`. The server does not load its key.
- Contract: **not configured on mainnet**. The published MarqueRegistry and the configured anchor rail are testnet only. The same address on another chain must never be assumed to contain the same contract.
- Mainnet gas: **not estimated** because a verified deployed destination is missing. Testnet used 51,007 gas, which is not a mainnet estimate.

To complete this unsigned plan, supply the address of an existing verified mainnet MarqueRegistry, confirm its chain ID and runtime code, simulate this exact call from the intended wallet and read its gas estimate and current gas price. A new contract is outside the post-close brief. Mainnet sending requires the owner's written approval for that exact operation and remains separate from website publication. Never substitute the testnet address or request a key.
