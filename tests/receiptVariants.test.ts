import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateHtmlFromTemplate } from '../services/templateReceiptGenerator';
import { OrderType } from '../types';

const VARIANTS = [
    'royal', 'neo', 'ledger', 'express',
    'zen', 'modular', 'card', 'arabic', 'split', 'timeline',
    'ultra', 'signature', 'qrhero', 'negative', 'geometric', 'glance',
];

const baseBlocks = (extraQr = {}) => [
    { id: 'logo', type: 'logo', enabled: true, label: 'Logo', labelAr: 'لوجو', config: {} },
    { id: 'header', type: 'header', enabled: true, label: 'Header', labelAr: 'رأس', config: { showBranch: true, showAddress: true, showPhone: true } },
    { id: 'title', type: 'title', enabled: true, label: 'Title', labelAr: 'عنوان', config: { text: 'Sales Receipt', textAr: 'إيصال بيع' } },
    { id: 'orderInfo', type: 'orderInfo', enabled: true, label: 'Order', labelAr: 'طلب', config: { showOrderNum: true, showType: true, showDate: true, showTime: true, showCashier: true } },
    { id: 'customerInfo', type: 'customerInfo', enabled: true, label: 'Customer', labelAr: 'عميل', config: { showTable: true, showCustomer: true, showPhone: true, showAddress: true } },
    { id: 'items', type: 'items', enabled: true, label: 'Items', labelAr: 'أصناف', config: { showModifiers: true, showNotes: true, showPrice: true, showQty: true } },
    { id: 'totals', type: 'totals', enabled: true, label: 'Totals', labelAr: 'إجمالي', config: { showSubtotal: true, showDiscount: true, showTax: true, showTotal: true, showTip: true } },
    { id: 'payment', type: 'payment', enabled: true, label: 'Payment', labelAr: 'دفع', config: {} },
    { id: 'qrCode', type: 'qrCode', enabled: true, label: 'QR', labelAr: 'QR', config: extraQr },
    { id: 'footer', type: 'footer', enabled: true, label: 'Footer', labelAr: 'ختام', config: { showTaxId: true, showPoweredBy: true } },
];

const demoOrder = {
    id: 'order-1042', orderNumber: 1042, type: OrderType.DINE_IN, branchId: 'b1',
    tableId: 't5', tableName: 'طاولة 5', customerName: 'أحمد محمد', customerPhone: '01000000000',
    cashierName: 'كريم',
    items: [
        { cartId: 'c1', id: 'i1', name: 'Beef Shawarma', nameAr: 'شاورما لحمة', quantity: 2, price: 60, selectedModifiers: [] },
        { cartId: 'c2', id: 'i2', name: 'Cola', nameAr: 'كنز', quantity: 1, price: 45, selectedModifiers: [] },
    ],
    status: 'PREPARING', subtotal: 165, discount: 0, tax: 23.1, total: 188.1, tipAmount: 0,
    paymentMethod: 'CASH', createdAt: new Date('2026-09-27T21:00:00'),
} as any;

const demoSettings = {
    restaurantName: 'Coduis Zen', phone: '01000000000', branchAddress: 'الفرع الرئيسي',
    receiptQrUrl: 'https://example.test/rate', taxRate: 14, serviceCharge: 0,
    taxRegistrationNumber: '123-456-789',
} as any;

const render = (variant: string, lang: 'ar' | 'en' = 'ar') =>
    generateHtmlFromTemplate({
        template: {
            id: `tpl-${variant}`, name: variant, nameAr: variant, type: 'receipt',
            blocks: baseBlocks(), fontSize: 'normal', paperWidth: '80mm', showLogo: true,
            linkedPrinterIds: [], linkedDepartments: [], isDefault: true,
            createdAt: new Date(0).toISOString(), styleVariant: variant,
        } as any,
        order: demoOrder, settings: demoSettings, currencySymbol: 'EGP', lang,
    });

