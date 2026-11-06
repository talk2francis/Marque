# Capacity observations

Original k6 summary exports, copied without changing their metrics from `/root/.marque/load/p2-11-run3/` and `/root/.marque/load/20261106T023015Z-0e9f5c5/`. Method, context and interpretation: [LOAD-TEST.md](../../phase2/LOAD-TEST.md).

The September run completed. Every November stage aborted on latency; the runner incorrectly continued after the first abort. The 250-visitor stage also recorded two 5xx responses. The restart counters rose by one between the 100 and 250 stages; within-stage counters were unchanged. These are failed capacity observations, not a supported visitor count. The two route mixes differ and must not be treated as a before/after benchmark. k6 ran on the same box as the application. No new production load was generated to copy these files.
