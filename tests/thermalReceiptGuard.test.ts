import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQrDataUrl, generateHtmlFromTemplate, selectReceiptTemplate } from '../services/templateReceiptGenerator';
import { OrderType } from '../types';

const templateSource = readFileSync(resolve(process.cwd(), 'services/templateReceiptGenerator.ts'), 'utf8');
const defaultReceiptSource = readFileSync(resolve(process.cwd(), 'services/receiptTemplate.ts'), 'utf8');
const receiptDesignerSource = readFileSync(resolve(process.cwd(), 'components/ReceiptDesigner.tsx'), 'utf8');
const rendererSource = readFileSync(resolve(process.cwd(), 'services/receiptImageRenderer.ts'), 'utf8');
const bridgeSource = readFileSync(resolve(process.cwd(), 'hardware-bridge/index.js'), 'utf8');
const { pngToEscPos } = createRequire(import.meta.url)('../hardware-bridge/png-raster.js') as {
    pngToEscPos: (input: Buffer) => Buffer;
};

describe('2026-07 client thermal receipt regression', () => {
    it('uses Cairo across generated receipts and the visual receipt preview', () => {
        expect(templateSource).toContain("font-family: 'Cairo'");
        expect(defaultReceiptSource).toContain("font-family: 'Cairo'");
        expect(receiptDesignerSource).toContain("\"'Cairo', system-ui, sans-serif\"");
    });
    it('selects receipt defaults by order type before the general sales default', () => {
        const templates = [
            { id: 'general', type: 'receipt', isDefault: true, linkedPrinterIds: [], blocks: [] },
            { id: 'dine-in', type: 'receipt', isDefault: false, linkedPrinterIds: [], blocks: [] },
            { id: 'delivery', type: 'receipt', isDefault: false, linkedPrinterIds: ['printer-1'], blocks: [] },
        ] as any[];

        expect(selectReceiptTemplate({
            templates,
            defaultTemplateId: 'general',
            templateByOrderType: { DINE_IN: 'dine-in' },
            orderType: OrderType.DINE_IN,
            printerId: 'printer-1',
        })?.id).toBe('dine-in');
        expect(selectReceiptTemplate({
            templates,
            defaultTemplateId: 'general',
            templateByOrderType: {},
            orderType: OrderType.TAKEAWAY,
            printerId: 'printer-1',
        })?.id).toBe('general');
    });

    it('prints the grand total as black text on white instead of reverse black fill', () => {
        for (const receiptSource of [templateSource, defaultReceiptSource]) {
            const totalStart = receiptSource.indexOf('.grand-total {');
            const totalCss = receiptSource.slice(totalStart, receiptSource.indexOf('.grand-total-label', totalStart));
            expect(totalCss).toContain('background: #fff');
            expect(totalCss).toContain('color: #000');
            expect(totalCss).toContain('border: 3px solid #111');
            expect(totalCss).not.toContain('background: #111');
        }
    });

    it('keeps only a minimal print tail so it cannot create a blank paper section', () => {
        // Bottom safe-area must stay tiny (8-10px): enough for Arabic
        // descenders + pill borders, never a blank paper section.
        expect(rendererSource).toMatch(/padding:[^;]*?(8|10)px !important/);
        expect(rendererSource).not.toContain('48px !important');
    });

    it('feeds and uses the broadly supported ESC/POS GS V B cut command', () => {
        expect(bridgeSource).toContain("const PAPER_FEED_AND_CUT = '\\x1B\\x64\\x05\\x1D\\x56\\x42\\x00'");
        expect(bridgeSource).toContain('0x1B,0x32,0x1B,0x64,0x05,0x1D,0x56,0x42,0x00');
        expect(bridgeSource).not.toContain('await cutWindowsPaper(printerName)');
    });

    it('converts network receipt PNGs directly without a temporary print file', () => {
        const onePixelPng = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            'base64',
        );
        const output = pngToEscPos(onePixelPng);

        expect(output.subarray(0, 5)).toEqual(Buffer.from([0x1b, 0x40, 0x1b, 0x33, 24]));
        expect(output.subarray(-9)).toEqual(Buffer.from([0x1b, 0x32, 0x1b, 0x64, 0x05, 0x1d, 0x56, 0x42, 0x00]));
        expect(bridgeSource).toContain("return Promise.resolve(pngToEscPos(Buffer.from(source, 'base64'), 576))");
    });

    it('renders restaurant branding from global settings in every 80mm preset', () => {
        const template = {
            id: 'preset-test', name: 'Preset', nameAr: 'قالب', type: 'receipt',
            blocks: [
                { id: 'logo', type: 'logo', enabled: true, label: 'Logo', labelAr: 'لوجو', config: {} },
                { id: 'header', type: 'header', enabled: true, label: 'Header', labelAr: 'رأس', config: {} },
                { id: 'qr', type: 'qrCode', enabled: true, label: 'QR', labelAr: 'QR', config: {} },
            ],
            fontSize: 'normal', paperWidth: '80mm', showLogo: true,
            linkedPrinterIds: [], linkedDepartments: [], isDefault: true,
            createdAt: new Date(0).toISOString(), styleVariant: 'royal',
        } as any;
        const html = generateHtmlFromTemplate({
            template,
            order: { id: 'order-1', type: 'TAKEAWAY', items: [], subtotal: 0, tax: 0, total: 0, createdAt: new Date(0) } as any,
            settings: {
                restaurantName: 'مطعم الاختبار', receiptLogoUrl: 'data:image/png;base64,logo',
                receiptQrUrl: 'https://example.test/menu', taxRate: 0, serviceCharge: 0,
            } as any,
            currencySymbol: 'EGP', lang: 'ar',
        });

        expect(html).toContain('مطعم الاختبار');
        expect(html).toContain('data:image/png;base64,logo');
        expect(html).toContain('data:image/svg+xml');
        expect(html).toContain('@page { margin: 0; size: 80mm auto; }');
        expect(html).toContain('border-width: 5px');
    });

    it('creates a standalone QR image that thermal renderers can load', () => {
        const encoded = createQrDataUrl('https://example.test/order/1', 88).split(',')[1];
        const svg = Buffer.from(encoded, 'base64').toString('utf8');

        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain('viewBox=');
    });
});
