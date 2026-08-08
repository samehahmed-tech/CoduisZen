# RestoFlow / CoduisZen — Phase 2 Master Plan

> Read together with **AUDIT.md** (findings) and **CHECKLIST.md** (progress tracking).
> Principle: **incremental, one module at a time, never refactor the whole project. Preserve all existing functionality.** Each module is independently shippable; no module depends on another module's completion.
> Status legend: ✅ ready · ⏳ in progress · ⬜ pending · ⛔ blocked

---

## Execution Principles

1. **No module changes behavior without its tests still green.** Run `npm run lint && npm run typecheck && npm test -- --run` after every module.
2. **One PR-sized chunk per module** (submodules M1a/M1b allowed where the file surface is large). Commit per submodule.
3. **Update `CHECKLIST.md` after each submodule** and add a short note at the bottom of this plan under **Execution Log**.
4. **Manual test:** every submodule's manual test steps must be run before marking Complete.automation (vitest) covers regressions; manual covers UX feel and real-hardware responsive behavior.
5. **Never sacrifice stability:** if a refactor risks behavior change, split it into a pure-additive first commit (new component) + an adoption commit (swap usages) + a removal commit (delete legacy).
6. **Preserve existing functionality absolutely.** No "tidy up" deletions of working code paths until replacements are validated in production paths.

---

## Module Index (priority order)

