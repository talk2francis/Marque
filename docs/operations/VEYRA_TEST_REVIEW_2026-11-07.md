# VEYRA Keeper test review, 7 November 2026

VEYRA Keeper is registry identity `97:0x8004a818bfb912233c491871b3d84c89a494bd9e:2718`. Its latest recorded MCS-REB-1 run, 16024, passed all eight checks on 7 November at 02:05:10 UTC, against BSC mainnet block 132117587. Earlier runs 15990 and 15991 also passed.

The homepage selected the largest historical failure instead of the latest result for each identity/test. It therefore still highlighted three 3 November records, 15987 to 15989, after subsequent passes. Their saved answer was a valid A2A DataPart (`kind: data`, with its object in `data`). The conformance adapter returned that wrapper instead of its payload. The grader then saw absent fields. That is a platform parsing defect, not evidence that VEYRA stated six wrong values.

The [offline replay](../evidence/veyra-parser-2026-11-07/replay.json) verifies the original request, response and ground-truth hashes. All three payloads pass the same eight unchanged numeric checks against their original frozen ground truth. This is a diagnostic replay, not a new stored test run. No third-party task, payment or chain transaction was sent. No original result, grade, raw answer or case was overwritten.

The repair unpacks only explicitly tagged structured DataParts, preserves application keys, and rejects malformed payloads. The homepage selects failure examples from the latest observation per identity/test, requires a stated wrong value for a failure example, and links both examples with their actual dates. A lone example fills its available column; a reference example carries the existing reference mark. Failed historical records remain available in the record.

An MCS-REB-1 pass establishes the supplied read/planning case and its checks. It does not establish autonomous on-chain rebalancing or a mainnet deployment of a testnet registry identity. The observed failure does not require the agent developer to change the valid saved answers.

Protocol reference: [A2A 0.3 DataPart](https://a2a-protocol.org/v0.3.0/specification/), structured data carried in the `data` member.

The new implementation fingerprint is `0x66057d145adf50c8c2a54c682bdaccc1940f9ed9363bc62c0e3d650718032418` over 48 files. Numeric criteria, tolerances and previously issued fingerprints remain unchanged.
