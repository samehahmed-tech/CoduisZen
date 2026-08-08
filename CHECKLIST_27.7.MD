# RestoFlow Whole-System Improvement Checklist — 27.7

> Execution order follows operational impact: usable screens first, workflow correctness next, full security hardening later.
> Stop-the-line exception: any confirmed cross-branch leak, unauthorized destructive action, or data-loss path is fixed immediately.

## Status

- `[ ]` pending
- `[~]` in progress
- `[x]` verified complete
- `[!]` blocked with evidence

## Completion rule

A checkbox becomes `[x]` only after:

1. Code or configuration is complete.
2. Narrow automated checks pass.
3. Relevant viewport or workflow is manually verified.
4. No unrelated user changes are reverted.
5. Result is recorded in the execution log.

## Priority rule

- **P0:** blocks selling, loses data, produces wrong financial/stock state, or breaks a core workflow.
- **P1:** screen or workflow is unusable on real POS/tablet/mobile hardware.
- **P2:** measurable slowness or repeated operator friction.
- **P3:** consistency, cleanup, and non-blocking polish.

---

## Phase 0 — Baseline and evidence

- [x] Capture current worktree status without reverting existing changes.
- [x] Verify available project commands from `package.json`.
- [x] Confirm responsive source exists at `styles/layout/pos-responsive.css`.
- [x] Confirm current automated suites under `tests/`, including order, inventory, finance, branch, public-screen, and E2E coverage.
- [x] Run `npm run typecheck` and record exact result.
- [x] Run `npm run lint` and record exact result.
- [x] Run `npm test -- --run` and separate current failures from new regressions.
- [x] Run `npm run build` after focused failures are understood.
- [ ] Run `npm run validate-env` against a safe configured environment.
- [ ] Run `npm run smoke:core` against a disposable/test database.
- [ ] Prepare realistic high-volume test data for menu, cart, KDS, CRM, inventory, reports, and day close.
- [ ] Capture baseline screenshots for Arabic and English at approved viewports.
- [ ] Record browser zoom, browser chrome height, OS scaling, and touch mode for hardware tests.

### Approved viewport matrix

- [~] `1074×650`
- [ ] `1074×678`
- [~] `1024×650`
- [ ] `1024×768`
- [ ] `1280×720`
- [ ] `1280×800`
- [ ] `1366×768`
- [~] `768×1024`
- [~] `414×896`
- [~] `360×640`

---

## Phase 1 — Operational responsive hardening

### 1A — Application shell

- [ ] Verify header, sidebar, navigation, drawers, and page roots against actual browser height.
- [ ] Remove nested page/body scrollbar conflicts.
- [ ] Preserve independent scroll areas for content, tables, and action panels.
- [ ] Ensure primary actions never leave the viewport before secondary information collapses.
- [ ] Verify Arabic RTL and English LTR at every approved viewport.
- [ ] Verify 100% and 125% browser/OS scaling where POS hardware supports it.

### 1B — POS

- [x] Keep cart items visible and independently scrollable at `1074×650`.
- [x] Keep totals and payment actions visible while cart items scroll.
- [x] Keep item grid usable when cart is open.
- [ ] Collapse secondary item metadata before shrinking core controls.
- [ ] Verify toolbar overflow has visible affordance.
- [x] Verify payment method grid and quick-cash controls on narrow widths.
- [ ] Verify on-screen keyboard and focused inputs do not cover payment actions.
- [ ] Verify long Arabic names, modifiers, discounts, notes, coupons, and large quantities.
- [ ] Verify empty, loading, offline, API error, and submitting states.
- [ ] Verify all primary touch targets are at least 44px without breaking dense layouts.

### 1C — KDS, Pickup, Packing

- [x] Verify 30–60 active tickets without clipped columns or controls.
- [x] Verify ticket text is readable at kitchen viewing distance.
- [~] Keep bump, recall, handover, sound, and reconnect controls visible.
- [~] Verify Pickup preparing/ready layout on tablet portrait and small landscape.
- [~] Verify Packing content and actions with long item/modifier lists.
- [ ] Verify reconnect/stale-data state is unmistakable.

### 1D — Driver and delivery operations

- [x] Verify active delivery flow at `360×640` and `414×896`.
- [x] Keep primary driver action visible above browser controls.
- [x] Verify COD amount, customer contact, address, map, and failure states.
- [~] Verify Dispatch Hub assignment and order detail on tablet.

### 1E — Inventory, finance, reports, and administration

