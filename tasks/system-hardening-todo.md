# RestoFlow System Hardening Tasks

## test-isolation

- [x] Task 1: Add and test a pure test-database target validator.
  - Acceptance: unsafe/current DB targets are rejected; marked test targets are accepted.
  - Verify: focused Vitest run without SQL Server.
  - Files: `server/db/testDatabaseGuard.ts`, `tests/testDatabaseGuard.test.ts`.

- [x] Task 2: Enforce the guard before SQL pool construction.
  - Acceptance: test mode never falls back to `.env`, `.env.local`, or `DATABASE_URL`.
  - Verify: unsafe integration startup exits before a connection attempt.
  - Files: `server/db/index.ts`, `tests/setup.ts`.

- [x] Task 3: Separate unit and integration commands.
  - Acceptance: unit command is DB-free; integration command requires isolated DB configuration.
  - Verify: unit command passes; unsafe integration command fails closed.
  - Files: `vitest.unit.config.ts`, `vitest.integration.config.ts`, `package.json`.

### Checkpoint: test-isolation

- [x] Focused unit tests pass.
- [x] Unsafe integration preflight is rejected before DB access (`UNSAFE_TEST_DATABASE|TEST_DATABASE_URL_REQUIRED`).
- [x] Typecheck/build remain clean in proportion to the change.
- [ ] Review and commit the isolated slice.

## Remaining approved modules

- [ ] `security-foundation`
- [ ] `authorization-scope`
- [ ] `payment-integrity`
- [ ] `financial-integrity`
- [ ] `inventory-integrity`
- [ ] `operations-resilience`
- [ ] `observability`
- [ ] `ui-accessibility`
- [ ] `delivery-gates`
