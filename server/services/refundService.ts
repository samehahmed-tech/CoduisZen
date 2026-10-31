/**
 * Refund Service — POS Refund Workflow
 * Implements: Section 7 (POS) of the ERP Launch Readiness Checklist
 *
 * Flow: Request → Manager Approval → Process → Post to Finance → Audit Log
 */

import { db, waitForDatabase } from '../db';
import { orders, orderItems, payments, settings, paymentMethodAccounts, chartOfAccounts, refundRecords } from '../../src/db/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { GLService } from './glService';
import { submitOrderToFiscal } from './fiscalSubmitService';
import { createSignedAuditLog } from './auditService';
import { allocateRefundPricing } from '../utils/refundPricingPolicy';
import logger from '../utils/logger';

const log = logger.child({ service: 'refund' });

// =============================================================================
// Types
// =============================================================================

export type RefundType = 'FULL' | 'PARTIAL' | 'ITEM';

export type RefundStatus = 'PENDING' | 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PROCESSED' | 'CANCELLED';

export type RefundMethod = 'CASH' | 'ORIGINAL_PAYMENT' | 'STORE_CREDIT';

export interface RefundRequest {
    id: string;
    orderId: string;
    orderNumber: number;
    branchId: string;
    type: RefundType;
    status: RefundStatus;
    // Amount
    originalAmount: number;
    refundAmount: number;
    couponCode?: string;
    couponDiscountAmount?: number;
    refundMethod: RefundMethod;
    // Items (for partial/item refunds)
    items?: RefundItem[];
    // Reason
    reason: string;
    reasonCategory: 'QUALITY' | 'WRONG_ORDER' | 'CUSTOMER_REQUEST' | 'CUSTOMER_COMPLAINT' | 'LATE_DELIVERY' | 'OVERCHARGE' | 'OTHER';
    // Approval
    requestedBy: string;
    requestedByName: string;
    approvedBy?: string;
    approvedByName?: string;
    rejectionReason?: string;
    // Processing
    processedAt?: string;
    processedBy?: string;
    paymentRefId?: string;
    gatewayRefundStatus?: 'PENDING' | 'SUCCEEDED' | 'FAILED';
    gatewaySessionId?: string;
    gatewayProvider?: string;
    gatewayTransactionId?: string;
    gatewayRefundId?: string;
    gatewayRefundedAt?: string;
    // Timestamps
    createdAt: string;
    updatedAt: string;
}

export interface RefundItem {
    orderItemId: number;
    menuItemName: string;
    quantity: number;
    unitPrice: number;
    refundAmount: number;
    grossAmount?: number;
    discountAllocated?: number;
    couponDiscountAllocated?: number;
    taxAllocated?: number;
    reason?: string;
}

export interface RefundPolicy {
    maxRefundWindowHours: number; // How many hours after order can refund be requested
    maxRefundWithoutApproval: number; // Amount below which no manager approval needed
    requireManagerPin: boolean;
    allowPartialRefund: boolean;
    allowItemRefund: boolean;
    autoRestockOnRefund: boolean;
    // Frontend aliases (kept in sync both ways so old UI builds keep working)
    maxRefundDays?: number;
    requireManagerApproval?: boolean;
    maxAutoApproveAmount?: number;
}

// =============================================================================
// Storage
// =============================================================================

const REFUND_KEY = 'pos_refunds_v1';
const REFUND_POLICY_KEY = 'pos_refund_policy_v1';

const readSetting = async <T>(key: string, fallback: T): Promise<T> => {
    const [row] = await db.select().from(settings).where(eq(settings.key, key));
    return (row?.value as T) || fallback;
};

const writeSetting = async (key: string, value: any, updatedBy?: string) => {
    const [existing] = await db.select().from(settings).where(eq(settings.key, key));
    if (existing) {
        await db.update(settings)
            .set({ value, category: 'pos', updatedBy: updatedBy || 'system', updatedAt: new Date() })
            .where(eq(settings.key, key));
    } else {
        await db.insert(settings).values({
            key, value, category: 'pos', updatedBy: updatedBy || 'system', updatedAt: new Date(),
        } as any);
    }
};