- [~] Verify inventory tabs, tables, filters, and modals at POS/tablet sizes.
- [ ] Verify stock count, adjustment, receipt, PO, transfer, and wastage screens.
- [~] Verify DayClose and Shift drawers without clipped confirmation controls.
- [~] Verify Finance, Fiscal, Reports, CRM, Campaigns, and Approval tables have contained horizontal scroll or responsive alternatives.
- [ ] Verify all long modals fit within actual browser height.

---

## Phase 2 — POS, KDS, shift, and day-close workflows

### 2A — POS cashier safety

- [x] Verify clear-cart confirmation preserves cart on cancel and clears only after confirmation.
- [x] Remove ambiguous two-step cash payment behavior.
- [x] Prevent retail search focus from stealing other controls.
- [~] Verify table transfer, split, merge, and partial-item movement.
- [x] Reject empty or invalid opening-balance values.
- [x] Make customer search last-request-wins.
- [x] Require valid customer data for platform delivery orders.
- [x] Resolve open-price plus size pricing deterministically.
- [x] Verify order discount and coupon feedback.
- [x] Verify void/refund requires reason and correct approval path.
- [x] Run focused POS and order lifecycle tests.

### 2B — KDS lifecycle

- [x] Remove double status advance from one bump action.
- [x] Reject handover while any required kitchen ticket is not ready.
- [x] Support concurrent pending bump confirmations without lost taps.
- [x] Verify rush/remake ordering.
- [x] Verify station routing from one authoritative source.
- [~] Verify allergen data path before displaying allergen claims.
- [x] Beep only for genuine new-ticket events.
- [x] Persist sound preference and unlock audio after user gesture.
- [x] Recover current board after socket reconnect.
- [x] Add bounded polling fallback only while socket is unavailable.
- [x] Run focused order status and KDS tests.

### 2C — Shift and business day

- [~] Verify open shift, cash movements, close shift, and variance reason.
- [x] Show complete close-day summary before irreversible close.
- [x] Verify idempotent repeated close requests.
- [x] Verify business-date boundary and timezone behavior.
- [x] Reconcile POS totals, payments, shift totals, and day-close snapshot.
- [x] Run day-close and business-date tests.

### 2D — Table configuration

- [x] Persist custom table names from Floor Designer to database and POS.
- [x] Persist default table discount percentage with `0–100` validation.
- [x] Allow either a percentage or an existing marketing coupon code as the table default.
- [x] Persist table minimum spend, VIP flag, and operator notes.
- [x] Apply table default discount only when opening a new empty table order.
- [x] Preserve an existing order or saved draft discount when returning to a table.
- [x] Show table settings clearly in Floor Designer and table selection.
- [x] Enforce minimum spend before payment with a clear operator message.
- [x] Verify table settings remain branch-scoped and survive refresh/offline cache.
- [x] Add focused persistence and discount workflow tests.

---

## Phase 3 — Inventory, menu, and recipe correctness

- [x] Validate finite stock adjustments and preview resulting quantity.
- [x] Persist stock-count drafts when not applying counts.
- [~] Support explicit daily/monthly counts and reject incomplete posting.
- [x] Support partial and repeated PO receiving without duplicate stock.
- [x] Persist direct-receipt `costPrice` and verify valuation update.
- [x] Prevent warehouse stock mutation when item creation fails.
- [x] Verify socket stock payload as absolute or delta with a focused test.
- [x] Route menu archive, restore, duplicate, and bulk update through backend persistence.
- [x] Roll back menu/category movement after failed backend update.
- [x] Preserve offline menu mutations through sync replay.
- [x] Verify delete fallback cannot silently hide backend failure.
- [ ] Reconcile recipe representation before any migration.
- [ ] Derive menu cost from BOM only after migration and override rules are approved.
- [ ] Run inventory, menu validation, import, deduction, and sync tests.

---

## Phase 4 — Finance, fiscal, dashboard, and reports

- [ ] Separate account codes from account IDs in journal contracts.
- [ ] Verify debit equals credit for every posting path.
- [ ] Verify expense approval, reversal, reconciliation, and period close.
- [ ] Reconcile finance results by branch and business date.
- [ ] Remove hardcoded trends, fake live labels, and non-functional actions.
- [ ] Verify dashboard series and time-window labels use real data.
- [ ] Verify ETA/fiscal submission, retry, force, and failure states.
- [ ] Verify report date ranges use local business dates.
- [ ] Verify print CSS variables, load timing, and page orientation.
- [ ] Align available CSV/XLSX exports with implemented server support.
- [ ] Verify CSV BOM handling and XLSX numeric/date output.
- [~] Upgrade existing Dine-in Tables report to include table name, zone, orders, revenue, average ticket, and average duration.
- [~] Upgrade existing Table Turnover report to include table name and zone.
- [~] Add table discount totals and average discount rate without double-counting item discounts.
- [ ] Add unused/low-performing table visibility for the selected branch and period.
- [ ] Verify renamed tables remain readable in historical reports through current table metadata.
- [ ] Run finance, fiscal, dashboard, export, and business-date tests.

