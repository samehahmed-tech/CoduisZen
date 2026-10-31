# Day-Close Auto-Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open branch day automatically once per day at a configurable global time, with force-override audit and WhatsApp + in-app surfacing of what was overridden.

**Architecture:** Settings-driven in-process scheduler reusing the `backupCronService` tick pattern and the existing `dayCloseService.closeDay` override path. No new tables, no new dependencies, no changes to close-gate logic.

**Tech Stack:** TypeScript, Express, Drizzle ORM (MSSQL), React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-day-close-auto-close-design.md`

## Global Constraints

- One global time for all branches; per-branch times are out of scope.
- Force-close uses the existing override path: `closeDay` with `autoCloseOpenShifts: true` and a written `overrideReason`. No gate-logic changes.
- `closedBy` is a non-null FK to `users.id`; the actor must be a real active `SUPER_ADMIN`/`OWNER` row selected at runtime.
- WhatsApp failure must never fail the close.
- Server-local timezone is authoritative.

## Review Focus

- Invalid `time` string in settings (e.g. `"25:99"`, `""`) must disable firing, never crash the tick — pinned in Task 1 tests.
- Server was down at the configured time and boots later the same day — branches still open must catch up — pinned in Task 2 tests.
- Manual close racing the scheduler for the same branch+date — second close returns the existing report (`DAY_ALREADY_CLOSED`), no duplicate — pinned in Task 2 tests.
- No active `SUPER_ADMIN`/`OWNER` exists — scheduler skips everything with an explicit error log, never forges an actor — pinned in Task 2 tests.
- WhatsApp send throws — close still succeeds, warning logged — pinned in Task 2 tests.

---

### Task 1: Settings shape and server getter

**Files:**
- Modify: `types.ts` (append `DayCloseAutoClose` interface, `AppSettings.dayCloseAutoClose`, `DEFAULT_DAY_CLOSE_AUTO_CLOSE`)
- Modify: `server/services/dayCloseService.ts` (add `getDayCloseAutoClose` getter + `isValidAutoCloseTime` helper next to `getDayCloseRules`)
- Test: `tests/dayCloseAutoClose.test.ts`

**Interfaces:**
- Consumes: existing `getSettingValue(key, fallback)` and `DayCloseRules` merge pattern in `dayCloseService.ts:295-322`.
- Produces: `getDayCloseAutoClose() => Promise<{ enabled: boolean; time: string }>` and `isValidAutoCloseTime(v: unknown) => boolean` for Task 2.

- [ ] **Step 1: Write the failing test**

```ts
it('rejects invalid auto-close times', () => {
  expect(isValidAutoCloseTime('25:99')).toBe(false);
  expect(isValidAutoCloseTime('')).toBe(false);
  expect(isValidAutoCloseTime('23:59')).toBe(true);
});
it('defaults to disabled when unset', async () => {
  await expect(getDayCloseAutoClose()).resolves.toEqual({ enabled: false, time: '23:59' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dayCloseAutoClose.test.ts`
Expected: FAIL with "isValidAutoCloseTime is not defined" (or import error).

- [ ] **Step 3: Implement `DayCloseAutoClose` in `types.ts` and `getDayCloseAutoClose` + `isValidAutoCloseTime` in `server/services/dayCloseService.ts`**

Getter reads setting key `dayCloseAutoClose`, merges over `DEFAULT_DAY_CLOSE_AUTO_CLOSE = { enabled: false, time: '23:59' }`, coerces `enabled` to boolean, falls back to default on invalid `time`. Export both helpers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dayCloseAutoClose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add types.ts server/services/dayCloseService.ts tests/dayCloseAutoClose.test.ts
git commit -m "feat(day-close): auto-close settings shape and getter"
```

### Task 2: Auto-close scheduler service and wiring

**Files:**
- Create: `server/services/dayCloseAutoCloseService.ts`
- Modify: `server/index.ts` (start it alongside `backupCronService`)
- Test: `tests/dayCloseAutoClose.test.ts` (extend)

**Interfaces:**
- Consumes: `getDayCloseAutoClose`, `isValidAutoCloseTime` (Task 1); `dayCloseService.closeDay/getClosedReport`; `emitBranchEvent`; `sendWhatsAppText`; `getSettingValue('dayCloseWhatsappRecipients')`.
- Produces: `dayCloseAutoCloseService.start(intervalMs?: number)` and `runAutoCloseOnce(now?: Date) => Promise<{ closed: string[]; skipped: string[] }>`.

- [ ] **Step 1: Write the failing tests**

```ts
it('does nothing when disabled', async () => {
  const res = await runAutoCloseOnce(new Date());
  expect(res.closed).toEqual([]);
});
it('never fires twice for the same branch and date', async () => {
  await runAutoCloseOnce(new Date());
  const second = await runAutoCloseOnce(new Date());
  expect(second.closed).toEqual([]);
});
it('treats concurrent manual close as skip, not error', async () => {
  // pre-insert closed report for branch+date, then run
  const res = await runAutoCloseOnce(new Date());
  expect(res.skipped).toContain('b1');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/dayCloseAutoClose.test.ts`
Expected: FAIL with "runAutoCloseOnce is not defined".

- [ ] **Step 3: Implement `dayCloseAutoCloseService` in `server/services/dayCloseAutoCloseService.ts`**

60s tick (same `setInterval` + `unref` + delayed boot sweep pattern as `scheduledOrderService.start`), `running` re-entry guard, per-branch loop: skip when disabled/invalid-time, skip when `now HH:mm < configured`, skip when `getClosedReport` exists, resolve actor as first active `SUPER_ADMIN`/`OWNER` (skip all + error log when none), call `closeDay(branchId, businessDate, actorId, { autoCloseOpenShifts: true, overrideReason: 'AUTO_CLOSE scheduled <HH:mm>' })`, treat `DAY_ALREADY_CLOSED`/`BUSINESS_DATE_MISMATCH` as skip-info, emit `day-close:auto` branch event, send WhatsApp via existing recipients inside try/catch (warn-only). Wire `start()` in `server/index.ts` next to the backup cron.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/dayCloseAutoClose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/dayCloseAutoCloseService.ts server/index.ts tests/dayCloseAutoClose.test.ts
git commit -m "feat(day-close): scheduled auto-close with override audit"
```

### Task 3: Settings UI (switch + time)

**Files:**
- Modify: `components/SettingsHub.tsx` (DAY_CLOSE case, after the override toggle block)
- Test: manual (existing settings save round-trip; no new unit test — same `handleChange` path as `dayCloseRules`)

**Interfaces:**
- Consumes: `settings.dayCloseAutoClose`, `handleChange`, `Toggle`, `tn` — same as the gates block at `SettingsHub.tsx:1251-1325`.
- Produces: persisted `dayCloseAutoClose` setting read by Task 1 getter.

- [ ] **Step 1: Add the auto-close card to the DAY_CLOSE section**

Card with `Toggle` bound to `dayCloseAutoClose.enabled` and `<input type="time">` bound to `dayCloseAutoClose.time`, Arabic/English copy via `tn`, help text noting server-local time. Invalid/empty time keeps the last valid value.

- [ ] **Step 2: Verify settings round-trip manually**

Run: dev server, open Settings → Day Close, toggle on, set time, reload page, confirm values persist.

Expected: values persist after reload.

- [ ] **Step 3: Commit**

```bash
git add components/SettingsHub.tsx
git commit -m "feat(day-close): auto-close schedule settings UI"
```

### Task 4: DayCloseHub result banner and auto-override badges

**Files:**
- Modify: `components/DayCloseHub.tsx` (banner above readiness list + badge in check rows)
- Test: manual (banner visible after auto-close; existing close flow unchanged)

**Interfaces:**
- Consumes: `report` (closed report carries `closedBy`, `closedAt`, audit `DAY_CLOSED` payload with `overrideReason`/`blockedReasons`), `readinessCopy` + `readinessChecks` at `DayCloseHub.tsx:270-325`.
- Produces: visible last-auto-close result and per-check `تجاوز تلقائي` badge.

- [ ] **Step 1: Add the auto-close result banner and badges**

Banner shows when the closed report's audit payload has an `AUTO_CLOSE` override reason: when, by whom, overridden blocker codes via existing `readinessCopy`. Check rows overridden in that payload get the auto badge; manual overrides keep existing display. No new API endpoint unless the audit payload proves insufficient during implementation — then add `GET /api/day-close/:branchId/auto-close-status` reading the latest `DAY_CLOSED` audit row.

- [ ] **Step 2: Verify manually**

Run: trigger a manual override close, confirm banner/badge render; confirm normal (non-override) close shows no banner.

Expected: banner only for override closes, badges match overridden codes.

- [ ] **Step 3: Commit**

```bash
git add components/DayCloseHub.tsx
git commit -m "feat(day-close): surface auto-close results and overrides"
```