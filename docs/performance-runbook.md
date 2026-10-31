# Performance verification runbook

## Frontend baseline

The repository already contains the authenticated Lighthouse runner under
`scripts/lighthouse/`. The last recorded baseline (2026-10-11) covered 9 routes
on desktop and mobile: 18/18 runs passed, all accessibility scores were 100,
and performance scores ranged from 64 to 100. The slowest mobile routes were
`/orders` (64), `/reports` (68), and `/`/`/pos`/`/inventory/items` (70–71).
These are optimization targets, not release blockers by themselves.

Refresh the baseline only against a dedicated test/staging deployment:

```powershell
$env:LH_BASE_URL = 'http://127.0.0.1:3000'
$env:LH_API_URL = 'http://127.0.0.1:3001/api'
npm run lighthouse:all
```

## Read-only API smoke/load

The API harness requires an explicit target and defaults to no production
assumptions. Use a read-only endpoint such as health or a dedicated staging
read endpoint. It reports success rate and p50/p95/p99 latency.

```powershell
node scripts/api-load-smoke.mjs --base-url http://127.0.0.1:3001 --path /api/health --requests 100 --concurrency 10 --max-p95 250 --max-failure-rate 0
```

Do not point this at a live branch or use mutation endpoints. A failed request,
timeout, or threshold violation exits with code 1, making the command suitable
for a release gate. Tune thresholds per staging hardware and keep them under
version control with the deployment evidence.

## Current closure status

Frontend performance evidence exists. Backend capacity thresholds, a real
staging run, and production-like load results are still required before
claiming the competitive release gate is closed.
