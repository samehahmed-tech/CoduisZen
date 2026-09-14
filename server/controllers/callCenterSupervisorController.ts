import { Request, Response } from 'express';
import { db } from '../db';
import { orders, settings, branches } from '../../src/db/schema';
import { and, eq, gte, lt, lte, or, sql, count, desc } from 'drizzle-orm';
import { parseSettingJson, upsertSetting } from '../utils/settingsStore';
import { revenueEligibleOrder } from '../utils/orderRevenue';

type EscalationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type EscalationStatus = 'OPEN' | 'RESOLVED';

type EscalationRecord = {
    id: string;
    orderId: string;
    branchId?: string | null;
    status: EscalationStatus;
    priority: EscalationPriority;
    reason: string;
    notes?: string | null;
    createdBy?: string | null;
    createdAt: string;
    assignedTo?: string | null;
    resolvedBy?: string | null;
    resolvedAt?: string | null;
    resolutionNotes?: string | null;
};

const SETTINGS_KEY = 'callCenterEscalations';
const COACHING_SETTINGS_KEY = 'callCenterCoachingNotes';
const DISCOUNT_APPROVALS_KEY = 'callCenterDiscountApprovals';

type CoachingNoteRecord = {
    id: string;
    agentId: string;
    branchId?: string | null;
    note: string;
    tags?: string[];
    createdBy?: string | null;
    createdAt: string;
};

type DiscountApprovalRecord = {
    id: string;
    orderId: string;
    agentId?: string | null;
    branchId?: string | null;
    status: 'APPROVED' | 'REJECTED';
    reason?: string | null;
    approvedBy?: string | null;
    approvedAt: string;
};

const isPriority = (value: string): value is EscalationPriority =>
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(value);

const loadEscalations = async (): Promise<EscalationRecord[]> => {
    const [row] = await db.select().top(1).from(settings).where(eq(settings.key, SETTINGS_KEY));
    return parseSettingJson<EscalationRecord[]>(row?.value, []);
};

const saveEscalations = async (records: EscalationRecord[], userId?: string | null) => {
    await upsertSetting({ key: SETTINGS_KEY, value: records, category: 'call_center', updatedBy: userId || 'system' });
};

const loadCoachingNotes = async (): Promise<CoachingNoteRecord[]> => {
    const [row] = await db.select().top(1).from(settings).where(eq(settings.key, COACHING_SETTINGS_KEY));
    return parseSettingJson<CoachingNoteRecord[]>(row?.value, []);
};

const saveCoachingNotes = async (records: CoachingNoteRecord[], userId?: string | null) => {
    await upsertSetting({ key: COACHING_SETTINGS_KEY, value: records, category: 'call_center', updatedBy: userId || 'system' });
};

const loadDiscountApprovals = async (): Promise<DiscountApprovalRecord[]> => {
    const [row] = await db.select().top(1).from(settings).where(eq(settings.key, DISCOUNT_APPROVALS_KEY));
    return parseSettingJson<DiscountApprovalRecord[]>(row?.value, []);
};

const saveDiscountApprovals = async (records: DiscountApprovalRecord[], userId?: string | null) => {
    await upsertSetting({ key: DISCOUNT_APPROVALS_KEY, value: records, category: 'call_center', updatedBy: userId || 'system' });
};

export const getEscalations = async (req: Request, res: Response) => {
    try {
        const statusFilter = String(req.query.status || '').toUpperCase();
        const branchId = String(req.query.branchId || '');
        const records = await loadEscalations();
        const filtered = records.filter((item) => {
            if (statusFilter && item.status !== statusFilter) return false;
            if (branchId && String(item.branchId || '') !== branchId) return false;
            return true;
        });
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        res.json(filtered);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_LOAD_ESCALATIONS' });
    }
};

