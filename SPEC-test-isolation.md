# Spec: Test Database Isolation

Module id: `test-isolation`

## Objective

Prevent every automated test, smoke check, and CI verification command from
connecting to or mutating the operational RestoFlow SQL Server database. Tests
that require a database must fail closed unless the connection is explicitly
marked as an isolated test database. Pure unit tests must remain runnable
without a database.

## Tech Stack

- Node.js 22, TypeScript 5.8, Vitest 2.1
- Drizzle ORM with SQL Server through `msnodesqlv8`
- Existing `.env.local` / `.env` runtime configuration
- No new dependency

## Commands

- Pure unit tests: `npm run test:unit -- --run`
- Database integration tests: `npm run test:integration -- --run`
- Verify an explicitly supplied isolated database (read-only): `npm run verify:test-database`
- Full safe test suite: `npm test -- --run`
- Type check: `npm run typecheck`
- Build: `npm run build`
- CI quality gate: `npm run ci:verify`

The exact scripts above are acceptance targets and may be added to
`package.json` during implementation.

## Project Structure

- `tests/setup.ts` — common non-destructive test setup
- `tests/setup-db.ts` — database-only guard and cleanup lifecycle
- `tests/unit/` or an explicit Vitest include list — tests that cannot access DB
- `tests/integration/` or an explicit Vitest include list — DB-writing tests
- `server/db/index.ts` — final connection guard before a test process creates a pool
- `scripts/verify-test-database.ts` — reusable fail-closed connection validation
- `.github/workflows/` — CI test database configuration where present

## Code Style

Trust-boundary checks return a structured reason and the caller throws before
opening a connection:

```ts
const verdict = validateTestDatabaseTarget(process.env.TEST_DATABASE_URL);
if (!verdict.ok) {
    throw new Error(`UNSAFE_TEST_DATABASE|${verdict.reason}`);
}
```

Rules:

- Environment parsing lives in one side-effect-free helper.
- Error codes are stable, uppercase, and testable.
- No fallback from `TEST_DATABASE_URL` to the normal production URL.
- No cleanup query runs until the guard has succeeded.

## Testing Strategy

1. Unit-test connection-string parsing and rejection cases without importing the DB module.
2. Prove rejection of the current operational database name and any unmarked URL.
3. Prove acceptance only when both `NODE_ENV=test` and an explicit test marker are present.
4. Prove pure unit tests run with no SQL Server connection.
5. Run DB integration tests only when an isolated test URL is deliberately supplied.
6. CI must provide a disposable database or skip the DB integration job explicitly; it must never inherit deployment secrets.

Accepted test markers:

- Database name ends with `_test`, `-test`, `_ci`, or `-ci`; or
- `ALLOW_TEST_DATABASE=1` is set together with `TEST_DATABASE_URL` and `NODE_ENV=test` for a disposable CI database.

## Boundaries

### Always

- Validate before importing/initializing the SQL connection pool.
- Use `TEST_DATABASE_URL` for DB-writing tests.
- Keep cleanup scoped to the isolated test database.
- Preserve existing test behavior after fixtures are moved to isolation.

### Ask first

- Creating or deleting a SQL Server database on the user's machine.
- Changing CI secrets or provisioning external infrastructure.
- Moving a large number of test files when include/exclude metadata is sufficient.

### Never

- Fall back to `DATABASE_URL` during a DB-writing test.
- Run cleanup against `CoduisZen` or another operational database.
- Auto-create, drop, truncate, restore, or rename an operational database.
- Print database credentials in errors or logs.

## Success Criteria

- `npm test -- --run` cannot connect to the current operational database.
- An unsafe DB target exits before schema alterations or cleanup statements run.
- Pure unit tests run without SQL Server availability.
- DB-writing tests have a distinct command and require explicit isolated configuration.
- The guard has focused tests for accepted and rejected connection strings.
- Existing `.env` and `.env.local` remain unchanged.
- No production data is inserted, updated, deleted, or schema-altered during verification.

## Open Questions

None. The default implementation will add the guard and test split without
creating a database. Integration tests will remain unavailable until the user
or CI supplies a disposable `TEST_DATABASE_URL`.