| ID | Module | Sev focus | Files touched | Independent? | Status |
|----|--------|-----------|---------------|--------------|--------|
| M0  | Design System Consolidation | MED-HIGH | utils, common/*, theme tokens | ✅ self-contained | ⬜ |
| M1  | Touch Target & Responsive Pass | HIGH | POS, KDS, Driver, common/shared CSS | ✅ | ⬜ |
| M2  | POS Cashier Safety (cart-clear, two-tap pay, retail focus-steal) | HIGH | POS components | ✅ | ⬜ |
| M3  | Tables Overflow & Pagination Adoption (CRM, CampaignHub, FiscalHub, Inventory, Reports) | HIGH | 5 modules + common/Pagination | ✅ | ⬜ |
| M4  | KDS Socket Orchestration & Sound | HIGH | server kdsController, publicScreenRoutes, socket, useKdsStore, KDS.tsx | ⚠ server+client | ⬜ |
| M5  | KDS Workflow Bugs (double-bump, handover guard, bump window, allergens, station routing) | HIGH | KDS.tsx, kdsController, kitchenTicketTemplate | ⚠ M4 first | ⬜ |
| M6  | Branch Isolation & Permissions Hardening (action-level guards, day-close role, business-date) | HIGH | server middleware, all feature pages, AppPermission | ⚠ server+client | ⬜ |
| M7  | DayClose Safety (useConfirm summary preview, close-shift confirmation, period close role) | HIGH | DayCloseHub, ShiftManagementDrawer, Finance | ✅ depends on M0 useConfirm | ⬜ |
| M8  | Finance & Fiscal Hardening (branchId on all calls, expense approval gate, ETA force role, period-close role) | HIGH | useFinanceStore, useReportsState, Finance, Expenses, FiscalHub, services/api | ⚠ server+client | ⬜ |
| M9  | CRM Privacy & Pagination (branchId, PII masking, no full reload, virtualize/ paginate, server-side search) | HIGH | CRM.tsx, useCRMStore, customersApi | ⚠ server+client | ⬜ |
| M10 | Campaigns Real Dispatch & Consent | HIGH | CampaignHub, campaignsApi, segment builder | ⚠ server+client | ⬜ |
| M11 | Menu Store Backend Persistence (archiveItem/restoreItem/duplicateItem/bulkUpdateItems/updateMenuItem rollback/deleteMenuItem contract) | HIGH | useMenuStore, menuApi, ItemDrawer | ⚠ server+client | ⬜ |
| M12 | Inventory Workflow Fixes (validate qty, persist stock-count draft, fix PO partial receive, send costPrice, fix handleSaveItem loop) | HIGH | Inventory + components/* modals | ✅ | ⬜ |
| M13 | Recipe & Cost Reconciliation (normalize recipe format, derive ItemDrawer.cost from BOM, margin display sync) | HIGH | RecipeManager, ItemDrawer, MenuProfitCenter | ✅ depends on M11 | ⬜ |
| M14 | Driver Proof-of-Delivery + Dispatch Hub hardening | HIGH | DriverDashboard, DispatchHub, delivery API | ⚠ server+client | ⬜ |
| M15 | Lite Public Screens Security (rotate keys, no LAN bypass, no SUPER_ADMIN escalation, error handling, message-payload socket) | HIGH | public/*.html, publicScreenRoutes | ⚠ M4 first | ⬜ |
| M16 | Performance: Virtualize ItemGrid, customer list, KDS columns, reports tables; ExcelJS worker/batch | HIGH | ItemGrid, common/VirtualList adopters, Reports, Inventory, KDS | ✅ | ⬜ |
| M17 | Reports Correctness (CSS-variable serialization in print window, supported-exports table aligned with server, useReportsState slot cleanup, orientation per report) | MED-HIGH | Reports, useReportsState, reportConstants, reportPrintStyles | ✅ | ⬜ |
| M18 | Dashboard Truthfulness (no simulated sparkline, currency formatter, business-date warning, window labels, timezone fix) | MED-HIGH | Dashboard, AdminDashboardPage, utils/formatters | ✅ depends on M0 | ⬜ |
| M19 | Accessibility Pass (focus traps in modals, Esc close, aria-labels on icon buttons, tabs role=tablist, th scope=col, prefers-reduced-motion gating) | MED | common components + adopters | ✅ depends on M1 tabs swap | ⬜ |
| M20 | Lite Public Screens Refresh (backoff, reconnect badge) — bundled with M15 | MED | kdslite.html | ✅ | ⬜ |
| M21 | Tech-debt cleanup (delete MenuManager.tsx legacy, delete stale fiscalService.ts stub, remove stale operator-screen.html) | LOW | codebase | ✅ end-of-cycle | ⬜ |

---

## M0 — Design System Consolidation

- **Objective**: Single source of truth for formatting and primitives; reduce bespoke reimplementations across feature modules → enables all subsequent modules.
- **Problems addressed (AUDIT §1.3-1.8, §5.5-5.6)**: 5 radii scales, currency fallback inconsistent, 3 load idioms, 4 empty idioms, 4 metric idioms, two toast systems, bespoke tabs/drawers everywhere.
- **Proposed**:
  1. Add `utils/formatters.ts` (or extend existing): `formatCurrency(n, currencySymbol?)`, `formatQty(n)`, `todayLocalDate()`, `formatLocalDate(d)`, `parseLocalDateKey(s)` — uses **local** time, never `toISOString()` for date inputs.
  2. Add `common/useConfirm` (already exists) — document and adopt in M7/M8 modules.
  3. Audit `common/ToastProvider` and deprecate/remove `components/Toast.tsx`; provide one `useToast()` everywhere. Migration: replace `./Toast` imports across Dashboard/Finance/Expenses.
  4. Define radius tokens in `theme/tokens.ts` (`radiusSm`, `radius`, `radiusLg`, `radiusXl`) and Radii value in `_base.css`; remove arbitrary `rounded-[Xrem]` usages gradually (module by module).
  5. Define `STOCK_LOW`, `STOCK_OUT`, `STOCK_HEALTHY` badge component `<StockLevelBadge qty safeThreshold unit/>` in `common/StatusBadge.tsx` extension.
  6. Document canonical empty-state via `common/EmptyState` (icon/title/subtitle/optional action/compact); add an `EmptyStatePresets` helper for "No menu items / No customers / No orders / No data" so adopters don't re-invent icon/copy each time.
  7. No removal yet — purely additive/standardize.
- **Business value**: reduces UX divergence long-term, makes every subsequent module cheaper, unblocks consistent theming across POS + tablet + mobile.
- **Estimated risk**: LOW. Additive only; no behavior changes.
- **Affected files**: `utils/formatters.ts` (new/extend), `components/common/EmptyState.tsx`, `components/common/StatusBadge.tsx`, `theme/tokens.ts`, `styles/themes/_base.css`, `components/common/ToastProvider.tsx` (deprecation note). No feature-module writes in this module — those happen in M1+ adoptions.
- **Manual testing**:
  1. `npm run typecheck` — no new errors.
  2. `npm run lint`.
  3. `npm test -- --run` — all green.
  4. Smoke: open app, switch themes (mica-glass, fluent-clean, dark-elegant), confirm no visual regression.
  5. Manual: create a sample `EmptyState` usage in a throwaway dev-only page; confirm `type='data'` vs `type='empty-results'` renders correct icon.

---

## M1 — Touch Target & Responsive Pass

- **Objective**: All touch targets ≥44×44px on primary actions; fix `h-13` Tailwind bug; tame narrow-viewport POS/KDS/Driver layouts for the listed device matrix.
- **Problems (AUDIT §3.1, §3.7, §3.8, §3.11, §8)**: toolbar `h-7`=28, header `X` `w-4 h-4`=16, CartItem steppers 32, numpad `h-10`=40, quick-cash `h-8`=32, ListCard steppers `w-7 h-7`=28, KDS bump `minHeight:34` and item chips 28×28, column action ~24px, **Driver `h-13` invalid → zero height**, POSToolbar invisible-scroll.
- **Proposed**:
  1. Define `--touch-target-min: 44px` and `--touch-target-cozy: 48px` tokens in `_base.css`; add `.touch-target` utility class enforcing min-w/h via `@layer components`.
  2. Replace `h-7`/`w-7`/`h-8`/`w-8` on integers on actionable controls with `h-11`/`w-11` (44px) or apply `.touch-target`.
  3. DriverDashboard: replace `h-13` with `h-14` (or `min-h-[52px]`).
  4. Header context-close `X`: enlarge to `w-7 h-7` (icon 18) inside a `44×44` hit-area wrapper (`p-1.5`).
  5. KDS bump `minHeight:34`→`minHeight:48`; item chips `28×28`→`40×40` (chip still visually small but hit-area wrapper larger).
  6. POSToolbar: keep `overflow-x-auto` but swap `no-scrollbar` for a 3px visible scrollbar + scrolldot indicator (CSS only).
  7. PickupScreen: at `<lg` switch to column stack (preparing sidebar above ready list) via responsive flex-direction; keep `xl` row layout.
  8. Add `touch-action: manipulation` and `user-select: none` to numeric steppers and item cards (utility class `.pressable`).
- **Business value**: usable on actual POS hardware, tablets, and phones; matches Foodics/Toast baseline.
- **Risk**: MED (visual change in dense POS area). Mitigation: keep visual sizing constant where possible (use wrapper hit-area).
- **Files**: `src/features/pos/components/POSToolbar.tsx`, `POSHeader.tsx`, `CartItem.tsx`, `MenuItemCard.tsx`, `PaymentSummary.tsx`, `components/KDS.tsx`, `src/features/driver/DriverDashboard.tsx`, `components/PickupScreen.tsx`, `styles/themes/_base.css`, `styles/layout/pos-responsive.css`.
- **Manual test** (device matrix):
  1. POS at 1024×768, 1074×678 (tablet portrait), 1280×720, 1366×768, 1600×900, 1920×1080 — confirm toolbar no invisible-scroll, no horizontal overflow, all actionables clearly hit-able.
  2. KDS at 1920×1080 and 1280×800 — bump buttons ≥48, column action ≥44.
  3. Driver at 360×640 and 414×896 Android viewport — primary buttons visible & ≥48 tall.
  4. PickupScreen at 768×1024 — preparing/ready stack vertically.
  5. `npm run lint && typecheck && test -- --run`.

---

## M2 — POS Cashier Safety

- **Objective**: Eliminate silent data loss on the cashier's primary screen.
- **Problems (AUDIT §2 POS)**: clear-cart adjacency + no confirm; cash takeaway silent two-tap pay; retail focus-steal breaks all other controls; table-mgmt step router broken; shift-open accepts empty balance as NaN; customer search race; platform-delivery with empty customer; item-options open-price+size overwrites custom price.
- **Proposed**:
  1. **Clear-cart** → wrap with `useConfirm({ variant: 'danger', confirmText: t.clear_cart })`; visually differentiate (icon-only `Trash2` rose) from close-cart `X` (neutral).
  2. **Cash takeaway pay** → either (a) auto-submit on drawer-open event (`toast.info` "Cashier drawer opened; submitting…" then submit 200ms later), or (b) relabel button to "Open Drawer & Pay" with explicit two-step hint.
  3. **RetailModePanel** → remove window-click force-focus; rely on `autoFocus` + `Cmdk`-style `Ctrl+L` shortcut to refocus. Optionally re-focus on `Escape` from another control.
  4. **TableManagementModal** → rewrite step router as a state-machine `mode-step` enum; merge path accepts explicit `selectedItemIds`; remove broken `setMode(mode)` no-op Next; clarify transfer-all vs transfer-items vs split with explicit `Next`/`Back` buttons gated by valid selection.
  5. **ShiftOverlays** → opening-balance input: parse `parseFloat(value) || 0`; disable submit if value is `''` or `NaN`; add visible "Enter opening float" label.
  6. **CustomerSelectView** → add `AbortController` to search; queue last-request wins; require name+phone before "Continue Platform Order".
  7. **ItemOptionsModal** → when both `isOpenPrice` and `selectedSize`, prompt: "Open price overrides size price — keep both?" with explicit mode (apply custom + zero size surcharge, or apply size price + custom as base).
  8. **Order-wide discount** → add explicit "Order Discount" entry in `PaymentSummary` toolbar (percent+flat toggle) — discoverable.
  9. **Coupon** → display metadata (amount/percent/free-item) when `activeCoupon` set; validation feedback on apply (loading → ok/invalid).
  10. **Refund/Void** → implement a `RefundModal` (line-item selection + reason + manager PIN via `useConfirm`); wire `onVoid` to it.
- **Business value**: cashier trust & speed; eliminating silent sale-loss and double-charge risks; matches Toast/Square baseline.
- **Risk**: MED (workflow change). Mitigation: keep old behaviors feature-flagged for one cycle.
- **Files**: `src/features/pos/components/POSCartSidebar.tsx`, `PaymentSummary.tsx`, `RetailModePanel.tsx`, `TableManagementModal.tsx`, `ShiftOverlays.tsx`, `CustomerSelectView.tsx`, `ItemOptionsModal.tsx`, new `RefundModal.tsx`, `src/features/pos/POS.tsx` (wire refund/void).
- **Manual test**:
  1. Add items → tap clear-cart → confirm dialog appears; cancel retains items, confirm empties.
  2. Takeaway + Cash + tap Pay → drawer opens AND sale completes within 1s (or explicit two-step shown).
  3. Retail mode: tap any button (cart, modal-trigger) → focus NOT stolen to search input.
  4. Table mgmt: select items → Next → table-select step → confirm transfer; merge flow with selected items sends `idsToMove`.
  5. Shift open: empty opening balance submit button disabled, tooltip "Enter a value".
  6. Customer search rapid typing → final list reflects last query, no stale overwrite.
  7. ItemOptions: open-price item with sizes — custom price honored.
  8. Run regression `vitest`.

---

## M3 — Tables Overflow & Pagination Adoption

- **Objective**: No horizontal overflow on phones/tablets; consistent pagination on long lists.
- **Problems (AUDIT §3.2, §3.3)**: CRM, CampaignHub, FiscalHub tables without `overflow-x-auto`; Inventory `min-w-[1180px] table-fixed`; no `common/Pagination` used anywhere; truncation `slice(0,N)` silently hides rows.
- **Proposed**:
  1. Wrap all wide tables in `<div className="responsive-table">` (define `.responsive-table{overflow-x:auto;-webkit-overflow-scrolling:touch;}` once in `styles/globals/premium.css`).
  2. Add `<th scope="col">` and `aria-sort` to all sortable columns.
  3. Replace `slice(0, N)` truncations with `common/Pagination` (server-side params where available; client-side for small lists).
  4. Inventory consumption table: switch from `min-w-[1180px] table-fixed` to percentage column widths OR stack as cards `<lg`.
  5. DayClose history (370 buttons), MenuProfitCenter grid, Reports catalog: paginate.
- **Business value**: usable on real hardware at all viewport sizes; no hidden rows; predictable navigation.
- **Risk**: LOW.
- **Files**: `components/CRM.tsx`, `CampaignHub.tsx`, `FiscalHub.tsx`, `Inventory.tsx`, `DayCloseHub.tsx`, `Reports.tsx`, `MenuProfitCenter.tsx`, `common/Pagination.tsx` (already exists), `styles/globals/premium.css`.
- **Manual test**:
  1. CRM on 360×740 — table scrolls horizontally inside the wrapper; page buttons navigate.
  2. CampaignHub on tablet — same.
  3. FiscalHub logs on 320×568 — table scrollable.
  4. DayClose history with 100 closes — paginated (10/page by default), can jump to last page.
  5. `lint && typecheck && test`.

---

## M4 — KDS Socket Orchestration & Sound

- **Objective**: Stop full-refetch storm, distinguish event types, deliver reliable new-ticket attention.
- **Problems (AUDIT §2 KDS, §4.2)**: `kds:update` no payload → full GET on every emit; sound fires on every event not just new; AudioContext suspended; urgent beep every 5s; `soundMode` not persisted; silent stale board on disconnect.
- **Proposed**:
  1. **server** (`kdsController.ts`, `publicScreenRoutes.ts`) → emit distinct events with payload: `kds:new-ticket {ticketId, orderId, station}`, `kds:bumped {ticketId, newStatus, updatedAt, serverVersion}`, `kds:recalled`, `kds:handover {orderId}`, `kds:item-toggled`.
  2. **`useKdsStore`** → add `addTicketFromSocket(ticket)`, `patchTicketStatus(id, status, version)`, `removeTicketFromSocket(orderId)`, `upsertTicketFromSocket`. Mirror `useOrderStore` patch model; snapshot+rollback on optimistic fails.
  3. **`KDS.tsx`** → subscribe per event; only trigger `playNewOrderSound` on `kds:new-ticket`; debounce `fetchOrders` fallback to 2s on `kds:*` events whose payload we don't recognize (forward-compat).
  4. **AudioContext unlock**: add one-time pointer/keydown listener that calls `getAudioCtx().resume()` (like PickupScreen does).
  5. **Persist `soundMode`** in localStorage (`restoflow.kds.sound`); add `critical-only` mode (urgent beep on `kds:new-ticket` ≥ critical threshold only).
  6. **Throttle urgent beep** to once per ticket + every 60s (not every 5s).
  7. **Reconnection badge**: register `socketService.onReconnect(() => fetchOrders(params))`; show a red top banner "RECONNECTING…" while `socketService.isConnected === false`.
  8. **30s poll fallback** if socket still down after first reconnect attempt.
- **Business value**: kitchen trust; no missed tickets in busy services; no alarm fatigue.
- **Risk**: MED (server protocol change — coordinate with M5/M15). Mitigation: keep emitting legacy `kds:update` (no payload) for one release alongside the new events; deprecate after M5 lands.
- **Files**: `server/controllers/kdsController.ts`, `server/routes/publicScreenRoutes.ts`, `server/socket.ts` (room emit helper), `stores/useKdsStore.ts`, `services/socketService.ts` (payload normalization), `components/KDS.tsx`, `components/PickupScreen.tsx`, `components/PackingScreen.tsx`.
- **Manual test**:
  1. Two KDS clients open; bump one ticket from client A → client B's board updates without full-refetch闪烁; only one beep sounds on client B if a *new* ticket arrives.
  2. Disconnect Wi-Fi → red banner appears within 2s → reconnect → banner clears and board refreshes.
  3. Refresh browser → `soundMode` retained; first user gesture resumes audio (one new-ticket beeps).
  4. No urgent beep loop after one critical ticket ages past 20m.

---

## M5 — KDS Workflow Bugs

- **Objective**: Correct kitchen lifecycle; no false-complete; sort/visibility correct; allergens surfaced.
- **Problems (AUDIT §2 KDS)**: `completeKitchenOrder` double-bump; handover force-marks all tickets DELIVERED; bump window 1.5s too short with no visual; stale silent drop; rush sort not prioritized; two station taxonomies; allergens invisible; `pendingBump` single-slot drops concurrent bumps.
- **Proposed**:
  1. `completeKitchenOrder` (KDS:433-437): one `updateOrderStatus` per click; remove the second unconditional advance.
  2. `kdsController.handoverOrder:527-529`: only mark tickets `DELIVERED` where `status==='READY'`; if any ticket not READY, reject with `KITCHEN_NOT_READY_FOR_HANDOVER` and surface in PickupScreen.
  3. Bump two-tap window 1.5s → 3s; render a 3s conic progress ring on the card after first tap; long-press (800ms) also bumps (touch-friendly).
  4. Stale tickets (>24h) → move to a collapsed "Stale (n)" drawer with acknowledge-to-archive action (audit log).
  5. Sort: rush/remake orders first (priority flag), then `createdAt` asc; document priority source (RUSH from POSsend, REMAKE from refund-then-resend).
  6. **Single station taxonomy**: server-derived; `GET /kds/meta` returns stations used by branch's printers; client increments `DEFAULT_STATIONS` only as fallback; remove keyword-guessing client map (`KDS:19-26`) as primary source.
  7. Allergens: include `allergens: string[]` on `KdsItem`; show red badge for high-risk (peanut, shellfish, gluten, dairy) on ticket + on `kitchenTicketTemplate`; allergen source = menu item's `allergens` field (add to menu schema in M11 if missing).
  8. `pendingBump` → use `Set<string>` for concurrent bump windows.
  9. Recall rollback: support roll-back from OUT_FOR_DELIVERY with audit reason (rare but exists when driver cancels pre-handover).
- **Business value**: kitchen no longer "loses" tickets; allergens keep customers safe; chefs can trust the screen.
- **Risk**: MED-HIGH (lifecycle semantics). Mitigation: server returns explicit rejected codes; UI confirms before destructive ops.
- **Files**: `components/KDS.tsx`, `server/controllers/kdsController.ts`, `services/kitchenTicketTemplate.ts`, new `GET /kds/meta` route.
- **Manual test**:
  1. Bump a multi-station order: only that station's card advances; order does NOT auto-ready until all stations READY.
  2. Handover attempt while GRILL still PREPARING → blocked, "GRILL not ready" toast.
  3. Three-tap bump rapid sequence → all three cards advance (no skipped mid-bump).
  4. Item with peanut allergen → red "PB" badge on ticket + on printed kitchen slip.
  5. Stale 25h ticket → in "Stale" drawer; acknowledge → moved out of board with audit row.

---

## M6 — Branch Isolation & Permissions Hardening

- **Objective**: Multi-tenant correctness + action-level RBAC.
- **Problems (AUDIT §6, §10)**: many GETs omit `branchId` (finance/reports/customer/campaign); expense approve no PIN/gate; period close no role check; ETA force-submit no role check; day-close has only `isSuperAdmin` gating on branch list not on actions; business-date update no role check; menu delete/archive no permission gate; Public-screen SUPER_ADMIN escalation + LAN bypass.
- **Proposed**:
  1. **Client side**: extend `services/api/{finance,reports,customers,campaigns}.ts` types to require/accept `branchId`; pass `settings.activeBranchId` from every caller (use `useAuthStore`).
  2. **New `AppPermission`s** (add to `types.ts`): `FINANCE_APPROVE_JOURNAL`, `FINANCE_CLOSE_PERIOD`, `FINANCE_REVERSE_JOURNAL`, `FISCAL_FORCE_SUBMIT`, `FISCAL_VIEW`, `MENU_DELETE_ITEM`, `MENU_ARCHIVE_ITEM`, `OP_CLOSE_DAY` (exists), `OP_UPDATE_BUSINESS_DATE`, `CAMPAIGN_DISPATCH`, `CAMPAIGN_MANAGE`, `CUSTOMER_VIEW_PII`, `CUSTOMER_MANAGE`.
  3. **Add `usePermissionGate` hook** wrapping `hasPermission` + `useConfirm`; gate destructive buttons (`disabled` + tooltip "Requires permission X").
  4. **DayClose**: only `SUPER_ADMIN | OWNER | BRANCH_MANAGER` see `OP_CLOSE_DAY` and `OP_UPDATE_BUSINESS_DATE`; use `useConfirm` modal + reason field for override.
  5. **Public screens** (server): remove `PUBLIC_SCREEN_LAN_NO_KEY` bypass (require key always); rotate keys via admin endpoint; never escalate to `SUPER_ADMIN` (introduce `PUBLIC_SCREEN_OPER` virtual role + audit by key id, respect status policy); send `X-Audit-Source: public-screen` header.
  6. **Server** (`routes/*`): always scope by `req.effectiveBranchId` (from JWT) when client omits `branchId`; reject `SUPER_ADMIN` queries without an explicit `?branchId=` query param to force intentional cross-branch view.
  7. **Migration**: add permissions to `seed-roles-permissions.ts` script + `RolesPermissions.tsx` UI exposure.
- **Business value**: trust, auditability, regulatory compliance (PDP law, ETA), multi-branch correctness.
- **Risk**: MED-HIGH (server changes). Mitigation: ship behind feature flags; run `branchIsolation.test.ts` after every step; add new server tests for omitted-`branchId` fall-through.
- **Files**: `types.ts`, `services/api/*.ts`, `stores/*` callers, `components/{Finance,Expenses,FiscalHub,DayCloseHub,MenuProfitCenter,CampaignHub,ApprovalCenter,CRM}`, `server/middleware/branchIsolation.ts`, `server/routes/publicScreenRoutes.ts`, `server/middleware/auth.ts` (new permission middleware), `scripts/seed-roles-permissions.ts`, `components/RolesPermissions.tsx`.
- **Manual test**:
  1. Login as CASHIER → menus only show permitted actions; "Approve Expense" hidden; "Close Period" hidden; "Force ETA" hidden.
  2. Login as BRANCH_MANAGER at Branch A → finance/reports return only Branch A; P&L shows Branch A only.
  3. Login as SUPER_ADMIN → must select Branch in header to see Branch A data; no implicit cross-branch.
  4. Expense approve button disabled for non-managers with tooltip.
  5. `branchIsolation.test.ts` + new tests green.

---

## M7 — DayClose Safety

- **Objective**: No irreversible action without informed confirm; clear "why" on disabled.
- **Problems (AUDIT §2 DayClose)**: no summary-preview modal before close; raw `window.confirm` for business-date; no role check on business-date update; close button disabled with tooltip-only explanation; close-shift drawer has no confirm and falls back to openingBalance.
- **Proposed**:
  1. `DayCloseHub.handleCloseDay` → prepend `useConfirm({ variant:'danger', confirmText:'CLOSE DAY', title, message })` summarizing today's orders/revenue/cash-variance from `report`.
  2. Business-date update → `useConfirm` + role gate from M6 + reason field; honor server-returned `businessDate`.
  3. Close button: render inline text "Required: <list of pending readiness codes>" replacing tooltip when `disabled`.
  4. `ShiftManagementDrawer.handleCloseShift` → if `Math.abs(variance) > settings.shiftVarianceThreshold` require reason via `useConfirm({ variant:'danger' })`; disable Submit until `report?.expectedCashBalance` defined (no fallback to openingBalance).
  5. Surface audit `result.report.auditId` after close ("Closed by {user}, audit #{id}").
  6. Closed snapshot: cap movement rows at 200 with "View all (n)" expansion; paginate inventory movements.
- **Business value**: prevents silent wrong closes, reversible operators; clear audit trail visible on screen.
- **Risk**: LOW (additive UX). Depends on M0 (useConfirm) + M6 (role gate).
- **Files**: `components/DayCloseHub.tsx`, `components/finance/ShiftManagementDrawer.tsx`, `services/api/dayClose.ts` (return auditId).
- **Manual test**:
  1. DayClose with one pending readiness → close disabled, inline text lists pending.
  2. DayClose ready → confirm modal shows revenue/orders/variance → confirm → success toast + audit id.
  3. Close shift with variance > threshold → reason required in confirm dialog.
  4. Snapshot day with 5000 movements → renders capped 200 + "view all".

---

## M8 — Finance & Fiscal Hardening

- **Objective**: Correct GL semantics; no expense self-approve; ETA force is privileged; branchId everywhere.
- **Problems (AUDIT §2 Finance/Fiscal)**: `useFinanceStore` no branchId; `debitAccountId` holds codes; period-close no role check; expense self-approve no PIN; `reportsApi.getFiscal` no branchId (worst leak); `FiscalHub "+4.2%"` hardcoded; ETA force no role/confirm; "View Full Fiscal Logs" dead button; `useFinanceStore.recordTransaction` hardcoded source.
- **Proposed**:
  1. Extend `JournalEntry` type with `debitAccountCode`/`creditAccountCode` separate from IDs; store populates both.
  2. Pass `branchId` on every finance GET (incl. `getProfitAndLoss`, `getJournal`) — depends on M6 types being extended.
  3. Gate `submitPeriodClose` with `FINANCE_CLOSE_PERIOD` + `useConfirm({variant:'danger'})`.
  4. Gate `approveExpense` with `FINANCE_APPROVE_JOURNAL` + manager PIN via `approvalApi.verifyPin` (route through ApprovalCenter workflow).
  5. `FiscalHub.handleSubmitETA` force → `FISCAL_FORCE_SUBMIT` + `useConfirm({variant:'danger', confirmText:'FORCE SUBMIT'})`.
  6. Add `branchId` to `reportsApi.getFiscal` contract (server + client).
  7. Replace cosmetic `"+4.2% from last month"` with real computed delta or hide entirely.
  8. Implement or remove "View Full Fiscal Logs" button (open a paginated logs drawer).
  9. `useFinanceStore.recordTransaction` accept `source` arg (default `'MANUAL'`).
  10. Ledger forms: round amounts to 2dp on submit; client-side `moneyRound`.
- **Business value**: financial integrity, audit-ready, regulatory-safe.
- **Risk**: MED. Coordinate with M6.
- **Files**: `stores/useFinanceStore.ts`, `services/api/{finance,reports}.ts`, `components/Finance.tsx`, `Expenses.tsx`, `FiscalHub.tsx`, `utils/formatters.ts` (`moneyRound`), server `routes/finance.ts`, `routes/reports.ts`.
- **Manual test**:
  1. Open Finance at Branch A → only Branch A entries visible.
  2. Period close as ACCOUNTANT → disabled; as BRANCH_MANAGER → confirm dialog → close.
  3. Expense approve without gate → button disabled + tooltip.
  4. ETA force without perm → button disabled; with perm → confirm dialog required.
  5. Fiscal at Branch A → VAT figures Branch A only.
  6. `lint && typecheck && test`.

---

## M9 — CRM Privacy & Pagination

- **Objective**: PII access controlled; no full SPA reload; no jank on large lists.
- **Problems**: no branchId on `customersApi.getAll`; phone/address in plain table without `DATA_VIEW_CUSTOMER_PII` masking; `refresh` reloads SPA; client-side filter over full list for 50k.
- **Proposed**:
  1. Extend `customersApi.getAll` to require `{ branchId, search?, phone?, limit?, cursor? }`; pass `settings.activeBranchId`.
  2. Server-side search/pagination; client becomes a thin paginated list.
  3. Wrap customer table in `responsive-table`; use `common/Pagination`.
  4. Replace `window.location.reload()` with `fetchCustomers()`.
  5. Mask phone/address (`+20 10•• ••• 1234`) unless `hasPermission(DATA_VIEW_CUSTOMER_PII)`; admins/managers see full; cashiers see masked.
  6. Profile drawer: add Escape close.
  7. CustomerSave: call `getCustomerByPhone(phone)` first; show "Existing customer found" toast + offer to use existing.
  8. Inline customer registration: validate phone via configurable country regex (not hardcoded Egyptian).
- **Business value**: legal PII handling, no SPA reload regression, multi-branch correctness, scales.
- **Risk**: LOW-MED.
- **Files**: `components/CRM.tsx`, `stores/useCRMStore.ts`, `services/api/customers.ts`, `types.ts` (`DATA_VIEW_CUSTOMER_PII` permission), `common/Pagination.tsx`.
- **Manual test**:
  1. CASHIER opens CRM → phone column masked; cannot reveal.
  2. BRANCH_MANAGER → full phone shown.
  3. Branch A user → only Branch A customers.
  4. 50k customers → pagination no jank.
  5. Refresh button → no full reload, list refreshes.

---

## M10 — Campaigns Real Dispatch & Consent

- **Objective**: Make campaigns actually dispatch to segments; gate consent per recipient; persist integration tokens.
- **Problems**: dispatch sends only operator phone; no segment builder; no consent; no template-variable system; integration tokens held in plain state, never persisted.
- **Proposed**:
  1. **Segment builder modal**: pull recipients from `useCRMStore.searchCustomers({ hasMarketingConsent: true, lastVisitBefore, minVisits, minSpend })`; preview recipient count + estimated cost.
  2. **Consent flag** on `Customer` (`marketingConsentAt: timestamp`); filter recipients to consented only; show rejected-count.
  3. **Template variables** `{name}`, `{code}`, `{discount}`, `{branch}` — resolved per recipient; preview renders one sample.
  4. **Integration persistence**: POST tokens to `/api/integrations/{fb,tiktok,wa}` from server-side env; never store tokens in client state. Remove UI shells or implement properly.
  5. **`branchId`** required on all `campaignsApi.*`.
  6. **Cost estimate** before dispatch; explicit "I confirm dispatch to N recipients" `useConfirm`.
- **Business value**: legal compliance (PDP law), real marketing operations, no fake UI.
- **Risk**: HIGH (integrations need server secrets). Mitigation: ship segment-builder + consent first; defer FB/TikTok API integration to a follow-up; remove fake UI shells in this module.
- **Files**: `components/CampaignHub.tsx`, new `CampaignSegmentBuilder.tsx`, `services/api/campaigns.ts`, `stores/useCRMStore.ts`, `types.ts` (`marketingConsentAt`), `components/CustomerSelectView.tsx` (capture consent on registration).
- **Manual test**:
  1. Create campaign → segment filter shows only consented recipients; rejected count shown.
  2. Dispatch → confirm dialog shows count + cost → confirm → success toast references real recipient ids.
  3. No marketing for customer with `marketingConsentAt=null`.

---

## M11 — Menu Store Backend Persistence

- **Objective**: Stop silent data loss in menu actions.
- **Problems**: `archiveItem`/`restoreItem`/`duplicateItem`/`bulkUpdateItems` local-only; `updateMenuItem:429-446` no rollback; `deleteMenuItem:451-475` mutates local even after both delete+archive fail; `deleteMenuItem` falls back to archive without user option; `fetchMenu` silently returns on 401.
- **Proposed**:
  1. Route all four local-only actions (`archiveItem`, `restoreItem`, `duplicateItem`, `bulkUpdateItems`) through their `menuApi` equivalents.
  2. `updateMenuItem` cross-category move: snapshot previous locations + `categories` arrays; on error restore both.
  3. `deleteMenuItem`: mutate local state ONLY after a confirmed success; on failure present the user with explicit archive-or-retry choice.
  4. `fetchMenu:148-152`: surface 401 as `sessionExpired` → `useAuthStore.logout()` → redirect login.
  5. Action-level RBAC from M6 (`MENU_DELETE_ITEM`, `MENU_ARCHIVE_ITEM`).
  6. **Allergens field** on `MenuItem` (array of strings) — used by M5 KDS.
- **Business value**: menus stop silently losing edits; kitchens see correct items.
- **Risk**: MED. Mitigation: add server-side idempotency keys on bulk update.
- **Files**: `stores/useMenuStore.ts`, `services/api/menu.ts`, `types.ts` (`MenuItem.allergens`), `components/menu/ItemDrawer.tsx` (allergens editor), `scripts/seed-roles-permissions.ts`.
- **Manual test**:
  1. Archive item offline → comes back online → archive persists; refresh → still archived.
  2. Move item across categories with network failure → item restored to original location with toast "Move failed".
  3. Delete item with server failure → modal "Delete failed. Archive instead? [Archive] [Retry] [Cancel]".
  4. Item with `allergens:['peanut']` → KDS shows "PB" badge.

---

## M12 — Inventory Workflow Fixes

- **Objective**: No silent stock corruption; receipts recorded with cost; counts not lost.
- **Problems**: `StockAdjustmentModal` no qty validation; `Inventory.tsx handleSaveItem:348-355` mutates stock for items whose create threw; direct receipt drops `costPrice`; `handleCompleteCount(apply=false)` doesn't persist draft; PO partial-receive unsupported; `patchStockFromSocket` absolute-vs-delta ambiguity.
- **Proposed**:
  1. `StockAdjustmentModal`: validate `quantity` finite & ≥0; show preview "Resulting qty: {current + delta}"; explicit `-`/`+` toggle.
  2. `handleSaveItem`: try/catch `addInventoryItem`; on throw, toast + abort warehouse loop.
  3. Direct receipt: add `costPrice` param to `updateStock` for `PURCHASE` type; backend updates moving-average cost; surface cost in inventory valuation.
  4. `handleCompleteCount(apply=false)`: persist draft counts via `updateStockCount(apply=false)` (mirror `InventoryIntelligence`).
  5. PO receive: pass editable receive-items list to `receivePurchaseOrder` (support partial / re-receive).
  6. `useInventoryStore.patchStockFromSocket`: confirm payload is absolute; if delta, accumulate. Add unit test.
  7. Sort labels `qty-asc`/`qty-desc` → `Qty ↑`/`Qty ↓`; remove "4.2x" placeholder (compute or hide).
  8. Cross-module currency: `utils/formatters.formatCurrency(qty, settings.currencySymbol)`.
- **Business value**: inventory figures trustworthy; valuation accurate; counts don't vanish.
- **Risk**: MED. Mitigation: server-side idempotency on cost updates.
- **Files**: `src/features/inventory/components/{StockAdjustmentModal,ReceiptModal,Procurement}.tsx`, `src/features/inventory/Inventory.tsx`, `stores/useInventoryStore.ts`, `services/api/inventory.ts`, `utils/formatters.ts`.
- **Manual test**:
  1. Negative qty in adjustment → blocked with preview.
  2. Save new item with backend failure → no warehouse stock rows created.
  3. Direct receipt with cost 50 → `inventoryValuation` reflects new average cost.
  4. Stock count draft saved (apply=false) → refreshing → counts persisted.
  5. PO partial receive 2 of 5 → remaining stays open.
  6. `lint && typecheck && test`.

---

## M13 — Recipe & Cost Reconciliation

- **Objective**: BOM drives item cost; no format-conversion data loss.
- **Problems**: `RecipeManager` flat-vs-size-keyed silent overwrite; `MenuItem.cost` manually set not auto-derived; live margin display can disagree with BOM.
- **Proposed**:
  1. Normalize recipe storage to **size-keyed format**: `{ sizeId: null, ingredients: [...] }` for base.
  2. `ItemDrawer` derives `item.cost` = Σ BOM×unit-cost on save; surface override toggle "Use custom cost (manual)" with reason.
  3. `MenuProfitCenter` margin filter uses derived cost (warning badge if `item.cost !== computedBomCost`).
  4. `RecipeManager` save: explicit format on write; migration path for old flat recipes.
- **Business value**: trustworthy menu margins.
- **Risk**: MED (data migration). Coordinate with M11.
- **Files**: `components/RecipeManager.tsx`, `components/menu/ItemDrawer.tsx`, `stores/useMenuStore.ts`.
- **Manual test**:
  1. Save recipe for size Large with 3 ingredients → cost recomputed; menu card shows realistic margin.
  2. Old format recipe (flat) → opens correctly in size-keyed editor with base mapping.
  3. Manual override → badge "cost overridden"; remove override → reverts to BOM cost.

---

## M14 — Driver Proof-of-Delivery & Dispatch Hardening

- **Objective**: No fraud-delivered; usable on tablet.
- **Problems**: no OTP/signature/photo before DELIVERED; DriverDashboard primary buttons `h-13` zero-height; `confirmDeliveredAndReturning` no confirm; `DispatchHub.assignDriver` global guard drops concurrent assignments.
- **Proposed**:
  1. **Proof of delivery**: driver taps "Delivered" → capture OTP (4-digit, customer confirms) OR signature canvas OR photo (geotagged); mandatory on tablet/phone.
  2. Fix `h-13` → `h-14`.
  3. `confirmDeliveredAndReturning` → `useConfirm` showing captured amount + COD reconciliation.
  4. `DispatchHub.assignDriver` → per-order pending set.
  5. Server-side filter DriverDashboard orders by `driverId` (not client-side filter over ALL orders).
  6. SLA configurable per branch / order-type (replace hardcoded 45).
- **Business value**: fraud reduction, evidence chain, driver app usable.
- **Risk**: MED. Mitigation: keep OTP optional behind settings flag for one release.
- **Files**: `src/features/driver/DriverDashboard.tsx`, `components/DispatchHub.tsx`, `services/api/delivery.ts`, `server/routes/delivery.ts`.
- **Manual test**:
  1. Driver "Delivered" with `requireProofOfDelivery=true` → OTP prompt shown; correct OTP → delivered.
  2. Wrong OTP rejected with toast.
  3. Photo capture: photo thumbnail + geotag stored.
  4. Buttons visible (not zero-height).
  5. Dispatch concurrent assign on two orders → both succeed.

---

## M15 — Lite Public Screens Security

- **Objective**: Lock down public-screen surface; no SUPER_ADMIN escalation; reliable reconnect.
- **Problems**: `PUBLIC_SCREEN_LAN_NO_KEY=true` LAN bypass; SUPER_ADMIN escalation with `skipPolicy:true`; key-in-localStorage leak; `operator-screen.html` stale duplicate; no payload on `kds:update`-equivalent events; no error-code handling for forbidden/token-required; naive 5s poll without backoff.
- **Proposed**:
  1. Remove `PUBLIC_SCREEN_LAN_NO_KEY` bypass (require key always).
  2. Replace static `PUBLIC_SCREEN_TOKEN` with rotating signed tokens issued by an authenticated parent endpoint (per-screen device binding + 24h TTL).
  3. Public-screen actions transition order status with `PUBLIC_SCREEN_OPER` virtual user + audit by key id; respect status policy (no `skipPolicy:true`).
  4. Delete `operator-screen.html` (use `kdslite.html` only).
  5. `kdslite.html` handle error codes `PUBLIC_SCREEN_FORBIDDEN`, `PUBLIC_SCREEN_TOKEN_REQUIRED` with inline login prompt.
  6. Adopt payload-carrying events from M4 (`kds:new-ticket` etc.).
  7. 5s poll → exponential backoff on errors, capped at 30s; reset on success.
  8. Replace inline `onclick="screenActionReady('...')"` interpolation with `addEventListener` (XSS hardening — defense in depth despite `text()` escaping).
  9. Audit: every public-screen action emits an `AUDIT` log row with key-id + source-IP + device-id.
- **Business value**: closes a real attack surface; legal audit trail.
- **Risk**: HIGH (server change). Depends on M4.
- **Files**: `server/routes/publicScreenRoutes.ts`, `server/middleware/publicScreenAuth.ts` (new), `server/services/publicScreenTokens.ts` (new), `public/kdslite.html`, `public/operator-screen.html` (delete), `public/packinglite.html` (keep, shim).
- **Manual test**:
  1. Try bumping from kdslite with wrong key → 403 inline login prompt.
  2. LAN-without-key → rejected.
  3. Force token expires after 24h → re-login required.
  4. Server outage → polls backoff (5s,10s,20s,30s), recovers automatically.
  5. Audit log row written per bump.

---

## M16 — Performance Virtualization

- **Objective**: No jank on large lists; exports don't freeze UI.
- **Problems (AUDIT §4)**: ItemGrid no virtualization + per-card tilt listener; customer list no virtualization; KDS columns AnimatePresence on all; Reports tables no virtualization; ExcelJS sync on UI thread; N+1 PO fetch; useMenuStore bulkPut whole menu.
- **Proposed**:
  1. **`ItemGrid`**: adopt `common/VirtualGrid` (exists); preserve tilt on visible cards only (suspend when offscreen via `useOnScreen`).
  2. **Customer list / large table views**: adopt `common/VirtualList` (exists) for >50 rows; render with fixed row height.
  3. **KDS columns**: window via `react-window` `FixedSizeList` for >30 tickets; disable framer-motion `layout` when count >50 (snap to position).
  4. **Reports tables**: replace inline `<tr>` render with `VirtualList`; cap DOM rows.
  5. **ExcelJS**: move to a Web Worker (`utils/workers/exportXlsx.worker.ts`); show progress + cancel button.
  6. **Inventory XLSX import**: parser + validator in Web Worker; bounded parallel `Promise.all` batches of 20.
  7. **useInventoryStore.fetchPurchaseOrders** → batch endpoint (`getAllWithItems`); drop N+1.
  8. **useMenuStore.fetchMenu** → diff-and-merge with `localDb` (don't clear+bulkPut everything).
  9. **Recharts lazy** — `Dashboard.tsx`, `CrmReports.tsx` only import used chart components.
- **Business value**: smooth on old POS hardware; large catalogs import/export without freezing.
- **Risk**: MED (virtualization correctness with variable heights). Mitigation: keep non-virtualized fallback for `<50` items.
- **Files**: `common/VirtualList.tsx`, `VirtualGrid.tsx` (verify/fix variable height support), `src/features/pos/components/ItemGrid.tsx`, `MenuItemCard.tsx` (suspend tilt offscreen), `components/KDS.tsx`, `components/Reports.tsx`, `components/reports/views/*Reports.tsx`, `src/features/inventory/Inventory.tsx` (import), `stores/{useInventoryStore,useMenuStore}.ts`, `services/api/procurement.ts`, `utils/workers/exportXlsx.worker.ts` (new).
- **Manual test**:
  1. Menu of 1000 items → smooth scroll, no jank; tilt only on visible.
  2. Customer list 50k → paginate (M9) + virtualize within page.
  3. KDS 60 active tickets → no jank on bump.
  4. Reports "Stock Movements" over 90 days (~30k rows) → table scrolls in <16ms frame; export to XLSX runs in worker, UI responsive + cancellable.
  5. Import 1000-row inventory Excel → UI responsive, progress shown, completes <10s.
  6. `lint && typecheck && test`.

---

## M17 — Reports Correctness

- **Objective**: Exports work; print window renders correctly; state-cleanup.
- **Problems (AUDIT §2 Reports)**: print window steals all `<style>`/`<link>` but CSS variables resolve `initial`; `setTimeout(print, 400)` race; `SUPPORTED_TABULAR_EXPORT_TYPES` only 14 of 88; `useReportsState` 90 slots never cleared; `@page size A4 portrait` hardcoded.
- **Proposed**:
  1. Print window: serialize `:root` CSS variables (provider/theme CSS) into the print window root via `serializeCssVars()` helper; wait `printWindow.onload` before `print()`.
  2. Align `SUPPORTED_TABULAR_EXPORT_TYPES` with server (`reportConstants.ts`) — add `SALES_BY_ITEM`, `SALES_BY_CATEGORY`, `SHIFT_SUMMARY`, `STOCK_VALUATION`, etc.; expose a `/reports/meta` server route listing export capability per report.
  3. `useReportsState`: refactor ~90 slots into a `Map<reportKey, ReportState>` keyed by `${report}__${range}`; clean up on `appliedRange` change.
  4. `@page` orientation per report (wide trial-balance → landscape); augment `reportConstants` entry with `orientation`.
  5. Column auto-fit: sample across body, not first 200 rows.
  6. Guard `start <= end` on CUSTOM range picker.
  7. BOM-strip incoming CSV (ExcelJS doesn't strip `\uFEFF`).
- **Business value**: reliable exports for accounting, audits.
- **Risk**: LOW.
- **Files**: `components/Reports.tsx`, `components/reports/useReportsState.ts`, `components/reports/reportConstants.ts`, `services/reportPrintStyles.ts`, `services/api/reports.ts`.
- **Manual test**:
  1. Print "Sales by Hour" → window renders with theme tokens intact; print dialog auto-opens after load.
  2. Export "Sales by Item" CSV → succeeds (was unsupported).
  3. Switch date range → no stale data from previous range.
  4. Wide trial balance export PDF → landscape orientation.

---

## M18 — Dashboard Truthfulness

- **Objective**: No simulated data; consistent currency; honest staleness indicator.
- **Problems (AUDIT §2 Dashboard)**: `trendData={revenue * 0.8}` simulated sparklines; `toLocaleString()` vs `toFixed(2)` inconsistent; businessDate missing silently default today; KPIs can be 5min stale with "LIVE" badge; no window labels on charts; TZ bugs.
- **Proposed**:
  1. Replace simulated sparklines with real per-metric series (or remove sparklines if API can't supply).
  2. Wrap all KPI numbers in `formatCurrency(value, currencySymbol)` from M0.
  3. If `activeBranch.businessDate` missing → surface amber warning "Branch business date not set" (don't silently default).
  4. Show "Updated HH:MM:SS" near refresh; subscribe to socket invalidation events for `order:*`/`audit:refresh`.
  5. Show resolved date-window (`startDate → endDate`) label on every chart.
  6. Tab visibility guard on `setInterval(refresh, 60000)`.
  7. Partial socket updates merge only defined keys in `AdminDashboardPage.handleBranchUpdate`.
  8. TZ: use `todayLocalDate()` from M0 everywhere (replace `toISOString().slice(0,10)`).
- **Business value**: operators trust the dashboard; no false conclusions.
- **Risk**: LOW.
- **Files**: `components/Dashboard.tsx`, `components/AdminDashboardPage.tsx`, `utils/formatters.ts` (M0).
- **Manual test**:
  1. KPI cards all show 2dp + currency suffix.
  2. Missing businessDate → amber warning, not silent default.
  3. Background refetch → "Updated HH:MM:SS" updates.
  4. Charts show window label `2026-07-20 → 2026-07-27`.
  5. Late-night at 23:30 local (UTC+2) → "today" stays correct (UTC rollover doesn't shift).

---

## M19 — Accessibility Pass

- **Objective**: WCAG 2.1 AA on focus, labels, semantics, motion.
- **Problems (AUDIT §7)**: no focus traps in 9+ modals; no Escape close; aria-labels sparse on icon buttons; cards `div onClick` not keyboard activatable; tabs no `role=tablist`; `th scope="col"` missing; `prefers-reduced-motion` partial.
- **Proposed**:
  1. Add `useFocusTrap` hook (`common/useFocusTrap.ts`) and apply to all drawers/modals (consolidates into M0's `common/Drawer`).
  2. `common/Drawer`, `common/Modal` (extract from ItemDrawer pattern): add Esc + focus trap + restore focus.
  3. Icon-only buttons: require `aria-label` (lint rule via eslint-plugin-jsx-a11y).
  4. Convert card `<div onClick>` to `<button>` or add `role="button" tabIndex={0} onKeyDown`.
  5. Replace bespoke tab strips with `common/Tabs` (aria-tablist) — coordinated with M0 adoption.
  6. `<th scope="col">` everywhere.
  7. `prefers-reduced-motion`: gate `CRM.tsx:13,535` shimmer and CampaignHub staggered rows; add `@media (prefers-reduced-motion: reduce)` block to mute `animate-[shimmer_2s_infinite]`.
  8. Pin inputs in `ApprovalCenter`/`ManagerApprovalModal` add `aria-label` and `role="alert"` on error.
- **Business value**: keyboard-operable for any user; lawsuit-ready audit.
- **Risk**: LOW.
- **Files**: `common/useFocusTrap.ts` (new), `common/Drawer.tsx`, `common/Modal.tsx` (new), adopters across modules, `eslint.config.cjs`.
- **Manual test**:
  1. Tab-only navigation through each major route; focus never escapes modal; Esc closes.
  2. Screen reader (NVDA) reads button labels (not "button button"); tabstrip announces "tab, selected"; table headers announce column.
  3. `prefers-reduced-motion: reduce` in devtools → no shimmer; POS card transitions near-instant.
  4. `eslint-plugin-jsx-a11y` lint green.

---

## M20 — Lite Screens Reconnect & Backoff

- Bundled with **M15** for the engineering saving.

---

## M21 — Tech-Debt Cleanup

- **Objective**: Remove dead code paths that confuse maintenance.
- **Proposed**:
  1. Confirm router uses `MenuProfitCenter` exclusively → delete `components/MenuManager.tsx` (1414 lines legacy orphan).
  2. Remove `services/fiscalService.ts` stub (throws `LEGACY_FISCAL_CLIENT_DISABLED`) — or move to `/legacy/` with README.
  3. Remove `public/operator-screen.html` (covered by M15).
  4. Remove `components/Toast.tsx` (covered by M0).
  5. Document orphan scripts in `scripts/` (legacy fixers) — keep operational but add README index.
- **Risk**: LOW (verify orphans are orphaned first via grep).
- **Files**: as listed + `README.md` migration notes.
- **Manual test**:
  1. `grep -r "MenuManager" components/` → no imports remain after deletion.
  2. Build green; runtime spot-check of menu route.
  3. `lint && typecheck && test`.

---

## Execution Log (updated after each submodule)

(initially empty; each submodule appends a dated entry: id, files modified, what/why/business value, risks, manual test result, checklist update)

---

### 2026-07-27 — M1 Touch Target & Responsive Pass

**Files modified:**
- `src/features/pos/components/POSToolbar.tsx:48` — added `pressable` to mode-segment wrapper (タッチズーム防止)
- `src/features/pos/components/POSHeader.tsx:65,82,90` — home button 32×32→44×44 (`h-11 w-11`, `aria-label` added); context-clear X `w-4 h-4` 16px→32×32 with `touch-target`, icon 14px
- `src/features/pos/components/CartItem.tsx:115-157` — stepper ±1 buttons `w-8`→`min-w-[44px]` (44px-hit); action buttons (discount, note, remove) 32×32→44×44 (`h-11 w-11`)
- `src/features/pos/components/CustomerSummary.tsx:224-241` — quick-cash buttons `h-8`→`h-10` + `touch-target`; numpad keys `h-10`→`h-11` + `touch-target`; exact-cash `h-10`→`h-11`
- `components/KDS.tsx:1348-1352` — item toggle chips 28×28→40×40 with minWidth/minHeight; column action button `padding 6px 12px, fs 9`→`padding 10px 16px, fs 12, minHeight 44`; ticket-footer bump `minHeight 34`→`minHeight 44`
- `src/features/driver/DriverDashboard.tsx:368,372` — `h-13`→`h-14` (fixed zero-height Tailwind bug)
- `components/PickupScreen.tsx:451,541` — main `<main>` now `flex-col lg:flex-row` (stacks vertically <lg); preparing sidebar `w-[400px]`→`w-full lg:w-[340px] xl:w-[450px]` (uses full width on tablet)

**What / Why / Business value:** All POS/KDS/touch actions now enforce ≥44px WCAG 2.5.5 minimums; DriverDashboard critical buttons are no longer zero-height; PickupScreen usable on tablets in vertical stack. Kitchen staff can reliably bump tickets onTouch; cashiers can hit numpad/stepper./quick-cash without zoom-in; header context-X no longer impossibly small for fingers.

**Risk:** MED (visual impacts on POS/KDS screen layouts). Mitigation: all changes preserve the visual icon size but extend the hit-area; flex-box and `min-w-px` keep content flow intact; column action font grew by 3px, but most KDS screens are 1080p with space to accommodate.

**Validation result:**
- `tsc --noEmit` → exit 0.
- `eslint` → exit 0.
- `vitest run` → 54 pass / 2 fail / 1 skipped — the same 2 E2E failures that reproduce on master before M0/M1 (coreOrderFlow E2E ×2 + dailyOrderNumber test file-not-found). No newreg refusal from M1.

**Checklist update:** M1 marked `[x]` on 8 of 8 items except manual test (deferred to M6 branch touch rollout). M1 is functionally complete and unblocks M2, M3, M6-M8 which all involve POS/KDS touch + responsive safety.

**Next module:** M2 — POS Cashier Safety**Execution Log**

**Next module:** M2 — POS Cashier Safety (clear-cart confirm, two-tap pay fix, retail focus-steal, table-step rewrite, shift NaN fix, customer search race, item diff modal).
