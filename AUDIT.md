# RestoFlow / CoduisZen — Phase 1 Project Audit

> Status: **COMPLETE**. This is a research-only audit. No code was modified.
> Method: Full codebase orientation → 4 parallel deep-audit agents (POS / Inventory+Menu / KDS+Kitchen / Dashboard+Reports+Finance+DayClose) + cross-cutting review of shared layer, theme engine, hooks, services.
> Severity legend: **HIGH** = data-loss / security / blocking workflow / brick on real hardware. **MED** = friction / perf / consistency. **LOW** = polish.

---

## 0. Architecture Summary

- **Stack**: React 18 + Vite + TypeScript + Tailwind v4 + Zustand + React Query + react-router 7 + framer-motion + recharts + Dexie (offline) + mssql/pg (server) + Drizzle ORM + Express 5 + Socket.io + BullMQ + Puppeteer (PDF) + ExcelJS + i18next (ar/en).
- **Theme engine**: 10 themes (`mica-glass`, `fluent-clean`, `material-soft`, `neumorphism-soft`, `flat-minimal`, `fintech-sharp`, `cupertino-light`, `monochrome-pro`, `warm-beige`, `dark-elegant`) → CSS variables + density tokens + component-variant tokens. Strong foundation.
- **Common component library** (`components/common/`): `EmptyState`, `Drawer`, `Tabs`, `Pagination`, `Card`, `StatCard`, `Skeleton`, `PageSkeleton`, `Spinner`, `Badge`, `StatusBadge`, `SectionHeader`, `ConfirmProvider` (`useConfirm`), `ToastProvider` (`useToast`) + legacy `Toast`, `ExportButton`, `VirtualList`, `VirtualGrid`, `Responsive`, `Tooltip`, `Toggle`, `Stepper`, `Timeline`, `Avatar`, `Divider`, `Tag`, `Kbd`, `ErrorBoundary`. **Exists but under-adopted** — most feature modules reimplement these.
- **Hooks** (`hooks/`): 27 hooks incl. `useMediaQuery`, `useWindowSize`, `useDebounce`, `useThrottle`, `usePOSCatalog`, `usePOSKeyboardShortcuts`, `useFetch`, `useSWR`, `useOnScreen`, `usePrevious`, `useForm`, `useScroll` etc. Solid — again under-used in feature modules.
- **Routing** (`routes.tsx`): 60+ lazy routes, each wrapped in `RequirePermission(permission) + ErrorBoundary + Suspense → PageSkeleton`. Good baseline.
- **Layout** (`MainLayout.tsx`):Fullscreen routes (POS/KDS/Pickup/Packing/CallCenter/Kiosk/Driver) hide sidebar + breadcrumbs; distraction-free mode for CASHIER/KITCHEN_STAFF/DRIVER; role-based default-page redirect; business-date staleness reminder. Reasonable.
- **Offline**: `db/localDb.ts` (Dexie) + `services/syncService.ts` + SWR-style stores. Offline cache for orders/customers/inventory/menu.
- **Realtime**: Socket.io with branch-scoped rooms; `useEffectEvent`-based patch handlers (good — no full-refetch on every event for orders, but KDS does full-refetch — see audit).
- **Permissions**: `RequirePermission` route guard on every route via `AppPermission`. **No action-level guards** inside pages for destructive actions — major gap.
- **Server**: branch isolation middleware (`enforceBranch` / `scopeBranchQuery`) — covered by `tests/branchIsolation.test.ts`; correctness depends on **client actually passing `branchId`** on each call (see cross-branch leakage findings).

---

## 1. UI Consistency Issues (cross-cutting)

| # | Issue | Where | Sev |
|---|-------|-------|-----|
| 1.1 | **Common primitives not adopted** — every feature module reimplements Tabs / Drawer / EmptyState / Card / Skeleton / Pagination | Finance, Reports, CampaignHub, ApprovalCenter, CRM, ShiftManagementDrawer, Inventory, Wastage, Intelligence, MenuProfitCenter | HIGH |
| 1.2 | **Two toast systems** — older `components/Toast.tsx` (direct import) and newer `common/ToastProvider.tsx` (`useToast`) coexist; appearance diverges | Dashboard / Finance / Expenses use old; ApprovalCenter / CampaignHub use new | MED |
| 1.3 | **~5 distinct radius scales** — `rounded-[3.5rem]`, `[2.5rem]`, `[2rem]`, `[1.5rem]`, `[1.75rem]` arbitrary values across Inventory.tsx | Inventory.tsx | MED |
| 1.4 | **Currency fallback inconsistency** — `'ج.م'` (Inventory), `'LE'` (Wastage/Intelligence), `'EGP'` (consumption export), `settings.currencySymbol || …` varies per module | Inventory, Wastage, InventoryIntelligence | HIGH |
| 1.5 | **Three loading idioms** — `PageSkeleton` (Inventory stock grid), bespoke `Loader2 + "Loading menu…"` full-screen (MenuProfitCenter), inline `Loading…` table rows (Wastage/Intelligence) | Menu, Inventory, Wastage, Intelligence | MED |
| 1.6 | **Four empty-state idioms** — Icon+title+buttons (Inventory), muted icon+label (RecipeManager), bespoke "Start building" block (MenuProfitCenter), plain `<td>` text (Wastage). `common/EmptyState` exists unused. | all modules | MED |
| 1.7 | **Three table-header styles** — `bg-elevated/30 text-[10px] tracking-widest` (Inventory) vs `bg-app/50 text-[9px] tracking-[0.2em]` (Wastage/Intelligence) vs unstyled `<th>` (CRM/Campaign/Fiscal) | multiple | MED |
| 1.8 | **Four metric-card idioms** — ornate gradient `StockMetric` (Inventory) vs minimal (Wastage) vs none (Intelligence) vs `border-l-8` accent (RecipeManager) vs `common/StatCard` (unused) | multiple | MED |
| 1.9 | **Modal sizing inconsistency** — `max-w-lg`/`xl`/`3xl`, some with `max-h-[90vh] overflow-y-auto`, some without → long content clipped on 768px-height viewports | Inventory modals (most lack `max-h`), Finance recon/close-period/reverse modals | MED |
| 1.10 | **Error surfacing inconsistency** — persistent banner (Inventory, Menu) vs transient toast only (Wastage, Intelligence, Fiscal) | multiple | MED |

