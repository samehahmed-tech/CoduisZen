import { db } from '../db';
import { chartOfAccounts, postingRules, paymentMethodAccounts, taxAccounts } from '../../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const standardCOA = [
    // 1xxxx Assets
    { code: '1230', name: 'Employee Loans Receivable', nameAr: 'سلف وقروض الموظفين', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1200' },
    { code: '1000', name: 'Total Assets', nameAr: 'إجمالي الأصول', type: 'ASSET', normalBalance: 'DEBIT', isControlAccount: true },
    { code: '1100', name: 'Current Assets', nameAr: 'الأصول المتداولة', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1000', isControlAccount: true },
    { code: '1110', name: 'Main Cash', nameAr: 'الخزينة الرئيسية', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1100' },
    { code: '1120', name: 'Petty Cash', nameAr: 'العهدة النقدية', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1100' },
    { code: '1130', name: 'Bank Current Account', nameAr: 'حساب البنك الجاري', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1100' },
    { code: '1140', name: 'Payment Gateway Clearing', nameAr: 'تسويات وسائل الدفع', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1100' },
    { code: '1200', name: 'Inventory Assets', nameAr: 'أصول المخزون', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1000', isControlAccount: true },
    { code: '1210', name: 'Raw Materials Inventory', nameAr: 'مخزون المواد الخام', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1200' },
    { code: '1220', name: 'Finished Goods Inventory', nameAr: 'مخزون الإنتاج التام', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1200' },
    { code: '1300', name: 'Accounts Receivable', nameAr: 'العملاء', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1000', isControlAccount: true },
    { code: '1500', name: 'Fixed Assets', nameAr: 'الأصول الثابتة', type: 'ASSET', normalBalance: 'DEBIT', parentId: '1000', isControlAccount: true },

    // 2xxxx Liabilities
    { code: '2110', name: 'Payroll Payable', nameAr: 'مستحقات الرواتب', type: 'LIABILITY', normalBalance: 'CREDIT', parentId: '2000' },
    { code: '2000', name: 'Total Liabilities', nameAr: 'إجمالي الخصوم', type: 'LIABILITY', normalBalance: 'CREDIT', isControlAccount: true },
    { code: '2100', name: 'Accounts Payable', nameAr: 'الموردين', type: 'LIABILITY', normalBalance: 'CREDIT', parentId: '2000', isControlAccount: true },
    { code: '2200', name: 'Tax Liabilities', nameAr: 'الالتزامات الضريبية', type: 'LIABILITY', normalBalance: 'CREDIT', parentId: '2000', isControlAccount: true },
    { code: '2210', name: 'VAT Payable (Output)', nameAr: 'ضريبة القيمة المضافة (مبيعات)', type: 'LIABILITY', normalBalance: 'CREDIT', parentId: '2200' },
    { code: '2220', name: 'VAT Receivable (Input)', nameAr: 'ضريبة القيمة المضافة (مشتريات)', type: 'ASSET', normalBalance: 'DEBIT', parentId: '2200' },
    
    // 3xxxx Equity
    { code: '3000', name: 'Total Equity', nameAr: 'إجمالي حقوق الملكية', type: 'EQUITY', normalBalance: 'CREDIT', isControlAccount: true },
    { code: '3100', name: 'Capital', nameAr: 'رأس المال', type: 'EQUITY', normalBalance: 'CREDIT', parentId: '3000' },
    { code: '3200', name: 'Retained Earnings', nameAr: 'الأرباح المحتجزة', type: 'EQUITY', normalBalance: 'CREDIT', parentId: '3000' },

    // 4xxxx Revenue
    { code: '4300', name: 'Other Income', nameAr: 'إيرادات أخرى', type: 'REVENUE', normalBalance: 'CREDIT', parentId: '4000' },
    { code: '4000', name: 'Total Revenue', nameAr: 'إجمالي الإيرادات', type: 'REVENUE', normalBalance: 'CREDIT', isControlAccount: true },
    { code: '4100', name: 'Dine-In Sales', nameAr: 'مبيعات الصالة', type: 'REVENUE', normalBalance: 'CREDIT', parentId: '4000' },
    { code: '4110', name: 'Takeaway Sales', nameAr: 'مبيعات التيك أواي', type: 'REVENUE', normalBalance: 'CREDIT', parentId: '4000' },
    { code: '4120', name: 'Delivery Sales', nameAr: 'مبيعات التوصيل', type: 'REVENUE', normalBalance: 'CREDIT', parentId: '4000' },
    { code: '4200', name: 'Service Charge Income', nameAr: 'إيرادات الخدمة', type: 'REVENUE', normalBalance: 'CREDIT', parentId: '4000' },

    // 5xxxx Cost of Sales
    { code: '5000', name: 'Cost of Goods Sold', nameAr: 'تكلفة البضاعة المباعة', type: 'EXPENSE', normalBalance: 'DEBIT', isControlAccount: true },
    { code: '5100', name: 'Raw Material Consumption', nameAr: 'استهلاك المواد الخام', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: '5000' },
    { code: '5110', name: 'Inventory Consumption Cost', nameAr: 'تكلفة استهلاك المخزون', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: '5100' },
    { code: '5140', name: 'Wastage Cost', nameAr: 'تكلفة الهالك', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: '5000' },

    // 6xxxx Expenses
    { code: '6000', name: 'Operating Expenses', nameAr: 'المصروفات التشغيلية', type: 'EXPENSE', normalBalance: 'DEBIT', isControlAccount: true },
    { code: '6100', name: 'Salaries and Wages', nameAr: 'الرواتب والأجور', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: '6000' },
    { code: '6200', name: 'Utilities', nameAr: 'المرافق', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: '6000' },
    { code: '6300', name: 'Rent', nameAr: 'الإيجار', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: '6000' }
];

const defaultPostingRules = [
    // --- POS SALE RULES ---
    // Debit cash or bank for the total amount
    { documentType: 'POS_SALE', amountSource: 'TOTAL', direction: 'DEBIT', accountCode: '{PAYMENT_METHOD}' },
    
    // Credit Revenue accounts based on Order Type
    { documentType: 'POS_SALE', amountSource: 'SUBTOTAL', direction: 'CREDIT', accountCode: '4100', conditionField: 'orderType', conditionValue: 'DINE_IN' },
    { documentType: 'POS_SALE', amountSource: 'SUBTOTAL', direction: 'CREDIT', accountCode: '4110', conditionField: 'orderType', conditionValue: 'TAKEAWAY' },
    { documentType: 'POS_SALE', amountSource: 'SUBTOTAL', direction: 'CREDIT', accountCode: '4120', conditionField: 'orderType', conditionValue: 'DELIVERY' },
    
    // Credit Tax and Service
    { documentType: 'POS_SALE', amountSource: 'TAX', direction: 'CREDIT', accountCode: '{TAX_OUTPUT}' },
    { documentType: 'POS_SALE', amountSource: 'SERVICE_CHARGE', direction: 'CREDIT', accountCode: '4200' },

    // --- POS REFUND RULES ---
    // Perfect reversal of POS SALE
    { documentType: 'POS_REFUND', amountSource: 'TOTAL', direction: 'CREDIT', accountCode: '{PAYMENT_METHOD}' },
    { documentType: 'POS_REFUND', amountSource: 'SUBTOTAL', direction: 'DEBIT', accountCode: '4100', conditionField: 'orderType', conditionValue: 'DINE_IN' },
    { documentType: 'POS_REFUND', amountSource: 'SUBTOTAL', direction: 'DEBIT', accountCode: '4110', conditionField: 'orderType', conditionValue: 'TAKEAWAY' },
    { documentType: 'POS_REFUND', amountSource: 'SUBTOTAL', direction: 'DEBIT', accountCode: '4120', conditionField: 'orderType', conditionValue: 'DELIVERY' },
    { documentType: 'POS_REFUND', amountSource: 'TAX', direction: 'DEBIT', accountCode: '{TAX_OUTPUT}' },
    { documentType: 'POS_REFUND', amountSource: 'SERVICE_CHARGE', direction: 'DEBIT', accountCode: '4200' },

    // --- PAYROLL RULES ---
    { documentType: 'PAYROLL', amountSource: 'GROSS_PAY', direction: 'DEBIT', accountCode: '6100' },
    { documentType: 'PAYROLL', amountSource: 'NET_PAY', direction: 'CREDIT', accountCode: '2110' },
    { documentType: 'PAYROLL', amountSource: 'LOAN_DEDUCTIONS', direction: 'CREDIT', accountCode: '1230' },
    { documentType: 'PAYROLL', amountSource: 'PENALTIES', direction: 'CREDIT', accountCode: '4300' },
    { documentType: 'PAYROLL', amountSource: 'OTHER_DEDUCTIONS', direction: 'CREDIT', accountCode: '2100' },
];

export const COASeedService = {
    async seed() {
        console.log('[COA Seed] Starting Chart of Accounts seeding...');
        // 1. Insert any missing accounts
        for (const acc of standardCOA) {
            const [existingAccount] = await db
                .select({ id: chartOfAccounts.id })
                .top(1)
                .from(chartOfAccounts)
                .where(eq(chartOfAccounts.code, acc.code));

            if (existingAccount) {
                await db.update(chartOfAccounts)
                    .set({
                        name: acc.name,
                        nameAr: acc.nameAr,
                        type: acc.type,
                        normalBalance: acc.normalBalance,
                        isControlAccount: acc.isControlAccount || false,
                    })
                    .where(eq(chartOfAccounts.id, existingAccount.id));
                continue;
            }

            const accountToInsert: any = {
                id: randomUUID(),
                code: acc.code,
                name: acc.name,
                nameAr: acc.nameAr,
                type: acc.type,
                normalBalance: acc.normalBalance,
                isControlAccount: acc.isControlAccount || false,
            };
            await db.insert(chartOfAccounts).values(accountToInsert);
        }

        // 2. Resolve Parents
        const allAccs = await db.select().from(chartOfAccounts);
        const codeMap = new Map(allAccs.map(a => [a.code, a.id]));

        for (const acc of standardCOA) {
            if (acc.parentId) {
                const pId = codeMap.get(acc.parentId);
                const selfId = codeMap.get(acc.code);
                if (pId && selfId) {
                    await db.update(chartOfAccounts).set({ parentId: pId }).where(eq(chartOfAccounts.id, selfId));
                }
            }
        }

        // 3. Seed Default Payment Mappings
        const cashAccId = codeMap.get('1110');
        const visaAccId = codeMap.get('1140');
        if (cashAccId) {
            await db.insert(paymentMethodAccounts)
                .values({ paymentMethod: 'CASH', accountId: cashAccId })
                .onConflictDoNothing();
        }
        if (visaAccId) {
            await db.insert(paymentMethodAccounts)
                .values({ paymentMethod: 'VISA', accountId: visaAccId })
                .onConflictDoNothing();
            await db.insert(paymentMethodAccounts)
                .values({ paymentMethod: 'MASTERCARD', accountId: visaAccId })
                .onConflictDoNothing();
            await db.insert(paymentMethodAccounts)
                .values({ paymentMethod: 'VODAFONE_CASH', accountId: visaAccId })
                .onConflictDoNothing();
        }

        // 4. Seed Default Tax Mappings
        const taxOutId = codeMap.get('2210');
        if (taxOutId) {
            const [existingOutputVat] = await db
                .select({ id: taxAccounts.id })
                .top(1)
                .from(taxAccounts)
                .where(and(
                    eq(taxAccounts.taxType, 'OUTPUT_VAT'),
                    eq(taxAccounts.rate, 14),
                ));

            if (!existingOutputVat) {
                await db.insert(taxAccounts).values({ taxType: 'OUTPUT_VAT', accountId: taxOutId, rate: 14 });
            }
        }

        // 5. Seed Posting Rules
        for (const rule of defaultPostingRules) {
            await db.insert(postingRules).values({
                id: `PR_${rule.documentType}_${rule.amountSource}_${rule.direction}_${rule.conditionValue || 'ANY'}`,
                documentType: rule.documentType,
                amountSource: rule.amountSource,
                direction: rule.direction,
                accountCode: rule.accountCode,
                conditionField: rule.conditionField,
                conditionValue: rule.conditionValue,
                isSystem: true,
                isActive: true
            }).onConflictDoNothing();
        }

        console.log('[COA Seed] Completed seeding Chart of Accounts, mappings, and posting rules.');
    }
};