export const createEscalation = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const orderId = String(body.orderId || '').trim();
        const reason = String(body.reason || '').trim();
        const priorityRaw = String(body.priority || 'HIGH').toUpperCase();
        const priority: EscalationPriority = isPriority(priorityRaw) ? priorityRaw : 'HIGH';

        if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });
        if (!reason) return res.status(400).json({ error: 'ESCALATION_REASON_REQUIRED' });

        const current = await loadEscalations();
        const existingOpen = current.find((e) => e.orderId === orderId && e.status === 'OPEN');
        if (existingOpen) {
            return res.status(409).json({ error: 'ESCALATION_ALREADY_OPEN', escalation: existingOpen });
        }

        const userId = req.user?.id || null;
        const nowIso = new Date().toISOString();
        const newItem: EscalationRecord = {
            id: `esc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            orderId,
            branchId: body.branchId || req.user?.branchId || null,
            status: 'OPEN',
            priority,
            reason,
            notes: body.notes ? String(body.notes) : null,
            createdBy: userId,
            createdAt: nowIso,
            assignedTo: body.assignedTo ? String(body.assignedTo) : null,
        };

        const next = [newItem, ...current];
        await saveEscalations(next, userId);
        res.status(201).json(newItem);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_CREATE_ESCALATION' });
    }
};

export const resolveEscalation = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'ESCALATION_ID_REQUIRED' });

        const resolutionNotes = String(req.body?.resolutionNotes || '').trim();
        const userId = req.user?.id || null;

        const current = await loadEscalations();
        const index = current.findIndex((e) => e.id === id);
        if (index === -1) return res.status(404).json({ error: 'ESCALATION_NOT_FOUND' });

        const target = current[index];
        if (target.status === 'RESOLVED') return res.json(target);

        const resolved: EscalationRecord = {
            ...target,
            status: 'RESOLVED',
            resolvedBy: userId,
            resolvedAt: new Date().toISOString(),
            resolutionNotes: resolutionNotes || null,
        };

        current[index] = resolved;
        await saveEscalations(current, userId);
        res.json(resolved);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_RESOLVE_ESCALATION' });
    }
};

export const autoScanEscalations = async (req: Request, res: Response) => {
    try {
        const thresholdMinutes = Math.max(5, Number(req.body?.thresholdMinutes || 20));
        const branchId = String(req.body?.branchId || req.user?.branchId || '').trim();
        const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
        const userId = req.user?.id || null;

        const orderConditions: any[] = [
            or(eq(orders.isCallCenterOrder, true), eq(orders.source, 'call_center')),
            or(eq(orders.status, 'PENDING'), eq(orders.status, 'PREPARING'), eq(orders.status, 'READY')),
            lt(orders.createdAt, cutoff),
        ];
        if (branchId) orderConditions.push(eq(orders.branchId, branchId));

        const staleOrders = await db.select({
            id: orders.id,
            branchId: orders.branchId,
            createdAt: orders.createdAt,
        }).from(orders).where(and(...orderConditions));

        const current = await loadEscalations();
        const openOrderIds = new Set(current.filter((e) => e.status === 'OPEN').map((e) => e.orderId));
        const nowIso = new Date().toISOString();
        const additions: EscalationRecord[] = [];

        for (const order of staleOrders) {
            if (openOrderIds.has(order.id)) continue;
            const ageMinutes = Math.floor((Date.now() - new Date(order.createdAt || nowIso).getTime()) / 60000);
            const priority: EscalationPriority = ageMinutes >= 45 ? 'CRITICAL' : ageMinutes >= 30 ? 'HIGH' : 'MEDIUM';
            additions.push({
                id: `esc-auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                orderId: order.id,
                branchId: order.branchId || null,
                status: 'OPEN',
                priority,
                reason: ageMinutes >= 45 ? 'SLA_BREACH_AUTO' : 'SLA_RISK_AUTO',
                notes: `Auto scan detected stale order (${ageMinutes}m)`,
                createdBy: userId || 'system',
                createdAt: nowIso,
                assignedTo: null,
            });
        }

        if (additions.length > 0) {
            await saveEscalations([...additions, ...current], userId);
        }

        res.json({
            scanned: staleOrders.length,
            created: additions.length,
            thresholdMinutes,
            branchId: branchId || 'ALL',
            escalations: additions,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_SCAN_ESCALATIONS' });
    }
};

