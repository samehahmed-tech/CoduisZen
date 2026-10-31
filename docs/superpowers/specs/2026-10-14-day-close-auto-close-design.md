# Day-Close Auto-Close — Design Spec

- Date: 2026-10-14
- Status: approved (approach + sections 1-3 confirmed in chat)
- Path: architectural (new scheduled subsystem + settings + UI surfacing)

## 1. Intent

The user wants the business day to close automatically at a configurable time of day, even if staff forget. The option must be toggleable on/off from settings. Auto-close must be "smarter": when problems exist, they are shown to the user instead of failing silently.

Agreed scope (from brainstorming):

- One global time for all branches (no per-branch schedules).
- On blockers, auto-close force-closes with a recorded override reason (same path as manual manager override, audited as `DAY_CLOSE_OVERRIDE`).
- Notifications on success and on exceptional failure via in-system channel (socket event + DayCloseHub banner) and WhatsApp (existing `dayCloseWhatsappRecipients`).
- No new screens. Reuse `blockingChecks` UI in `DayCloseHub` plus a last-auto-close result panel.

## 2. Approach (approved: A)

**A. In-process scheduler (chosen).** New `server/services/dayCloseAutoCloseService.ts` with `start()`, wired in `server/index.ts` next to `backupCronService`. Checks every 60 seconds whether the configured time has passed and the branch business date is still open. Zero new dependencies, works on customer machines without Redis. Missed runs during downtime are covered by catch-up on boot (delayed by ~1 minute).

Rejected:

- **B. BullMQ repeatable job.** Durable across restarts but requires Redis at every customer site (`SOCKET_REDIS_ENABLED=false` today). Extra ops burden.
- **C. External Windows task.** Fragile, installer-coupled, hard to test.

## 3. Settings model

Extend `AppSettings` in `types.ts`:

```ts
dayCloseAutoClose?: { enabled: boolean; time: string /* "HH:mm" 24h, server-local */ };
```

- Edited from Settings → Day Close: enable switch + time input. Validation: `HH:mm` 24-hour format; saving invalid time is rejected with `INVALID_AUTO_CLOSE_TIME`.
- Read server-side via the existing `getSettingValue('dayCloseAutoClose', ...)` mechanism used by `dayCloseRules`, so behavior matches current gates. No new table.
- `DEFAULT`: `{ enabled: false, time: "23:59" }` (off until the admin opts in).

## 4. Scheduler service

New file `server/services/dayCloseAutoCloseService.ts`:

- `start()`: `setInterval` 60s + one delayed boot check (~60s after listen, giving the DB pool time to warm up). No-op when `NODE_ENV !== 'production'`? No — same policy as backup cron is production-only, but auto-close must also work on on-prem production installs (which run `NODE_ENV=production`). Keep it enabled whenever settings say so; log clearly when it fires in non-production.
- Each tick: load settings once; if `!enabled`, return. Compute server-local `HH:mm`; if `now < configured`, return.
- For each branch: `dayCloseService.getClosedReport(branchId, businessDate)` — skip when already closed. In-memory guard `lastRun[branchId + date]` prevents double-firing within the same tick windows; the DB unique index `day_close_branch_date_unique_idx` is the final guard (a `DAY_ALREADY_CLOSED` result is logged at info, not error).
- Close call: `dayCloseService.closeDay(branchId, date, actorId, { autoCloseOpenShifts: true, overrideReason: 'AUTO_CLOSE scheduled ...' })`. No changes to `closeDay` internals.
- Actor: `closedBy` is a non-null FK to `users.id`, so a fake `SYSTEM` id is invalid. The service selects the first active `SUPER_ADMIN`/`OWNER` at runtime; if none exists it skips all branches and logs an explicit error.
- Catch-up: if the server was down at the configured time and starts later the same day with branches still open, the boot check closes them (same code path, reason notes the catch-up).

## 5. Notifications and smarter display

- Success per branch: `emitBranchEvent(branchId, 'day-close:auto', {...})` + WhatsApp text via existing `sendWhatsAppText` to `dayCloseWhatsappRecipients` (branch, date, overridden blockers). WhatsApp failure never fails the close; it is logged as a warning.
- Exceptional failure (DB error, no actor, unexpected throw): same two channels with the failure reason; logged as error with branch/date.
- `DayCloseHub.tsx`: result banner for the last auto-close (when, by whom, which blockers were overridden) + `تجاوز تلقائي` badge on auto-overridden checks vs manual ones. Reuses the existing `blockingChecks` mapping (codes like `OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE` already have Arabic/English text). New API surface: minimal — either derive the banner from the closed report's audit data or add one `GET /api/day-close/:branchId/auto-close-status` endpoint (decision at implementation time; prefer zero new endpoints if the audit trail already carries it).

## 6. Edge cases

- Server-local timezone is authoritative; DST shifts may move the close by the OS clock — acceptable and documented in settings help text.
- WhatsApp down: close succeeds, notification logged.
- Manual close racing the scheduler: unique index wins; loser gets `DAY_ALREADY_CLOSED` (info).
- Branch already closed: skipped silently.
- No active SUPER_ADMIN/OWNER: everything skipped with an explicit error log (auth cannot be forged).

## 7. Testing

- Unit: time matching (before/at/after), disabled skips, same branch+date never fires twice, invalid time rejected.
- Manual: set time 2 minutes ahead, observe close + banner + WhatsApp (or warning log when no recipients configured).
- Regression: existing day-close tests keep passing; `closeDay` internals untouched.

## 8. Files touched (expected)

- `types.ts` (settings shape + default).
- `server/services/dayCloseAutoCloseService.ts` (new).
- `server/index.ts` (start it).
- `components/SettingsHub.tsx` (Day Close section: switch + time).
- `components/DayCloseHub.tsx` (result banner + auto-override badges).
- `server/services/dayCloseService.ts` or settings helper only if a getter is missing; no gate-logic changes.
- `tests/dayCloseAutoClose.test.ts` (new).

## 9. Self-review

- No placeholders or TBDs; all open questions from brainstorming were answered (global time, force-close, WhatsApp+system).
- Consistent with existing patterns (`backupCronService` scheduler shape, `dayCloseRules` settings mechanism, `DAY_CLOSE_OVERRIDE` audit path).
- Single-plan scope: scheduler + settings + surfacing. Per-branch times and retry policies are explicitly out.

## 10. Prior production issue (out of scope, tracked separately)

The 401 flood on `api/*` plus 500 on `day-close` plus `wss ... vercel.app` socket failure reported before this feature request is a separate incident (suspected wrong frontend origin and/or masked DB error in `authenticateToken`). It needs its four evidence items (opening URL, 401 response body, `/api/health`, applier log lines) before any fix. This spec does not change auth, CORS, or socket behavior.