---

## Phase 5 — CRM, campaigns, delivery, and remaining modules

- [ ] Add server-side CRM search and pagination before loading large customer sets.
- [ ] Replace full SPA reloads with scoped refresh.
- [ ] Verify customer duplicate and phone validation behavior.
- [ ] Mask PII based on approved roles.
- [ ] Remove campaign integration shells that do not persist or dispatch.
- [ ] Define consent and recipient rules before real marketing dispatch.
- [ ] Implement real dispatch only after provider and business requirements exist.
- [ ] Verify driver receives only assigned orders.
- [ ] Make concurrent dispatch assignments independent.
- [ ] Decide proof-of-delivery mode as a product requirement before implementation.
- [ ] Review Production, HR, attendance, call center, reservations, approvals, and settings using the same viewport/workflow gates.

---

## Phase 6 — Measured performance and offline resilience

- [ ] Profile target hardware before optimizing.
- [ ] Record thresholds for item count, ticket count, customer count, and spreadsheet rows.
- [ ] Use installed `@tanstack/react-virtual` only where measurements justify virtualization.
- [ ] Replace KDS full refetch events with payload updates while keeping safe resync.
- [ ] Remove confirmed N+1 purchase-order fetches with an existing or minimal batch contract.
- [ ] Move spreadsheet work off the UI thread only when recorded freezes exceed the acceptance limit.
- [ ] Pause non-critical polling while tab is hidden.
- [ ] Verify offline queue ordering, retry, deduplication, and conflict feedback.
- [ ] Replace unstable `Date.now()` idempotency keys on retryable business actions.
- [ ] Load-test reconnect and replay without duplicate receipts, stock, or finance side effects.

---

## Phase 7 — Incremental UX consistency and accessibility

- [ ] Reuse existing common components before adding new abstractions.
- [ ] Adopt shared `Tabs`, `Drawer`, `EmptyState`, `Pagination`, `StatusBadge`, `useConfirm`, and toast APIs only in touched screens.
- [ ] Remove duplicate component only after all imports are migrated and verified.
- [ ] Add Escape close, focus trap, focus restore, and keyboard activation to touched dialogs.
- [ ] Add accessible names to icon-only actions.
- [ ] Add tab and table semantics.
- [ ] Respect reduced-motion preference.
- [ ] Verify Arabic screen-reader labels and keyboard navigation.
- [ ] Avoid a whole-project design-system rewrite.

---

## Phase 8 — Full security hardening

- [ ] Enforce server-side action permissions for financial, fiscal, menu, day-close, user, and approval actions.
- [ ] Enforce branch isolation on every read and mutation.
- [ ] Add explicit branch-selection behavior for cross-branch administrators.
- [ ] Remove public-screen LAN key bypass.
- [ ] Remove public-screen `SUPER_ADMIN` and policy bypass behavior.
- [ ] Rotate and bind public-screen credentials with auditable identity.
- [ ] Protect customer PII and integration secrets.
- [ ] Verify session expiry, revoked sessions, and 401 recovery.
- [ ] Validate trust-boundary inputs and safe error contracts.
- [ ] Verify audit trails for destructive and privileged actions.
- [ ] Run branch isolation, route auth, public-screen, manager approval, and security tests.

---

## Phase 9 — UAT, launch, and rollback

- [ ] Build role-based UAT scripts for cashier, kitchen, driver, stock, manager, finance, and administrator.
- [ ] Run Arabic-first UAT on real POS terminal, tablet, and phone.
- [ ] Run peak-data UAT.
- [ ] Run network disconnect/reconnect UAT.
- [ ] Verify printers, cash drawer, attendance, and local hardware bridge.
- [ ] Verify environment and migration state.
- [ ] Run backup and restore drill.
- [ ] Document rollback per release.
- [ ] Pilot one branch before general rollout.
- [ ] Collect operational evidence and sign-off.
- [ ] Run final `npm run ci:verify`.
- [x] Build versioned offline Setup with safe upgrade and clean-install prerequisites.
- [ ] Sign the final Setup with a trusted commercial code-signing certificate.

---

## Execution log

### 2026-07-27 — Checklist initialization