---

## 2. UX Friction & Workflow Issues (per module)

### POS
- **POSCartSidebar:122-130** — Clear-cart and Close-cart buttons sit adjacent, identical 40×40 styling, **no confirm before clearing entire cart**. HIGH (data loss).
- **PaymentSummary:70-77** — `handleSubmitClick` swallows the first submit for cash+takeway to open the cash drawer (`return` after `setIsCashDrawerOpen(true)`). Cashier taps Pay → drawer opens, sale not completed, no indication. HIGH.
- **PaymentSummary:274-278** — Send-Kitchen button only renders for `DINE_IN`; takeaway/pickup/delivery cannot fire items to kitchen from this footer. MED (workflow gap).
- **RetailModePanel:41-49** — Window `click` listener force-refocuses search input unless target is INPUT/TEXTAREA. Steals focus from every other control → breaks cart interactions, modal opens. HIGH.
- **TableManagementModal:308, 259, 332** — Broken step router: "Next" is a no-op (`setMode(mode)`) when items selected but no target; merge always passes `[]` items (all-or-nothing hidden); the boolean at :332 collapses `targetTableId`/`!targetTableId` clauses so transfer-all enters the multi-step branch. HIGH.
- **ShiftOverlays** — Only opening overlay implemented; no close-shift UI in this component; **empty `openingBalance` parses to NaN yet disables submit-button condition `NaN<0` is false → button enabled → NaN sent to API**. HIGH (silent corruption).
- **CustomerSelectView:96-108, 344** — Search race (no AbortController); platform-delivery path requires only `externalOrderNumber`, customer name/phone/address optional → can complete order with no reachable customer. MED/HIGH.
- **ItemOptionsModal:90-121** — Open-price + size interaction silently loses custom price (`finalItem.price` overwritten by `selectedSize.price`). MED.
- **Order-wide discount** — Where cashier applies it is unclear from components (only `orderDiscountAmount` reaches `PaymentSummary` as display). Workflow discovery gap. MED.
- **Coupon** — `activeCoupon` is `string|null` only; no metadata (amount/type) displayed; no validation feedback beyond enabling Remove. MED.
- **Refund/Void** — Only `onVoid` link visible; no Refund/Void modal in the 22 component files. Workflow gap. MED.

