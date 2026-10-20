# Documentation map

Start with the [repository overview](../README.md) for the product tour, architecture image, live entry points and dated evidence. This index groups documents by the question they answer; historical phase records retain their original dates and are not current feature promises.

## Use the product

| Question | Start here |
|---|---|
| What can I do now? | [Live documentation](https://marque.trade/docs), [delivery status](https://marque.trade/docs/delivery-status), [FAQ](https://marque.trade/docs/faq) |
| How do I inspect a service? | [Marketplace](https://marque.trade/register), [Standard](https://marque.trade/standard), [current scope](../README.md#current-scope-v3-october-2026) |
| How do I list my agent? | [Builders](https://marque.trade/builders), [builder and service incident](operations/BUILDER_SERVICE_INCIDENT_2026-10-20.md) |
| Which claims are still unproven? | [Delivery audit](vnext/V3_DELIVERY_AUDIT.md), [requirements crosscheck](vnext/HACKATHON_CROSSCHECK.md), [deviations](DEVIATIONS.md) |

## Build and integrate

| Document | Responsibility |
|---|---|
| [Architecture](ARCHITECTURE.md) | Runtime boundaries, data model, current service bindings and evidence flow |
| [Security](SECURITY.md) | Trust boundaries and handling hostile external endpoints |
| [Machine contract](vnext/P07_MACHINE_CONTRACT.md) | Public catalog, schemas and read-client semantics |
| [Consumer contract](vnext/P13_READ_CLIENT_CONTRACT.md) | Receipt verification and bounded HTTP challenge inspection |
| [Consumer examples](../examples) | Tracked examples for reading and verifying marketplace data |
| [Commerce specification](phase2/SPEC-COMMERCE.md) | Phase 2 protocol specification; read alongside current implementation and deviations |
| [Working rules](../AGENTS.md) | Product invariants, protected observations and action boundaries |

## Operate and verify

| Document | Responsibility |
|---|---|
| [Runbook](RUNBOOK.md) | Operational procedures; confirm the current release before applying older examples |
| [V3 release audit](vnext/V3_RELEASE_AUDIT.md) | Dated validation and deployment provenance, with the later maintenance pointer |
| [Builder/service incident](operations/BUILDER_SERVICE_INCIDENT_2026-10-20.md) | Current declaration repair, live protocol checks and remaining provider/listing limits |
| [Migration inventory](vnext/MIGRATION_INVENTORY.md) | Source hashes, additive changes and the scope of historical restore proofs |
| [Recovery record](vnext/P15_RECOVERY.md) | Interruption recovery and release continuity |
| [Findings](FINDINGS.md) | Recorded measurements and their observation scope |

## Review benchmarks and submission evidence

| Document | Responsibility |
|---|---|
| [Live Ledger](https://marque.trade/ledger) | Current benchmark completion and published evidence |
| [Manual-arm guide](LEDGER-MANUAL-ARMS.md) | How manual benchmark work is recorded and bound to its case |
| [September Agent Advantage Report](AGENT-ADVANTAGE-REPORT.md) | Historical report, separate from current Ledger completion |
| [September submission](SUBMISSION.md) | Original submission record and historical acceptance evidence |
| [Requirements crosscheck](vnext/HACKATHON_CROSSCHECK.md) | Original judging and later campaign criteria, with unverified requirements explicit |

## Follow implementation history

[V3 project state](vnext/PROJECT_STATE.md), [Phase 2 project state](phase2/PROJECT_STATE.md) and their linked checkpoints preserve what was tested, reduced, deferred and deployed. Later entries supersede older status claims; they do not erase original failures or turn archived screenshots into current measurements.

## Maintain these documents

Preserve useful product images, setup steps, navigation and evidence links when correcting a claim. Label an older recording with its date and scope; replace a current illustration only after reviewing its replacement. Keep the architecture SVG and its embedded copy synchronized, check local links and image loading, and connect release claims to the implementation actually deployed. Public screenshots must contain only reviewed public product data; private diagnostics, credentials and planning evidence stay outside the repository.
