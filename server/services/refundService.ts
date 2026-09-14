/**
 * Refund Service — POS Refund Workflow
 * Implements: Section 7 (POS) of the ERP Launch Readiness Checklist
 *
 * Flow: Request → Manager Approval → Process → Post to Finance → Audit Log
 */

import { db } from '../db';
import { orders, orderItems, payments, auditLogs, settings, paymentMethodAccounts, chartOfAccounts } from '../../src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { GLService } from './glService';
import { submitOrderToFiscal } from './fiscalSubmitService';
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
    refundMethod: RefundMethod;
    // Items (for partial/item refunds)
    items?: RefundItem[];
    // Reason
    reason: string;
    reasonCategory: 'QUALITY' | 'WRONG_ORDER' | 'CUSTOMER_REQUEST' | 'OVERCHARGE' | 'OTHER';
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
    reason?: string;
}

export interface RefundPolicy {
    maxRefundWindowHours: number; // How many hours after order can refund be requested
    maxRefundWithoutApproval: number; // Amount below which no manager approval needed
    requireManagerPin: boolean;
    allowPartialRefund: boolean;
    allowItemRefund: boolean;
    autoRestockOnRefund: boolean;
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

    // =========================================================================
    // Policy
    // =========================================================================
    async getPolicy(): Promise<RefundPolicy> {
        return readSetting<RefundPolicy>(REFUND_POLICY_KEY, defaultPolicy());
    },

