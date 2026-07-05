import { Order, OrderItem } from '../../types';
import { requireEnv } from '../config/env';

const ETA_RIN = process.env.ETA_RIN;
const ETA_COMPANY_NAME = process.env.ETA_COMPANY_NAME || 'Restaurant Enterprise';
const ETA_BRANCH_CODE = process.env.ETA_BRANCH_CODE || '0';
const ETA_ADDRESS = {
    country: process.env.ETA_COUNTRY || 'EG',
    governate: process.env.ETA_GOVERNATE || 'Cairo',
    city: process.env.ETA_CITY || 'Cairo',
    street: process.env.ETA_STREET || '90th St',
    buildingNumber: process.env.ETA_BUILDING || 'Business Tower',
};

export const fiscalService = {
    prepareETAReceipt: (order: Order, items: OrderItem[], options?: { isReturn?: boolean, originalReceiptNumber?: string }) => {
        if (!ETA_RIN) {
            throw new Error('ETA_RIN is not configured');
        }

        const isReturn = options?.isReturn || order.status === 'REFUNDED';

        return {
            header: {
                dateTimeIssued: order.createdAt.toISOString(),
                receiptNumber: order.id,
                uuid: '',
                previousUUID: '',
                referenceOldReceiptNumber: options?.originalReceiptNumber || '',
                type: isReturn ? 'R' : 'S', // R for Return, S for Sale
            },
            seller: {
                rin: ETA_RIN,
                companyTradeName: ETA_COMPANY_NAME,
                branchCode: ETA_BRANCH_CODE,
                address: ETA_ADDRESS
            },
            buyer: {
                type: order.customerPhone ? 'P' : 'F', // P for Person, F for Foreigner/Generic
                id: order.customerPhone || '000000000',
                name: order.customerName || 'Walk-in Customer'
            },
            itemData: (items || []).map(item => ({
                description: item.name,
                itemType: 'GS1',
                itemCode: item.fiscalCode || '10001234',
                unitType: 'EA',
                quantity: item.quantity,
                unitPrice: item.price,
                netSale: item.price * item.quantity,
                totalSale: item.price * item.quantity,
                total: (item.price * item.quantity) + (item.tax || 0),
                taxableItems: [
                    {
                        taxType: 'T1',
                        amount: item.tax || (item.price * item.quantity * 0.14),
                        subType: 'V001',
                        rate: 14
                    }
                ]
            })),
            totalSales: order.subtotal,
            totalVAT: order.tax,
            netAmount: order.subtotal,
            totalAmount: order.total,
            paymentMethod: order.paymentMethod === 'CASH' ? 'C' : 'K'
        };
    }
};