- Created `CHECKLIST_27.7.MD` as the single execution tracker.
- Inspected current dirty worktree; preserved all existing modifications and untracked planning documents.
- Verified commands from `package.json`: `lint`, `typecheck`, `test`, `build`, `ci:verify`, `validate-env`, and `smoke:core`.
- Verified test inventory includes focused order, inventory, finance, branch-isolation, public-screen, and E2E suites.
- Verified POS responsive implementation exists in `styles/layout/pos-responsive.css`.
- Baseline `typecheck` initially failed on three POS changes: incorrect `useConfirm` call, missing typed translation key, and invalid table-modal step.
- Fixed the three TypeScript errors; repeated `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- --run`: 54 files passed, 2 files failed; 212 tests passed, 2 failed, 1 skipped.
- Current test failures: call-center daily filter assertion and dashboard paid-revenue assertion in `tests/e2e/coreOrderFlow.test.ts`; `tests/dailyOrderNumber.test.ts` also reports `Connection is closed` during suite setup.
- `npm run build:frontend` and `npm run build:server` passed; frontend reports existing chunk-size and stale Browserslist-data warnings.
- Next: complete real-viewport baseline and verify the first POS responsive slice.

### 2026-07-27 — Table configuration vertical slice

- Reused existing Floor Designer fields instead of creating a second table-settings system.
- Added persistent `discount_percent`, `min_spend`, `is_vip`, and `notes` columns to Drizzle schema, empty database schema, and idempotent SQL Server repair.
- Floor layout save now preserves table name, discount, minimum spend, VIP flag, and notes.
- Floor Designer now accepts a percentage or a marketing coupon code and persists `default_coupon_code`.
- New empty dine-in table orders inherit the configured percentage discount; active orders and saved drafts retain their own discount.
- Payment blocks below the table minimum spend with Arabic/English operator feedback.
- Existing `Dine-in Tables` and `Table Turnover` reports now return and render table name and zone; table analysis includes discount total/rate.
- `drizzle-kit generate --name=table-settings` failed with `Cannot read properties of undefined (reading 'value')`; repository deployment path uses the updated canonical and repair SQL files instead.
- Applied the idempotent SQL repair to LocalDB, made its required `QUOTED_IDENTIFIER` setting self-contained, and verified `discount_percent`, `default_coupon_code`, `min_spend`, `is_vip`, and `notes`.
- API workflow verified: saved/read a `100%` table discount, changed the same table to a fixed marketing coupon, persisted the code, and validated a `25` discount on subtotal `100`; temporary QA rows were removed.
- Full browser workflow at `1074×650` verified a renamed table with `100%` default discount, then the same table with campaign code `TABLE25QA`; subtotal `130` received the expected fixed `25` discount.
- Fixed an empty-layout save failure: Floor Designer now creates the displayed fallback `MAIN` zone locally before saving instead of sending `zones: []`.
- Captured `output/playwright/pos-table-coupon-1074x650.png`; test table, coupon, zone, and empty test shift were removed after verification.
- Focused tests passed: `tests/tableDiscountState.test.ts` and `tests/couponPricing.test.ts` (`4/4`).
- Final verification passed: `typecheck`, `lint`, frontend build, and server build.
- Remaining: finish the viewport matrix, minimum-spend/manual report verification, and branch/offline table-settings checks.

### 2026-07-27 — POS critical viewport slice

- Verified the live POS at `1074×650`, `1024×650`, `768×1024`, `414×896`, and `360×640`.
- Desktop/POS widths keep the cart, totals, payment action, category strip, and item grid usable together.
- Mobile widths switch to a two-column item grid and expose a counted `فتح السلة` action; its full-height cart drawer keeps the line item, totals, payment method, and payment action visible at `414×896` and `360×640`.
- Captured viewport evidence under `output/playwright/`; no responsive code change was required for this verified POS slice.
- Repeated `typecheck` and `lint` passed after the final Floor Designer fallback-zone fix.

### 2026-07-27 — KDS, Pickup, and Packing responsive slice

- Verified empty operational states at `1074×650`, `768×1024`, and `414×896`.
- KDS toolbar wraps without clipping and keeps search, filters, sound, display, settings, live status, and clock visible.
- Fixed Pickup header overflow: below desktop width it now uses a compact two-row layout, keeps search fluid, and preserves ready/preparing counters plus sound/fullscreen controls.
- Fixed Packing header clipping: below desktop width the complete screen title and action toolbar now use separate rows.
- Captured before/after screenshots under `output/playwright/`; repeated `typecheck` and `lint` passed.
- Ran a database-free browser stress fixture with `60` mixed-status tickets, four stations, long Arabic notes/modifiers, rush tickets, and up to six items per ticket.
- Verified all `60` cards are present with an independently scrollable board at `1074×650`, `768×1024`, and `414×896`.
- Replaced hidden double-click completion with explicit `44px` single-tap `إنهاء الطلب` / `تسليم الطلب` actions.
- Fixed the completion path sending two status transitions: each ticket now receives exactly one bump request per operator action.
- Browser verification observed one successful API request per completion and delivery tap; `tests/kdsTransition.test.ts` verifies one transition per ticket ID.
- Focused KDS test, `typecheck`, and `lint` passed.
- Remaining: Pickup/Packing populated long-list stress, recall interaction, reconnect, and stale-data states.

