# CoduisZen Fix Checklist — Audit Remediation Tracker

Status legend: `[x]` done · `[ ]` pending. Work part by part, check off as we go.

## Part A — Critical 10 (immediate priority)

- [x] A1. Split-close inventing money — validate split sum vs table total BEFORE closing any round (POS.tsx).
- [ ] A2. Missing permissions across all inventory pages (menu/recipes/stock/suppliers/procurement/warehouses/counts/movements/production/butchery/wastage).
- [ ] A3. Recipe costing without unit conversion (g/kg/ml/piece) — RecipeManager.
- [ ] A4. No expiry/batch tracking (entry UI + reports feed) — food-safety gap.
- [ ] A5. One-click branch stock zeroing + unapproved count finalization (StockItems/Counts).
- [x] A6. WhatsApp OTP false success — report real send result (deliveryController pickupOrder) + pilot warning toast.
- [x] A7. Unauthenticated complaints endpoints — role gates on GET/POST (marketingRoutes).
- [x] A8. Treasury transfer validation — client fail-fast (same/<=0/over-balance) + approve confirm; server already authoritative.
- [x] A9. Offboarding never deactivates login — "terminate access" action wired to server soft-delete (employee + login + open attendance).
- [x] A10. Payroll gross ignores allowances/bonuses — prefer server grossPay, fallback sums all earning parts.

## Part B — Sales (POS / tables / kitchen / orders)

- [x] B0. Multi-round table aggregation (temp bill, close-out, modal, transfer/split/merge, locked cart history, KDS fallback).
- [x] B1. KDS multi-station filter broken + "complete all" scope + polling interval leak — fetch-all + set filter, MULTI-row match, honest confirm text.
- [x] B2. Pickup: delivery READY handover + endless announcement loop — dispatch button + no-refill queue.
- [x] B3. OrdersCenter: void on DELIVERED/COMPLETED rerouted to refund flow (revenue rule kept — intentional server mirror).
- [x] B4. RefundManager: partial-amount requests, approve/process confirms + permission gate, totals exclude REJECTED.
- [x] B5. SplitBillModal: non-negative amounts, no zero-line clutter, close-time exact-match guard (per-item split = phase-2 feature).
- [x] B6. Reservations: table picker + seats check + double-booking guard + phone validation (POS seating link = phase-2).
- [x] B7. TrackOrder: signed ?t= links (server HMAC), per-type steps, REFUNDED/VOID banner.
- [x] B8. Kiosk: no paymentMethod on unpaid counter orders + server-matching service charge.
- [x] B9. TableMap: stale-occupancy heal to AVAILABLE + belt keyed on hasOrders (no $0 double-open).
- [x] B10. Temp-bill/round quotes include per-line item discounts (net math mirrors orderTotals).

## Part C — Call center & delivery

- [x] C1. CallCenter: zone-required (no invented fee), full-context hold/recall, free-delivery approval gate, PBX uses server matches (platform ingestion + loyalty redeem = phase-2).
- [x] C2. CallCenterManager: keep data on transient errors, full-pipeline driver stats, SCHEDULED aligned, full CSV.
- [x] C3. CRM: working handoff CTA, dormancy-based at-risk, id+phone history, canonical phones, duplicate guard.
- [x] C4. ZonesManager: server in-use guard + role-gated delete + deactivate guidance; global zones flag manual branch.
- [x] C5. DispatchHub: hub fail/return with manager PIN (server fallback), assignable-only tab count.
- [x] C6. DriversHub: road-load cycle guard, disabled toggle + re-enable, creation-only login fields, branch picker.
- [x] C7. DriverDashboard: exit returns orders first, pill reconciled post-deliver, dropped ops announced, live-position ETA.
- [x] C8. Platforms: API key persisted (masked reads) + delete-becomes-pause with re-activate.
- [x] C9. WhatsAppHub: audible failures, canonical phones, case-proof VIP, campaign blocked unless READY (retry UI needs server queue API = phase-2).
- [x] C10. MailHub: inbox delete (own copy) + CC broadcast role + throttled live toasts.
- [x] C11. ComplaintsInbox: strict flow (no OPEN skip), required resolution, verified identity, staff assignee.
- [x] C12. Delivery routes: dispatch/telemetry role gates (DRIVER excluded from roster/telemetry).

## Part D — Inventory & production

