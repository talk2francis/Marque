# Charters source verification, 11 November 2026

The owner approved publication to Sourcify. The service reports 18 exact runtime matches and two legacy testnet matches. Creation matches are reported only where the service found the creation transaction; null fields in the JSON are preserved. The two legacy testnet deployments predate source formatting and retain different metadata hashes. Their partial matches must not be described as exact matches. No contract was redeployed for verification.

| Chain | Contract | Source result |
|---|---|---|
| 56 | [LoanGuardFactoryV2 0x60bB1B00](https://repo.sourcify.dev/56/0x60bB1B002c1469DF778Ff1e49F2e5e43cde9eA7d) | Exact runtime match |
| 56 | [YieldSweepFactory 0xb32a26c0](https://repo.sourcify.dev/56/0xb32a26c068d5C650e6C17F390b5c2a72A1968d03) | Exact runtime match |
| 56 | [GridBandFactory 0x2267640b](https://repo.sourcify.dev/56/0x2267640b997dc00139d46cC6A94a89822D43F0a5) | Exact runtime match |
| 56 | [RangeKeeperFactory 0x374b7394](https://repo.sourcify.dev/56/0x374b739439FE25E12B8664EB9231a13EaEC138F4) | Exact runtime match |
| 56 | [CharterFactory 0x45422fCF](https://repo.sourcify.dev/56/0x45422fCF1314c576Fe771Af1F3828fD88Fe0b761) | Exact runtime match |
| 97 | [LoanGuardFactoryV2 0x63F9040A](https://repo.sourcify.dev/97/0x63F9040AA802c1259B59A6AEc0a8856287684748) | Exact runtime match |
| 97 | [YieldSweepFactory 0xd46c7D47](https://repo.sourcify.dev/97/0xd46c7D475fbA434e3A00D3f92feA25E56f55B012) | Exact runtime match |
| 97 | [GridBandFactory 0x5F89CF9a](https://repo.sourcify.dev/97/0x5F89CF9a3fb4fb98C620b6aA796554f171030CC4) | Exact runtime match |
| 97 | [RangeKeeperFactory 0xB5F9c7B3](https://repo.sourcify.dev/97/0xB5F9c7B3A872D5DbbCEBc6049Ab7254140b6168B) | Exact runtime match |
| 56 | [LoanGuardV2 0xa369c039](https://repo.sourcify.dev/56/0xa369c039153c64Ee68f0BB54a1526a9CA6ab19A8) | Exact runtime match |
| 56 | [YieldSweep 0x81d80c58](https://repo.sourcify.dev/56/0x81d80c5884f7d3E2a09f114c9d0401DaAF9C7121) | Exact runtime match |
| 56 | [GridBand 0xDCD39B36](https://repo.sourcify.dev/56/0xDCD39B3645020CB4E1cFAa5Ca39a5d5dedD7c835) | Exact runtime match |
| 56 | [RangeKeeper 0x20fd32e4](https://repo.sourcify.dev/56/0x20fd32e487Ed9611235b3Eb33F95a95d8ee1fe48) | Exact runtime match |
| 56 | [LoanGuard 0xe8482b34](https://repo.sourcify.dev/56/0xe8482b345264a1CA5D4Bb616B12974172EC3a2FF) | Exact runtime match |
| 97 | [LoanGuard 0x0fFf6F69](https://repo.sourcify.dev/97/0x0fFf6F690dc26fdFfb51F844f5dBEbFB26d4f57B) | Partial runtime match |
| 97 | [LoanGuardV2 0x5357BE00](https://repo.sourcify.dev/97/0x5357BE009054FC73b8d5ae33707bb7E0699f4257) | Exact runtime match |
| 97 | [YieldSweep 0xa81c4aFf](https://repo.sourcify.dev/97/0xa81c4aFf4a47B1701292a6961d285105F042eCCa) | Exact runtime match |
| 97 | [GridBand 0x02195Ba7](https://repo.sourcify.dev/97/0x02195Ba716345f7891E45e85AEaE66331549fCd2) | Exact runtime match |
| 97 | [RangeKeeper 0xD18c3eC0](https://repo.sourcify.dev/97/0xD18c3eC08d0D502D64823DFACFD967409355f0b2) | Exact runtime match |
| 97 | [CharterFactory 0xaf53e335](https://repo.sourcify.dev/97/0xaf53e33562B8894314B65F40EB8D199525a6358d) | Partial runtime match |

The two Range Keeper blueprints are non-executable data containers: one `0xfe` byte followed by the compiled Range Keeper creation bytecode. Both match that full byte sequence and share code hash `0xf80350b91a38fd580c1ac1ad3cb8240d36abee72d64d1b7410f8cd9c2ee256c5`. They are not represented as ordinary Solidity runtime verification matches. Factory and live Range Keeper contract source verification is listed above.

The automatic Etherscan forwarding returned a daily submission limit for multiple targets. This report claims Sourcify verification, not completion of BscScan publication. Original responses and job IDs are retained privately. See [machine-readable results](charters-verification-2026-11-11.json).
