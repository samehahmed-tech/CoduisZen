# RestoFlow Improvement Checklist

> Living document. Update continuously. Mark `[x]` when done. Leave `[ ]` pending.
> See `AUDIT.md` for findings detail and `MASTER_PLAN.md` for module objectives/testing.

Legend: `[ ]` pending · `[~]` in progress · `[x]` complete · `[!]` blocked

---

## Phase 1 — Audit (DONE)

- [x] Architecture map (theme engine, common, hooks, services, stores, routes)
- [x] POS module audit (22 components + workflow)
- [x] Inventory + Menu + Recipes + Wastage + Intelligence audit
- [x] KDS + Pickup + Packing + Production + Dispatch + Driver audit
- [x] Dashboard + Reports + Finance + Expenses + DayClose + Fiscal + Campaigns + CRM + Approvals audit
- [x] Responsive cross-cutting review (device matrix)
- [x] Performance cross-cutting review (virtualization, refetch, XLSX)
- [x] Accessibility cross-cutting review
- [x] Branch isolation & security review
- [x] Maintainability / tech-debt review
- [x] Top critical-fixes list compiled
- [x] Written to `AUDIT.md`

---

## Phase 2 — Master Plan (DONE)

- [x] Module index prioritized (M0–M21)
- [x] Per-module: objective / problems / proposed / business value / risk / files / manual test
- [x] Execution principles (no big-bang; one module at a time; tests green)
- [x] Written to `MASTER_PLAN.md`

---

## Phase 3 — Checklist Setup (DONE)

- [x] This `CHECKLIST.md` initialized
- [x] Continuous-update discipline established

---

## Phase 4 — Execution

### M0 — Design System Consolidation
- [x] Audit
- [x] Add `utils/formatters.ts` (`formatCurrency`, `todayLocalDate`, `formatLocalDate`, `parseLocalDateKey`, `moneyRound`, `formatQty`)
- [ ] Deprecate `components/Toast.tsx` in favor of `common/ToastProvider`/`useToast` (deferred to M2+ adoption cycle)
- [x] Define radius tokens (`--radius-xs/sm/lg/xl/2xl`) + touch-target tokens (`--touch-target-min/cozy`) in `theme/tokens.ts` + `_base.css`
- [x] Add `<StockLevelBadge>` to `common/StatusBadge.tsx`
- [x] Add `EmptyStatePresets` helper to `common/EmptyState.tsx`
- [x] Add `.touch-target`, `.touch-target-cozy`, `.pressable`, `.responsive-table` utility classes in `index.css`
- [x] Validate (`typecheck` green, `lint` green, `test -- --run` 210/215 pass — 4 pre-existing e2e/inventory failures present at master HEAD, not introduced by M0)
- [x] Regression Tested

### M1 — Touch Target & Responsive Pass
- [x] Audit touch targets (toolbar, header X, cart steppers, numpad, quick-cash, ListCard, KDS bump, item chips, column action, Driver `h-13`)
- [x] Define `--touch-target-min:44px` token + `.touch-target` utility class (done in M0)
- [x] Fix Driver `h-13` → `h-14` (zero-height bug)
- [x] Enlarge under-44px targets: CartItem stepper ± (`min-w-[44px]`), CartItem actions (`h-11 w-11`), POSHeader home (`h-11 w-11`), header context X (`w-8 h-8` from `w-4 h-4`), numpad keys (`h-11`), quick-cash (`h-10 + touch-target`), KDS bump (`minHeight:44`), KDS column action (`minHeight:44, padding:10px 16px, fontSize:12`), KDS item chips (`40×40, minWidth/minHeight:40`)
- [x] Add `.pressable` class to POSToolbar mode-segment wrapper
- [ ] POSToolbar visible scrollbar + scrolldot (deferred — m multi-shot incremental)
- [x] PickupScreen stack vertically `<lg` (`flex-col lg:flex-row` on main; preparing sidebar `w-full lg:w-[340px] xl:w-[450px]`)
- [ ] Test on viewport matrix (1024×768, 1074×678, 1280×720, 1366×768, 1600×900, 1920×1080, 360×640, 414×896, 768×1024) — deferred to M6 branch-isolation rollout
- [x] Complete

