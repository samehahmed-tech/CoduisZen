/**
 * Socket Event Utilities
 * Implements: P1 Item 8 — Event versioning basics.
 *
 * Provides a typed emit wrapper that automatically adds:
 * - eventId: unique identifier for deduplication
 * - seq: monotonic sequence number for ordering
 * - ts: server timestamp
 *
 * Usage in controllers:
 *   import { emitBranchEvent } from '../utils/socketEmit';
 *   emitBranchEvent(branchId, 'order:created', savedOrder);
 */

import { getIO } from '../socket';
import { randomUUID } from 'crypto';

let _seq = 0;

/**
 * Emit a versioned event to a branch room.
 * Wraps the payload with eventId, seq, and ts for deduplication and ordering.
 */
export function emitBranchEvent(branchId: string, event: string, payload: any) {
    if (!branchId) return;
    const room = `branch:${branchId}`;
    const envelope = {
        ...payload,
        _eventId: randomUUID(),
        _seq: ++_seq,
        _ts: Date.now(),
    };
    try {
        getIO().to(room).emit(event, envelope);
    } catch (err) {
        // Socket not initialized — safe to ignore during tests/startup
    }
}

/**
 * Emit a versioned event to a specific room (e.g. user room).
 */
export function emitRoomEvent(room: string, event: string, payload: any) {
    const envelope = {
        ...payload,
        _eventId: randomUUID(),
        _seq: ++_seq,
        _ts: Date.now(),
    };
    try {
        getIO().to(room).emit(event, envelope);
    } catch (err) {
        // Socket not initialized — safe to ignore
    }
}