### Inventory / Menu / Recipes
- **StockAdjustmentModal:25-35** — No quantity validation; negative/zero quantities pass straight through (sign convention unclear). HIGH.
- **Inventory:1166-1168** — Sort labels `qty-asc` and `qty-desc` both render `'Qty ?'` — indistinguishable. HIGH (usability).
- **Inventory:1782** — Turnover Ratio hardcoded `"4.2x"` placeholder shown to users. HIGH (misleading).
- **Inventory:453-470** direct receipt — `costPrice` collected then dropped; only quantity sent to backend → inventory valuation never reflects purchase cost. HIGH (financial correctness).
- **Inventory:1572-1604** PO receive — passes `[]` items to `receivePurchaseOrderInDB`; no partial/re-receive path possible from UI. MED.
- **Inventory.tsx handleSaveItem:348-355** — If `addInventoryItem` for a new item throws, the for-loop still runs `updateStock` for each warehouse row (mutating stock for an item that wasn't created). HIGH.
- **Inventory.tsx handleCompleteCount(true) (apply=false)** — `apply=false` path just `setCountSession(null)` and **does not persist draft counts**, unlike `InventoryIntelligence.tsx:98-107` which does. HIGH (counted data lost).
- **RecipeManager:122-147** — Flat vs size-keyed recipe format can silently overwrite prior recipe (`updateMenuItem` sends `item.recipe || []`). HIGH.
- **MenuProfitCenter cost vs BOM** — `MenuItem.cost` is **manually set in ItemDrawer**, not auto-derived from BOM; menu margin display can disagree with `RecipeManager` computed `totalCost`. HIGH.
- **WastageManager:224-273** — Record modal has no `required`; validation only in `handleRecord` (toast). Quantity input `min=1` doesn't prevent decimal/0 typing. MED.
- **WastageManager:51-55** — Entries held in local `useState`; no socket subscription or polling → stale on concurrent wastage entries. HIGH.

### Kitchen / KDS / Pickup / Packing
- **orderController:1300-1306** — DINE_IN orders **never auto-dispatched to KDS**; manual Send required. If cashier forgets, kitchen never sees the ticket. HIGH.
- **KDS:392-396, 1450-1454** — Bump requires **two taps within 1.5s**; missed double-tap silently resets. No visible countdown. HIGH (kitchen miss).
- **KDS:433-437** `completeKitchenOrder` — Calls `updateOrderStatus(ticketId)` **twice in succession** in one click → single-tap advances two statuses (PREPARING→READY→SERVED), bypassing the READY card view. HIGH (workflow bug).
- **kdsController:527-529** `handoverOrder` — Force-overwrites ALL order tickets to `DELIVERED` regardless of station readiness; GRILL still cooking → silently marked done. HIGH.
- **KDS:296-299** — `playNewOrderSound` fires on **every** `kds:update` (including bump/recall/handover/toggle), not just new tickets → kitchen chimes on every chef action. HIGH (auditory confusion).
- **kdsController:392** — Socket emits `kds:update` with **no payload**; server emits same event for create/bump/recall/toggle/handover; client can't distinguish → forces full GET refetch on every emit. HIGH (perf + sound spam).
- **KDS:32-51** — No `ctx.resume()` user-gesture unlock; browsers suspend AudioContext until gesture → first few tickets silent. HIGH.
- **KDS:374-378** — Urgent beep re-fires **every 5s** while any ticket ≥20 min → alarm fatigue. HIGH.
- **KDS:256** — Sound config only ALL/OFF binary; **not persisted** to localStorage; resets on reload. MED.
- **KDS:347-355** — Stale tickets (>24h) silently dropped without trace/audit; chef thinks the order is missing. MED.
- **KDS:357** — Rush/Remake tickets stay in chronological sort (don't bubble to top). MED.
- **KDS:19-26 vs kdsController:304-317** — Two parallel divergent station taxonomies: client keyword map vs server printer-role map. Stations in filter ribbon may have no tickets because server routes by printer.role/code. HIGH.
- **KDS:1335-1404** — Allergens invisible to kitchen staff (no field on `KdsItem`, no badge on ticket, not on `kitchenTicketTemplate`). HIGH (regulatory).
- **KDS:259, 391-419** — Single-slot `pendingBump` `useState<string|null>` — bump on order A then B within 1.5s silently replaces A's pending state, dropping A's bump. MED.
- **PackingScreen:447** — `readyOrders.slice(0, 12)` and `preparingOrders.slice(0, 8)` — a 13th ready order is **silently off-screen**, customer never called; no "more" indicator. HIGH.
- **PackingScreen:383** — `fetchOrders({ limit: 120 })` — if >120 active orders, older ones silently missing. MED.
- **DispatchHub:431-448, DriverDashboard:152-162,372** — No proof-of-delivery (no OTP, signature, photo, or geofence) before marking DELIVERED; one tap on "تم التوصيل والتحصيل" → DELIVERED. HIGH (fraud risk). Same in DriverDashboard — which also uses `h-13` (an **invalid Tailwind class** → primary action buttons render with **zero height**). HIGH.
- **kdsController recallTicket:474-479** — Rolls order to PREPARING only if status in `[READY, SERVED]`; no rollback from OUT_FOR_DELIVERY. MED.

### Dashboard / Reports / Finance / DayClose / Fiscal
- **Dashboard:474,487** — `trendData={payload.trendData.map(d => d.revenue * 0.8)}` and `d.revenue * 0.2 + 20` — **sparkline data is simulated**, not real. HIGH (misleading).
- **Dashboard:184-185** — `activeBusinessDate = activeBranch?.businessDate || formatLocalDate()` — if `businessDate` missing, silently defaults to today and `isStaleBusinessDate = false`. HIGH (silent).
- **Dashboard:426** — Number formatting ignores currency precision: `revenue.toLocaleString()` (browser default) vs `avgTicket.toFixed(2)` — inconsistent across 6 KPI cards. HIGH.
- **Reports:332-425** `exportXlsx` — ExcelJS row build loops synchronously on UI thread; banner has no spinner/cancel → multi-thousand-row exports freeze UI for seconds. HIGH (perf).
- **Reports:200-241** `openPrintableReport` — Copies all `<style>` and `<link>` from SPA but CSS variables (`--color-main` etc.) resolve to `initial` in print window; Tailwind classes that depend on them render broken. HIGH.
- **Reports:240** — `setTimeout(() => printWindow.print(), 400)` race on slow networks. MED.
- **useReportsState:142-296** — ~90 separate `useState` slots kept alive forever; switching range resets the `loadedReports.current` set but never clears the state slots → stale data persists. HIGH (memory + correctness).
- **reportConstants:158-174** — `SUPPORTED_TABULAR_EXPORT_TYPES` lists only 14 of 88 catalog reports → operators see "CSV unavailable" for ~74 reports even when server supports them. HIGH (capability gap).
- **Reports:676-693** — No virtualization; report views render a `<tr>` per row in DOM; `STOCK_MOVEMENTS` over a quarter = 30k+ rows. HIGH (perf).
- **useFinanceStore:93-99** — `fetchFinanceData` makes **no branch-scoped calls** (accounts, journal, reconciliations, periods, exceptions, posting rules all global). HIGH (cross-branch leakage; depends on JWT fallback only).
- **useFinanceStore:121-130** — Sets `debitAccountId: j.debitAccountCode` (camelCase semantics corrupted: ID fields hold codes). MED.
- **Finance:202, 211-212** — `reportsApi.getProfitAndLoss` and `financeApi.getJournal(200)` no `branchId` → P&L/journal aggregated across branches. MED (correctness).
- **Finance:294-307** `submitPeriodClose` — Guarded only by `closeConfirmText !== 'CLOSE'`; **no `useConfirm()` and no role check**; irreversible period lock. HIGH (safety).
- **ShiftManagementDrawer:55-77** — No confirmation before irreversible cash-reconciliation close; falls back to `openingBalance` while X-report loading → wrong variance calculated before report arrives. HIGH.
- **Expenses:180-210** — No duplicate-entry prevention; `EXP-${Date.now()}` ref guarantees uniqueness but double-click submit creates 2 entries before `setIsSaving(true)` flushes. MED.
- **Expenses:237-249** `approveExpense` — Direct call to `financeApi.approveJournal` with **no PIN / no permission gate**; any user with Expenses access can approve their own entries, bypassing `ApprovalCenter` and the manager-PIN flow. HIGH (financial integrity).
- **Expenses:138-147** — `pendingTotal`/`postedTotal` sum over `recentExpenses` (search-filtered subset) → KPI "Pending approval" can drop to $0 by typing a search. MED.
- **DayCloseHub:258-303** `handleCloseDay` — Server returns idempotency codes; **but no client-side `useConfirm()` dialog before the irreversible POST**, no summary-preview modal. HIGH (safety).
- **DayCloseHub:513-520** — `disabled` close button shows **no inline "why?" text** explaining pending checks (tooltip-only, invisible on touch). HIGH.
- **DayCloseHub:305-337** `handleUpdateBusinessDate` — Raw `window.confirm()` (not `useConfirm()`), **no role check**; anyone with the hub open can advance business date. MED.
- **DayCloseHub:317-322** — Server-returned `businessDate` ignored; client trusts local `manualBusinessDate`. LOW.
- **DayCloseHub:760-822** — Closed snapshot renders `closedSnapshot.inventory.movements` and `orders.byStatus` as raw lists with no cap; a day with 5,000 stock movements injects 5,000 `<div>` rows. MED (perf).
- **DayCloseHub** — No call to `auditApi` / `useAuditStore.addLog` on success; audit id not surfaced to operator. MED.
- **FiscalHub:99-120** `handleSubmitETA` **force** — Force-submit ETA button has **no confirmation and no role check**; bad/duplicate submissions create legal exposure. HIGH (compliance).
- **FiscalHub / reportsApi.getFiscal:18** — **No `branchId` param at all** on `getFiscal`; VAT/E-invoice numbers aggregated across all branches. HIGH (worst branch-leak in fiscal area).
- **FiscalHub:217-222** — `"+4.2% from last month"` is a **hardcoded cosmetic string** on an audited financial screen. HIGH (misleading).
- **FiscalHub:394** — "View Full Fiscal Logs" button does nothing (`className` only, no `onClick`). MED.
- **CampaignHub:111-132** `dispatchCampaign` — Sends only the **single** `settings.phone` fallback number; cannot dispatch to real customer segments; "BLAST"/"VERIFYING" labels misleading. HIGH.
- **CampaignHub:111-132** — No consent screen; no per-recipient opt-out check; **illegal under Egyptian Personal Data Protection Law 2024** for unsolicited marketing SMS/WhatsApp. HIGH (legal).
- **CampaignHub:111-124** — Message is a literal `${campaign.name} - ${campaign.discount}`; **no template-variable system**. HIGH.
- **CampaignHub:386, 405, 361** — Facebook/TikTok tokens + WhatsApp number held in plain React state and on click only flip local flags (`waConnected`); **never POSTed/persisted**; integration panels are UI shells. HIGH.
- **services/api/campaigns.ts** — No `branchId` param on any call → campaigns implicitly global. HIGH.
- **CRM:42-50, customersApi.getAll** — `getAll` takes `{ search, phone }` only, **no branch scoping**; every branch sees the entire customer DB + PII. HIGH (privacy).
- **CRM:221** — `onClick={() => window.location.reload()}` — full SPA reload. **HIGH (UX regression)**.
- **CRM:62-68** `filteredCustomers` — Client-side filter over full customer list (no limit) for 50k+ customers → jank. MED.
- **CRM:334-453** — Profile drawer has no Escape handler. LOW.
- **CRM:288-291** — Phone numbers/addresses shown in plain table; no masking for users without `DATA_VIEW_CUSTOMER_PII`. HIGH (PII access).
- **ApprovalCenter:108-122** — Rejection reason optional; empty reasons defeat the audit trail. MED.
- **ApprovalCenter:260-275** — PIN modal has no Escape handler / no focus trap (only `autoFocus`); Tab order escapes. LOW.

---

## 3. Responsive Issues (cross-cutting)

| # | Issue | Where | Sev |
|---|-------|-------|-----|
| 3.1 | **Touch targets systematically under 44px** | POS toolbar (`h-7`=28), header context-close `X` (`w-4 h-4`=16), CartItem steppers (`w-8 h-8`=32), PaymentSummary numpad (`h-10`=40), quick-cash (`h-8`=32), ListCard steppers (`w-7 h-7`=28), KDS bump (`minHeight:34`), item chips (`28×28`), column action (`padding:6px 12px` ~24px) | HIGH |
| 3.2 | **Tables without `overflow-x-auto` wrapper** — CRM customer table, CampaignHub campaign table, FiscalHub logs table — overflow horizontally on phones/tablets with no scroll container | CRM:255-330, CampaignHub:488-566, FiscalHub:328-367 | HIGH |
| 3.3 | **Tables with fixed `min-width`** — Inventory consumption `min-w-[1180px] table-fixed`, branch transfers `min-w-[600px]` → horizontal scroll on tablets, columns may clip below 1180 | Inventory.tsx:1088-1100, :1652 | MED |
| 3.4 | **5-column payment-method grid** `grid-cols-5` on 360px phone → ~60px columns, labels truncate ("VODAFO…", "INSTAP…") | PaymentSummary:150 | HIGH |
| 3.5 | **Quick-cash grid** hardcoded `[50,100,200,500]` not localized to currency or denominations | PaymentSummary:224 | MED |
| 3.6 | **Double scrollbar conflict** — Inventory root `max-h-screen overflow-y-auto pb-32` fights with the app shell's own scroll | Inventory.tsx:1700 | MED |
| 3.7 | **PickupScreen** `<main className="flex-1 flex p-6 gap-6">` (row by default); preparing sidebar `w-[400px] shrink-0` leaves only ~350px for ready list on a 768px tablet | PickupScreen:451, :541 | MED |
| 3.8 | **`h-13` invalid Tailwind class** → primary driver action buttons render with **zero height** | DriverDashboard:368, 372 | HIGH |
| 3.9 | **Reports filter panel min-width** `xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)]` — on 1280px viewport report panel squeezes to ~500px for 7-column tables | Reports.tsx:454 | LOW |
| 3.10 | **Modals with no `max-h-[90vh] overflow-y-auto`** — Inventory modals, Finance recon/close-period/reverse — long content clipped on 768px-height viewports | multiple | MED |
| 3.11 | **POSToolbar** `overflow-x-auto no-scrollbar` — on 360-414px the toolbar itself scrolls horizontally with invisible scrollbar→ touch affordance missing | POSToolbar:48 | HIGH |
| 3.12 | **ItemGrid no virtualization** — 200-item menu = 200 simultaneously-mounted tilt-enabled `MenuItemCard`s; auto-fill `minmax(184px,1fr)` | ItemGrid.tsx; MenuItemCard.tsx:61-89 | HIGH (perf) |
| 3.13 | **KDS Kaanban** `AnimatePresence mode="sync"` per ticket with `layout` — Friday-night rush 60+ active tickets jank-prone | KDS.tsx:1147-1162 | MED (perf) |
| 3.14 | **`text-[9px]`-`text-[10px]` everywhere** — on KDS TV at 3m view distance <14px is unreadable | KDS.tsx:647, 843-844, 1105, 1122, 1183 | HIGH |

---

## 4. Performance Issues (cross-cutting)

| # | Issue | Where | Sev |
|---|-------|-------|-----|
| 4.1 | **No virtualization** in large lists: ItemGrid (menu), CustomerSelectView, KDS columns, Reports view tables, Finance journal cards, DayClose snapshot, Closed-day history buttons | multiple | HIGH |
| 4.2 | **Full GET refetch on every `kds:update`** socket event; no `patchTicketStatus`/`addTicketFromSocket` actions in `useKdsStore` (unlike `useOrderStore`) | KDS.tsx:293-306; useKdsStore.ts | HIGH |
| 4.3 | **ExcelJS synchronous** row build on UI thread for XLSX export; no chunking, no worker, no cancel | Reports.tsx:332-425 | HIGH |
| 4.4 | **XLSX parse + per-row await** sequential — 1000-row sheet freezes UI; `inventoryExcelRows.ts` throws on any single bad row, halting entire import | Inventory.tsx:385-410; inventoryExcelRows.ts:35-37 | HIGH |
| 4.5 | **N+1 PO fetch** — `Promise.allSettled(data.map(po => purchaseOrdersApi.getById(po.id)))` issues one HTTP per PO | useInventoryStore.fetchPurchaseOrders:183 | HIGH |
| 4.6 | **`use3DTilt` pointer listener per card** — `onPointerMove` writing CSS vars on every move × dozens of cards | MenuItemCard.tsx:61-89 | HIGH |
| 4.7 | **Recharts eager imports** — Dashboard imports `BarChart, Bar, LineChart, Line, RadarChart, Radar, PieChart, Pie, AreaChart` even when only `AreaChart, PieChart` used; CrmReports imports all 16 chart components per report load | Dashboard.tsx:5-5; CrmReports.tsx:2-4 | MED |
| 4.8 | **Container-Query antipattern**: new object/array literals passed as props break `React.memo` — `value={revenue.toLocaleString()}` in MetricCard; tip presets `[0,sub*0.05,…]` re-allocated each render with key collisions when subtotal=0 | Dashboard.tsx; PaymentSummary.tsx:166 | MED |
| 4.9 | **AnimatePresence + motion.div w/ layout** on cart rows, packing cards, campaign rows — reconciliation jank on 50+ items | POSCartSidebar.tsx:198-208; KDS; CampaignHub | MED |
| 4.10 | **Polling without backoff** — kdslite.html naive 5s `setInterval(load, 5000)`, no exponential backoff on outage → server hammered; multiple screens compound | kdslite.html:320 | MED |
| 4.11 | **`AdminDashboardPage.setInterval(refresh, 60000)` runs even when tab hidden** | AdminDashboardPage.tsx:77 | LOW |
| 4.12 | **`useMenuStore.fetchMenu`** clears `localDb.menuCategories` + `menuItems` then bulkPut everything on every full fetch — heavy for menus with thousands of items | useMenuStore.ts:84-127 | MED |
| 4.13 | **`Inventory.tsx` AI Forecast button** keeps `aiForecasts` unbounded state keyed by `itemId` — never cleared → memory growth | Inventory.tsx:1302-1324 | LOW |

---

## 5. Duplicate Components & Repeated Logic

| # | What | Where | Action |
|---|------|-------|--------|
| 5.1 | **Bespoke Tabs** reimplemented in 6+ modules | Finance.tsx:451-461, Reports.tsx:543-567, CampaignHub.tsx:322-342, ApprovalCenter.tsx:201-207, Inventory.tsx:1786-1806, WastageManager.tsx:147-157, InventoryIntelligence.tsx:150-157 | Replace with `common/Tabs` |
| 5.2 | **Bespoke Drawer / side-sheet** reimplemented in 3+ modules | CRM.tsx:334-345, ApprovalCenter.tsx:306-308, ShiftManagementDrawer.tsx:100-107, DayCloseHub snapshot section, ItemDrawer.tsx (uses `createPortal`) | Replace with `common/Drawer` |
| 5.3 | **Bespoke EmptyState** in every module | all modules | Replace with `common/EmptyState` |
| 5.4 | **Bespoke Skeleton / Loader** — 3 idioms | Menu, Inventory, Wastage, Intelligence, Finance, Reports | Standardize on `PageSkeleton`/`Skeleton` |
| 5.5 | **Currency formatting** — `toLocaleString()`, `.toFixed(2)`, hardcoded currency strings; no shared `formatCurrency(n, currency?)` | all finance/POS/inventory/CRM | Add `utils/formatters.ts` → `formatCurrency` |
| 5.6 | **Date formatting** — `toISOString().slice(0,10)` used inconsistently; some local, some UTC → TZ bugs in Finance.tsx:172, Expenses.tsx:43-48, Reports.tsx:270-280, useReportsState.ts:42-44 | multiple | Add `utils/formatters.ts` → `todayLocalDate`, `formatLocalDate`, shared |
| 5.7 | **Barcode generation** — `barcodeApi.generate()` called from both `ItemModal.tsx` and `ItemDrawer.tsx` | components/menu/ItemModal and components/menu/ItemDrawer | Extract `useBarcode` hook |
| 5.8 | **Tailwind-style metric card** reimplemented in 4 idioms | Inventory, Wastage, RecipeManager, Dashboard (unused `common/StatCard`) | Standardize on `common/StatCard`/`common/Card` |
| 5.9 | **Window click force-focus** antipattern (only in RetailModePanel, but pattern often copied) | RetailModePanel.tsx:41-49 | Remove entirely |
| 5.10 | **`window.confirm()`** raw usage (DayClose, Finance close-period uses raw `closeConfirmText`, Fiscal uses raw `window.confirm`) | DayCloseHub:305-337, FiscalHub | Replace with `useConfirm({ variant:'danger' })` |

---

## 6. Missing Loading / Empty / Error States

- Missing loading states: KDS board while `fetchOrders` in flight (no per-card shimmer); PickupScreen/PackingScreen during reconnect; DayClose readiness recompute; Finance background refetch (no shimmer).
- Missing empty states: HeldOrdersModal when empty; Saved/Cleared table drafts; WastageManager on first load (inline text only); RecipeManager "no ingredient" muted icon only.
- Missing error states: `useMenuStore.fetchMenu:148-152` silently returns on 401 (blank menu, no toast); `useOrderStore.fetchOrders:245-247` silently catches 401 (orders array empties with no re-login flag); FiscalHub ETA no-order-for-submission (only indigo status, no banner); CampaignHub integration failures (no error surfacing at all — UI shells).
- Missing "why disabled?" affordance: DayClose close button (tooltip-only, invisible on touch); ShiftOverlays opening-balance button (NaN accepts), FiscalHub force button (no tooltip).
- Stale-data indicator missing: Dashboard "LIVE" badge but KPIs can be 5 min stale; KDS silent stale board on socket disconnect (no "RECONNECTING" red badge).

---

## 7. Accessibility Issues (cross-cutting)

- **No focus traps** in 9+ modals: `ItemOptionsModal`, `SplitBillModal`, `ManagerApprovalModal`, `TableManagementModal`, `HeldOrdersModal`, `TakeawayNameModal`, `NoteModal`, `SeatModal`, `CourseModal`, all Inventory modals (except `ItemDrawer`), `ApprovalCenter` PIN modal. Background content remains Tab-reachable behind modal.
- **No Escape close** in most modals (only `SeatModal`, `CartItem` qty-edit, `ItemDrawer` handle Esc).
- **`aria-label` sparse** for icon-only buttons: POSHeader clear-X, PaymentSummary method buttons, KDS Settings/Fullscreen (`title=` only), Search `X` clear button.
- **Cards as `<div onClick>` not `<button>`** — not keyboard activatable; no `role="button"`/`tabIndex`/`onKeyDown`: MIANUItemCard, KDS toggle chips, TableManagementModal item rows.
- **`aria-pressed`/`aria-current`/`role="tab"`** missing on Tabs everywhere (bespoke tab strips lack ARIA tablist semantics).
- **`<th scope="col">`/`aria-sort`** missing on all audited tables.
- **Color-only state distinction**: KDS risk=red and critical=red collapse distinction; PaymentSummary change/short border color only.
- **`prefers-reduced-motion` partial**: `pos-responsive.css` honors it (good); `CRM.tsx:13,535` shimmer button animation not gated; `PackingScreen`/`CampaignHub` staggered rows not gated.

---

## 8. Touch Usability Issues

See §3.1 for touch-target summary. Other touch concerns:
- **No `touch-action: manipulation`** on stepper buttons → risk of double-tap zoom.
- **No `user-select: none`** on long-press areas; text selection on press-hold.
- **Backdrop-tap-on-scroll closes modal losing draft** — `ItemOptionsModal`, `NoteModal`, `SeatModal` backdrop `onClick={onClose}` (consider gating).
- **Hover-only image zoom** on `MenuItemCard` (`group-hover:scale-110`) irrelevant on touch.
- **POSToolbar** horizontal-scroll with `no-scrollbar` (invisible) — touch affordance missing.
- **Stale-design assumption**: chrome (mode toggle, sound, fullscreen, settings) on KDS header wraps to 3 rows on 768px tablet, eating vertical space.

---

## 9. Maintainability Issues

- **`packages-lock.json` churn**, single-package monorepo with multiple sub-bundles (hardware-bridge, React app, public lite HTML); divergence risk high (KDS feature changes need replicating in kdslite.html).
- **`MenuManager.tsx` 1414 lines** — legacy menu manager not wired into router (router uses `MenuProfitCenter`); orphan code. Remove or document.
- **`POS.tsx` ~1100+ lines** — orchestrator holds 30+ prop callbacks; `POSCartSidebar` alone takes 50+ props, `PaymentSummary` ~25. State coupling excessive.
- **`Inventory.tsx` 1884 lines** — eight-tab hub in one file with bespoke KPI/strip/grid subcomponents; should be split per tab.
- **`useReportsState.ts` 90 useState slots** — single hook managing 88 reports' state; refactor to a Map or route-scoped query.
- **`ItemDrawer.tsx` 970 lines** — multi-tab editor with body-scroll lock; complex enough to deserve a feature folder.
- **Stale `fiscalService.ts`** — legacy client signing stub throws `LEGACY_FISCAL_CLIENT_DISABLED`; remove or move to `/legacy`.
- **Stale `operator-screen.html`** — older duplicate of kdslite.html flow; no localStorage key persistence, no error-code handling. Remove.
- **Modular but under-leveraged**: `common/` and `hooks/` directories exist with strong utilities but feature modules bypass them. Lowest-cost improvement with highest cross-cutting value: enforce adoption.

---

## 10. Branch Isolation & Security Summary (HIGH aggregate)

The `branchIsolation.test.ts` confirms server middleware enforces `branch_id` when present. **But many clients never pass it**, so multi-tenant correctness depends on JWT-branch fallback (safe for non-super-admin; **unsafe for SUPER_ADMIN with empty JWT branch**):

- ❌ `financeApi.getAccounts/getJournal/getReconciliations/getPeriodCloses/getExceptions/getTrialBalance` — no branchId.
- ❌ `reportsApi.getProfitAndLoss`, `reportsApi.getFiscal` — no branchId.
- ❌ `customersApi.getAll` — no branchId (PII cross-branch).
- ❌ `campaignsApi.*` — no branchId (implicitly global).
- ✅ `approvalApi.getAll(branchId?)` — optional; ApprovalCenter passes it (good).
- ⚠️ **Public-screen auth**: `PUBLIC_SCREEN_LAN_NO_KEY=true` bypasses key on LAN — any device on restaurant Wi-Fi (incl. guest VLAN if not segmented) can bump/handover. Public-screen code path **escalates to `SUPER_ADMIN` and `skipPolicy:true`** with no real-user audit. **Leaked screen key gives full order-status mutation.**
- ⚠️ `kdslite.html:117-124` persists key in localStorage; once persisted, reused across any future visit — anyone with URL drives the kitchen.
- ⚠️ `useOrderStore.updateOrderStatus:421` idempotencyKey = `${orderId}:${status}:${Date.now()}` — `Date.now()` makes every retry a new key → **idempotency defeated**, completion receipt can fire twice.
- ⚠️ `kdsController.dispatchToKitchen:225-228` default path causes **both server-side AND client-side kitchen printing** unless caller explicitly passes `clientHandlesPrinting:true`. Verify default callers.
- ⚠️ No action-level permission gating on: expense approval, finance period close/reversal, fiscal force-submit, day-close, business-date update, menu item delete/archive.

---

# TOP CRITICAL FIXES (priority order)

1. **Cashier data-loss**: clear-cart adjacent to close-cart + no confirm (POSCartSidebar:122); silent two-tap Pay for cash takeaway (PaymentSummary:70-77).
2. **Kitchen sound/orchestration**: emit payload-carrying `kds:new-ticket`/`kds:bumped`/etc. (split events); add `useKdsStore.patchTicket…` actions; persist `soundMode`; add AudioContext user-gesture unlock; throttle urgent beep.
3. **KDS workflow bugs**: double-bump in `completeKitchenOrder` (KDS:433-437); handover force-marks all tickets DELIVERED (kdsController:527-529); bump two-tap window 1.5→3s + visual progress ring.
4. **Cross-branch leakage**: add `branchId` to all finance/reports/customer/campaign GETs; remove `PUBLIC_SCREEN_LAN_NO_KEY` bypass; rotate public-screen keys; never escalate to `SUPER_ADMIN`.
5. **Touch targets** ≤44px everywhere (toolbar `h-7`, header `w-4 h-4`, numpad `h-10`, ListCard `w-7 h-7`, KDS bump `minHeight:34`); fix `h-13` Tailwind bug in DriverDashboard.
6. **Tables overflow**: add `overflow-x-auto`/`responsive-table` wrapper to CRM, CampaignHub, FiscalHub tables.
7. **DayClose safety**: insert `useConfirm({variant:'danger'})` summary-preview before close; close-shift confirmation with variance reason; period-close role check + `useConfirm`; ETA force-submit role check + `useConfirm`.
8. **Permission gating**: gate expense approval (`FINANCE_APPROVE_JOURNAL`), period close (`FINANCE_CLOSE_PERIOD`), ETA force-submit (`FISCAL_FORCE_SUBMIT`), business-date update (`OP_CLOSE_DAY`/manager), destructive menu actions.
9. **Receipt cost lost**: direct-receipt path must send `costPrice` to backend; compute `MenuItem.cost` from BOM at save; standardize currency fallback to `settings.currencySymbol`.
10. **`useMenuStore` data-loss cluster**: `archiveItem`/`restoreItem`/`duplicateItem`/`bulkUpdateItems` are **local-only mutations never reaching backend** → data lost on next fetch. `updateMenuItem:429-446` has no rollback on error.
11. **Idempotency**: drop `Date.now()` from `updateOrderStatus:421` key.
12. **Performance**: virtualize ItemGrid, customer list, KDS columns, reports tables, finance journal; move ExcelJS build to worker/batch; N+1 PO fix.
13. **Allergens on KDS** (regulatory) + station routing single-source (server-derived, drop client keyword guessing).
14. **Proof-of-delivery** before DELIVERED (OTP/photo); confirm prompt on DriverDashboard deliver.
15. **Confirm adoption**: enforce `common/Tabs`, `common/Drawer`, `common/EmptyState`, `common/Pagination`, `common/StatCard`, `useConfirm`, `useToast` across all modules. Single-currency formatter + local-date formatter in `utils/formatters.ts`.
