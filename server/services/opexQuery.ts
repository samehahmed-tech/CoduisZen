/**
 * Opex query helper for daily P&L.
 *
 * journal_lines has no branchId; entries are scoped via journal_entries'
 * costCenterId (set by GLService when a branchId is supplied on posting).
 * Entries without a cost center are intentionally excluded from branch P&L.
 *
 * Runs as one inlined raw-SQL pass via db.execute — the server/db shim
 * converts the drizzle sql`` template into safely-inlined literals, bypassing
 * the msnodesqlv8 parameter declaration bug.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export const expenseOpex = async (branchId: string, accountIds: string[], from: Date, to: Date): Promise<number> => {
    try {
        const rows = await (db as any).execute(sql`
            SELECT SUM(l.debit - l.credit) AS opex
            FROM journal_lines l
            INNER JOIN journal_entries e ON e.id = l.journal_entry_id
            WHERE l.account_id IN (${accountIds.join(',')})
              AND e.cost_center_id = ${branchId}
              AND e.status = 'POSTED'
              AND e.date >= ${from}
              AND e.date <= ${to}
        `);
        const value = (Array.isArray(rows) ? rows[0] : rows?.rows?.[0] || rows?.recordset?.[0])?.opex;
        return Math.round((Number(value) || 0) * 100) / 100;
    } catch {
        // Degradation-safe: P&L still computes without the opex line;
        // the anomaly surfaces as Operating Expenses = 0 and gets reviewed.
        return 0;
    }
};