### 2026-07-27 — Driver and Dispatch responsive slice

- Verified populated Driver Dashboard cards at `414×896` and `360×640` with long Arabic addresses, phone/map actions, READY and OUT_FOR_DELIVERY states, late SLA state, and sticky primary actions.
- Fixed cash collection correctness: prepaid orders now show `مدفوع`, split orders expose only their cash portion, and expected collection excludes completed/prepaid value.
- Browser fixture verified two cash orders total `1206` after rounding while a `190` VISA order contributes `0`.
- `tests/driverCashCollection.test.ts` covers cash, prepaid, and split-payment collection.
- Diagnosed Dispatch Hub telemetry/SLA `500`: runtime SQL declared `driver_id nvarchar(max) PRIMARY KEY`, which SQL Server rejects while compiling the conditional DDL.
- Aligned runtime telemetry DDL and Drizzle telemetry IDs to `nvarchar(255)` and the canonical identity key; telemetry and SLA endpoints now return `200`.
- Verified the Dispatch Hub error banner is gone at `768×1024`; populated assignment/detail interaction remains pending.
- Focused Driver/KDS tests, `typecheck`, and `lint` passed.

### 2026-07-27 — Inventory, Finance, Reports, and Day Close viewport pass

- Verified Inventory landing/actions/cards at `1074×650`, `768×1024`, and `414×896`; the tablet layout keeps primary actions and horizontal module navigation accessible.
- Verified Finance at `1074×650` and `768×1024`; summary cards, period actions, search, and module navigation remain contained.
- Verified Reports filters, date range, export actions, and report catalog at `1074×650` and `768×1024`.
- Verified Day Close branch/date controls, calendar, report refresh, and close action at `1074×650`.
- Remaining before completion: populated inventory tables, stock workflows, long modals, finance/report tables, CRM/Campaign/Fiscal/Approval overflow, and irreversible confirmation drawers.

### 2026-07-27 — KDS event and sound safety

- Generic `kds:update` no longer beeps blindly: the board refreshes, compares ticket IDs, and announces only a newly observed ticket.
- Initial load and status-only updates remain silent; `tests/kdsTransition.test.ts` covers unchanged and new ID sets.
- Sound mode now persists through `kds_sound_mode`; keyboard/UI enable resumes a suspended AudioContext from the operator gesture.
- Browser verification saved `OFF`, survived reload, and restored `ALL`.
- Urgent alarms are throttled to once per minute instead of every five-second clock tick.
- Replaced the shared pending-confirmation state with a synchronous per-order in-flight guard; a rapid double click produced one successful transition request.

### 2026-07-27 — POS cashier safety

- Verified clear-cart cancel keeps the current items and confirmation clears them.
- Fixed Quick Pay retaining the first-render submit handler, which silently saw an empty cart and inactive shift.
- Quick Pay now submits explicitly as `CASH` in one action; browser verification produced one `POST /api/orders`, cleared the cart, and sent `payment_method: CASH` with a matching cash payment.
- `tests/orderPayment.test.ts` covers explicit cash selection and split-payment preservation; focused POS/KDS/Driver tests passed.
- Removed the exact temporary shift `SFT-20260727-0062-141` after confirming it had no persisted orders.
- Verified Retail mode focuses the scanner on entry but leaves focus inside the order-name modal instead of stealing it back.
- Verified an empty opening balance disables shift opening; finite non-negative values are revalidated before the API call.
- Customer lookup now clears its loading state when a short query cancels the active request; aborted older requests cannot overwrite newer results.
- Platform delivery now requires order number, customer name, a phone with at least seven digits, and a usable address; browser verification kept the action disabled until all fields were valid.
- `tests/platformDeliveryValidation.test.ts` covers complete and incomplete platform orders.
- Unified Item Options preview and submit pricing: explicit open price now wins consistently while size selection still labels the item; fixed-price items still use the selected size.
- `tests/itemOptionPricing.test.ts` covers open-price plus size, fixed-price size, and base-price fallback.
- Table percentage and campaign coupon feedback were already verified through the full POS flow, including persisted `100%` and fixed-value campaign discounts.
- Fixed Table Management opening a blank screen for partial transfer/split; flow now routes through item selection, target selection, confirmation, and a usable Back action.
- Completed/cancelled/delivered orders are no longer treated as active table orders.
- Failed transfer/split/merge requests now roll back optimistic table/order state, stay in the modal, and show an operator error instead of silently closing.
- `tests/tableManagementFlow.test.ts` covers the transfer-all, merge, partial-transfer, and split step routes.
- Remaining before `[x]`: execute transfer, split, merge, and rollback against populated database orders.
- Removed temporary shift `SFT-20260727-9449-874` after confirming it had zero persisted orders.
- Final focused verification for this slice: `7` test files / `17` tests passed; project `typecheck` and `lint` passed.

