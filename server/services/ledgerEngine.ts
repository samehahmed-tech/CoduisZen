import { db } from '../db';
import { ledgerEntries } from '../../src/db/schema';
import { randomUUID } from 'node:crypto';
import logger from '../utils/logger';
import { validateLedgerEntries } from '../utils/ledgerInvariant';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { resolveJournalProvenance } from '../utils/financeProvenance';
import { buildLedgerCorrelationId } from '../utils/ledgerCorrelation';

let provenanceSchemaPromise: Promise<void> | undefined;

const ensureLedgerProvenanceSchema = async () => {
    if (!provenanceSchemaPromise) {
        provenanceSchemaPromise = db.execute(sql.raw(`
            IF COL_LENGTH('dbo.ledger_entries', 'branch_id') IS NULL
                ALTER TABLE dbo.ledger_entries ADD branch_id nvarchar(255) NULL;
            IF COL_LENGTH('dbo.ledger_entries', 'source') IS NULL
                ALTER TABLE dbo.ledger_entries ADD source nvarchar(100) NULL;
            IF COL_LENGTH('dbo.ledger_entries', 'actor_id') IS NULL
                ALTER TABLE dbo.ledger_entries ADD actor_id nvarchar(255) NULL;
            IF COL_LENGTH('dbo.ledger_entries', 'correlation_id') IS NULL
                ALTER TABLE dbo.ledger_entries ADD correlation_id nvarchar(255) NULL;
        `)).then(() => undefined).catch((error) => {
            provenanceSchemaPromise = undefined;
            throw error;
        });
    }
    await provenanceSchemaPromise;
};

export interface LedgerEntryInput {
    account: string;
    direction: 'debit' | 'credit';
    amount: number;
    currency?: string;
}

export interface LedgerTransactionContext {
    branchId?: string;
    source?: string;
    actorId?: string;
    correlationId?: string;
}

export class LedgerEngine {
    /**
     * Records a balanced set of ledger entries.
     * Enforces Double-Entry Accounting Rule: sum(debit) == sum(credit)
     */
    static async recordTransaction(
        orderId: string | null,
        paymentSessionId: string | null,
        entries: LedgerEntryInput[],
        context: LedgerTransactionContext = {},
    ): Promise<{ duplicate: boolean; entryIds: string[] }> {
        const invariant = entries?.length ? validateLedgerEntries(entries) : { ok: false as const, reason: 'INVALID_LEDGER_ENTRIES' };
        if (invariant.ok === false) {
            const errorMsg = `Invalid ledger transaction: ${invariant.reason}`;
            logger.error({ orderId, paymentSessionId, entryCount: entries?.length || 0 }, errorMsg);
            throw new Error(errorMsg);
        }

        try {
            await ensureLedgerProvenanceSchema();
            const correlationId = buildLedgerCorrelationId(
                orderId,
                paymentSessionId,
                context.source,
                context.correlationId,
            );
            const provenance = resolveJournalProvenance({
                referenceType: context.source || 'LEGACY_LEDGER',
                reference: orderId || paymentSessionId || undefined,
                source: context.source || 'LEGACY_LEDGER',
                actorId: context.actorId,
                correlationId,
            });
            // Using a transaction to ensure all entries are saved atomically
            let duplicate = false;
            await db.transaction(async (tx) => {
                // Serialize retries for the same accounting transaction. The
                // range lock prevents two concurrent requests from both
                // observing an empty correlation and inserting duplicates.
                await tx.execute(sql`
                    SELECT ${ledgerEntries.id}
                    FROM ${ledgerEntries} WITH (UPDLOCK, HOLDLOCK)
                    WHERE ${ledgerEntries.correlationId} = ${provenance.correlationId}
                      AND ${context.branchId
                        ? sql`${ledgerEntries.branchId} = ${context.branchId}`
                        : sql`${ledgerEntries.branchId} IS NULL`}
                `);
                const existing = await tx.select({ id: ledgerEntries.id })
                    .from(ledgerEntries)
                    .where(and(
                        eq(ledgerEntries.correlationId, provenance.correlationId),
                        context.branchId ? eq(ledgerEntries.branchId, context.branchId) : isNull(ledgerEntries.branchId),
                    ));
                if (existing.length > 0) {
                    duplicate = true;
                    return;
                }

                const valuesToInsert = entries.map(entry => ({
                    id: randomUUID(),
                    orderId: orderId,
                    paymentSessionId: paymentSessionId,
                    account: entry.account,
                    direction: entry.direction,
                    amount: entry.amount,
                    currency: entry.currency || 'EGP',
                    branchId: context.branchId,
                    source: provenance.source,
                    actorId: provenance.actorId,
                    correlationId: provenance.correlationId,
                }));
                
                await tx.insert(ledgerEntries).values(valuesToInsert);
            });

            logger.info({ orderId, paymentSessionId, totalAmountMinorUnits: invariant.totalMinorUnits }, 'Balanced ledger transaction recorded');
            const stored = await db.select({ id: ledgerEntries.id })
                .from(ledgerEntries)
                .where(and(
                    eq(ledgerEntries.correlationId, provenance.correlationId),
                    context.branchId ? eq(ledgerEntries.branchId, context.branchId) : isNull(ledgerEntries.branchId),
                ));
            return { duplicate, entryIds: stored.map((row) => row.id) };
        } catch (error: any) {
            logger.error({ error: error?.message || String(error), orderId, paymentSessionId }, 'Failed to record ledger transaction');
            throw error;
        }
    }
}
