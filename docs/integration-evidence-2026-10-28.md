# Full SQL integration evidence — 2026-10-28

Environment: SQL Server named instance `localhost\\CODUISZEN`, isolated database `RestoFlow_Test`, `NODE_ENV=test`.

Command: `npm run test:integration -- --run` with `TEST_DATABASE_URL` pointed explicitly at `RestoFlow_Test` and `ALLOW_TEST_DATABASE=1`.

Result after fixing direct `server/app` bootstrap schema drift:

- `132/132` test files passed.
- `669/669` tests passed.
- Exit code `0`.
- The test database guard verified `databaseName=RestoFlow_Test`; the operational `CoduisZen` database was not used.
- The first run exposed `Invalid column name 'birth_date'` in CRM/order flows. The fix makes additive marketing schema initialization run before customer creation and order-side CRM auto-registration when the Express app is imported directly, while production startup remains covered by the existing bootstrap.

Follow-up QR slice: `publicQrModifiers.test.ts` and `coreOrderFlow.test.ts` passed together (`2` files, `15/15` tests), verifying bounded idempotency scope for long public QR actors, authoritative modifier/size pricing, and persistence of both selections.

Latest full rerun after the QR size support: `132/132` files and `669/669` tests passed, including the new SQL E2E.

Latest internal slice: `refundProjectionRepair.test.ts` passed `1/1` on `RestoFlow_Test`; repair defaults to preview, is insert-only when executed, skips records without a branch, and does not overwrite existing SQL projections. A direct cold-start preview after waiting for SQL connection returned `scanned=0`, `inserted=0`, `failed=0` on the isolated test database.

Customer 360 pagination contract now caps refund rows per response at 200, exposes `refundsPagination`, and keeps refund count/value summaries calculated across the full customer history; typecheck and targeted contract test passed.

Security slice: Webhook CRUD now applies authenticated branch isolation, ignores body `branchId` for non-SUPER_ADMIN users, and checks endpoint ownership before update/delete/delivery-history reads; targeted branch/retry contracts passed `5/5` and typecheck passed.

Financial boundary slice: `financialBranchRequired.test.ts` passed `1/1` on `RestoFlow_Test`; balanced `WALLET_PAYMENT` without a branch was routed to `finance_exceptions` and no `journal_entries` row was created.

Wallet posting hardening: wallet deposit/payment now require a branch before mutation and propagate GL failure so the surrounding transaction can roll back; financial boundary contracts passed `5/5`, with typecheck and lint green.

POS finance provenance: first-attempt order posting now uses stable `POS_ORDER:<orderId>` correlation metadata, matching finance retry identity; combined provenance/boundary contracts passed `13/13` and typecheck remained green.

Wallet transaction boundary: wallet creation during deposit now uses the caller transaction rather than the global DB handle, preventing orphan wallet rows after GL rollback; wallet transaction contracts passed `6/6` and typecheck remained green.

Post-wallet verification gate: full unit suite passed `247/247` files and `558/558` tests. Targeted SQL integration for `financialBranchRequired.test.ts`, `refundProjectionRepair.test.ts`, and `coreOrderFlow.test.ts` passed `3/3` files and `16/16` tests on the guarded `RestoFlow_Test` database.

Security gate rerun after the latest branch/GL changes: `66/66` files and `142/142` tests passed.

Production build gate after the same changes: frontend Vite build and server bundle completed successfully; only existing circular-chunk and large-chunk warnings were emitted.

Multi-branch provenance slice: `branchLedgerProvenance.test.ts` passed `1/1` on `RestoFlow_Test`; existing databases were repaired with `branch_id` columns for loyalty ledger, wallet transactions, customer wallets, and suppliers. New customer wallets are protected by a filtered unique index per customer/branch, while legacy global rows remain untouched. Legacy-schema migration paths use dynamic SQL where needed to avoid compile-time references to newly-added columns. Targeted wallet/Customer 360 contracts passed `15/15`, supplier branch contracts passed `10/10`, typecheck and lint remained green.

Post-migration regression gate: full unit suite passed `247/247` files and `559/559` tests, and security suite passed `66/66` files and `142/142` tests.

Hotfix/restart resilience slice: the API now consumes `runtime/drain.request`, returns `SERVER_DRAINING` to new requests, lets in-flight requests finish, closes socket/database resources, and only force-exits after a 35-second safety timeout. The installer supervisor signals the drain instead of immediately killing the API. Runtime contract passed `8/8`, supervisor syntax check passed, offline/day-close/recovery contracts passed `15/15`, full unit passed `247/247` files and `560/560` tests, and the production server build completed successfully. Physical network interruption and payment/day-close UAT remain separate checks.

Mutation transport-safety slice: frontend payment/day-close mutations now expose deterministic `NETWORK_UNAVAILABLE` or `SERVER_DRAINING` errors after transport loss, never auto-retry ambiguous writes, and provide Arabic/English guidance that success was not confirmed. UX/transport tests passed `12/12`; frontend build completed with the existing circular/large-chunk warnings. A real device/network interruption drill is still required before closing the UAT item.