### 2026-07-27 — Void and refund safety

- Void confirmation stays disabled until a reason is entered; browser verification persisted the exact reason with `CANCELLED`.
- Manager PIN verification now creates an approval tied to the exact branch, action, and order; cashier cancellation accepts only that matching approval.
- Invalid or cross-order approval IDs are rejected by the shared server lifecycle path, not trusted from the client.
- Settled orders expose a full-refund request with reason category; active orders expose void, while terminal orders cannot be voided.
- Refund request validation now matches the service contract and rejects empty reasons, invalid item IDs, unsettled orders, cumulative over-refunds, and repeated item quantities.
- High-value or PIN-required refunds remain `PENDING`; processing before approval is rejected and creates no payment.
- Browser verification created one `PENDING` refund with the entered Arabic reason and `0` payment rows.
- `orderVoidApproval`, `orderStatusPolicy`, `refundValidation`, and `refundWorkflow` passed; all exact temporary orders, approvals, refunds, and payments were removed.
- Project `typecheck` and `lint` passed after the final UI and server changes.
- Combined POS/order lifecycle verification passed: `9` focused files / `23` tests.

### 2026-07-27 — KDS handover readiness

- Added one shared lifecycle guard used by authenticated and public packing handover paths.
- Handover now rejects orders with missing kitchen tickets or any ticket outside `READY`, `SERVED`, or `DELIVERED`.
- Cancelled orders cannot be handed over; completed and already-delivered orders remain idempotent.
- Order delivery and KDS ticket delivery now commit in the same database transaction.
- Pickup and Packing screens show actionable Arabic/English readiness errors.
- `kdsHandoverGuard`, `kdsTransition`, and `orderStatusPolicy` passed: `3` files / `9` tests; exact temporary order and tickets were removed.
- Project `typecheck` and `lint` passed.

### 2026-07-27 — KDS rush/remake ordering

- KDS now places `RUSH` and `REMAKE` tickets before `NORMAL`, then preserves FIFO order by creation time.
- Multi-station order cards preserve `REMAKE` over `RUSH` over `NORMAL` when ticket priorities differ.
- Urgent POS orders now create `RUSH` kitchen tickets from the authoritative order `isUrgent` flag.
- `REMAKE` remains an explicit KDS ticket priority; no speculative refund/resend workflow was added.
- Focused KDS verification passed: `3` files / `10` tests; project `typecheck` and `lint` passed.

### 2026-07-27 — Authoritative KDS station routing

- Added authenticated `GET /kds/meta`; it returns active printer-routing stations plus stations on active tickets for the effective branch.
- Dispatch and station metadata now share one resolver: explicit `stationId`, then kitchen printer role, then safe printer fallback.
- Cashier-only printers are excluded from the KDS station list.
- Removed editable browser-local station taxonomy; KDS reads server routing and uses defaults only when metadata is unavailable.
- `kdsRouting` plus focused KDS lifecycle verification passed: `4` files / `12` tests; project `typecheck` and `lint` passed.

### 2026-07-27 — Allergen claim safety gate

- Repository search confirmed there is no authoritative allergen field in menu schema, menu types/editor, order snapshots, or KDS ticket items.
- No allergen badge or printed claim was added from names, keywords, recipes, or other inference.
- Remaining before `[x]`: add an explicit menu allergen field with controlled editing and validation, snapshot it into order/KDS items, then render only stored values.

### 2026-07-27 — KDS reconnect recovery

- Socket service now publishes connected/disconnected state to consumers.
- KDS silently refreshes its full current board on connect/reconnect without replaying new-ticket sounds.
- A `10s` fallback poll runs only while disconnected, stops immediately on reconnect, and prevents overlapping refreshes.
- `kdsPolling` plus focused KDS verification passed: `5` files / `13` tests; project `typecheck` and `lint` passed.

### 2026-07-27 — Shift cash validation

- Opening and actual drawer balances now reject missing, negative, and non-finite values on the server; zero remains valid.
- Material variance above `1` requires an operator reason in both the close drawer UI and server.
- Existing-open-shift requests remain idempotent before new-opening validation.
- Focused lifecycle verification passed: `6` files / `15` tests; project `typecheck` and `lint` passed.
- Remaining before `[x]`: define and persist explicit shift-linked Cash In/Cash Out movements, then include them in expected drawer cash.