export const getCoachingNotes = async (req: Request, res: Response) => {
    try {
        const agentId = String(req.query.agentId || '').trim();
        const branchId = String(req.query.branchId || '').trim();
        const records = await loadCoachingNotes();
        const filtered = records.filter((item) => {
            if (agentId && item.agentId !== agentId) return false;
            if (branchId && String(item.branchId || '') !== branchId) return false;
            return true;
        });
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        res.json(filtered);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_LOAD_COACHING_NOTES' });
    }
};

export const addCoachingNote = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const agentId = String(body.agentId || '').trim();
        const note = String(body.note || '').trim();
        if (!agentId) return res.status(400).json({ error: 'AGENT_ID_REQUIRED' });
        if (!note) return res.status(400).json({ error: 'COACHING_NOTE_REQUIRED' });

        const tags = Array.isArray(body.tags)
            ? body.tags.map((t: any) => String(t || '').trim()).filter(Boolean)
            : [];
        const userId = req.user?.id || null;
        const nowIso = new Date().toISOString();
        const newItem: CoachingNoteRecord = {
            id: `coach-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            agentId,
            branchId: body.branchId || req.user?.branchId || null,
            note,
            tags,
            createdBy: userId,
            createdAt: nowIso,
        };

        const current = await loadCoachingNotes();
        const next = [newItem, ...current].slice(0, 3000);
        await saveCoachingNotes(next, userId);
        res.status(201).json(newItem);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_ADD_COACHING_NOTE' });
    }
};

export const getDiscountAbuse = async (req: Request, res: Response) => {
    try {
        const branchId = String(req.query.branchId || '').trim();
        const startDateRaw = String(req.query.startDate || '').trim();
        const endDateRaw = String(req.query.endDate || '').trim();
        const thresholdPercent = Math.max(5, Number(req.query.thresholdPercent || 20));
        const thresholdAmount = Math.max(1, Number(req.query.thresholdAmount || 120));

        const end = endDateRaw ? new Date(`${endDateRaw}T23:59:59.999`) : new Date();
        const start = startDateRaw ? new Date(`${startDateRaw}T00:00:00.000`) : new Date(end);
        if (!startDateRaw) start.setDate(end.getDate() - 7);

        const conditions: any[] = [
            or(eq(orders.isCallCenterOrder, true), eq(orders.source, 'call_center')),
            gte(orders.createdAt, start),
            lte(orders.createdAt, end),
        ];
        if (branchId) conditions.push(eq(orders.branchId, branchId));

        const scopedOrders = await db.select({
            id: orders.id,
            branchId: orders.branchId,
            callCenterAgentId: orders.callCenterAgentId,
            status: orders.status,
            subtotal: orders.subtotal,
            discount: orders.discount,
            total: orders.total,
            createdAt: orders.createdAt,
        }).from(orders).where(and(...conditions));

        const approvals = await loadDiscountApprovals();
        const approvedOrderIds = new Set(
            approvals
                .filter((a) => a.status === 'APPROVED')
                .map((a) => a.orderId),
        );

        const violations = scopedOrders
            .map((order) => {
                const subtotal = Math.max(0, Number(order.subtotal || 0));
                const discount = Math.max(0, Number(order.discount || 0));
                const discountPercent = subtotal > 0 ? (discount / subtotal) * 100 : 0;
                const highDiscount = discountPercent >= thresholdPercent || discount >= thresholdAmount;
                return {
                    orderId: order.id,
                    branchId: order.branchId || null,
                    agentId: order.callCenterAgentId || null,
                    status: String(order.status || ''),
                    subtotal,
                    discount,
                    total: Number(order.total || 0),
                    discountPercent: Number(discountPercent.toFixed(2)),
                    createdAt: order.createdAt,
                    highDiscount,
                    approved: approvedOrderIds.has(order.id),
                };
            })
            .filter((v) => v.highDiscount)
            .sort((a, b) => Number(b.discountPercent) - Number(a.discountPercent));

        const pendingViolations = violations.filter((v) => !v.approved);

        const byAgent = new Map<string, { agentId: string; orders: number; discountTotal: number; highDiscountOrders: number }>();
        for (const order of scopedOrders) {
            const agentId = String(order.callCenterAgentId || 'UNASSIGNED');
            const row = byAgent.get(agentId) || { agentId, orders: 0, discountTotal: 0, highDiscountOrders: 0 };
            const subtotal = Math.max(0, Number(order.subtotal || 0));
            const discount = Math.max(0, Number(order.discount || 0));
            const discountPercent = subtotal > 0 ? (discount / subtotal) * 100 : 0;
            row.orders += 1;
            row.discountTotal += discount;
            if (discountPercent >= thresholdPercent || discount >= thresholdAmount) row.highDiscountOrders += 1;
            byAgent.set(agentId, row);
        }

        res.json({
            branchId: branchId || 'ALL',
            period: { start, end },
            thresholds: { thresholdPercent, thresholdAmount },
            totalOrders: scopedOrders.length,
            violations: pendingViolations,
            approvedViolations: violations.filter((v) => v.approved),
            byAgent: Array.from(byAgent.values()).sort((a, b) => b.highDiscountOrders - a.highDiscountOrders),
            approvals: approvals.filter((a) => !branchId || String(a.branchId || '') === branchId),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_LOAD_DISCOUNT_ABUSE' });
    }
};

export const approveDiscountViolation = async (req: Request, res: Response) => {
    try {
        const orderId = String(req.body?.orderId || '').trim();
        const agentId = String(req.body?.agentId || '').trim();
        const branchId = String(req.body?.branchId || req.user?.branchId || '').trim();
        const status = String(req.body?.status || 'APPROVED').toUpperCase() === 'REJECTED' ? 'REJECTED' : 'APPROVED';
        const reason = String(req.body?.reason || '').trim();
        if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });

        const userId = req.user?.id || null;
        const nowIso = new Date().toISOString();
        const current = await loadDiscountApprovals();
        const existingIndex = current.findIndex((item) => item.orderId === orderId);
        const record: DiscountApprovalRecord = {
            id: existingIndex >= 0 ? current[existingIndex].id : `disc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            orderId,
            agentId: agentId || null,
            branchId: branchId || null,
            status,
            reason: reason || null,
            approvedBy: userId,
            approvedAt: nowIso,
        };

        if (existingIndex >= 0) {
            current[existingIndex] = record;
        } else {
            current.unshift(record);
        }
        await saveDiscountApprovals(current.slice(0, 5000), userId);
        res.json(record);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_APPROVE_DISCOUNT_VIOLATION' });
    }
};

