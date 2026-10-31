# RestoFlow Offline Sync Contract

This contract describes the behavior that must remain true for every offline mutation. A feature is not considered offline-ready unless it follows this contract and has a focused replay test.

## Queue item identity

Each item in `localDb.syncQueue` contains:

- `id`: immutable local queue identifier.
- `entity` and `action`: the replay operation.
- `payload`: the mutation body, including the captured branch when applicable.
- `dedupeKey`: stable idempotency key for repeated local taps/replays.
- `branchId`: branch active when the mutation was created; it is mandatory for new items.
- `status`: `PENDING`, `SYNCED`, `FAILED`, or `CONFLICT`.
- retry metadata: `retryCount`, `lastAttemptAt`, `nextAttemptAt`, and `lockedAt`.
- `conflict`: machine code, user-facing message, optional server snapshot, and detection time.

## Branch invariant

1. A new item must have an active branch context.
2. A payload branch, when supplied, must equal the active branch.
3. Replay is allowed only when `item.branchId` equals the current active branch.
4. Legacy items without a branch are quarantined as `OFFLINE_BRANCH_UNKNOWN`; they are never replayed automatically.
5. Cross-branch replay requires an explicit server-side workflow, not a client-side override.

## Replay lifecycle

```text
PENDING -> PROCESSING (local lease) -> SYNCED
                         |              
                         +-> FAILED     (transient error, retryable)
                         +-> CONFLICT   (server/business/branch conflict)
```

`PROCESSING` is an implementation lease and is not exposed as a terminal state. A stale lease is recovered after the configured lease window. A retry must preserve the original `dedupeKey`.

## Error policy

- Network/5xx/rate-limit errors: retain `PENDING`/`FAILED` and apply backoff.
- Authentication or branch mismatch: quarantine as `CONFLICT`; never retry blindly.
- Server version/business conflict: store `serverState` when available and expose it in the Conflict Center.
- User resolution `RETRY`: clear the conflict, reset retry metadata, and replay only in the same branch.
- User resolution `DISCARD`: mark the local mutation `SYNCED` without sending it to the server, preserving the local decision in the queue history.

## Entity adapter requirements

Every adapter in `syncService.processItem` must be:

1. idempotent on the server or use the queue `dedupeKey`;
2. branch-scoped on reads and writes;
3. explicit about unknown entities/actions (fail closed);
4. covered by an offline replay test for success, duplicate replay, branch mismatch, and conflict.

## Current evidence

- Branch binding and legacy quarantine: `tests/offlineBranchBinding.test.ts`.
- Dedupe/retry/lease helpers: `tests/syncQueueUtils.test.ts`.
- Menu replay compatibility: `tests/menuOfflineReplay.test.ts` (browser/IndexedDB integration scope).
- Conflict UI: `/offline-conflicts` with Retry and Discard actions.
- Local KDS fallback: `src/services/localKdsService.ts` derives branch-scoped unsynced POS orders for a kitchen display when the server fetch fails; local Bump/Recall enqueue `orderStatus` mutations with the same branch binding.
- Local KDS hub: `src/services/localKdsHub.ts` broadcasts branch-bound order/status events through `BroadcastChannel` with a `storage` fallback; consumers validate event kind/freshness, deduplicate event ids, and reject cross-branch events.

Conflict resolution semantics:

- `RETRY` keeps the local payload and replays it after an explicit user decision.
- `DISCARD` accepts the server state and marks the local mutation resolved.
- `MERGE` is conservative: server values win for keys present on both sides, while local-only keys are preserved; it requires an object server snapshot and then replays the merged payload.
- Cross-branch transfer is never part of merge and requires a separate audited workflow.
- Branch creation is online-only; it is not a supported offline replay operation because branch identity and authorization are centrally governed.