### 2026-07-27 — Close-day confirmation summary

- Day-close preview now includes shift count, expected cash, actual cash, and variance for the selected business day.
- Irreversible close requires explicit danger confirmation showing orders, revenue, expected/actual cash, variance, and blocker count.
- A failed readiness gate never opens the confirmation or calls the close API.
- `dayCloseConfirmation` and `shiftReconciliation` passed: `2` files / `3` tests; project `typecheck` and `lint` passed.

### 2026-07-27 — Idempotent day close

- Repeating the same close request returns the original immutable closed snapshot instead of `409`.
- Existing snapshot lookup happens before active-business-date validation, so retries still work after the date advances.
- Concurrent duplicate insert losers return the winner's snapshot and skip duplicate audit/message side effects.
- Fixed `dayCloseBusinessDate` fixture cleanup and removed `11` old test users plus `11` old test branches; verified zero matching rows remain.
- Focused day-close verification passed: `4` files / `5` tests; project `typecheck` and `lint` passed.

### 2026-07-27 — Branch-timezone business-day bounds

- Day-close sales, payments, fiscal, finance, side-effect, readiness, shift, and operational filters now use the branch timezone.
- UTC boundaries are derived from local midnight to the next local midnight minus `1ms`; no fixed 24-hour assumption.
- Tests cover Cairo versus New York and `23h`/`25h` DST business days.
- Focused business-date/day-close verification passed: `4` files / `5` tests; project `typecheck` and `lint` passed.

### 2026-07-27 — Payment and close-total reconciliation

- Shift X-report, shift close expected cash, day-close payment breakdown, and immutable payment snapshot now use one reconciliation rule.
- Confirmed payment sessions replace legacy payment rows only for the same order and normalized method; split methods remain additive.
- Legacy databases without `payment_sessions` continue using completed `payments`.
- Payment, shift, business-date, and day-close focused verification passed; project `typecheck` and `lint` passed.

### 2026-07-27 — Table settings visibility and branch-safe cache

- Floor Designer and POS table selection now show coupon/percentage, minimum spend, VIP, and note indicators.
- Table and zone offline cache keys include `branchId`; refresh replaces only that branch and restores original server IDs offline.
- Offline table-status replay now carries the originating branch ID.
- Minimum spend remains non-blocking while sending to kitchen, but payment is rejected in both POS and server when subtotal is below the table rule.
- Focused table/cache/payment verification passed: `5` files / `8` tests; project `typecheck` and `lint` passed.

### 2026-07-27 — Stock adjustment validation and preview

- Empty, negative, `NaN`, and infinite quantities are rejected before optimistic stock mutation; the server schema also requires a finite non-negative quantity.
- The adjustment modal starts from the selected warehouse's current balance and previews current quantity, resulting quantity, and delta before saving.
- Manual browser verification at `1074×650` confirmed the preview and disabled submit/error state for `-1`.
- Focused verification passed: `tests/stockAdjustment.test.ts` (`2/2`); project `typecheck` and `lint` passed.

### 2026-07-27 — Stock-count draft persistence

- The former cancel action is now an explicit Save Draft action that persists entered quantities and notes before leaving the session.
- Draft saves keep the count at its current pre-post status and never mutate warehouse stock or post variance accounting.
- Notes can persist before a quantity is entered; invalid/non-finite counted quantities are rejected server-side.
- Browser verification at `1074×650` confirmed save feedback and the persisted session in count history; temporary browser data was removed.
- Focused inventory verification passed: `2` files / `3` tests; project `typecheck` and `lint` passed.

### 2026-07-27 — Partial and idempotent PO receiving

- The visible GRN flow now lets the operator choose each receipt quantity up to the authoritative remaining PO balance.
- PO line received totals and PO status advance atomically from `PARTIAL` to `RECEIVED`; warehouse, item, quantity, and PO status are validated in the same transaction.
- PO unit price is authoritative for stock valuation even if a client sends a different price.
- Existing idempotency storage now claims each GRN reference before mutation; sequential retries replay and concurrent duplicates create one GRN, movement, batch, and stock increment only.
- Browser verification at `1074×650` confirmed `ordered 10 / received 4 / remaining 6`, with the receipt input capped and defaulted to `6`.
- Focused database verification passed: `tests/purchaseOrderPartialReceive.test.ts` (`2/2`); project `typecheck` and `lint` passed.

### 2026-07-27 — Direct receipt cost and valuation

