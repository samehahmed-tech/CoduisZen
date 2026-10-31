# Implementation Plan: RestoFlow System Hardening

## Overview

Execute the approved capability map in dependency order. Each module receives
its own approved spec, focused tests, and verification before the next module.
The current active module is `test-isolation`.

## Architecture Decisions

- Tests fail closed before the SQL pool is created.
- DB-writing tests use `TEST_DATABASE_URL`; runtime uses `DATABASE_URL`.
- Pure validation stays dependency-free so it can be tested without SQL Server.
- Existing user changes remain in place; patches are limited to the active slice.
- Schema migrations are additive and are never executed against the operational DB during tests.

## Dependency Order

`test-isolation` -> `security-foundation` -> `authorization-scope` ->
`payment-integrity` -> `financial-integrity` -> `inventory-integrity` ->
`operations-resilience` -> `observability` -> `ui-accessibility` ->
`delivery-gates`

## Active Module: test-isolation

### Task 1: Pure target validator

- Add a side-effect-free SQL Server target validator.
- Reject missing, production, same-as-runtime, and unmarked targets.
- Verify with a focused unit test that requires no DB.

### Task 2: Guard the connection boundary

- Make `server/db/index.ts` validate test targets before constructing the pool.
- Stop test mode from loading `.env` or `.env.local` automatically.
- Point integration tests exclusively at the validated `TEST_DATABASE_URL`.

### Task 3: Split safe commands

- Add a DB-free unit Vitest config and an integration config.
- Keep the existing DB suite behind the integration guard.
- Update package scripts and CI verification to run the safe unit gate by default.

### Checkpoint

- Focused validator tests pass without SQL Server.
- Unsafe integration invocation fails before any connection/schema/cleanup action.
- Typecheck succeeds for touched files/project.
- No operational data changes occur.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A test imports the DB transitively | High | Connection-boundary guard is authoritative, not setup-file-only. |
| CI has no disposable SQL Server | Medium | Unit gate remains available; integration command fails with a clear configuration error. |
| Existing tests depend on global setup | Medium | Keep current setup for integration config; use a separate config for pure tests. |
| Dirty worktree overlap | High | Patch only explicit files and inspect each diff before commit. |

## Open Questions

None for `test-isolation`. Later modules remain gated by their individual specs.