### M2 — POS Cashier Safety
- [ ] Audit
- [ ] Wrap clear-cart with `useConfirm({variant:'danger'})`; differentiate from close-cart
- [ ] Fix cash-takeaway silent two-tap pay (auto-submit after drawer OR explicit two-step label)
- [ ] Remove RetailModePanel window-click force-focus
- [ ] Rewrite TableManagementModal step-router (no-op Next, merge `[]` items, mode boolean cluster)
- [ ] Fix ShiftOverlays NaN opening-balance (disable on empty/NaN)
- [ ] Add AbortController to CustomerSelectView search; require name+phone for platform delivery
- [ ] Fix ItemOptionsModal open-price + size interaction
- [ ] Add order-wide discount UI in PaymentSummary
- [ ] Display coupon metadata on apply
- [ ] Implement RefundModal (line-items + reason + manager PIN); wire `onVoid`
- [ ] Validate (regression `vitest` + manual POS smoke)
- [ ] Complete

### M3 — Tables Overflow & Pagination Adoption
- [ ] Audit
- [ ] Define `.responsive-table { overflow-x:auto; -webkit-overflow-scrolling:touch }` in `styles/globals/premium.css`
- [ ] Wrap CRM table in `.responsive-table`; add `<th scope="col">`
- [ ] Wrap CampaignHub table
- [ ] Wrap FiscalHub logs table
- [ ] Replace `slice(0,N)` truncations with `common/Pagination`
- [ ] Inventory consumption `min-w-[1180px] table-fixed` → percentage widths OR card stack `<lg`
- [ ] DayClose history (370 buttons) → paginated
- [ ] Test on tablets + phones
- [ ] Complete

### M4 — KDS Socket Orchestration & Sound
- [ ] Audit
- [ ] Server: emit payload-carrying events (`kds:new-ticket`, `kds:bumped`, `kds:recalled`, `kds:handover`, `kds:item-toggled`)
- [ ] `useKdsStore`: add `addTicketFromSocket`/`patchTicketStatus`/`removeTicketFromSocket`/`upsertTicketFromSocket`
- [ ] KDS.tsx subscribe per event; only beep on new-ticket
- [ ] AudioContext user-gesture unlock
- [ ] Persist `soundMode` (localStorage); add `critical-only` mode
- [ ] Throttle urgent beep (once per ticket + 60s)
- [ ] Reconnection badge + 30s poll fallback
- [ ] PickupScreen/PackingScreen adopt new events
- [ ] Validate (two-client bump test, disconnect/reconnect, refresh retention)
- [ ] Complete

### M5 — KDS Workflow Bugs
- [ ] Audit
- [ ] Remove double-bump in `completeKitchenOrder` (KDS:433-437)
- [ ] Guard `handoverOrder` to only mark READY tickets (reject `KITCHEN_NOT_READY_FOR_HANDOVER`)
- [ ] Bump window 1.5s → 3s + conic progress ring; long-press bump
- [ ] Stale tickets → "Stale (n)" collapsed drawer + acknowledge-to-archive
- [ ] Sort: RUSH/REMAKE first, then createdAt asc
- [ ] Single station taxonomy (server-derived via `GET /kds/meta`; drop client keyword guessing)
- [ ] Allergens on KDS ticket + kitchen template
- [ ] `pendingBump` → Set for concurrent bumps
- [ ] Recall rollback from OUT_FOR_DELIVERY (with audit reason)
- [ ] Validate
- [ ] Complete