describe('receipt design schools (16 variants)', () => {
    for (const variant of VARIANTS) {
        it(`renders ${variant} with full data (ar)`, () => {
            const html = render(variant, 'ar');
            expect(html).toContain(`receipt-${variant}`);
            expect(html).toContain('1042');
            expect(html).toContain('188.10');
            expect(html).toContain('شاورما لحمة');
            expect(html).toContain('data:image/svg+xml');
        });
        it(`renders ${variant} in english`, () => {
            const html = render(variant, 'en');
            expect(html).toContain(`receipt-${variant}`);
            expect(html).toContain('1042');
            expect(html).toContain('Beef Shawarma');
        });
    }

    it('keeps every school thermal-printable (no gradients/shadows)', () => {
        for (const variant of VARIANTS) {
            const html = render(variant, 'ar');
            expect(html, variant).not.toContain('linear-gradient');
            expect(html, variant).not.toContain('box-shadow');
            expect(html, variant).not.toContain('text-shadow');
        }
    });

    it('split school numbers its chapters', () => {
        const html = render('split', 'ar');
        expect(html).toContain('chapter-num');
        expect(html).toContain('01');
        expect(html).toContain('03');
    });

    it('timeline school renders node flow without tables', () => {
        const html = render('timeline', 'ar');
        expect(html).toContain('tl-item');
        expect(html).toContain('tl-node');
    });

    it('card school stacks products instead of tabling them', () => {
        const html = render('card', 'ar');
        expect(html).toContain('stack-item');
        expect(html).not.toContain('<table class="items-table"');
    });

    it('qrhero school renders the largest QR', () => {
        const hero = render('qrhero', 'ar');
        const ultra = render('ultra', 'ar');
        const heroSize = Number(hero.match(/qr-image"[^>]*width="(\d+)"/)?.[1] || 0);
        const ultraSize = Number(ultra.match(/qr-image"[^>]*width="(\d+)"/)?.[1] || 0);
        expect(heroSize).toBe(280);
        expect(ultraSize).toBe(140);
        expect(heroSize).toBeGreaterThan(ultraSize);
    });
});

describe('kitchen templates (kitchen-mode)', () => {
    const renderKitchen = (variant: string, lang: 'ar' | 'en' = 'ar') =>
        generateHtmlFromTemplate({
            template: {
                id: `tpl-k-${variant}`, name: variant, nameAr: variant, type: 'kitchen',
                blocks: [
                    { id: 'title', type: 'title', enabled: true, label: 'Title', labelAr: 'عنوان', config: { text: 'KITCHEN TICKET', textAr: 'تذكرة المطبخ' } },
                    { id: 'orderInfo', type: 'orderInfo', enabled: true, label: 'Order', labelAr: 'طلب', config: { showOrderNum: true, showType: true, showDate: true, showTime: true, showCashier: true } },
                    { id: 'customerInfo', type: 'customerInfo', enabled: true, label: 'Customer', labelAr: 'عميل', config: { showTable: true, showCustomer: true, showPhone: true, showAddress: false } },
                    { id: 'items', type: 'items', enabled: true, label: 'Items', labelAr: 'أصناف', config: { showModifiers: true, showNotes: true, showPrice: true, showQty: true } },
                    { id: 'totals', type: 'totals', enabled: true, label: 'Totals', labelAr: 'إجمالي', config: { showSubtotal: true, showDiscount: true, showTax: true, showTotal: true, showTip: false } },
                    { id: 'payment', type: 'payment', enabled: true, label: 'Payment', labelAr: 'دفع', config: {} },
                    { id: 'qrCode', type: 'qrCode', enabled: true, label: 'QR', labelAr: 'QR', config: {} },
                    { id: 'footer', type: 'footer', enabled: true, label: 'Footer', labelAr: 'ختام', config: {} },
                ],
                fontSize: 'large', paperWidth: '80mm', showLogo: false,
                linkedPrinterIds: [], linkedDepartments: [], isDefault: true,
                createdAt: new Date(0).toISOString(), styleVariant: variant,
            } as any,
            order: demoOrder, settings: demoSettings, currencySymbol: 'EGP', lang,
        });

    for (const variant of ['royal', 'zen', 'timeline', 'ultra', 'glance', 'card']) {
        it(`kitchen ${variant} shows items with zero money`, () => {
            const html = renderKitchen(variant, 'ar');
            expect(html).toContain('kitchen-mode');
            expect(html).toContain('شاورما لحمة');
            expect(html).toContain('1042');
            expect(html).not.toContain('188.10');
            expect(html).not.toContain('EGP');
            expect(html).not.toContain('<table class="summary-table"');
            expect(html).not.toContain('<span class="payment-pill">');
            expect(html).not.toContain('<img class="qr-image"');
            expect(html).not.toContain('linear-gradient');
        });
    }

    it('kitchen timeline uses node flow', () => {
        expect(renderKitchen('timeline', 'ar')).toContain('tl-node');
    });

    it('kitchen card stacks without prices', () => {
        const html = renderKitchen('card', 'ar');
        expect(html).toContain('stack-item');
        expect(html).not.toContain('<table class="items-table"');
    });

    it('flex/grid children can shrink (RTL left-edge clip guard)', () => {
        const src = readFileSync(resolve(process.cwd(), 'services/templateReceiptGenerator.ts'), 'utf8');
        expect(src).toContain('.twocol-cell, .meta-row > *');
        expect(src).toContain('min-width: 0');
        // Long data must survive generation intact in the risky schools.
        const longName = 'عبد الرحمن محمد عبد الله السيد أحمد الشريف';
        for (const variant of ['modular', 'arabic', 'split', 'glance']) {
            const html = generateHtmlFromTemplate({
                template: {
                    id: `tpl-${variant}`, name: variant, nameAr: variant, type: 'receipt',
                    blocks: baseBlocks(), fontSize: 'normal', paperWidth: '80mm', showLogo: false,
                    linkedPrinterIds: [], linkedDepartments: [], isDefault: true,
                    createdAt: new Date(0).toISOString(), styleVariant: variant,
                } as any,
                order: { ...demoOrder, customerName: longName } as any,
                settings: demoSettings, currencySymbol: 'EGP', lang: 'ar',
            });
            expect(html, variant).toContain(longName);
        }
    });
});
