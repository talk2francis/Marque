# P00 deviations and limits

- Pack was read from its actual uploaded private directory, not copied into `build-pack/`. Reason: retain private planning/competitive material outside the public repository. No pack instructions replaced root AGENTS or Phase 2 docs.
- The original V1 zip was not available. Inventory covers its ladder as reconstructed in V3; exact original-file completeness is UNKNOWN.
- Raw screenshots, private test reproductions, server logs and competitive research remain off-repo. Only source-safe audit documents are committed locally; nothing is pushed.
- A Phase 2 owner GET was requested before its second publication call site was discovered. Its captured verdict failed qualification, so `listIfQualified` returned before any listing write. The route is now excluded from further browser probes. No production mutation test was performed. Future P01A must cover both GET callers.
- One initial private read-only SQL snapshot referenced a nonexistent scheduler column and stopped; all earlier SELECT results were preserved. Corrected schema names were then queried. No migration, permission relaxation or data change was used.
- BscScan denied the implementation page; Sourcify full/partial metadata was absent at the tested paths. Official source ABI comparison and deployed code/implementation hashes are available; verified-build provenance is still UNKNOWN.
- Configured archive credentials were not accessed. Current configured TLS health, independent backup-key custody, actual person/funding independence, connected-wallet signing and Plinth deliverable bytes remain UNKNOWN.
- Browser failures are retained, including a font 502 and a 45-second charter navigation timeout. Read-only reruns, if any, are additional samples and do not erase them. Samples collected alongside serial low-priority typechecks are not unperturbed production latency benchmarks.
- Visual review also found a profile without its stylesheet and one mobile quest capture without its checklist. Six failed sheet loads and a 60-second metadata request were correlated with long seller-candidate SQL; production probing then stopped. A final metadata-only DB sample found the active queries drained. No queries or other processes were killed.
- No production build, deployment, rollback, restore, new conformance invocation, paid quote/A2A/MCP task, mainnet write or testnet write was run. Full release acceptance is not claimed.
- Tmux repair is prepared separately and held at the P00 read-only review checkpoint; the terminated processes cannot be resurrected by changing session policy.
