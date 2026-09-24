import { sql } from 'drizzle-orm';
import { orders } from '../../src/db/schema';

/**
 * THE revenue rule (single source of truth): an order counts as revenue
 * the moment it exists and is not dead — i.e. not cancelled / refunded /
 * voided / soft-deleted. Nothing else matters:
 * - Kitchen (KDS) and delivery screens are purely operational side views.
 * - No payment bookkeeping is required for the sale itself to count;
 *   tender/settlement is reconciled separately (payments mix, shift cash).
 */
export const revenueEligibleOrder = () =>
    sql`(${orders.status} not in ('CANCELLED', 'REFUNDED', 'VOID') and ${orders.deletedAt} is null)`;

/** Alias kept for existing callers — identical rule. */
export const revenueRecognizedOrder = () => revenueEligibleOrder();