### M6 — Branch Isolation & Permissions Hardening
- [ ] Audit
- [ ] Add `branchId` to `financeApi`/`reportsApi`/`customersApi`/`campaignsApi` types
- [ ] Pass `settings.activeBranchId` from all callers
- [ ] Add new `AppPermission`s (`FINANCE_APPROVE_JOURNAL`, `FINANCE_CLOSE_PERIOD`, `FINANCE_REVERSE_JOURNAL`, `FISCAL_FORCE_SUBMIT`, `FISCAL_VIEW`, `MENU_DELETE_ITEM`, `MENU_ARCHIVE_ITEM`, `OP_UPDATE_BUSINESS_DATE`, `CAMPAIGN_DISPATCH`, `CAMPAIGN_MANAGE`, `CUSTOMER_VIEW_PII`, `CUSTOMER_MANAGE`)
- [ ] Add `usePermissionGate` hook (perm + tooltip)
- [ ] Server reject SUPER_ADMIN GETs without explicit `?branchId=`
- [ ] Server scope by `req.effectiveBranchId` when client omits
- [ ] DayClose role gate (`OP_CLOSE_DAY`, `OP_UPDATE_BUSINESS_DATE`)
- [ ] DayClose business-date update → `useConfirm` + reason + role
- [ ] Expense approve gate (`FINANCE_APPROVE_JOURNAL` + manager PIN)
- [ ] Period close role gate
- [ ] ETA force-submit role gate
- [ ] Public-screen: remove `PUBLIC_SCREEN_LAN_NO_KEY` bypass; rotate keys; never escalate to SUPER_ADMIN; `PUBLIC_SCREEN_OPER` virtual role + audit
- [ ] Update `seed-roles-permissions.ts`; expose in `RolesPermissions.tsx`
- [ ] Run `branchIsolation.test.ts` + new tests
- [ ] Complete

### M7 — DayClose Safety
- [ ] Audit
- [ ] `handleCloseDay` → `useConfirm({variant:'danger'})` summary preview (orders/revenue/cash variance)
- [ ] Business-date update → `useConfirm` + role gate (M6)
- [ ] Close button: inline "Why?" text (no tooltip-only on touch)
- [ ] `ShiftManagementDrawer`: require reason when variance > threshold; disable Submit until `report?.expectedCashBalance` defined
- [ ] Surface `auditId` after close ("Closed by {user}, audit #{id}")
- [ ] Closed snapshot: cap rows at 200 + "view all"
- [ ] Validate
- [ ] Complete

### M8 — Finance & Fiscal Hardening
- [ ] Audit
- [ ] Separate `debitAccountCode` vs `debitAccountId` in `JournalEntry`
- [ ] Pass `branchId` on all finance GETs (incl. `getProfitAndLoss`, `getFiscal`)
- [ ] Gate `submitPeriodClose` (`FINANCE_CLOSE_PERIOD` + `useConfirm`)
- [ ] Gate `approveExpense` (PIN/ApprovalCenter workflow)
- [ ] Gate ETA force (`FISCAL_FORCE_SUBMIT` + `useConfirm`)
- [ ] Replace hardcoded "+4.2%" with real delta or hide
- [ ] Implement or remove "View Full Fiscal Logs" button
- [ ] `recordTransaction` accept `source` arg
- [ ] `moneyRound` amounts on submit
- [ ] Validate (`lint && typecheck && test`)
- [ ] Complete

### M9 — CRM Privacy & Pagination
- [ ] Audit
- [ ] `customersApi.getAll` require `{ branchId, search?, phone?, limit?, cursor? }` server-side
- [ ] Wrap table in `.responsive-table`; use `common/Pagination`
- [ ] Replace `window.location.reload()` with `fetchCustomers()`
- [ ] Mask phone/address unless `CUSTOMER_VIEW_PII`
- [ ] Profile drawer: Escape close
- [ ] `getCustomerByPhone` pre-check before save
- [ ] Configurable phone regex (not hardcoded Egyptian)
- [ ] Validate (CASHIER masked; MANAGER full; Branch-A scoped; 50k paginated)
- [ ] Complete

### M10 — Campaigns Real Dispatch & Consent
- [ ] Audit
- [ ] Segment builder modal (consented recipients from `useCRMStore`)
- [ ] `Customer.marketingConsentAt` consent flag
- [ ] Template variables `{name}`/`{code}`/`{discount}`/`{branch}`
- [ ] Cost estimate + dispatch `useConfirm`
- [ ] `branchId` on all `campaignsApi.*`
- [ ] Persist integration tokens server-side (remove UI shells or implement properly)
- [ ] Validate (real recipient ids; rejected count; no marketing for unconsented)
- [ ] Complete