/* ═══════════════════════════════════════════════════════════════════
 *  BRANCH HEALTH — Ping branch server IPs for online/offline status
 * ═══════════════════════════════════════════════════════════════════ */

export const getBranchHealth = async (req: Request, res: Response) => {
    try {
        const allBranches = await db.select({
            id: branches.id,
            name: branches.name,
            nameAr: branches.nameAr,
            serverIp: branches.serverIp,
            isActive: branches.isActive,
            phone: branches.phone,
        }).from(branches).where(eq(branches.isActive, true));

        const branchHealth = [];

        for (const branch of allBranches) {
            const ip = branch.serverIp?.trim();
            let status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN' = 'UNKNOWN';
            let latencyMs = -1;

            if (ip) {
                try {
                    const start = Date.now();
                    // Try an HTTP HEAD ping to the branch server
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000);
                    await fetch(`http://${ip}/api/health`, {
                        method: 'GET',
                        signal: controller.signal,
                    });
                    clearTimeout(timeout);
                    latencyMs = Date.now() - start;
                    status = 'ONLINE';
                } catch {
                    status = 'OFFLINE';
                }
            }

            // Count orders in the last 24h for this branch
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const [orderStats] = await db.select({
                total: count(),
                failedSync: sql<number>`count(case when ${orders.syncStatus} in ('FAILED', 'PENDING') then 1 end)`,
                pending: sql<number>`count(case when ${orders.status} = 'PENDING' then 1 end)`,
            }).from(orders).where(
                and(
                    eq(orders.branchId, branch.id),
                    or(eq(orders.isCallCenterOrder, true), eq(orders.source, 'call_center')),
                    gte(orders.createdAt, dayAgo),
                ),
            );

            branchHealth.push({
                id: branch.id,
                name: branch.name,
                nameAr: branch.nameAr,
                serverIp: ip || null,
                phone: branch.phone,
                status,
                latencyMs,
                lastChecked: new Date().toISOString(),
                orders24h: Number(orderStats?.total || 0),
                failedSync: Number(orderStats?.failedSync || 0),
                pendingOrders: Number(orderStats?.pending || 0),
            });
        }

        res.json({
            checkedAt: new Date().toISOString(),
            branches: branchHealth,
            summary: {
                total: branchHealth.length,
                online: branchHealth.filter(b => b.status === 'ONLINE').length,
                offline: branchHealth.filter(b => b.status === 'OFFLINE').length,
                unknown: branchHealth.filter(b => b.status === 'UNKNOWN').length,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_CHECK_BRANCH_HEALTH' });
    }
};

/* ═══════════════════════════════════════════════════════════════════
 *  FAILED ORDERS — Orders that failed to sync to branch
 * ═══════════════════════════════════════════════════════════════════ */

export const getFailedOrders = async (req: Request, res: Response) => {
    try {
        const branchId = String(req.query.branchId || '').trim();

        const conditions: any[] = [
            or(eq(orders.isCallCenterOrder, true), eq(orders.source, 'call_center')),
            or(eq(orders.syncStatus, 'FAILED'), eq(orders.syncStatus, 'PENDING')),
        ];
        if (branchId) conditions.push(eq(orders.branchId, branchId));

        const failedOrders = await db.select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            branchId: orders.branchId,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            deliveryAddress: orders.deliveryAddress,
            status: orders.status,
            syncStatus: orders.syncStatus,
            total: orders.total,
            callCenterAgentId: orders.callCenterAgentId,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
        }).from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt)).offset(0).fetch(100);

        res.json({
            total: failedOrders.length,
            orders: failedOrders,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_LOAD_FAILED_ORDERS' });
    }
};

