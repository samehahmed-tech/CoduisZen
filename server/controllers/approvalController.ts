import { Request, Response } from 'express';
import { db } from '../db';
import { managerApprovals, auditLogs, users, journalEntries, financeExceptions } from '../../src/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { GLService } from '../services/glService';

const normalizeApproval = (approval: typeof managerApprovals.$inferSelect) => {
    const details = (approval.details && typeof approval.details === 'object') ? approval.details as Record<string, any> : {};
    return {
        ...approval,
        id: String(approval.id),
        type: approval.actionType,
        referenceId: approval.relatedId,
        status: details.status || (approval.reason === 'PIN Verified' ? 'APPROVED' : 'PENDING'),
        details,
        resolvedAt: details.resolvedAt,
        resolvedBy: details.resolvedBy,
    };
};

const backfillPendingExpenseApprovals = async (branchId: string | undefined, userId: string | undefined) => {
    if (!branchId || !userId) return;

    const pendingExpenseExceptions = await db.select()
        .top(50)
        .from(financeExceptions)
        .where(and(
            eq(financeExceptions.referenceType, 'EXPENSE'),
            eq(financeExceptions.status, 'PENDING'),
        ));

    for (const exception of pendingExpenseExceptions) {
        const reason = String(exception.reason || '');
        if (!reason.startsWith('NO_OPEN_PERIOD')) continue;

        const payload = exception.payload as any;
        if (!payload || !Array.isArray(payload.lines)) continue;

        const result = await GLService.postJournalEntry(payload);
        const entryId = typeof result === 'object' && result && 'entryId' in result ? String(result.entryId) : '';
        if (!entryId) continue;

        await db.update(financeExceptions)
            .set({ status: 'RESOLVED', resolvedBy: userId, resolvedAt: new Date() })
            .where(eq(financeExceptions.id, exception.id));
    }

    const pendingExpenses = await db.select()
        .top(100)
        .from(journalEntries)
        .where(and(
            eq(journalEntries.referenceType, 'EXPENSE'),
            eq(journalEntries.status, 'PENDING_APPROVAL'),
        ));

    if (pendingExpenses.length === 0) return;

    const existingApprovals = await db.select()
        .from(managerApprovals)
        .where(eq(managerApprovals.actionType, 'EXPENSE'));
    const existingRelatedIds = new Set(existingApprovals.map((approval) => approval.relatedId).filter(Boolean));

    const missing = pendingExpenses.filter((entry) => !existingRelatedIds.has(entry.id));
    if (missing.length === 0) return;

    await db.insert(managerApprovals).values(missing.map((entry) => ({
        managerId: userId,
        branchId,
        actionType: 'EXPENSE',
        relatedId: entry.id,
        reason: 'Expense pending approval',
        details: {
            status: 'PENDING',
            referenceId: entry.reference,
            description: entry.description,
            requestedBy: entry.createdBy || userId,
            requestedAt: entry.createdAt?.toISOString?.() || new Date().toISOString(),
            backfilled: true,
        },
        createdAt: entry.createdAt || new Date(),
    })));
};

