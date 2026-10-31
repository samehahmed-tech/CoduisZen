# SQL E2E evidence — 2026-10-28

Environment: SQL Server named instance `.\CODUISZEN`, isolated database `RestoFlow_Test`, `NODE_ENV=test`.

## Passed runs

- `tests/e2e/coreOrderFlow.test.ts` + `tests/e2e/comprehensiveOrderFlow.test.ts`: 2 files, 15/15 tests.
- `tests/purchaseOrderPartialReceive.test.ts`, `tests/purchaseOrderWarehouseFlow.test.ts`, `tests/refundWorkflow.test.ts`, `tests/dayCloseReopen.test.ts`: 4 files, 6/6 tests.
- Day-close package (`dayCloseBusinessDate`, `dayCloseIdempotency`, `dayCloseExports`, `dayCloseConfirmation`, `dayCloseReopen`): 5 files, 7/7 tests.
- Operational-day support (`dashboardExpenseAndConsumption`, `driverCashCollection`, `stockCountDraft`, `stockCountPrint`, `warehouseStockCountScope`): 5 files, 8/8 tests.
- Offline replay gate (`offlineAdapterCoverage`, `offlineBranchBinding`, `offlineConflictResolution`, `offlineCoreReplay`, `offlineIndexedDbClaim`, `offlinePayloadConflict`, `offlineQueueAtomicityContract`, `offlineSyncLifecycle`, `menuOfflineReplay`, `syncQueueUtils`): 10 files, 45/45 tests.
- Local server restart drill: started source server on `API_PORT=3011`, `/api/health` returned `HEALTHY` with `database=CONNECTED`, stopped it, started it again, and received the same healthy/connected result after restart.
- Marketplace ingress: `marketplaceService.integration.test.ts` passed 2/2 against SQL Server, proving deterministic external-order fingerprinting, safe replay, duplicate prevention, payload-conflict rejection, and lazy repair of the legacy `delivery_platforms.api_key` column.
- Aggregator contract regression: `aggregatorContract.test.ts` passed 5/5 against SQL Server; provider status transitions keep the same payload fingerprint, while changed totals produce a different fingerprint for conflict handling.
- Aggregator ingest now claims `(provider, external order, status)` atomically in `idempotency_keys` before order side effects; failed transactions release the claim, and concurrent losers receive `AGGREGATOR_ORDER_IN_PROGRESS` instead of creating a second order. Typecheck passed after this change.
- SQL concurrency evidence: `aggregatorIngest.integration.test.ts` passed 1/1 against `RestoFlow_Test`; two concurrent deliveries produced exactly one order, with the other request either replaying the same order or receiving the explicit in-progress conflict, and the fixture cleaned its KDS side effects.
- Talabat SQL concurrency evidence: `talabatIngest.integration.test.ts` passed 1/1 against `RestoFlow_Test`; two concurrent `RECEIVED` webhooks produced exactly one Talabat order, and the competing request either replayed or received `TALABAT_ORDER_IN_PROGRESS`; KDS fixtures were cleaned afterward.
- Talabat payload-conflict evidence: the Talabat unit/integration pair passed 5/5; status transitions preserve the fingerprint, while a changed `order_total` for the same order/status is rejected with `TALABAT_ORDER_PAYLOAD_CONFLICT` (409).
- ETA runtime-policy hardening: ETA token/receipt requests now have a 15s timeout, a stable provider `Idempotency-Key`, and shared HTTP failure classification; permanent 4xx errors stop retrying while transient/conflict failures retain bounded backoff. `integrationRuntimePolicy.test.ts` passed 3/3 and typecheck passed.
- Deployment heartbeat hardening: branch-to-central heartbeat now has a 10s timeout, bounded retry for transient/conflict responses, a stable `x-idempotency-key`, and no longer duplicates the site token in the request body. Typecheck and production server build passed.
- OpenWA outbound hardening: OpenWA session/status requests now abort after 10s instead of hanging indefinitely. Existing WhatsApp auth/privacy/Baileys tests passed 17/17; typecheck and production server build passed.
- Paymob outbound hardening: auth, ecommerce order, payment-key, and refund requests now use a shared 15s timeout; no automatic retry was added to non-idempotent POST operations. Typecheck and production server build passed. The selected Paymob suites exposed a pre-existing test-harness mismatch where mocked `server/db` modules do not implement the setup-required database contract; no production behavior was claimed from those suites.
- Full SQL integration rerun after the marketplace change: 129 files, 664/664 tests passed on `RestoFlow_Test` (including the new marketplace suite).
- Public QR modifier/size regression: `publicQrModifiers.test.ts` passed against `RestoFlow_Test`; the menu exposed the linked option and size, a QR DINE_IN order returned `201`, client-supplied modifier price was ignored, authoritative size/modifier prices were persisted, and the core order flow remained green (`15/15` across the two targeted files).
- Latest full SQL integration rerun after QR size support: `132/132` files and `669/669` tests passed on the isolated `RestoFlow_Test` database.

The evidence covers authenticated order creation/progression, KDS dispatch, customer/CRM linkage, branch isolation, offline-created order preservation, purchase receiving, refund workflow, day-close reopen, and related finance/inventory paths.

This is automated SQL E2E evidence. It is not a substitute for the full five-scenario manual UAT, multi-device offline/network testing, physical hardware certification, or live provider callbacks.