Supplier branch-isolation slice: supplier list/detail reads now show branch-local plus legacy global suppliers; branch users can create/update/deactivate only rows owned by their branch, while legacy global supplier mutations are restricted to head office roles. SQL schema repair and startup ensure are additive and idempotent; `branchLedgerProvenance.test.ts` passed `1/1`, supplier contracts passed `10/10`, security passed `66/66` files and `142/142` tests, unit passed `248/248` files and `565/565` tests, and the server build completed successfully.

Global settings authority slice: the global `settings` table can no longer be mutated by branch managers or permission-only users; mutations require Head Office roles, while read behavior remains unchanged. Contract passed `1/1`; full regression then passed `249/249` unit files (`566/566` tests), `66/66` security files (`142/142` tests), typecheck, lint, and server build.

Internal mail branch-authority slice: direct recipients are now limited to the sender's branch/allowed-branch scope unless the sender is an approved cross-branch role; `BROADCAST_ALL` is restricted to Head Office roles. Message ownership/recipient checks remain in place for reads, replies, and mutations. Contract passed `1/1`; full unit passed `250/250` files and `567/567` tests, security passed `66/66` files and `142/142` tests, and the server build completed successfully.

User administration authority slice: all tenant-wide identity operations (user list/detail/export, role/permission changes, session controls, password/PIN/MFA resets, and branch assignment) now require Head Office roles. Branch managers cannot unlock these operations through a permission fallback; branch-level employee operations remain in HR routes. Contract passed `1/1`; full unit passed `251/251` files and `568/568` tests, security passed `66/66` files and `142/142` tests, and the server build completed successfully.

Role administration authority slice: global role reads, permission discovery, role creation, synchronization, updates, and deletion now require Head Office roles; branch-level permission grants cannot mutate tenant-wide security policy. Contract passed `1/1`; full unit passed `252/252` files and `569/569` tests, security passed `66/66` files and `142/142` tests, and the server build completed successfully.

Public API key authority slice: multi-branch API key creation, rotation, revocation, and metadata access now require Head Office or IT roles; branch-level permission grants cannot create a key delegating access to arbitrary branches. Contract passed `1/1`; full unit passed `253/253` files and `570/570` tests, security passed `66/66` files and `142/142` tests, and the server build completed successfully.

Barcode branch/privacy slice: POS barcode lookup, duplicate check, menu lookup, and inventory lookup now require server-derived branch scope; operational responses no longer expose inventory cost or purchase price. Contract passed `1/1`; full unit passed `254/254` files and `571/571` tests, security passed `66/66` files and `142/142` tests, and the server build completed successfully.

Image asset privacy slice: `/api/images/:id` no longer exposes image metadata or storage URLs publicly; upload/read/delete are restricted to Head Office/IT roles because the current global image table has no branch ownership. The contract passed `2/2`, full unit passed `255/255` files and `573/573` tests, security passed `67/67` files and `144/144` tests, typecheck and lint passed. External platform integrations remain intentionally deferred.

Approval authentication slice: all approval routes, including manager PIN/password verification, now require an authenticated session before processing credentials or executing an approval side effect; branch scope remains enforced by `scopeBranchQuery`. The contract passed `1/1`, full unit passed `256/256` files and `574/574` tests, security passed `68/68` files and `145/145` tests, typecheck and server build passed.

Subscription tenant-authority slice: subscription plans, tenant entitlements, and onboarding endpoints now require Head Office/IT roles rather than trusting a caller-supplied `branchId` under a generic authenticated session. The contract passed `1/1`, full unit passed `257/257` files and `575/575` tests, security passed `69/69` files and `146/146` tests, typecheck and lint passed.

Print gateway branch/privacy slice: protected print-job management now uses the server-resolved branch scope, non-head-office users cannot substitute another branch in the request, and the bridge registry is filtered to the effective branch. Device bridge endpoints remain protected by per-gateway tokens. The contract passed `1/1`, full unit passed `258/258` files and `576/576` tests, security passed `70/70` files and `147/147` tests, typecheck and server build passed.

Gift-card financial fail-closed slice: issue/top-up/redeem/void now mutate the card and post GL inside one transaction, lock the card with `UPDLOCK/HOLDLOCK`, reject missing GL `entryId` so the balance rolls back, and use a unique transaction reference for each top-up/redeem/void. The contract passed `2/2`, full unit passed `259/259` files and `578/578` tests, security passed `71/71` files and `149/149` tests, typecheck, lint, and server build passed.

Treasury voucher financial fail-closed slice: approval now locks the voucher and performs supplier linkage, GL posting, and the `COMPLETED` transition in one transaction; missing accounts or a GL result without `entryId` reject and roll back instead of approving the voucher. The contract passed `2/2`, full unit passed `260/260` files and `580/580` tests, security passed `72/72` files and `151/151` tests, typecheck, lint, and server build passed.

Purchase-return financial fail-closed slice: supplier returns now decrement stock, create the stock movement, and post the supplier credit note in one transaction; a failed GL posting rolls back the full return. `PURCHASE_RETURN` is now an operational idempotent GL reference type instead of `MANUAL`. The contract passed `2/2`, full unit passed `261/261` files and `582/582` tests, security passed `73/73` files and `153/153` tests, typecheck, lint, and server build passed.

This is automated SQL integration evidence. Physical hardware, real network interruption, installer elevation, and live external-provider UAT remain separate operational checks.