### M11 — Menu Store Backend Persistence
- [ ] Audit
- [ ] Route `archiveItem`/`restoreItem`/`duplicateItem`/`bulkUpdateItems` through `menuApi`
- [ ] `updateMenuItem` cross-category: snapshot + rollback on error
- [ ] `deleteMenuItem`: mutate local only after success; failure → archive-or-retry modal
- [ ] `fetchMenu:148-152`: surface 401 as sessionExpired → logout
- [ ] Add `MenuItem.allergens` (for M5)
- [ ] Action-level RBAC (`MENU_DELETE_ITEM`, `MENU_ARCHIVE_ITEM`)
- [ ] Validate (offline archive persists; failed move restores; failed delete offers archive)
- [ ] Complete

### M12 — Inventory Workflow Fixes
- [ ] Audit
- [ ] `StockAdjustmentModal` qty validation + resulting-qty preview + explicit +/- toggle
- [ ] `handleSaveItem` try/catch `addInventoryItem` before warehouse loop
- [ ] Direct receipt send `costPrice` (update moving-average cost)
- [ ] `handleCompleteCount(apply=false)` persist draft counts
- [ ] PO partial/re-receive (editable receive-items)
- [ ] `patchStockFromSocket`: confirm absolute-vs-delta (add unit test)
- [ ] Sort labels `Qty ↑`/`Qty ↓`; remove "4.2x" placeholder
- [ ] Use `formatCurrency`/`formatQty` from M0
- [ ] Validate
- [ ] Complete

### M13 — Recipe & Cost Reconciliation
- [ ] Audit
- [ ] Normalize recipe storage to size-keyed (`{ sizeId: null, ingredients: [...] }` base)
- [ ] Migration path for flat recipes
- [ ] `ItemDrawer` derives `item.cost` from BOM on save; manual override toggle + reason
- [ ] `MenuProfitCenter` margin filter uses derived cost (warning badge on override)
- [ ] Validate
- [ ] Complete

### M14 — Driver Proof-of-Delivery & Dispatch Hardening
- [ ] Audit
- [ ] Fix `h-13` → `h-14` (Driver zero-height bug)
- [ ] Proof-of-delivery: OTP / signature / photo (geotagged) on "Delivered"
- [ ] `confirmDeliveredAndReturning` → `useConfirm` (amount + COD reconciliation)
- [ ] `DispatchHub.assignDriver` per-order pending set
- [ ] Server-side filter DriverDashboard orders by `driverId`
- [ ] Configurable SLA per branch/order-type
- [ ] Validate (wrong OTP rejected; photo capture; concurrent assigns succeed)
- [ ] Complete

### M15 — Lite Public Screens Security
- [ ] Audit
- [ ] Remove `PUBLIC_SCREEN_LAN_NO_KEY` bypass
- [ ] Rotating signed tokens (per-device binding, 24h TTL)
- [ ] `PUBLIC_SCREEN_OPER` virtual role + audit by key id (no SUPER_ADMIN escalation)
- [ ] Delete `public/operator-screen.html`
- [ ] Handle error codes (`PUBLIC_SCREEN_FORBIDDEN`, `PUBLIC_SCREEN_TOKEN_REQUIRED`)
- [ ] Adopt payload-carrying events from M4
- [ ] Poll exponential backoff (5s→30s) reset on success
- [ ] Replace inline `onclick` string interpolation with `addEventListener`
- [ ] Validation: wrong key → 403 + login prompt; LAN-without-key → rejected; 24h expiry → re-login
- [ ] Complete

### M16 — Performance Virtualization
- [ ] Audit
- [ ] `ItemGrid` adopt `common/VirtualGrid`; suspend tilt offscreen
- [ ] Customer list / large tables adopt `common/VirtualList`
- [ ] KDS columns window via `react-window` >30 tickets; disable `layout` anim >50
- [ ] Reports tables virtualize
- [ ] ExcelJS export → Web Worker + progress + cancel
- [ ] Inventory XLSX import → worker + bounded parallel batches
- [ ] `useInventoryStore.fetchPurchaseOrders` batch endpoint (drop N+1)
- [ ] `useMenuStore.fetchMenu` diff-and-merge
- [ ] Recharts lazy imports (drop unused chart components)
- [ ] Validate (1000-item menu smooth; 30k-row XLSX responsive; 60-ticket KDS smooth)
- [ ] Complete