const refundRecordValues = (refund: RefundRequest) => ({
    id: refund.id,
    orderId: refund.orderId,
    branchId: refund.branchId,
    amount: Number(refund.refundAmount || 0),
    couponCode: refund.couponCode || null,
    couponDiscountAmount: Number(refund.couponDiscountAmount || 0),
    refundMethod: refund.refundMethod,
    reason: refund.reason,
    reasonCategory: refund.reasonCategory,
    items: refund.items as any,
    status: refund.status,
    requestedBy: refund.requestedBy,
    approvedBy: refund.approvedBy || null,
    approvedAt: refund.approvedBy ? new Date(refund.updatedAt) : null,
    processedAt: refund.processedAt ? new Date(refund.processedAt) : null,
    rejectionReason: refund.rejectionReason || null,
    createdAt: new Date(refund.createdAt),
    updatedAt: new Date(refund.updatedAt),
});

/**
 * SQL projection for reporting and Customer 360. Settings remain a
 * compatibility mirror for older clients, but new records have a durable
 * relational source of truth as well.
 */
const syncRefundRecord = async (refund: RefundRequest) => {
    const values = refundRecordValues(refund);
    const [existing] = await db.select({ id: refundRecords.id }).top(1).from(refundRecords).where(eq(refundRecords.id, refund.id));
    if (existing) {
        await db.update(refundRecords).set(values).where(eq(refundRecords.id, refund.id));
    } else {
        await db.insert(refundRecords).values(values);
    }
};

const syncRefundRecordBestEffort = async (refund: RefundRequest) => {
    try {
        await syncRefundRecord(refund);
    } catch (error: any) {
        log.warn({ refundId: refund.id, err: error?.message || String(error) }, 'SQL refund projection unavailable; compatibility mirror retained');
    }
};

const assertRefundBranch = (refund: RefundRequest, expectedBranchId?: string) => {
    const expected = String(expectedBranchId || '').trim();
    if (expected && String(refund.branchId || '').trim() !== expected) {
        throw new Error('REFUND_BRANCH_MISMATCH');
    }
};

const readSqlRefundProjection = async (filters?: {
    branchId?: string;
    status?: string;
    orderId?: string;
    orderIds?: string[];
    id?: string;
}): Promise<RefundRequest[]> => {
    try {
        const conditions: any[] = [];
        if (filters?.branchId) conditions.push(eq(refundRecords.branchId, filters.branchId));
        if (filters?.status) conditions.push(eq(refundRecords.status, filters.status));
        if (filters?.orderId) conditions.push(eq(refundRecords.orderId, filters.orderId));
        if (filters?.orderIds?.length) conditions.push(inArray(refundRecords.orderId, filters.orderIds));
        if (filters?.id) conditions.push(eq(refundRecords.id, filters.id));
        const rows = await db.select().from(refundRecords)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(refundRecords.createdAt)).offset(0).fetch(10000);
        return rows.map((row: any) => ({
            id: row.id,
            orderId: row.orderId,
            orderNumber: 0,
            branchId: row.branchId,
            type: 'PARTIAL' as RefundType,
            status: row.status as RefundStatus,
            originalAmount: Number(row.amount || 0),
            refundAmount: Number(row.amount || 0),
            refundMethod: row.refundMethod as RefundMethod,
            items: row.items || undefined,
            reason: row.reason || '',
            reasonCategory: (row.reasonCategory || 'OTHER') as RefundRequest['reasonCategory'],
            requestedBy: row.requestedBy || 'system',
            requestedByName: '',
            approvedBy: row.approvedBy || undefined,
            rejectionReason: row.rejectionReason || undefined,
            processedAt: row.processedAt ? new Date(row.processedAt).toISOString() : undefined,
            createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        }));
    } catch (error: any) {
        log.warn({ err: error?.message || String(error) }, 'SQL refund projection read unavailable; using compatibility mirror');
        return [];
    }
};

const defaultPolicy = (): RefundPolicy => ({
    maxRefundWindowHours: 24,
    maxRefundWithoutApproval: 50, // EGP
    requireManagerPin: true,
    allowPartialRefund: true,
    allowItemRefund: true,
    autoRestockOnRefund: false,
});

// =============================================================================
// Service
// =============================================================================