export const createApproval = async (req: Request, res: Response) => {
    try {
        const { managerId, branchId, actionType, relatedId, reason, details } = req.body;

        const [approval] = await db.insert(managerApprovals).output().values({
            managerId,
            branchId,
            actionType,
            relatedId,
            reason,
            details: { ...(details || {}), status: details?.status || 'PENDING' },
            createdAt: new Date(),
        });

        // Also log to audit logs for central visibility
        await db.insert(auditLogs).values({
            eventType: `MANAGER_APPROVAL_${actionType}`,
            userId: managerId,
            branchId,
            reason,
            payload: details,
            createdAt: new Date(),
        });

        res.status(201).json(normalizeApproval(approval));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getApprovals = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const effectiveBranchId = (branchId as string | undefined) || req.user?.branchId || req.user?.allowedBranches?.[0] || undefined;
        await backfillPendingExpenseApprovals(effectiveBranchId, req.user?.id);
        let query = db.select().from(managerApprovals);

        if (effectiveBranchId) {
            // @ts-ignore
            query = query.where(eq(managerApprovals.branchId, effectiveBranchId));
        }

        const approvals = await query.orderBy(desc(managerApprovals.createdAt)).offset(0).fetch(100);
        res.json(approvals.map(normalizeApproval));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Verify Manager PIN for secure actions (Void, Refund, High Discount)
 */
export const verifyManagerPin = async (req: Request, res: Response) => {
    try {
        const { branchId, pin, action, approvalId } = req.body;

        if (!pin || (!branchId && !approvalId)) {
            return res.status(400).json({ error: 'pin and branchId or approvalId are required' });
        }

        const [approval] = approvalId
            ? await db.select().top(1).from(managerApprovals).where(eq(managerApprovals.id, Number(approvalId)))
            : [];
        const effectiveBranchId = branchId || approval?.branchId;
        const effectiveAction = action || approval?.actionType || 'APPROVAL';

        if (!effectiveBranchId) {
            return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        }

        // Find managers in this branch with matching PIN
        const managers = await db.select({
            id: users.id,
            name: users.name,
            role: users.role
        }).from(users).where(
            and(
                eq(users.assignedBranchId, effectiveBranchId),
                eq(users.managerPin, pin),
                eq(users.isActive, true)
            )
        );

        // Check if any matching user has manager-level role
        const validManager = managers.find(m =>
            ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'FINANCE_DIRECTOR', 'ACCOUNTANT'].includes(m.role)
        );

        if (validManager) {
            if (approval) {
                const details = (approval.details && typeof approval.details === 'object') ? approval.details as Record<string, any> : {};
                if (details.status === 'APPROVED') {
                    return res.json({
                        approved: true,
                        managerId: validManager.id,
                        managerName: validManager.name,
                        approval: normalizeApproval(approval),
                    });
                }

                if (approval.actionType === 'EXPENSE' && approval.relatedId) {
                    const [entry] = await db.select().top(1).from(journalEntries).where(eq(journalEntries.id, approval.relatedId));
                    if (!entry) return res.status(404).json({ error: 'JOURNAL_ENTRY_NOT_FOUND' });
                    if (entry.status === 'PENDING_APPROVAL') {
                        await db.update(journalEntries)
                            .set({ status: 'POSTED' })
                            .where(eq(journalEntries.id, approval.relatedId));
                    }
                }

                const resolvedDetails = {
                    ...details,
                    status: 'APPROVED',
                    resolvedAt: new Date().toISOString(),
                    resolvedBy: validManager.id,
                    resolvedByName: validManager.name,
                };

                const [updatedApproval] = await db.update(managerApprovals)
                    .set({
                        managerId: validManager.id,
                        reason: 'PIN Verified',
                        details: resolvedDetails,
                    })
                    .output()
                    .where(eq(managerApprovals.id, approval.id));

                await db.insert(auditLogs).values({
                    eventType: `MANAGER_APPROVAL_${approval.actionType}`,
                    userId: validManager.id,
                    userName: validManager.name,
                    userRole: validManager.role,
                    branchId: effectiveBranchId,
                    reason: 'PIN Verified',
                    payload: { approvalId: approval.id, relatedId: approval.relatedId, actionType: approval.actionType },
                    createdAt: new Date(),
                });

                return res.json({
                    approved: true,
                    managerId: validManager.id,
                    managerName: validManager.name,
                    approval: normalizeApproval(updatedApproval),
                });
            }

            await db.insert(managerApprovals).values({
                managerId: validManager.id,
                branchId: effectiveBranchId,
                actionType: effectiveAction,
                reason: 'PIN Verified',
                details: {
                    status: 'APPROVED',
                    resolvedAt: new Date().toISOString(),
                    resolvedBy: validManager.id,
                    resolvedByName: validManager.name,
                },
                createdAt: new Date(),
            });

            res.json({
                approved: true,
                managerId: validManager.id,
                managerName: validManager.name
            });
        } else {
            res.json({ approved: false, error: 'Invalid PIN or insufficient permissions' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const rejectApproval = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const reason = String(req.body?.reason || '').trim() || 'Rejected by reviewer';
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_APPROVAL_ID' });

        const [approval] = await db.select().top(1).from(managerApprovals).where(eq(managerApprovals.id, id));
        if (!approval) return res.status(404).json({ error: 'APPROVAL_NOT_FOUND' });

        const details = (approval.details && typeof approval.details === 'object') ? approval.details as Record<string, any> : {};
        if (details.status === 'APPROVED') return res.status(400).json({ error: 'APPROVAL_ALREADY_APPROVED' });
        if (details.status === 'REJECTED') return res.json(normalizeApproval(approval));

        if (approval.actionType === 'EXPENSE' && approval.relatedId) {
            await db.update(journalEntries)
                .set({ status: 'REJECTED' })
                .where(eq(journalEntries.id, approval.relatedId));
        }

        const resolvedDetails = {
            ...details,
            status: 'REJECTED',
            rejectedReason: reason,
            resolvedAt: new Date().toISOString(),
            resolvedBy: req.user?.id || 'system',
            resolvedByName: req.user?.name || 'System',
        };

        const [updatedApproval] = await db.update(managerApprovals)
            .set({
                managerId: req.user?.id || approval.managerId,
                reason,
                details: resolvedDetails,
            })
            .output()
            .where(eq(managerApprovals.id, id));

        await db.insert(auditLogs).values({
            eventType: `MANAGER_REJECT_${approval.actionType}`,
            userId: req.user?.id || 'system',
            userName: req.user?.name,
            userRole: req.user?.role,
            branchId: approval.branchId || req.effectiveBranchId,
            reason,
            payload: { approvalId: approval.id, relatedId: approval.relatedId, actionType: approval.actionType },
            createdAt: new Date(),
        });

        res.json(normalizeApproval(updatedApproval));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
