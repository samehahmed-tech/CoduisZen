# RestoFlow Offline Operational Matrix

This matrix is the current operating contract for a branch when the server is
unreachable. It records only behavior covered by the current implementation;
hardware and SQL/UAT claims remain explicitly open until demonstrated.

| Capability | Offline behavior | Recovery behavior | Safety boundary | Evidence |
|---|---|---|---|---|
| POS order creation | Local order can be queued with branch envelope | Replays through the canonical order API with a stable idempotency key | Cash only; non-cash and unsafe split tenders are rejected | `offlineCoreReplay`, `syncQueueUtils`, `offlinePayloadConflict` |
| Order status | Status transitions can be queued in order | Each transition uses its own idempotency key and is not collapsed into another status | Branch mismatch and unsupported actions become `CONFLICT` | `offlineCoreReplay`, `syncQueueUtils` |
| Payment | No remote settlement is claimed offline | Payment remains pending until the server/provider confirms it | Offline non-cash payment is fail-closed | `assertOfflinePaymentPolicy`, offline payment tests |
| Loyalty | Offline order replay does not award or settle remote points locally | Loyalty effects are applied by the server after the order is accepted | No offline redemption is treated as confirmed without server state | loyalty replay policy and order sync boundary |
| KDS/local hub | Local fallback and branch-scoped hub events remain available | Server/KDS state is reconciled after connectivity returns | Cross-branch envelopes are rejected; duplicate hub events are deduped | `localKdsHub`, `offlineBranchBinding` |
| Printing | LOCAL/WINDOWS/USB can use the local bridge; LAN remains server-queued | Queued LAN work resumes through the server | Bridge policy does not silently route LAN jobs locally | `localPrintPolicy`, hardware bridge checks |
| Inventory/menu/customer replay | Supported queue operations replay through their APIs | Transient errors retry with backoff; business/branch errors enter Conflict Center | Unsupported operations cannot become `SYNCED` | `offlineAdapterCoverage`, `offlineCoreReplay` |
| Conflict resolution | Conflict remains visible with server/local state metadata | Retry/merge/discard requires branch scope and permission | Discard clears retry/lease metadata; merge is server-wins on shared keys | `offlineConflictResolution`, `syncQueueUtils` |

## Recovery invariants

- A queue item is marked `SYNCED` only after its adapter resolves successfully.
- Two tabs cannot claim the same active item; stale leases can be recovered.
- A same-id order create with a different payload becomes
  `IDEMPOTENCY_KEY_PAYLOAD_CONFLICT` instead of overwriting the queued order.
- A real server restart, weak-network run, full-day pilot, and physical LAN
  device certification are UAT requirements and are not implied by this file.

## Operator messages

The POS must explain that cash is the only offline tender and that non-cash
payment requires connectivity. Conflicts are shown in Offline Conflict Center;
operators must not be told that a payment or order is synchronized before the
server confirms it.