    async updatePolicy(policy: Partial<RefundPolicy>, updatedBy?: string): Promise<RefundPolicy> {
        const current = await this.getPolicy();
        const updated = { ...current, ...policy };
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
        if (filters?.startDate) refunds = refunds.filter(r => r.createdAt >= filters.startDate!);
        if (filters?.endDate) refunds = refunds.filter(r => r.createdAt <= filters.endDate!);

        return refunds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    async getRefundById(id: string): Promise<RefundRequest | null> {
        const refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        return refunds.find(r => r.id === id) || null;
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

        if (data.type === 'FULL') {
            refundAmount = Number(order.total || 0);
        } else if (data.type === 'PARTIAL' && data.customAmount) {
            if (!policy.allowPartialRefund) throw new Error('Partial refunds are not enabled');
            refundAmount = data.customAmount;
            if (refundAmount > Number(order.total || 0)) {
                throw new Error('Refund amount exceeds order total');
            }
        } else if (data.type === 'ITEM' && data.items) {
            if (!policy.allowItemRefund) throw new Error('Item-level refunds are not enabled');

            const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, data.orderId));
            refundItems = [];

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

                const itemRefundAmount = Number(orderItem.price || 0) * item.quantity;
                refundAmount += itemRefundAmount;

                refundItems.push({
                    orderItemId: item.orderItemId,
                    menuItemName: orderItem.name,
                    quantity: item.quantity,
                    unitPrice: Number(orderItem.price || 0),
                    refundAmount: itemRefundAmount,
                    reason: item.reason,
                });
            }
        } else {
            throw new Error('Invalid refund type or missing data');
        }
        if (alreadyRefundedAmount + refundAmount > Number(order.total || 0)) {
            throw new Error('Cumulative refund amount exceeds order total');
        }

        // Determine if auto-approved (below threshold)
        const needsApproval = policy.requireManagerPin || refundAmount > policy.maxRefundWithoutApproval;

        const refund: RefundRequest = {
            id: `REF-${Date.now()}`,
            orderId: data.orderId,
            orderNumber: Number(order.orderNumber || 0),
            branchId: order.branchId,
            type: data.type,
            status: needsApproval ? 'PENDING' : 'APPROVED',
            originalAmount: Number(order.total || 0),
            refundAmount,
            refundMethod: data.refundMethod,
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
        await writeSetting(REFUND_KEY, existingRefunds, data.requestedBy);

        // Auto-process if auto-approved
        if (!needsApproval) {
            return this.processRefund(refund.id, data.requestedBy);
        }

        return refund;
    },

    // =========================================================================
    // Approve / Reject
    // =========================================================================
    async approveRefund(refundId: string, approvedBy: string, approvedByName: string): Promise<RefundRequest> {
        const refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const refund = refunds.find(r => r.id === refundId);
        if (!refund) throw new Error('Refund not found');
        if (refund.status !== 'PENDING' && refund.status !== 'REQUESTED') throw new Error('Refund is not pending approval');

        refund.status = 'APPROVED';
        refund.approvedBy = approvedBy;
        refund.approvedByName = approvedByName;
        refund.updatedAt = new Date().toISOString();

        await writeSetting(REFUND_KEY, refunds, approvedBy);
        return refund;
    },

    async rejectRefund(refundId: string, rejectedBy: string, reason: string): Promise<RefundRequest> {
        const refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const refund = refunds.find(r => r.id === refundId);
        if (!refund) throw new Error('Refund not found');
        if (refund.status !== 'PENDING' && refund.status !== 'REQUESTED') throw new Error('Refund is not pending approval');

        refund.status = 'REJECTED';
        refund.approvedBy = rejectedBy;
        refund.rejectionReason = reason;
        refund.updatedAt = new Date().toISOString();

        await writeSetting(REFUND_KEY, refunds, rejectedBy);
        return refund;
    },

    // =========================================================================
    // Process Refund
    // =========================================================================
    async processRefund(refundId: string, processedBy: string): Promise<RefundRequest> {
        const refunds = await readSetting<RefundRequest[]>(REFUND_KEY, []);
        const refund = refunds.find(r => r.id === refundId);
        if (!refund) throw new Error('Refund not found');
        if (refund.status !== 'APPROVED') throw new Error('Refund is not approved');

        const [order] = await db.select().from(orders).where(eq(orders.id, refund.orderId));
        if (!order) throw new Error('Order not found for refund');

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
            lines: [
                { accountCode: '4100', debit: netRefund, credit: 0 },
                ...(taxRatio > 0 ? [{ accountCode: '2210', debit: taxRatio, credit: 0 }] : []),
                { accountCode: cashAccount, debit: 0, credit: Number(refund.refundAmount || 0) },
            ],
        });
        if (!financeResult || typeof financeResult === 'string' || !(financeResult as any).entryId) {
            throw new Error('REFUND_FINANCE_POSTING_FAILED');
        }

        // 1. Update order status if full refund
        if (refund.type === 'FULL') {
            await db.update(orders)
                .set({
                    status: 'REFUNDED',
                    updatedAt: new Date(),
                } as any)
                .where(eq(orders.id, refund.orderId));
        }

        // 2. Record refund payment
        const paymentId = `PAY-REF-${Date.now()}`;
        await db.insert(payments).values({
            id: paymentId,
            orderId: refund.orderId,
            method: refund.refundMethod === 'ORIGINAL_PAYMENT' ? 'REFUND' : refund.refundMethod,
            amount: -refund.refundAmount, // Negative amount for refund
            referenceNumber: refund.id,
            status: 'COMPLETED',
            processedBy,
            createdAt: new Date(),
        });

        // 3. Record audit log
        await db.insert(auditLogs).values({
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
            createdAt: new Date(),
        });

        // 4. Update refund status
        refund.status = 'PROCESSED';
        refund.processedAt = new Date().toISOString();
        refund.processedBy = processedBy;
        refund.paymentRefId = paymentId;
        refund.updatedAt = new Date().toISOString();

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
        const totalRefunded = processed.reduce((sum, r) => sum + r.refundAmount, 0);

        const byCategory: Record<string, { count: number; amount: number }> = {};
        for (const r of processed) {
            if (!byCategory[r.reasonCategory]) byCategory[r.reasonCategory] = { count: 0, amount: 0 };
            byCategory[r.reasonCategory].count++;
            byCategory[r.reasonCategory].amount += r.refundAmount;
        }

        return {
            totalRefunds: processed.length,
            totalAmount: Math.round(totalRefunded * 100) / 100,
            pendingCount: refunds.filter(r => r.status === 'PENDING' || r.status === 'REQUESTED').length,
            rejectedCount: refunds.filter(r => r.status === 'REJECTED').length,
            byCategory,
            avgRefundAmount: processed.length > 0
                ? Math.round((totalRefunded / processed.length) * 100) / 100
                : 0,
        };
    },
};

export default refundService;