- Direct receipts now persist the latest purchase price and recalculate weighted-average `costPrice` atomically with stock, movement, batch, and idempotency completion.
- The receipt API rejects non-finite, zero, and negative quantities or costs; expired references can be reused while active/completed retries cannot duplicate stock.
- Focused database verification confirmed `10 × 2 + 5 × 8 = 15 × 4`, valuation `60`, and no duplicate movement or batch on replay.
- Browser verification at `1074×650` confirmed the modal fits, blocks zero cost, and enables save for a valid `12.50` purchase price.
- `tests/directStockReceiptCost.test.ts` passed (`1/1`); project `typecheck` and `lint` passed.

### 2026-07-27 — Item creation opening-stock guard

- New-item creation now aborts explicitly before the opening-stock loop when item persistence fails.
- The item modal remains open and tells the operator that no opening balance was recorded.
- Browser failure injection at `1074×650` confirmed the failed create path issued `0` stock-update requests; project `typecheck` and `lint` passed.

### 2026-07-27 — Absolute stock socket contract

- Every stock emitter carrying item, warehouse, and quantity was verified to send the final warehouse balance; the legacy refresh-only event has no quantity and remains ignored by targeted patching.
- Client socket patching now uses one explicit absolute-balance helper and rejects negative, non-finite, or unknown-item updates.
- Focused verification proved an existing balance of `10` becomes `3` after a `quantity: 3` event rather than `13`.
- `tests/stockSocketPayload.test.ts` passed (`2/2`); project `typecheck` and `lint` passed.

### 2026-07-27 — Menu action backend persistence

- Archive, restore, duplicate, bulk edit, and drag ordering now wait for real menu API persistence instead of mutating Zustand only.
- Restore explicitly clears backend `deletedAt`; archived item actions now show and execute Restore rather than archiving again.
- Offline archive/restore actions are queued for replay, while local IndexedDB changes happen only after the server or queue accepts the operation.
- Focused menu verification passed: `2` files / `6` tests; project `typecheck` and `lint` passed.

### 2026-07-27 — Menu movement failure safety

- Cross-category item moves remain unchanged locally until the backend accepts the update.
- Category reorder keeps its previous snapshot and restores it when any persistence request fails.
- Focused failure injection passed in `tests/menuPersistenceActions.test.ts` (`3/3`).

### 2026-07-30 — Menu offline replay

- Verified queued menu CREATE, UPDATE, restore, and DELETE mutations replay through the shared sync processor.
- Focused menu and inventory verification passed: `3` files / `6` tests; project `typecheck` and `lint` passed.

### 2026-07-30 — POS short-height payment safety

- At `1074×600`, `1024×560`, and `768×560`, the cart remains scrollable and the cash calculator no longer pushes the Pay action below the viewport.
- On short screens, the calculator becomes a contained overlay while the sticky payment action remains visible.
- Verified no horizontal page overflow; the exact browser-test shift was closed with zero persisted sales.

### 2026-07-30 — Daily/monthly stock-count guard

- Added an explicit Daily/Monthly selector and persisted the selected count type in count history.
- The client and server now reject posting until every frozen stock line has a physical quantity.
- Browser verification at `1074×650` confirmed both count types, successful Monthly selection, and no page-width overflow.
- Focused stock-count test covers rejection without changing count status or warehouse balance; project `typecheck` and `lint` passed.
- Remaining before `[x]`: manually verify a complete monthly posting workflow against disposable stock data.

### 2026-07-30 — Menu delete failure safety

- Removed the online delete-to-archive fallback that could hide a failed delete behind a second mutation.
- Failed item/category deletes now keep the editor open, preserve local state, and show the backend error.
- Focused failure test confirms no archive update is attempted after delete failure; combined verification passed `3` files / `7` tests plus project `typecheck` and `lint`.

### 2026-07-30 — Final Setup 1.1.17

- Bumped the application/package version to `1.1.17` and built the unified offline installer from the current frontend, server, schema repair, runtime, and Print Bridge.
- Bundled Microsoft SQL Server Express 2022, ODBC Driver 18, and Visual C++ x64 prerequisites after the builder validated their Microsoft signatures.
- Verified Setup product version `1.1.17`, output size `399,785,139` bytes, and SHA-256 `084D6F9415FFC2CA8BDFC6B4BCE4F6A0C419BEDF1671FF6844E8DA68DB6FBA9F`.
- Upgrade uses the existing stable `AppId`; `.env`, SQL database, backups, and install state are outside replacement targets. Focused installer/current-change tests passed `4` files / `14` tests and the production build passed.
- Full suite result remains a launch blocker: `81` files / `261` tests passed, with the same known call-center/day-range, dashboard revenue, and closed test-DB connection failures. The Setup executable itself is not commercially code-signed.
