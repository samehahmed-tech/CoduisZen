import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasCashierPrinterConfigured, printKitchenTicketsByRouting, printOrderReceipt, resolveKitchenPrinterIdsForItem } from '../services/posPrintOrchestrator';
import { OrderStatus, OrderType, type Order } from '../types';
import { shouldEnqueueServerCashierReceipt } from '../server/services/printQueueService';

afterEach(() => vi.unstubAllGlobals());

describe('receipt printing failure contract', () => {
    it('does not queue a second server receipt for POS orders', () => {
        expect(shouldEnqueueServerCashierReceipt(true, 'POS')).toBe(false);
        expect(shouldEnqueueServerCashierReceipt(true, 'CALL_CENTER')).toBe(true);
        expect(shouldEnqueueServerCashierReceipt(false, 'CALL_CENTER')).toBe(false);
    });

    it('rejects when no cashier printer is configured instead of reporting fake success', async () => {
        const order: Order = {
            id: 'order-1',
            branchId: 'branch-1',
            type: OrderType.TAKEAWAY,
            status: OrderStatus.PENDING,
            items: [],
            subtotal: 0,
            tax: 0,
            total: 0,
            createdAt: new Date('2026-01-01T00:00:00Z'),
        };

        await expect(printOrderReceipt({
            order,
            printers: [],
            settings: {},
            currencySymbol: 'EGP',
            lang: 'en',
            t: {},
        })).rejects.toThrow('NO_CASHIER_PRINTER_CONFIGURED');
    });

    it('recognizes a persisted primary cashier printer', () => {
        expect(hasCashierPrinterConfigured([{
            id: 'cashier-1',
            name: 'Cashier',
            type: 'NETWORK',
            address: '192.168.1.90',
            branchId: 'branch-1',
            isActive: true,
            isOnline: true,
            isPrimaryCashier: true,
        } as any], 'branch-1', {})).toBe(true);
    });

    it('never falls back kitchen tickets to a cashier-only printer', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        await printKitchenTicketsByRouting({
            order: {
                id: 'order-2',
                branchId: 'branch-1',
                type: OrderType.TAKEAWAY,
                status: OrderStatus.PENDING,
                items: [{ id: 'item-1', name: 'Burger', categoryId: 'food', quantity: 1, price: 100 } as any],
                subtotal: 100,
                tax: 0,
                total: 100,
                createdAt: new Date('2026-01-01T00:00:00Z'),
            },
            categories: [],
            printers: [{
                id: 'cashier-1',
                name: 'Cashier',
                type: 'NETWORK',
                address: '192.168.1.90',
                branchId: 'branch-1',
                role: 'CASHIER',
                roles: ['CASHIER'],
                isActive: true,
                isOnline: true,
                isPrimaryCashier: true,
            } as any],
            branchId: 'branch-1',
            settings: {},
            currencySymbol: 'EGP',
            lang: 'en',
            t: {},
        });

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('routes an item to its own printers before its category defaults', () => {
        const printers = ['item-a', 'item-b', 'category-a'].map(id => ({
            id,
            name: id,
            type: 'NETWORK',
            address: `192.168.1.${id.length}`,
            branchId: 'branch-1',
            role: 'KITCHEN',
            roles: ['KITCHEN'],
            isActive: true,
            isOnline: true,
        } as any));
        const categoryMap = new Map([['food', {
            id: 'food',
            name: 'Food',
            items: [],
            menuIds: [],
            printerIds: ['category-a'],
        }]]);

        const resolved = resolveKitchenPrinterIdsForItem(
            { id: 'item-1', name: 'Burger', categoryId: 'food', quantity: 1, price: 100, printerIds: ['item-a', 'item-b'] } as any,
            categoryMap,
            printers,
            printers,
            1,
        );

        expect(resolved).toEqual(['item-a', 'item-b']);
    });

    it('uses category printers when the item has no explicit route', () => {
        const printer = {
            id: 'category-a', name: 'Kitchen', type: 'NETWORK', address: '192.168.1.91',
            branchId: 'branch-1', role: 'KITCHEN', roles: ['KITCHEN'], isActive: true, isOnline: true,
        } as any;
        const categoryMap = new Map([['food', {
            id: 'food', name: 'Food', items: [], menuIds: [], printerIds: ['category-a'],
        }]]);

        expect(resolveKitchenPrinterIdsForItem(
            { id: 'item-1', name: 'Burger', categoryId: 'food', quantity: 1, price: 100 } as any,
            categoryMap,
            [printer],
            [printer],
            2,
        )).toEqual(['category-a']);
    });
});
