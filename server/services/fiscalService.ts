import { Order, OrderItem } from '../../types';
import { requireEnv } from '../config/env';

export const FISCAL_SELLER_ENV_KEYS = [
    'ETA_RIN',
    'ETA_COMPANY_NAME',
    'ETA_BRANCH_CODE',
    'ETA_COUNTRY',
    'ETA_GOVERNATE',
    'ETA_CITY',
    'ETA_STREET',
    'ETA_BUILDING',
] as const;

export const fiscalService = {
    prepareETAReceipt: (order: Order, items: OrderItem[], options?: { isReturn?: boolean, originalReceiptNumber?: string }) => {
        const seller = {
            rin: requireEnv('ETA_RIN'),
            companyTradeName: requireEnv('ETA_COMPANY_NAME'),
            branchCode: requireEnv('ETA_BRANCH_CODE'),
            address: {
                country: requireEnv('ETA_COUNTRY'),
                governate: requireEnv('ETA_GOVERNATE'),
                city: requireEnv('ETA_CITY'),
                street: requireEnv('ETA_STREET'),
                buildingNumber: requireEnv('ETA_BUILDING'),
            },
        };
        const isReturn = options?.isReturn || order.status === 'REFUNDED';

        const itemData = (items || []).map(item => {
            const itemCode = String(item.fiscalCode || '').trim();
            if (!itemCode) throw new Error(`FISCAL_ITEM_CODE_MISSING: ${item.name}`);

            const quantity = Number(item.quantity || 0);
            const unitPrice = Number(item.price || 0);
            const netSale = Number((quantity * unitPrice).toFixed(2));
            const taxAmount = Number(Number(item.tax || 0).toFixed(2));
            const taxRate = netSale > 0 ? Number(((taxAmount / netSale) * 100).toFixed(4)) : 0;

            return {
                description: item.name,
                itemType: /^\d{8,14}$/.test(itemCode) ? 'GS1' : 'EGS',
                itemCode,
                unitType: 'EA',
                quantity,
                unitPrice,
                netSale,
                totalSale: netSale,
                total: Number((netSale + taxAmount).toFixed(2)),
                taxableItems: taxAmount > 0 ? [{
                    taxType: 'T1',
                    amount: taxAmount,
                    subType: 'V001',
                    rate: taxRate,
                }] : [],
            };
        });

        return {
            header: {
                dateTimeIssued: order.createdAt.toISOString(),
                receiptNumber: order.id,
                uuid: '',
                previousUUID: '',
                referenceOldReceiptNumber: options?.originalReceiptNumber || '',
                type: isReturn ? 'R' : 'S',
            },
            seller,
            buyer: {
                type: order.customerPhone ? 'P' : 'F',
                id: order.customerPhone || '000000000',
                name: order.customerName || 'Walk-in Customer',
            },
            itemData,
            totalSales: order.subtotal,
            totalVAT: order.tax,
            netAmount: order.subtotal,
            totalAmount: order.total,
            paymentMethod: order.paymentMethod === 'CASH' ? 'C' : 'K',
        };
    },
};
