# Butchery / Fabrication Module

Multi-output inventory transformation: one source item (e.g. Whole Beef Leg)
is consumed and N output items (Steak, Cubes, Mince, Fat, Bones, Waste) are
produced in a single atomic transaction. Built on the existing
production/inventory patterns — no new engines.

## Flow

```
PO / GRN → Raw Material Inventory → Butchery (POSTED) → Processed Items
→ Recipes (normal inventory_item_id ingredients) → Sale (FEFO + COGS)
```

Recipes never know an item came from butchery: outputs are ordinary
`inventory_items` rows usable in `recipe_ingredients`, and sale-time
`computeConsumption` prices them at their (yield-adjusted) `cost_price`.

## Tables (new, additive — no existing table touched)

- `butchery_operations` — header: reference (unique), branch, warehouse,
  source item/qty/unit, source unit+total cost (re-locked at post),
  template, status `DRAFT → POSTED → CANCELLED`, created/posted/cancelled
  by+at, notes, waste reason.
- `butchery_outputs` — lines: item (null only for pure WASTE), qty, unit,
  type `USABLE | BY_PRODUCT | WASTE`, yield %, allocated unit+total cost,
  destination warehouse, waste reason.
- `butchery_templates` + `butchery_template_lines` — expected yield %
  per source item (must sum to 100 ± 0.5). Expected only; actuals always
  recorded on the operation; variance = actual − expected per line.

Tables are declared in `src/db/schema.ts` and self-created at runtime by
`ensureButcheryTables()` (same `IF NOT EXISTS` pattern as
`productionController`), so fresh and existing databases both work with no
manual migration.

## Posting (atomic `db.transaction`)

1. `deductInventoryFEFO` consumes the source (batch traceability to the
   original purchase preserved; `PRODUCTION_CONSUMPTION` movement).
2. Cost re-locked from live `cost_price`; `allocateCost` distributes it
   proportionally by weight (converted to source unit via the existing
   `unitConversion` service; incompatible UOMs rejected, never guessed).
3. Each `USABLE`/`BY_PRODUCT` line: global-MAC update of `cost_price`
   (same formula as GRN/direct-receipt), `inventory_stock` credit,
   `PRODUCTION` movement, `BATCH-BUTCH-*` lot row.
4. Each `WASTE` line: `WASTE` movement against the source item with its
   cost share — recorded loss, never enters sellable stock.
5. Status → `POSTED`; `BUTCHERY_POSTED` signed audit log; `stock:updated`
   socket emit; GL `postProductionCompletionEntry` (Dr 1220 / Cr 1210 for
   the full input value, mirroring production) + `postWastageEntry`
   (Dr 5140 / Cr 1210) for the waste share.

Conservation invariant enforced at post:
`Σ allocated + waste == input cost` (tolerance 0.05; largest-remainder
rounding keeps the penny on the biggest line).

## Cancellation / reversal

- `DRAFT` → `CANCELLED` directly (no stock moved yet).
- `POSTED` → reversal in one transaction: every stockable output is taken
  back via `deductInventoryFEFO` (fails loudly with `INSUFFICIENT_STOCK`
  if already consumed — never silent negatives), source qty returned with
  `ADJUSTMENT` movement + release batch, status → `CANCELLED`,
  `BUTCHERY_CANCELLED` audit. Completed operations are never edited or
  deleted.

## Edit & delete (mistake correction)

Any operation can be corrected — there is no dead-end for user mistakes:

- `DRAFT`: free edit of source item, source qty, outputs, notes
  (cost re-locked from live `cost_price`, lines re-allocated).
- `POSTED`: `PUT /operations/:id` with corrected `sourceQty`/`outputs`/
  `notes` performs an **atomic reverse + re-post in one transaction** —
  old stock effects undone, new ones applied, or nothing changes at all.
  Refused with `INSUFFICIENT_STOCK` when outputs were already consumed
  (cancel/reverse first is impossible then; adjust via a new operation).
  Source item is locked after posting (`SOURCE_ITEM_LOCKED_AFTER_POST`);
  every correction writes a `BUTCHERY_EDITED` audit entry with
  before/after values. GL: a positive input-value delta posts a top-up
  production-completion entry; a reduced value keeps the original entry
  and returns `financeNote: INPUT_VALUE_REDUCED|...` for manual adjustment
  (the system never silently reverses GL).
- `DELETE /operations/:id` works for every status: `DRAFT`/`CANCELLED`
  rows are removed outright; `POSTED` rows are reversed first in the same
  transaction (same `INSUFFICIENT_STOCK` guard). `stock_movements` and
  `audit_logs` (`BUTCHERY_DELETED` included) are append-only history and
  are always kept.
- UI: the detail drawer offers Edit / Post / Delete on drafts,
  Edit (reverse & re-apply) / Reverse & Cancel / Delete on posted
  operations (with explicit confirmations), and permanent delete on
  cancelled ones.

## Costing

No new costing engine. Butchery feeds the existing global moving-average
(`cost_price`) exactly like a GRN does, so recipe food cost
(`recipeService.recalculateCost`) and sale COGS automatically reflect
yield: 20 KG @ 10,000 with 90% usable yield lands ≈ 555.56/KG on outputs
instead of the naive 500/KG purchase price.

## Permissions (existing system, no new permission model)

Route guards reuse `requireRoles` + `enforceBranch`:
view/create/post under `SUPER_ADMIN, OWNER, BRANCH_MANAGER,
PRODUCTION_STAFF, WAREHOUSE_DIRECTOR`; post/cancel/delete additionally
require manage roles (`SUPER_ADMIN, OWNER, BRANCH_MANAGER,
WAREHOUSE_DIRECTOR`). UI route `/butchery` gated by `NAV_PRODUCTION`.

## API (`/api/butchery`, also `/api/inventory/butchery`)

- `GET /operations?status&branchId&sourceItemId`, `POST /operations`,
  `GET /operations/:id`, `PUT /operations/:id` (DRAFT only),
  `DELETE /operations/:id` (DRAFT only),
  `POST /operations/:id/post`, `POST /operations/:id/cancel`
- `GET /templates`, `POST /templates`, `DELETE /templates/:id`
- `GET /yield-report?branchId&sourceItemId&startDate&endDate`
  (rows + totals: input qty/cost, output qty, usable/waste %)

## UI

`/butchery` (`components/ButcheryManager.tsx`, `NAV_PRODUCTION`):
Operations list (Reference, Date via detail, Input, Input/Output qty,
Yield %, Status, Branch, Created By), create wizard
(source → outputs grid with USABLE/BY_PRODUCT/WASTE + waste reason →
review/post), detail drawer with cost/yield/variance + post/cancel,
yield-report tab, templates tab. Uses existing stores (`useInventoryStore`),
`ToastProvider`, Tailwind `bg-card/text-main` theme tokens.

## Tests

`tests/butchery.test.ts` (14 tests): per-output/usable/waste yield incl.
GRAM→KG conversion, cost conservation + proportionality + rounding,
100%/zero waste, incompatible-UOM rejection, input validation matrix,
expected-vs-actual variance. `tests/butcheryApi.test.ts` (full lifecycle
against the real database): create DRAFT (no stock movement) → post
(source 20→0, outputs stocked, MAC cost verified, WASTE movement present,
double-post refused) → edit POSTED (reverse + re-apply verified in stock)
→ cancel (source restored, outputs removed) → delete cancelled (GET→404)
→ delete POSTED directly (reversed + removed). All pass; neighboring suites
(stockAdjustment, wastageValidation, purchaseOrderPartialReceive,
inventoryStore — 8 tests) also pass.
