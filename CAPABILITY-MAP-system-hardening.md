# Capability Map: RestoFlow ERP System Hardening

Objective: remediate the verified security, financial-integrity, branch-isolation,
operational-reliability, observability, and UI/UX findings without overwriting the
existing uncommitted work or allowing automated tests to touch production data.

| Module id | Responsibility | Depends on |
|---|---|---|
| `test-isolation` | Create a fail-closed test database boundary and safe focused-test commands before any behavioral verification. | — |
| `security-foundation` | Remove hard-coded setup/approval secrets, centralize secret redaction, and enforce safe error contracts and request identifiers. | `test-isolation` |
| `authorization-scope` | Centralize role ceilings and branch-scoped authorization for AI actions, audit, subscriptions, budgets, waitlists, wastage, images, and public screens. | `security-foundation` |
| `payment-integrity` | Make Paymob checkout/webhooks authoritative and idempotent, protect provider secrets, and bind transactions to orders and branches. | `security-foundation`, `authorization-scope` |
| `financial-integrity` | Add database-enforced journal/gift-card/drawer idempotency, start finance retries, and introduce an additive exact-decimal money migration. | `test-isolation`, `payment-integrity` |
| `inventory-integrity` | Fail closed on recipe lookup, enforce one stock row per item/warehouse, and make aggregator/order side effects transactional or recoverable. | `test-isolation`, `financial-integrity` |
| `operations-resilience` | Wire cleanup scheduling, harden backup retention/encryption/offsite hooks, and make marketing campaigns consent-aware and deduplicated. | `security-foundation`, `financial-integrity` |
| `observability` | Provide structured redacted logs, durable/correlated error reporting, useful latency metrics, and alerts for payment/finance/background-job failures. | `security-foundation`, `operations-resilience` |
| `ui-accessibility` | Fix hidden-focus navigation, scalable branch selection, non-overlaying business-date alerts, semantic finance tabs, labels, and responsive states. | `authorization-scope`, `observability` |
| `delivery-gates` | Add focused tests, migration checks, lint/type/build gates, browser verification, and a release/rollback checklist. | all modules |

Build order:

1. `test-isolation`
2. `security-foundation`
3. `authorization-scope`
4. `payment-integrity`
5. `financial-integrity`
6. `inventory-integrity`
7. `operations-resilience`
8. `observability`
9. `ui-accessibility`
10. `delivery-gates`

Boundary rules:

- Existing user changes stay intact; overlapping files require surgical patches.
- No destructive or contract-phase database migration runs automatically.
- Tests must fail closed unless they can prove they are using an isolated test database.
- Money migration follows expand -> backfill -> dual-read verification -> contract.
- Public API compatibility is preserved unless a security boundary requires a documented breaking change.
- No new dependency is added when an existing project facility or platform primitive is sufficient.