export const retryFailedOrder = async (req: Request, res: Response) => {
    try {
        const orderId = String(req.params.id || '').trim();
        if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });

        const [order] = await db.select().top(1).from(orders).where(eq(orders.id, orderId));
        if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        const status = String((order as any).status || '').toUpperCase();
        if (['CANCELLED', 'DELIVERED', 'COMPLETED', 'REFUNDED'].includes(status)) {
            return res.status(409).json({ error: 'ORDER_ALREADY_TERMINAL', orderId, status });
        }

        // Real re-push to the branch: fresh kitchen dispatch (re-enqueues
        // branch print jobs), branch events, and sync flag flip.
        const { kdsController } = await import('./kdsController');
        const { emitBranchEvent } = await import('../utils/socketEmit');
        await kdsController.dispatchToKitchen((order as any).branchId, orderId).catch(() => undefined);
        emitBranchEvent((order as any).branchId, 'order:created', order);
        emitBranchEvent((order as any).branchId, 'order:status', { id: orderId, status, updatedAt: new Date() });
        await db.update(orders).set({ syncStatus: 'SYNCED', updatedAt: new Date() }).where(eq(orders.id, orderId));

        res.json({ success: true, orderId, syncStatus: 'SYNCED', redispatched: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_RETRY_ORDER' });
    }
};

export const retryAllFailedOrders = async (req: Request, res: Response) => {
    try {
        const branchId = String(req.query.branchId || req.body?.branchId || '').trim();
        const conditions: any[] = [
            or(eq(orders.isCallCenterOrder, true), eq(orders.source, 'call_center')),
            or(eq(orders.syncStatus, 'FAILED'), eq(orders.syncStatus, 'PENDING')),
            sql`${orders.status} NOT IN ('CANCELLED', 'DELIVERED', 'COMPLETED', 'REFUNDED')`,
        ];
        if (branchId) conditions.push(eq(orders.branchId, branchId));
        const rows = await db.select({ id: orders.id }).from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt)).offset(0).fetch(100);
        let ok = 0;
        const failed: string[] = [];
        for (const row of rows) {
            try {
                const [order] = await db.select().top(1).from(orders).where(eq(orders.id, (row as any).id));
                if (!order) continue;
                const { kdsController } = await import('./kdsController');
                const { emitBranchEvent } = await import('../utils/socketEmit');
                await kdsController.dispatchToKitchen((order as any).branchId, (order as any).id).catch(() => undefined);
                emitBranchEvent((order as any).branchId, 'order:created', order);
                await db.update(orders).set({ syncStatus: 'SYNCED', updatedAt: new Date() }).where(eq(orders.id, (order as any).id));
                ok += 1;
            } catch {
                failed.push(String((row as any).id));
            }
        }
        res.json({ success: true, retried: ok, failed, total: rows.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_RETRY_ORDERS' });
    }
};