- [x] D1. MenuProfitCenter: menu auto-select, cost-preserving export/import with category mapping, manager-gated mutations (live cost sync rides on D2).
- [x] D2. RecipeManager: unit conversion engine (g/kg/ml/l/piece) + inconvertible flags + save guard + converted print/CSV.
- [x] D3. StockRequests: per-tab slices, shortfall-guarded accept, warehouse role gates, in-transit cancel, fresh stock snapshot.
- [x] D4. StockItems: verified no dual-post; orphaned/zero rows excluded from totals/SKUs (server weighted-avgs cost on receipt).
- [x] D5. Suppliers: validation + duplicate guard, suspended roster with re-enable, mandatory return supplier.
- [x] D6. Procurement: APPROVED can send, branch-only warehouse (no cross-branch fallback), prompted invoice tax/discount.
- [x] D7. Warehouses: on-hand display + fail-fast guards + activate/deactivate (in-transit workflow needs server states = phase-2).
- [x] D8. StockCounts: duplicate-session block, partial posting with confirm, min-one-line guard (server-enforced blind = phase-2).
- [x] D9. Movements: branch picker, split in/out money, real landscape PDF window, THEORETICAL explained.
- [x] D10. Production: controlled qty inputs, explicit warehouse required, card cancel via confirm modal (reservation = phase-2).
- [x] D11. Butchery: empty-row filtering, on-hand display + pre-check, warehouse editable on DRAFT (server already converts units).
- [x] D12. Wastage: honest copy, Return reason removed, warehouse/unit export, no silent catalog fallback.
- [x] D13. Intelligence: warehouse-scoped refetch, blank counts, guarded partial apply, validated converter.

## Part E — Finance & reports

- [x] E1. Reports: money-only XLSX totals, local dates + max + inverted swap (full-dataset export per report = phase-2).
- [x] E2. DayClose: kitchen/vouchers/custody/driver-cash blockers (server) + copy + badge/button aligned (reopen = phase-2).
- [x] E3. Finance: working journal filters, leaf-only summaries, functional recurring-template form.
- [x] E4. Treasury: settle clamped to outstanding, branch-explicit account creation (scope enforced server-side).
- [ ] E5. Expenses: stale branch, sliced totals, status collapse, dual auth paths.
- [ ] E6. Fiscal: VAT mixes branches, single-order submit only, fake-ready signals.
- [ ] E7. ApprovalCenter: reject without PIN, stale branch, truncated refs.
- [ ] E8. Franchise: mean-of-avgs ticket, mutating sort in render, wrong drill permission.
- [ ] E9. AIInsights/AIAssistant: browser-cache metrics, arbitrary health score, destructive actions guard, zero-cash bug.
- [ ] E10. Forensics: no filters/pagination/export, unverified theater, time-only timeline.

## Part F — HR & system

- [ ] F1. Attendance: overnight mis-attribution, empty days as absent, UTC date, ignored readiness gate.
- [ ] F2. Payroll: deduction total excludes items, no loan schedule, overlapping cycles, CLOSED recalc allowed, unscoped payouts.
- [ ] F3. Scheduling: no delete, fixed Sunday week, conflict swallow, single-entry edit.
- [ ] F4. TaskChecklist: definitions only (no instances), wrong branchId source.
- [ ] F5. Biometric: one-mapping-per-employee limit, stale health, no USB test path, timezone shift.
- [ ] F6. HRSettings: department delete orphans employees, title delete unchecked.
- [ ] F7. Migration: attendance/users only, no dry-run/rejects file, error swallowed.
- [ ] F8. UserManagement: "applies to all" false, bulk uses filter/first-branch, empty-perms lockout, plaintext PIN.
- [ ] F9. SettingsHub: save persists almost nothing, fake branch IP, delete==deactivate.
- [ ] F10. PrinterManager: no 58mm config, branding not persisted, 1s queue hammering, purge without confirm.
- [ ] F11. ReceiptDesigner: fake Save button semantics, dangling links on delete, QR via external API.
- [ ] F12. SetupWizard: printers/tables incomplete, staff perms ignore modules, PINs in sessionStorage.
- [ ] F13. Login: dead forgot-password, uncontrolled remember-me, swallowed PIN errors.
- [ ] F14. Routes/nav: HR-only login loop, hidden sidebar overreach, approval-gated migration.

## Part G — Cross-cutting

- [ ] G1. Offline works for driver app only; everything else fails silently.
- [ ] G2. Shared NAV_* permissions block least-privilege splits.
- [ ] G3. Date/money formatting + forced RTL inconsistencies across pages.
