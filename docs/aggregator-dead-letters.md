# Aggregator inbound dead letters

Failed aggregator webhook ingests are retained in the internal `aggregator-inbound` delivery log so an operator can diagnose and replay them without asking the provider to resend.

## Protected endpoints

- `GET /api/integrations/providers/{providerId}/dead-letters`
- `POST /api/integrations/providers/{providerId}/dead-letters/{deliveryId}/replay`

Both endpoints require the existing platform-management permission. Branch-scoped users are filtered by `effectiveBranchId`; a failed record without branch evidence cannot be replayed by a branch-scoped user. Cross-branch administrators can inspect/replay it after the usual role checks.

The list response is metadata-only: provider, external ID, branch, provider status, attempt, error and timestamps. The raw provider payload remains internal to the replay path and is never returned to the UI. Replay claims a failed row atomically, normalizes it again, runs the same idempotent ingest path, and records success or the new failure reason.

The dead letter is operational evidence, not a guarantee that a provider will accept a repeated event. The normal provider authentication, branch mapping, idempotency and menu/order validation still run during replay.