export const refundService = {

    /**
     * Backfill the relational projection from the legacy settings mirror.
     * This is explicit and insert-only: existing SQL rows are never
     * overwritten because SQL is the financial source of truth.
     */
    async repairProjection(options?: { branchId?: string; dryRun?: boolean }): Promise<{
        dryRun: boolean;
        branchId: string | null;
        scanned: number;
        eligible: number;
        inserted: number;
        alreadyProjected: number;
        skippedMissingBranch: number;
        failed: Array<{ id: string; reason: string }>;
    }> {
        await waitForDatabase();
        const branchId = String(options?.branchId || '').trim() || undefined;
        const dryRun = options?.dryRun !== false;
        const legacy = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const latestById = new Map<string, RefundRequest>();
        for (const raw of Array.isArray(legacy) ? legacy : []) {
            if (!raw?.id) continue;
            const normalized = { ...raw, status: raw.status === 'REQUESTED' ? 'PENDING' : raw.status } as RefundRequest;
            const previous = latestById.get(String(normalized.id));
            if (!previous || new Date(normalized.updatedAt || normalized.createdAt || 0).getTime() >= new Date(previous.updatedAt || previous.createdAt || 0).getTime()) {
                latestById.set(String(normalized.id), normalized);
            }
        }
        const candidates = [...latestById.values()].filter((refund) => !branchId || String(refund.branchId || '') === branchId);
        const existingRows = await db.select({ id: refundRecords.id }).from(refundRecords)
            .where(branchId ? eq(refundRecords.branchId, branchId) : undefined)
            .orderBy(refundRecords.id)
            .offset(0).fetch(100000);
        const existingIds = new Set(existingRows.map((row) => String(row.id)));
        let eligible = 0;
        let inserted = 0;
        let alreadyProjected = 0;
        let skippedMissingBranch = 0;
        const failed: Array<{ id: string; reason: string }> = [];

        for (const refund of candidates) {
            if (!refund.branchId) {
                skippedMissingBranch++;
                continue;
            }
            eligible++;
            if (existingIds.has(String(refund.id))) {
                alreadyProjected++;
                continue;
            }
            if (dryRun) {
                inserted++;
                continue;
            }
            try {
                await db.insert(refundRecords).values(refundRecordValues(refund));
                existingIds.add(String(refund.id));
                inserted++;
            } catch (error: any) {
                failed.push({ id: String(refund.id), reason: error?.message || String(error) });
            }
        }
        return {
            dryRun,
            branchId: branchId || null,
            scanned: latestById.size,
            eligible,
            inserted,
            alreadyProjected,
            skippedMissingBranch,
            failed,
        };
    },

    // =========================================================================
    // Policy
    // =========================================================================
    async getPolicy(): Promise<RefundPolicy> {
        const stored = await readSetting<any>(REFUND_POLICY_KEY, defaultPolicy());
        const merged: any = { ...defaultPolicy(), ...stored };
        // Normalize frontend aliases -> canonical (old UI builds send days/approval/limit)
        if (merged.maxRefundDays != null && merged.maxRefundWindowHours === defaultPolicy().maxRefundWindowHours) {
            const days = Number(merged.maxRefundDays);
            if (Number.isFinite(days) && days > 0) merged.maxRefundWindowHours = days * 24;
        }
        if (merged.requireManagerApproval != null) merged.requireManagerPin = Boolean(merged.requireManagerApproval);
        if (merged.maxAutoApproveAmount != null) {
            const limit = Number(merged.maxAutoApproveAmount);
            if (Number.isFinite(limit)) merged.maxRefundWithoutApproval = limit;
        }
        // Always expose aliases so any UI build reads a consistent shape
        merged.maxRefundDays = Number(merged.maxRefundWindowHours) / 24;
        merged.requireManagerApproval = Boolean(merged.requireManagerPin);
        merged.maxAutoApproveAmount = Number(merged.maxRefundWithoutApproval);
        return merged;
    },

    async updatePolicy(policy: Partial<RefundPolicy>, updatedBy?: string): Promise<RefundPolicy> {
        const current: any = await this.getPolicy();
        const incoming: any = { ...policy };
        // Accept frontend aliases on write
        if (incoming.maxRefundDays != null && incoming.maxRefundWindowHours == null) {
            const days = Number(incoming.maxRefundDays);
            if (Number.isFinite(days) && days > 0) incoming.maxRefundWindowHours = days * 24;
        }
        if (incoming.requireManagerApproval != null && incoming.requireManagerPin == null) {
            incoming.requireManagerPin = Boolean(incoming.requireManagerApproval);
        }
        if (incoming.maxAutoApproveAmount != null && incoming.maxRefundWithoutApproval == null) {
            const limit = Number(incoming.maxAutoApproveAmount);
            if (Number.isFinite(limit)) incoming.maxRefundWithoutApproval = limit;
        }
        const updated = { ...current, ...incoming };
        // Re-sync aliases before persist + return
        updated.maxRefundDays = Number(updated.maxRefundWindowHours) / 24;
        updated.requireManagerApproval = Boolean(updated.requireManagerPin);
        updated.maxAutoApproveAmount = Number(updated.maxRefundWithoutApproval);
        await writeSetting(REFUND_POLICY_KEY, updated, updatedBy);
        return updated;
    },

    // =========================================================================
    // Get Refunds
    // =========================================================================
    async getRefunds(filters?: {
        branchId?: string;
        status?: string;
        orderId?: string;
        orderIds?: string[];
        startDate?: string;
        endDate?: string;
    }): Promise<RefundRequest[]> {
        let refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        refunds = refunds.map((refund: any) => ({
            ...refund,
            status: refund.status === 'REQUESTED' ? 'PENDING' : refund.status,
            totalAmount: refund.refundAmount,
            customAmount: refund.refundAmount,
        }));

        if (filters?.branchId) refunds = refunds.filter(r => r.branchId === filters.branchId);
        if (filters?.status) refunds = refunds.filter(r => r.status === filters.status);
        if (filters?.orderId) refunds = refunds.filter(r => r.orderId === filters.orderId);
        if (filters?.orderIds?.length) {
            const orderIds = new Set(filters.orderIds.map(String));
            refunds = refunds.filter(r => orderIds.has(String(r.orderId)));
        }
        if (filters?.startDate) refunds = refunds.filter(r => r.createdAt >= filters.startDate!);
        if (filters?.endDate) refunds = refunds.filter(r => r.createdAt <= filters.endDate!);
        const sqlRefunds = await readSqlRefundProjection(filters);
        const byId = new Map<string, RefundRequest>(refunds.map((refund) => [refund.id, refund]));
        for (const sqlRefund of sqlRefunds) {
            const legacy = byId.get(sqlRefund.id);
            // SQL owns financial state; retain legacy-only metadata such as
            // gateway identifiers and requestedByName when present.
            byId.set(sqlRefund.id, legacy ? {
                ...legacy,
                branchId: sqlRefund.branchId,
                status: sqlRefund.status,
                refundAmount: sqlRefund.refundAmount,
                refundMethod: sqlRefund.refundMethod,
                reason: sqlRefund.reason,
                reasonCategory: sqlRefund.reasonCategory,
                items: sqlRefund.items || legacy.items,
                processedAt: sqlRefund.processedAt || legacy.processedAt,
                updatedAt: sqlRefund.updatedAt,
            } : sqlRefund);
        }
        return [...byId.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    async getRefundById(id: string): Promise<RefundRequest | null> {
        const refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const found = refunds.find(r => r.id === id) || null;
        const [sqlRefund] = await readSqlRefundProjection({ id });
        if (!found && !sqlRefund) return null;
        if (!found && sqlRefund) return sqlRefund;
        const anyRefund = found as any;
        return {
            ...found,
            ...(sqlRefund ? {
                branchId: sqlRefund.branchId,
                status: sqlRefund.status,
                refundAmount: sqlRefund.refundAmount,
                refundMethod: sqlRefund.refundMethod,
                reason: sqlRefund.reason,
                reasonCategory: sqlRefund.reasonCategory,
                items: sqlRefund.items || anyRefund.items,
                processedAt: sqlRefund.processedAt || anyRefund.processedAt,
                updatedAt: sqlRefund.updatedAt,
            } : {}),
            status: sqlRefund ? sqlRefund.status : (anyRefund.status === 'REQUESTED' ? 'PENDING' : anyRefund.status),
            totalAmount: anyRefund.totalAmount ?? anyRefund.refundAmount,
            customAmount: anyRefund.customAmount ?? anyRefund.refundAmount,
        } as RefundRequest;
    },

    async markGatewayRefundSucceeded(data: {
        refundId: string;
        provider: string;
        transactionId: string;
        gatewayRefundId?: string;
        updatedBy: string;
    }): Promise<RefundRequest> {
        const refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const refund = refunds.find(r => r.id === data.refundId);
        if (!refund) throw new Error('Refund not found');
        if (refund.status !== 'APPROVED' && refund.status !== 'PROCESSED') {
            throw new Error('Refund is not approved');
        }
        if (refund.gatewayRefundStatus === 'SUCCEEDED') return refund;
        refund.gatewayRefundStatus = 'SUCCEEDED';
        refund.gatewayProvider = data.provider;
        refund.gatewayTransactionId = data.transactionId;
        refund.gatewayRefundId = data.gatewayRefundId;
        refund.gatewayRefundedAt = new Date().toISOString();
        refund.updatedAt = new Date().toISOString();
        await writeSetting(REFUND_KEY, refunds, data.updatedBy);
        return refund;
    },

    // =========================================================================
    // Request Refund
    // =========================================================================
    async requestRefund(data: {
        orderId: string;
        type: RefundType;
        reason: string;
        reasonCategory: RefundRequest['reasonCategory'];
        refundMethod: RefundMethod;
        requestedBy: string;
        requestedByName: string;
        branchId?: string;
        items?: { orderItemId: number; quantity: number; reason?: string }[];
        customAmount?: number; // For partial refunds
        requireApproval?: boolean; // External gateway refunds must never auto-process
        gatewaySessionId?: string;
    }): Promise<RefundRequest> {
        const policy = await this.getPolicy();

        // Validate order exists
        const [order] = await db.select().from(orders).where(eq(orders.id, data.orderId));
        if (!order) throw new Error('Order not found');
        if (data.branchId && order.branchId !== data.branchId) {
            throw new Error('FORBIDDEN_BRANCH_ACCESS');
        }
        if (!['DELIVERED', 'COMPLETED'].includes(String(order.status))) {
            throw new Error('ONLY_SETTLED_ORDERS_CAN_BE_REFUNDED');
        }

        // Check refund window
        const orderDate = new Date(order.createdAt!);
        const hoursSinceOrder = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60);
        if (hoursSinceOrder > policy.maxRefundWindowHours) {
            throw new Error(`Refund window has expired (max ${policy.maxRefundWindowHours} hours). Order placed ${Math.round(hoursSinceOrder)} hours ago.`);
        }

        // Check for existing refund
        const existingRefunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const countedStatuses = new Set<RefundStatus>(['PENDING', 'REQUESTED', 'APPROVED', 'PROCESSED']);
        const countedRefunds = existingRefunds.filter(r => r.orderId === data.orderId && countedStatuses.has(r.status));
        const alreadyRefundedAmount = countedRefunds.reduce((sum, refund) => sum + Number(refund.refundAmount || 0), 0);
        if (data.type === 'FULL' && countedRefunds.length > 0) {
            throw new Error('An active refund already exists for this order');
        }

        // Calculate refund amount
        let refundAmount = 0;
        let refundItems: RefundItem[] | undefined;
        const couponCode = String((order as any).couponCode || '').trim() || undefined;
        let couponDiscountAmount = 0;
        // POS counter sends PARTIAL + items + customAmount; treat as item-level refund.
        const effectiveType = (data.type === 'PARTIAL' && data.items && data.items.length > 0) ? 'ITEM' : data.type;

        if (data.type === 'FULL') {
            refundAmount = Number(order.total || 0);
            couponDiscountAmount = Number((order as any).couponDiscountAmount || 0);
        } else if (effectiveType === 'PARTIAL' && data.customAmount) {
            if (!policy.allowPartialRefund) throw new Error('Partial refunds are not enabled');
            refundAmount = data.customAmount;
            if (refundAmount > Number(order.total || 0)) {
                throw new Error('Refund amount exceeds order total');
            }
            couponDiscountAmount = Number((order as any).couponDiscountAmount || 0)
                * (Number(order.total || 0) > 0 ? refundAmount / Number(order.total || 0) : 0);
        } else if (effectiveType === 'ITEM' && data.items) {
            if (!policy.allowItemRefund) throw new Error('Item-level refunds are not enabled');

            const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, data.orderId));
            refundItems = [];

            const requestedLines: Array<{ input: { orderItemId: number; quantity: number; reason?: string }; orderItem: typeof orderItems.$inferSelect }> = [];
            for (const item of data.items) {
                const orderItem = orderItemsList.find(oi => oi.id === item.orderItemId);
                if (!orderItem) throw new Error(`Order item ${item.orderItemId} not found`);
                const alreadyRefundedQuantity = countedRefunds
                    .flatMap(refund => refund.items || [])
                    .filter(refundItem => refundItem.orderItemId === item.orderItemId)
                    .reduce((sum, refundItem) => sum + refundItem.quantity, 0);
                if (item.quantity + alreadyRefundedQuantity > orderItem.quantity) {
                    throw new Error(`Refund quantity exceeds ordered quantity for ${orderItem.name}`);
                }

                requestedLines.push({ input: item, orderItem });
            }
            const allocatedLines = allocateRefundPricing(
                requestedLines.map(({ input, orderItem }) => ({
                    orderItemId: input.orderItemId,
                    unitPrice: Number(orderItem.price || 0),
                    quantity: input.quantity,
                })),
                {
                    orderSubtotal: Number(order.subtotal || 0),
                    orderDiscount: Number(order.discount || 0),
                    couponDiscount: Number((order as any).couponDiscountAmount || 0),
                    orderTax: Number(order.tax || 0),
                },
            );
            couponDiscountAmount = allocatedLines.reduce((sum, line) => sum + line.couponDiscountAllocated, 0);
            for (const [index, line] of allocatedLines.entries()) {
                const { input, orderItem } = requestedLines[index];
                refundAmount += line.refundAmount;

                refundItems.push({
                    orderItemId: line.orderItemId,
                    menuItemName: orderItem.name,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    grossAmount: line.grossAmount,
                    discountAllocated: line.discountAllocated,
                    couponDiscountAllocated: line.couponDiscountAllocated,
                    taxAllocated: line.taxAllocated,
                    refundAmount: line.refundAmount,
                    reason: input.reason,
                });
            }
        } else {
            throw new Error('Invalid refund type or missing data');
        }
        if (alreadyRefundedAmount + refundAmount > Number(order.total || 0)) {
            throw new Error('Cumulative refund amount exceeds order total');
        }

        // Determine if auto-approved (below threshold)
        const needsApproval = data.requireApproval === true
            || policy.requireManagerPin
            || refundAmount > policy.maxRefundWithoutApproval;

        const refund: RefundRequest = {
            id: `REF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            orderId: data.orderId,
            orderNumber: Number(order.orderNumber || 0),
            branchId: order.branchId,
            type: effectiveType,
            status: needsApproval ? 'PENDING' : 'APPROVED',
            originalAmount: Number(order.total || 0),
            refundAmount,
            couponCode,
            couponDiscountAmount: Number(couponDiscountAmount.toFixed(2)),
            refundMethod: data.refundMethod,
            gatewaySessionId: data.gatewaySessionId,
            items: refundItems,
            reason: data.reason,
            reasonCategory: data.reasonCategory,
            requestedBy: data.requestedBy,
            requestedByName: data.requestedByName,
            approvedBy: needsApproval ? undefined : 'AUTO',
            approvedByName: needsApproval ? undefined : 'Auto-approved (below threshold)',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        existingRefunds.unshift(refund);
        await syncRefundRecordBestEffort(refund);
        await writeSetting(REFUND_KEY, existingRefunds, data.requestedBy);
        await createSignedAuditLog({
            eventType: 'REFUND_REQUESTED',
            userId: data.requestedBy,
            userName: data.requestedByName,
            branchId: refund.branchId,
            payload: { refundId: refund.id, orderId: refund.orderId, type: refund.type, amount: refund.refundAmount, method: refund.refundMethod, gatewaySessionId: refund.gatewaySessionId },
            reason: refund.reason,
        });

        // Auto-process if auto-approved
        if (!needsApproval) {
            return this.processRefund(refund.id, data.requestedBy, refund.branchId);
        }

        return refund;
    },

    // =========================================================================
    // Approve / Reject
    // =========================================================================
    async approveRefund(refundId: string, approvedBy: string, approvedByName: string, expectedBranchId?: string): Promise<RefundRequest> {
        const refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const refund = refunds.find(r => r.id === refundId);
        if (!refund) throw new Error('Refund not found');
        assertRefundBranch(refund, expectedBranchId);
        if (refund.status !== 'PENDING' && refund.status !== 'REQUESTED') throw new Error('Refund is not pending approval');

        refund.status = 'APPROVED';
        refund.approvedBy = approvedBy;
        refund.approvedByName = approvedByName;
        refund.updatedAt = new Date().toISOString();

        await syncRefundRecordBestEffort(refund);
        await writeSetting(REFUND_KEY, refunds, approvedBy);
        await createSignedAuditLog({
            eventType: 'REFUND_APPROVED',
            userId: approvedBy,
            userName: approvedByName,
            branchId: refund.branchId,
            payload: { refundId: refund.id, orderId: refund.orderId, amount: refund.refundAmount },
            reason: 'Refund approved',
        });
        return refund;
    },

    async rejectRefund(refundId: string, rejectedBy: string, reason: string, expectedBranchId?: string): Promise<RefundRequest> {
        const refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const refund = refunds.find(r => r.id === refundId);
        if (!refund) throw new Error('Refund not found');
        assertRefundBranch(refund, expectedBranchId);
        if (refund.status !== 'PENDING' && refund.status !== 'REQUESTED') throw new Error('Refund is not pending approval');

        refund.status = 'REJECTED';
        refund.approvedBy = rejectedBy;
        refund.rejectionReason = reason;
        refund.updatedAt = new Date().toISOString();

        await syncRefundRecordBestEffort(refund);
        await writeSetting(REFUND_KEY, refunds, rejectedBy);
        await createSignedAuditLog({
            eventType: 'REFUND_REJECTED',
            userId: rejectedBy,
            branchId: refund.branchId,
            payload: { refundId: refund.id, orderId: refund.orderId, amount: refund.refundAmount, rejectionReason: reason },
            reason,
        });
        return refund;
    },

    // =========================================================================
    // Process Refund
    // =========================================================================
    async processRefund(refundId: string, processedBy: string, expectedBranchId?: string): Promise<RefundRequest> {
        const refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const refund = refunds.find(r => r.id === refundId);
        if (!refund) throw new Error('Refund not found');
        assertRefundBranch(refund, expectedBranchId);
        if (refund.status === 'PROCESSED') return refund;
        if (refund.status !== 'APPROVED') throw new Error('Refund is not approved');

        if (refund.gatewaySessionId && refund.gatewayRefundStatus !== 'SUCCEEDED') {
            throw new Error('GATEWAY_REFUND_NOT_SETTLED');
        }

        const [order] = await db.select().from(orders).where(eq(orders.id, refund.orderId));
        if (!order) throw new Error('Order not found for refund');
        if (order.branchId !== refund.branchId) {
            throw new Error('REFUND_BRANCH_MISMATCH');
        }

        const originalMethod = String(order.paymentMethod || 'CASH').toUpperCase();
        const refundMethod = refund.refundMethod === 'ORIGINAL_PAYMENT'
            ? originalMethod
            : String(refund.refundMethod || 'CASH').toUpperCase();
        const paymentAccount = await db.select({ code: chartOfAccounts.code })
            .from(paymentMethodAccounts)
            .innerJoin(chartOfAccounts, eq(paymentMethodAccounts.accountId, chartOfAccounts.id))
            .where(eq(paymentMethodAccounts.paymentMethod, refundMethod))
            .top(1);
        const cashAccount = paymentAccount[0]?.code || '1110';
        const taxRatio = Number(order.total || 0) > 0
            ? Number(order.tax || 0) * (Number(refund.refundAmount || 0) / Number(order.total || 0))
            : 0;
        const netRefund = Math.max(0, Number(refund.refundAmount || 0) - taxRatio);

        // The finance entry must succeed before the refund becomes operationally
        // processed. This prevents a successful refund with no GL entry.
        const financeResult = await GLService.postJournalEntry({
            reference: refund.id,
            referenceType: 'REFUND',
            description: `Refund ${refund.id} for Order #${refund.orderNumber}`,
            branchId: refund.branchId,
            createdBy: processedBy,
            actorId: processedBy,
            source: 'REFUND',
            correlationId: `REFUND:${refund.id}`,
            lines: [
                { accountCode: '4100', debit: netRefund, credit: 0 },
                ...(taxRatio > 0 ? [{ accountCode: '2210', debit: taxRatio, credit: 0 }] : []),
                { accountCode: cashAccount, debit: 0, credit: Number(refund.refundAmount || 0) },
            ],
        });
        if (!financeResult || typeof financeResult === 'string' || !(financeResult as any).entryId) {
            throw new Error('REFUND_FINANCE_POSTING_FAILED');
        }

        // Keep the order projection and refund payment atomic. The deterministic
        // payment id makes a retry safe even if the settings-backed refund state
        // was not persisted before the worker/request crashed.
        let paymentId = `PAY-REF-${refund.id}`;
        await db.transaction(async (tx) => {
            await tx.execute(sql`
                SELECT id
                FROM orders WITH (UPDLOCK, HOLDLOCK)
                WHERE id = ${refund.orderId}
            `);

            if (refund.type === 'FULL') {
                await tx.update(orders)
                    .set({
                        status: 'REFUNDED',
                        updatedAt: new Date(),
                    } as any)
                    .where(eq(orders.id, refund.orderId));
            }

            const [existingRefundPayment] = await tx.select({ id: payments.id })
                .from(payments)
                .where(and(eq(payments.orderId, refund.orderId), eq(payments.referenceNumber, refund.id)))
                .top(1);
            if (existingRefundPayment) {
                paymentId = existingRefundPayment.id;
            } else {
                await tx.insert(payments).values({
                    id: paymentId,
                    orderId: refund.orderId,
                    method: refund.refundMethod === 'ORIGINAL_PAYMENT' ? 'REFUND' : refund.refundMethod,
                    amount: -refund.refundAmount, // Negative amount for refund
                    referenceNumber: refund.id,
                    status: 'COMPLETED',
                    processedBy,
                    createdAt: new Date(),
                }).onConflictDoNothing();
            }
        });

        // 3. Record signed audit log
        await createSignedAuditLog({
            eventType: 'REFUND_PROCESSED',
            userId: processedBy,
            branchId: refund.branchId,
            payload: {
                refundId: refund.id,
                orderId: refund.orderId,
                type: refund.type,
                amount: refund.refundAmount,
                method: refund.refundMethod,
                reason: refund.reason,
                items: refund.items?.length || 0,
            },
            reason: refund.reason,
        });

        // 4. Update refund status
        refund.status = 'PROCESSED';
        refund.processedAt = new Date().toISOString();
        refund.processedBy = processedBy;
        refund.paymentRefId = paymentId;
        refund.updatedAt = new Date().toISOString();

        await syncRefundRecordBestEffort(refund);
        await writeSetting(REFUND_KEY, refunds, processedBy);

        // 5. Claw back loyalty points awarded for this order (best-effort).
        if (order.customerId) {
            const { loyaltyService } = await import('./loyaltyService');
            await loyaltyService.clawbackPoints(
                String(order.customerId), Number(refund.refundAmount || order.total || 0),
                String(order.id), refund.branchId,
            ).catch(() => undefined);
        }

        // 5. Trigger ETA fiscal submission for refund (Credit Note)
        setTimeout(() => {
            submitOrderToFiscal(refund.orderId, {
                isReturn: true,
                originalReceiptNumber: refund.orderId, // In this system, orderId is the receipt number
                force: true // Always force submit refunds even if original sale was submitted
            }).catch(err => {
                log.error({ refundId: refund.id, err: err.message }, 'Failed to submit refund to ETA');
            });
        }, 0);

        return refund;
    },

    // =========================================================================
    // Refund Statistics
    // =========================================================================
    async getRefundStats(branchId?: string, startDate?: string, endDate?: string) {
        let refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);

        if (branchId) refunds = refunds.filter(r => r.branchId === branchId);
        if (startDate) refunds = refunds.filter(r => r.createdAt >= startDate);
        if (endDate) refunds = refunds.filter(r => r.createdAt <= endDate);

        const processed = refunds.filter(r => r.status === 'PROCESSED');
        const totalRefunded = processed.reduce((sum, r) => sum + Number((r as any).refundAmount || 0), 0);

        const byCategory: Record<string, { count: number; amount: number }> = {};
        for (const r of processed) {
            const key = (r as any).reasonCategory || 'OTHER';
            if (!byCategory[key]) byCategory[key] = { count: 0, amount: 0 };
            byCategory[key].count++;
            byCategory[key].amount += Number((r as any).refundAmount || 0);
        }

        // Frontend legacy shape: reasonBreakdown + top reason
        const reasonBreakdown = Object.entries(byCategory).map(([reason, v]) => ({
            reason,
            count: v.count,
            amount: Math.round(v.amount * 100) / 100,
        })).sort((a, b) => b.count - a.count);
        const top = reasonBreakdown[0];

        // Total orders for refund-rate (best-effort; 0 when DB unavailable)
        let totalOrders = 0;
        try {
            const conditions = [];
            if (branchId) conditions.push(eq(orders.branchId, branchId));
            const [row]: any[] = conditions.length > 0
                ? await db.select({ totalOrders: sql<number>`count(*)` }).from(orders).where(and(...conditions))
                : await db.select({ totalOrders: sql<number>`count(*)` }).from(orders);
            totalOrders = Number(row?.totalOrders || 0);
        } catch {
            totalOrders = 0;
        }

        const totalAmount = Math.round(totalRefunded * 100) / 100;
        return {
            totalRefunds: processed.length,
            totalAmount,
            // Aliases consumed by RefundManager stats tab
            totalRefundedAmount: totalAmount,
            totalOrders,
            refundRate: totalOrders > 0 ? Math.round((processed.length / totalOrders) * 1000) / 10 : 0,
            pendingCount: refunds.filter(r => r.status === 'PENDING' || (r as any).status === 'REQUESTED').length,
            approvedCount: refunds.filter(r => r.status === 'APPROVED').length,
            processedCount: processed.length,
            rejectedCount: refunds.filter(r => r.status === 'REJECTED').length,
            byCategory,
            reasonBreakdown,
            topReason: top?.reason || null,
            topReasonCount: top?.count || 0,
            avgRefundAmount: processed.length > 0
                ? Math.round((totalRefunded / processed.length) * 100) / 100
                : 0,
        };
    },
};

export default refundService;