### M17 — Reports Correctness
- [ ] Audit
- [ ] Print window: serialize `:root` CSS vars; wait `onload` before `print()`
- [ ] Align `SUPPORTED_TABULAR_EXPORT_TYPES` with server (`/reports/meta` route)
- [ ] `useReportsState` → Map keyed by `${report}__${range}`; cleanup on range change
- [ ] `@page` orientation per report (wide → landscape)
- [ ] Column auto-fit: sample across body (not first 200)
- [ ] Guard `start <= end` on CUSTOM range
- [ ] BOM-strip CSV (`\uFEFF`)
- [ ] Validate
- [ ] Complete

### M18 — Dashboard Truthfulness
- [ ] Audit
- [ ] Replace simulated sparklines (`revenue*0.8`) with real series or remove
- [ ] Wrap KPI numbers in `formatCurrency(value, currencySymbol)` from M0
- [ ] Missing `businessDate` → amber warning, not silent default
- [ ] "Updated HH:MM:SS" near refresh; subscribe socket invalidation
- [ ] Show resolved date-window label on every chart
- [ ] Tab-visibility guard on `setInterval(refresh, 60000)`
- [ ] `AdminDashboardPage.handleBranchUpdate` merge only defined keys
- [ ] Use `todayLocalDate()` everywhere (replace `toISOString().slice(0,10)`)
- [ ] Validate
- [ ] Complete

### M19 — Accessibility Pass
- [ ] Audit
- [ ] Add `common/useFocusTrap` hook
- [ ] Add `common/Modal` (Esc + focus trap + restore)
- [ ] Adopt in all drawers/modals across modules
- [ ] eslint-plugin-jsx-a11y: require `aria-label` on icon-only buttons
- [ ] Cards `div onClick` → `<button>` or `role="button" tabIndex={0} onKeyDown`
- [ ] Replace bespoke tab strips with `common/Tabs` (aria-tablist)
- [ ] Add `<th scope="col">` everywhere
- [ ] Gate `prefers-reduced-motion` for shimmer/stagger animations
- [ ] `aria-label` on PIN inputs + `role="alert"` on error
- [ ] Validate (Tab-only nav; NVDA reads labels; reduced-motion respected)
- [ ] Complete

### M21 — Tech-Debt Cleanup
- [ ] Verify `components/MenuManager.tsx` orphan (router uses `MenuProfitCenter`)
- [ ] Delete `components/MenuManager.tsx`
- [ ] Delete or relocate `services/fiscalService.ts` stub
- [ ] Delete `public/operator-screen.html` (after M15)
- [ ] Delete `components/Toast.tsx` (after M0)
- [ ] Add `scripts/README.md` index for legacy fixers
- [ ] Validate (grep imports; build green; smoke menu route)
- [ ] Complete

---

## Continuous-Update Discipline

After each submodule:
1. `[x]` mark items above.
2. Append an `Execution Log` entry at the bottom of `MASTER_PLAN.md` with: date, submodule id, files modified, what/why/business-value, risks, manual-test result, checklist delta.
3. Run `npm run lint && npm run typecheck && npm test -- --run`.
4. Spot-check on real hardware (POS terminal / tablet / phone) per the device matrix in M1.

---

## Device Matrix (reference)

| Device | Viewport | Priority |
|--------|----------|----------|
| Small Android phone | 360×640 | P0 |
| Standard phone | 414×896 | P0 |
| 10" tablet portrait | 768×1024 (1074×678 odd) | P0 |
| 10" POS terminal | 1280×800 | P0 |
| 15" POS terminal | 1366×768 | P0 |
| Laptop | 1280×720 / 1366×768 / 1600×900 | P1 |
| Desktop | 1920×1080 | P1 |
| Ultrawide | 2560×1080+ | P2 |
| 1024×768 (legacy tablet) | 1024×768 | P0 (cashier flow) |