/* ═══════════════════════════════════════════════════════════════════
 *  DAILY ORDER SUMMARY — Aggregated stats for today's review screen
 * ═══════════════════════════════════════════════════════════════════ */

export const getDailyOrderSummary = async (req: Request, res: Response) => {
    try {
        const branchId = String(req.query.branchId || '').trim();
        const dateStr = String(req.query.date || '').trim();
        const targetDate = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const conditions: any[] = [
            or(eq(orders.isCallCenterOrder, true), eq(orders.source, 'call_center')),
            gte(orders.createdAt, startOfDay),
            lte(orders.createdAt, endOfDay),
        ];
        if (branchId) conditions.push(eq(orders.branchId, branchId));

        const revenueEligible = revenueEligibleOrder();
        const summary = await db.select({
            status: orders.status,
            orderCount: count(),
            totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
            avgTotal: sql<number>`coalesce(avg(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions)).groupBy(orders.status);

        // Hourly breakdown
        const hourly = await db.select({
            hour: sql<number>`DATEPART(hour, ${orders.createdAt})`,
            orderCount: count(),
            revenue: sql<number>`coalesce(sum(case when ${revenueEligible} then ${orders.total} else 0 end), 0)`,
        }).from(orders).where(and(...conditions)).groupBy(sql`DATEPART(hour, ${orders.createdAt})`).orderBy(sql`DATEPART(hour, ${orders.createdAt})`);

        // Agent breakdown with AHT
        const agentBreakdown = await db.select({
            agentId: orders.callCenterAgentId,
            orderCount: count(),
            revenue: sql<number>`coalesce(sum(case when ${revenueEligible} then ${orders.total} else 0 end), 0)`,
            cancelled: sql<number>`count(case when ${orders.status} = 'CANCELLED' then 1 end)`,
            delivered: sql<number>`count(case when ${orders.status} = 'DELIVERED' then 1 end)`,
            avgAhtMinutes: sql<number>`coalesce(avg(DATEDIFF(SECOND, ${orders.createdAt}, ${orders.completedAt}) / 60.0), 0)`,
        }).from(orders).where(and(...conditions)).groupBy(orders.callCenterAgentId);

        const totalOrders = summary.reduce((sum, s) => sum + Number(s.orderCount), 0);
        const totalRevenue = summary
            .filter(row => !['CANCELLED', 'REFUNDED', 'VOID'].includes(String(row.status)))
            .reduce((sum, row) => sum + Number(row.totalRevenue), 0);

        res.json({
            date: targetDate.toISOString().slice(0, 10),
            branchId: branchId || 'ALL',
            totalOrders,
            totalRevenue: Number(totalRevenue.toFixed(2)),
            byStatus: summary.map(s => {
                const excluded = ['CANCELLED', 'REFUNDED', 'VOID'].includes(String(s.status));
                return {
                    status: s.status,
                    count: Number(s.orderCount),
                    revenue: excluded ? 0 : Number(Number(s.totalRevenue).toFixed(2)),
                    discount: Number(Number(s.totalDiscount).toFixed(2)),
                    avgOrderValue: excluded ? 0 : Number(Number(s.avgTotal).toFixed(2)),
                };
            }),
            hourly: hourly.map(h => ({
                hour: Number(h.hour),
                orders: Number(h.orderCount),
                revenue: Number(Number(h.revenue).toFixed(2)),
            })),
            agents: agentBreakdown.map(a => ({
                agentId: a.agentId,
                orders: Number(a.orderCount),
                revenue: Number(Number(a.revenue).toFixed(2)),
                cancelled: Number(a.cancelled),
                delivered: Number(a.delivered),
                avgAhtMinutes: Number(Number(a.avgAhtMinutes).toFixed(2)),
            })),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'FAILED_TO_LOAD_DAILY_SUMMARY' });
    }
};
