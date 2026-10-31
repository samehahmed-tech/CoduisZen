/* ═══════════════════════════════════════════════════════════════════════════
   Template-based receipt generator — reads designer templates from localStorage
   and produces styled HTML for raster print.
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { AppSettings, Order, OrderType, Branch } from '../types';
import { calculateOrderTotalsFromOrder } from './orderTotals';

// ── Types (must match ReceiptDesigner.tsx) ──

type BlockType =
    | 'header' | 'title' | 'orderInfo' | 'customerInfo'
    | 'items' | 'totals' | 'payment' | 'qrCode'
    | 'logo' | 'footer' | 'separator' | 'customText';

interface ReceiptBlock {
    id: string;
    type: BlockType;
    enabled: boolean;
    label: string;
    labelAr: string;
    config: Record<string, any>;
}

export type ReceiptStyleVariant =
    | 'royal' | 'neo' | 'ledger' | 'express'
    | 'zen' | 'modular' | 'card' | 'arabic' | 'split' | 'timeline'
    | 'ultra' | 'signature' | 'qrhero' | 'negative' | 'geometric' | 'glance';
export type ReceiptStyleVariantInput = ReceiptStyleVariant | 'classic' | 'compact' | 'bold';

export interface ReceiptTemplate {
    id: string;
    name: string;
    nameAr: string;
    type: 'receipt' | 'kitchen';
    blocks: ReceiptBlock[];
    fontSize: 'small' | 'normal' | 'large';
    paperWidth: '58mm' | '80mm';
    showLogo: boolean;
    linkedPrinterIds: string[];
    linkedDepartments: string[];
    isDefault: boolean;
    createdAt: string;
    styleVariant?: ReceiptStyleVariantInput;
}

// ── Storage key (same as ReceiptDesigner) ──

const STORAGE_KEY = 'coduiszen_receipt_templates';

// ── Public API ──

/**
 * Find a template linked to the given printer ID.
 */
export const findTemplateForPrinter = (printerId: string, type?: 'receipt' | 'kitchen'): ReceiptTemplate | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const templates: ReceiptTemplate[] = JSON.parse(raw);
        return templates.find(t => t.linkedPrinterIds.includes(printerId) && (!type || t.type === type)) || null;
    } catch {
        return null;
    }
};

/**
 * Find the default template of a given type.
 */
export const findDefaultTemplate = (type: 'receipt' | 'kitchen'): ReceiptTemplate | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const templates: ReceiptTemplate[] = JSON.parse(raw);
        return templates.find(t => t.type === type && t.isDefault)
            || templates.find(t => t.type === type)
            || null;
    } catch {
        return null;
    }
};

export const findLatestTemplate = (type: 'receipt' | 'kitchen'): ReceiptTemplate | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const templates: ReceiptTemplate[] = JSON.parse(raw);
        return templates
            .filter(t => t.type === type)
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]
            || null;
    } catch {
        return null;
    }
};

export const selectReceiptTemplate = ({
    templates,
    defaultTemplateId,
    templateByOrderType,
    orderType,
    printerId,
}: {
    templates?: Array<Record<string, any>>;
    defaultTemplateId?: string;
    templateByOrderType?: Partial<Record<OrderType, string>>;
    orderType: OrderType;
    printerId?: string;
}): ReceiptTemplate | null => {
    const receiptTemplates = (Array.isArray(templates) ? templates : [])
        .filter((template): template is ReceiptTemplate => template?.type === 'receipt' && Array.isArray(template?.blocks));
    const typeTemplateId = templateByOrderType?.[orderType];
    return receiptTemplates.find(template => template.id === typeTemplateId)
        || receiptTemplates.find(template => template.id === defaultTemplateId)
        || (printerId ? receiptTemplates.find(template => template.linkedPrinterIds?.includes(printerId)) : undefined)
        || receiptTemplates.find(template => template.isDefault)
        || receiptTemplates[0]
        || null;
};

interface GenerateHtmlParams {
    template: ReceiptTemplate;
    order: Order;
    settings: AppSettings;
    currencySymbol: string;
    lang: 'en' | 'ar';
    branch?: Branch;
    title?: string;
}

const escapeHtml = (value: unknown): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const looksMojibake = (value: unknown): boolean =>
    /(?:[ØÙ][^\s]|Ã|Â|ط[§±¨µ¦©®¯¹ھ]|ظ[„…‚])/u.test(String(value || ''));

const legacyPairReplace = (text: string): string => text.replace(/ظ‚|ط§|ظ„|ظ…|ظˆ|ظٹ|ط¹|ط±|ط¨|طµ|ط®|ط¯|طھ|ط³|ط´|ط²/g, (pair) => ({
    'ظ‚': 'ق', 'ط§': 'ا', 'ظ„': 'ل', 'ظ…': 'م', 'ظˆ': 'و', 'ظٹ': 'ي',
    'ط¹': 'ع', 'ط±': 'ر', 'ط¨': 'ب', 'طµ': 'ص', 'ط®': 'خ', 'ط¯': 'د',
    'طھ': 'ت', 'ط³': 'س', 'ط´': 'ش', 'ط²': 'ز',
} as Record<string, string>)[pair] || pair);

const latin1BytesToUtf8 = (text: string): string => {
    const bytes = Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8').decode(bytes);
};

const arabicRepairScore = (text: string): number => {
    const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const broken = (text.match(/\uFFFD/g) || []).length;
    const traces = looksMojibake(text) ? 1000 : 0;
    return arabic - broken * 100 - traces;
};

const repairMojibake = (value: unknown): string => {
    const raw = String(value ?? '');
    if (!raw || !looksMojibake(raw)) return raw;
    let best = legacyPairReplace(raw);
    let bestScore = arabicRepairScore(best);
    const rawScore = arabicRepairScore(raw);
    if (rawScore > bestScore) {
        best = raw;
        bestScore = rawScore;
    }
    for (const candidate of [latin1BytesToUtf8(raw), latin1BytesToUtf8(latin1BytesToUtf8(raw))]) {
        if (candidate.includes('\uFFFD')) continue;
        const score = arabicRepairScore(candidate);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
};

const cleanDisplayText = (value: unknown, fallback = ''): string => {
    const text = repairMojibake(value).trim();
    if (!text) return fallback;
    return text;
};

const formatCurrencyHtml = (currencySymbol: string, amount: number) =>
    `<span class="money" dir="ltr">${escapeHtml(currencySymbol || 'EGP')} ${Number(amount || 0).toFixed(2)}</span>`;

const formatAmountHtml = (amount: number) =>
    `<span class="money money-compact" dir="ltr">${Number(amount || 0).toFixed(2)}</span>`;

const ar = {
    dineIn: '\u0635\u0627\u0644\u0629',
    delivery: '\u062f\u064a\u0644\u0641\u0631\u064a',
    pickup: '\u0627\u0633\u062a\u0644\u0627\u0645 \u0639\u0645\u064a\u0644',
    takeaway: '\u062a\u064a\u0643 \u0627\u0648\u0627\u064a',
    cash: '\u0643\u0627\u0634',
    card: '\u0628\u0637\u0627\u0642\u0629',
    visa: '\u0641\u064a\u0632\u0627',
    vodafoneCash: '\u0641\u0648\u062f\u0627\u0641\u0648\u0646 \u0643\u0627\u0634',
    instapay: '\u0627\u0646\u0633\u062a\u0627 \u0628\u0627\u064a',
    split: '\u0645\u0642\u0633\u0645',
    receiptTitle: '\u0625\u064a\u0635\u0627\u0644 \u0628\u064a\u0639',
    phone: '\u0647\u0627\u062a\u0641',
    orderNumber: '\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628',
    type: '\u0627\u0644\u0646\u0648\u0639',
    date: '\u0627\u0644\u062a\u0627\u0631\u064a\u062e',
    table: '\u0637\u0627\u0648\u0644\u0629',
    customer: '\u0627\u0644\u0639\u0645\u064a\u0644',
    address: '\u0627\u0644\u0639\u0646\u0648\u0627\u0646',
    item: '\u0627\u0644\u0635\u0646\u0641',
    qty: '\u0639\u062f\u062f',
    price: '\u0627\u0644\u0633\u0639\u0631',
    total: '\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a',
    subtotal: '\u0627\u0644\u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064a',
    itemDiscounts: '\u062e\u0635\u0648\u0645\u0627\u062a \u0627\u0644\u0623\u0635\u0646\u0627\u0641',
    discount: '\u062e\u0635\u0645',
    tax: '\u0627\u0644\u0636\u0631\u064a\u0628\u0629',
    tip: '\u0627\u0644\u0628\u0642\u0634\u064a\u0634',
    paid: '\u0627\u0644\u062f\u0641\u0639',
    cashier: '\u0627\u0644\u0643\u0627\u0634\u064a\u0631',
    thanks: '\u0634\u0643\u0631\u0627 \u0644\u0632\u064a\u0627\u0631\u062a\u0643\u0645!',
    taxId: '\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0636\u0631\u064a\u0628\u064a',
};

const utf8ToBase64 = (value: string): string => {
    // btoa throws on non-Latin1 input — encode as UTF-8 bytes first so Arabic
    // (or any Unicode) inside the SVG can never drop the whole QR block.
    if (typeof Buffer !== 'undefined') {
        try {
            return Buffer.from(value, 'utf8').toString('base64');
        } catch { /* fall through to TextEncoder */ }
    }
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
};

export const createQrDataUrl = (value: string, size: number): string => {
    try {
        const svg = renderToStaticMarkup(React.createElement(QRCodeSVG as any, {
            value,
            size,
            level: 'M',
            bgColor: '#FFFFFF',
            fgColor: '#000000',
            marginSize: 1,
            xmlns: 'http://www.w3.org/2000/svg',
        }));
        return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
    } catch {
        return '';
    }
};

export const generateHtmlFromTemplate = ({
    template,
    order,
    settings,
    currencySymbol,
    lang,
    branch,
    title,
}: GenerateHtmlParams): string => {
    const isAr = lang === 'ar';
    const dir = isAr ? 'rtl' : 'ltr';
    const textAlign = isAr ? 'right' : 'left';
    const textAlignEnd = isAr ? 'left' : 'right';
    const paperWidth = template.paperWidth || '80mm';
    const widthMm = paperWidth === '58mm' ? 58 : 80;
    const bodyWidthMm = paperWidth === '58mm' ? 56 : 78;
    // EYE-COMFORT design language: hierarchy comes from size + weight
    // CONTRAST, not from heavy frames everywhere. Body text is a calm 600;
    // only hero data (names, totals, order number) goes 800/900. Whitespace
    // separates sections — thin rules mark major breaks, never boxes.
    const fontSizePx = template.fontSize === 'small' ? 20 : template.fontSize === 'large' ? 27 : 24;
    // Legacy factory variants map onto the new design system so stored
    // templates keep a polished look: classic→ledger, compact→express, bold→royal.
    const LEGACY_VARIANT_MAP: Record<string, ReceiptStyleVariant> = {
        classic: 'ledger',
        compact: 'express',
        bold: 'royal',
    };
    const rawVariant = String(template.styleVariant || 'royal');
    const ALL_VARIANTS: ReceiptStyleVariant[] = ['royal', 'neo', 'ledger', 'express',
        'zen', 'modular', 'card', 'arabic', 'split', 'timeline',
        'ultra', 'signature', 'qrhero', 'negative', 'geometric', 'glance'];
    const styleVariant: ReceiptStyleVariant = (ALL_VARIANTS as string[]).includes(rawVariant)
        ? rawVariant as ReceiptStyleVariant
        : LEGACY_VARIANT_MAP[rawVariant] || 'royal';
    const isExpress = styleVariant === 'express' || styleVariant === 'ultra';
    // ── Per-school layout modes ──
    // itemsMode: how product lines render. metaMode: how order meta renders.
    // qrSizeOverride: hero/compact QR sizing per school (0 = template config).
    type ItemsMode = 'table' | 'stacked' | 'timeline' | 'minimal';
    type MetaMode = 'grid' | 'micro' | 'rows' | 'twocol';
    const VARIANT_LAYOUT: Record<string, { items: ItemsMode; meta: MetaMode; qr: number; chapters: boolean }> = {
        royal: { items: 'table', meta: 'grid', qr: 0, chapters: false },
        neo: { items: 'table', meta: 'grid', qr: 0, chapters: false },
        ledger: { items: 'table', meta: 'grid', qr: 0, chapters: false },
        express: { items: 'table', meta: 'grid', qr: 0, chapters: false },
        zen: { items: 'table', meta: 'micro', qr: 0, chapters: false },
        modular: { items: 'table', meta: 'twocol', qr: 0, chapters: false },
        card: { items: 'stacked', meta: 'micro', qr: 0, chapters: false },
        arabic: { items: 'table', meta: 'rows', qr: 0, chapters: false },
        split: { items: 'table', meta: 'grid', qr: 0, chapters: true },
        timeline: { items: 'timeline', meta: 'micro', qr: 180, chapters: false },
        ultra: { items: 'minimal', meta: 'micro', qr: 140, chapters: false },
        signature: { items: 'stacked', meta: 'micro', qr: 220, chapters: false },
        qrhero: { items: 'table', meta: 'micro', qr: 280, chapters: false },
        negative: { items: 'table', meta: 'micro', qr: 150, chapters: false },
        geometric: { items: 'table', meta: 'grid', qr: 0, chapters: false },
        glance: { items: 'minimal', meta: 'micro', qr: 200, chapters: false },
    };
    const layout = VARIANT_LAYOUT[styleVariant] || VARIANT_LAYOUT.royal;
    // KITCHEN-MODE: templates of type 'kitchen' render through the same
    // generator so every design school works for kitchen tickets too — but a
    // kitchen ticket must NEVER show money (prices, totals, payment, QR
    // payment links). Money columns/blocks are force-hidden below, and the
    // kitchen-mode CSS boosts scannability (giant names + quantities).
    const hideMoney = template.type === 'kitchen';
    const chapterLabel = (num: string, en: string, arLabel: string) => `
        <div class="chapter"><span class="chapter-num">${num}</span><span class="chapter-text">${pickText(en, arLabel)}</span></div>
    `;
    const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
    const dateStr = createdAt.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
    const timeStr = createdAt.toLocaleTimeString(isAr ? 'ar-EG' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
    });
    const totals = calculateOrderTotalsFromOrder(order, settings);

    const pickText = (en?: string, arText?: string, fallback = '') => {
        const primary = isAr ? cleanDisplayText(arText, '') : cleanDisplayText(en, '');
        const secondary = isAr ? cleanDisplayText(en, '') : cleanDisplayText(arText, '');
        return escapeHtml(primary || secondary || fallback);
    };

    const orderTypeLabels: Record<string, { ar: string; en: string }> = {
        [OrderType.DINE_IN]: { ar: ar.dineIn, en: 'Dine-In' },
        [OrderType.DELIVERY]: { ar: ar.delivery, en: 'Delivery' },
        [OrderType.PICKUP]: { ar: ar.pickup, en: 'Pickup' },
        [OrderType.TAKEAWAY]: { ar: ar.takeaway, en: 'Takeaway' },
    };
    const paymentLabels: Record<string, { ar: string; en: string }> = {
        CASH: { ar: ar.cash, en: 'Cash' },
        CARD: { ar: ar.card, en: 'Card' },
        VISA: { ar: ar.visa, en: 'Visa' },
        VODAFONE_CASH: { ar: ar.vodafoneCash, en: 'Vodafone Cash' },
        INSTAPAY: { ar: ar.instapay, en: 'InstaPay' },
        SPLIT: { ar: ar.split, en: 'Split' },
    };

    const summaryRows: string[] = [];
    const pushSummary = (enabled: boolean, labelEn: string, labelAr: string, value: number, cls = '') => {
        if (!enabled) return;
        summaryRows.push(`
            <tr class="summary-row ${cls}">
                <td>${pickText(labelEn, labelAr)}</td>
                <td>${formatCurrencyHtml(currencySymbol, value)}</td>
            </tr>
        `);
    };

    const blockHtml = template.blocks
        .filter((block) => block.enabled)
        .map((block) => {
            const cfg = block.config || {};
            // Template-wide discount visibility (totals block toggle, default ON).
            // The fallback receipt always prints discounts, so the designer path
            // must match unless the merchant explicitly hid them.
            const totalsCfg = (template.blocks || []).find((b: any) => b?.type === 'totals')?.config || {};
            const showDiscountAnywhere = (totalsCfg as any).showDiscount !== false;

            switch (block.type) {
                case 'logo': {
                    const logoUrl = cfg.url || settings.receiptLogoUrl || '';
                    if (!logoUrl || template.showLogo === false) return '';
                    return `
                        <div class="block logo-block" style="padding-top:2mm;overflow:visible">
                            <img src="${escapeHtml(logoUrl)}" alt="logo" style="max-height:${Number(cfg.maxHeight || 120)}px;max-width:100%;width:auto;height:auto;object-fit:contain;display:block;margin:0 auto" />
                        </div>
                    `;
                }

                case 'header':
                    return `
                        <div class="block header-block">
                            <div class="restaurant-name">${escapeHtml(cleanDisplayText(settings.restaurantName, 'Restaurant'))}</div>
                            ${cfg.showBranch && (branch?.name || branch?.nameAr)
                                ? `<div class="branch-name">${pickText(branch?.name, branch?.nameAr)}</div>` : ''}
                            ${cfg.showAddress && (settings.branchAddress || branch?.address)
                                ? `<div class="branch-info">${escapeHtml(cleanDisplayText(settings.branchAddress || branch?.address || ''))}</div>` : ''}
                            ${cfg.showPhone && (settings.phone || branch?.phone)
                                ? `<div class="branch-info">${pickText('Tel', ar.phone)}: ${escapeHtml(settings.phone || branch?.phone || '')}</div>` : ''}
                        </div>
                    `;

                case 'title': {
                    const titleText = cleanDisplayText(
                        title || (isAr ? (cfg.textAr || cfg.text) : (cfg.text || cfg.textAr)),
                        isAr ? ar.receiptTitle : 'Sales Receipt',
                    );
                    return `<div class="block receipt-title">${escapeHtml(titleText)}</div>`;
                }

                case 'orderInfo': {
                    const orderType = orderTypeLabels[order.type] || orderTypeLabels[OrderType.TAKEAWAY];
                    const cashierName = cleanDisplayText((order as any).cashierName || '', '');
                    const orderNumText = escapeHtml(order.orderNumber || order.id?.slice(0, 8) || '---');
                    const typeText = pickText(orderType.en, orderType.ar);
                    const tableText = escapeHtml((order as any).tableName || (order as any).tableId || '');
                    // MICRO: one calm line — zen / card / ultra / glance schools.
                    if (layout.meta === 'micro') {
                        const parts: string[] = [];
                        if (cfg.showOrderNum) parts.push(`${isAr ? 'طلب' : 'Order'} #${orderNumText}`);
                        if (cfg.showTime) parts.push(escapeHtml(timeStr));
                        if (cfg.showDate) parts.push(escapeHtml(dateStr));
                        if (cfg.showTable && (order as any).tableId) parts.push(`${isAr ? 'طاولة' : 'Table'} ${tableText}`);
                        if (cfg.showCustomer && order.customerName) parts.push(escapeHtml(cleanDisplayText(order.customerName)));
                        return `
                            <div class="block order-meta-micro">
                                <div class="micro-line">${parts.join(`<span class="micro-dot">•</span>`)}</div>
                                ${cfg.showType ? `<div class="micro-type">${typeText}</div>` : ''}
                                ${cfg.showCashier !== false && cashierName ? `<div class="micro-cashier">${pickText('Cashier', ar.cashier)}: ${escapeHtml(cashierName)}</div>` : ''}
                            </div>
                        `;
                    }
                    // ROWS: Arabic-first label/value ledger rows.
                    if (layout.meta === 'rows') {
                        const row = (show: any, labelEn: string, labelAr: string, value: string) => show && value
                            ? `<div class="meta-row"><span>${pickText(labelEn, labelAr)}</span><span>${value}</span></div>` : '';
                        return `
                            <div class="block order-meta-rows">
                                ${row(cfg.showOrderNum, 'Order #', ar.orderNumber, `#${orderNumText}`)}
                                ${row(cfg.showDate, 'Date', ar.date, escapeHtml(dateStr))}
                                ${row(cfg.showTime, 'Time', 'الوقت', escapeHtml(timeStr))}
                                ${row(cfg.showTable && (order as any).tableId, 'Table', ar.table, tableText)}
                                ${row(cfg.showCustomer && order.customerName, 'Customer', ar.customer, escapeHtml(cleanDisplayText(order.customerName)))}
                                ${row(cfg.showCashier !== false && cashierName, 'Cashier', ar.cashier, escapeHtml(cashierName))}
                                ${cfg.showType ? `<div class="meta-row"><span>${pickText('Type', ar.type)}</span><span class="type-badge">${typeText}</span></div>` : ''}
                            </div>
                        `;
                    }
                    // TWOCOL: modular 2×2 info module.
                    if (layout.meta === 'twocol') {
                        const cell = (show: any, label: string, value: string) => show && value
                            ? `<div class="twocol-cell"><span class="twocol-label">${label}</span><span class="twocol-value">${value}</span></div>` : '';
                        return `
                            <div class="block order-meta-twocol">
                                ${cell(cfg.showOrderNum, pickText('Order #', ar.orderNumber), `#${orderNumText}`)}
                                ${cell(cfg.showTime || cfg.showDate, pickText('Time', 'الوقت'), escapeHtml(cfg.showTime ? timeStr : dateStr))}
                                ${cell(cfg.showTable && (order as any).tableId, pickText('Table', ar.table), tableText)}
                                ${cell(cfg.showCustomer && order.customerName, pickText('Customer', ar.customer), escapeHtml(cleanDisplayText(order.customerName)))}
                                ${cell(cfg.showType, pickText('Type', ar.type), typeText)}
                                ${cell(cfg.showCashier !== false && cashierName, pickText('Cashier', ar.cashier), escapeHtml(cashierName))}
                            </div>
                        `;
                    }
                    return `
                        ${layout.chapters ? chapterLabel('01', 'Order', 'الطلب') : ''}
                        <div class="block order-meta">
                            ${cfg.showOrderNum ? `
                                <div class="meta-block">
                                    <span class="meta-label">${pickText('Order #', ar.orderNumber)}</span>
                                    <span class="meta-value">${escapeHtml(order.orderNumber || order.id?.slice(0, 8) || '---')}</span>
                                </div>
                            ` : ''}
                            ${cfg.showType ? `
                                <div class="meta-block meta-center">
                                    <span class="meta-label">${pickText('Type', ar.type)}</span>
                                    <span class="type-badge">${pickText(orderType.en, orderType.ar)}</span>
                                </div>
                            ` : ''}
                            ${(cfg.showDate || cfg.showTime) ? `
                                <div class="meta-block meta-end">
                                    ${cfg.showDate ? `<span class="meta-label">${pickText('Date', ar.date)}</span><span class="meta-value">${escapeHtml(dateStr)}</span>` : ''}
                                    ${cfg.showTime ? `<span class="meta-time">${escapeHtml(timeStr)}</span>` : ''}
                                </div>
                            ` : ''}
                            ${cfg.showCashier !== false && cashierName ? `
                                <div class="meta-cashier">
                                    <span>${pickText('Cashier', ar.cashier)}</span>
                                    <span>${escapeHtml(cashierName)}</span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }

                case 'customerInfo':
                    return `
                        <div class="block customer-info">
                            ${cfg.showTable && order.tableId ? `<div class="info-chip">${pickText('Table', ar.table)}: <strong>${escapeHtml((order as any).tableName || order.tableId)}</strong></div>` : ''}
                            ${cfg.showCustomer && order.customerName ? `<div class="info-chip">${pickText('Customer', ar.customer)}: ${escapeHtml(cleanDisplayText(order.customerName))}</div>` : ''}
                            ${cfg.showPhone && order.customerPhone ? `<div class="info-chip">${pickText('Phone', ar.phone)}: ${escapeHtml(order.customerPhone)}</div>` : ''}
                            ${cfg.showAddress && order.deliveryAddress ? `<div class="info-chip">${pickText('Address', ar.address)}: ${escapeHtml(cleanDisplayText(order.deliveryAddress))}</div>` : ''}
                        </div>
                    `;

                case 'items': {
                    const pricedLines = (order.items || []).map((item) => {
                        const modsPrice = (item.selectedModifiers || []).reduce((s, m) => s + (m.price || 0), 0);
                        const unitPrice = (item.price || 0) + modsPrice;
                        const lineGross = unitPrice * (item.quantity || 1);
                        let itemDiscount = 0;
                        if ((item as any).itemDiscount && (item as any).itemDiscount > 0) {
                            itemDiscount = (item as any).itemDiscountType === 'percent'
                                ? lineGross * ((item as any).itemDiscount / 100)
                                : (item as any).itemDiscount;
                        }
                        return { item, unitPrice, lineNet: lineGross - itemDiscount, itemDiscount };
                    });
                    const extrasHtml = (entry: { item: any; itemDiscount?: number }) => `
                        ${cfg.showModifiers ? (entry.item.selectedModifiers || []).map((modifier: any) => `
                            <div class="item-mod">
                                + ${escapeHtml(cleanDisplayText(modifier.optionName || modifier.groupName || ''))}
                                ${modifier.price > 0 ? `<span class="mod-price">(${Number(modifier.price).toFixed(2)})</span>` : ''}
                            </div>
                        `).join('') : ''}
                        ${cfg.showNotes && entry.item.notes ? `<div class="item-note">${escapeHtml(cleanDisplayText(entry.item.notes))}</div>` : ''}
                        ${showDiscountAnywhere && entry.itemDiscount > 0 ? `<div class="item-discount">${isAr ? 'خصم' : 'Disc'}: -${Number(entry.itemDiscount).toFixed(2)}</div>` : ''}
                    `;
                    // STACKED: product cards — card / signature schools.
                    if (layout.items === 'stacked') {
                        return `
                            <div class="block">
                                <div class="stacked-items">
                                    ${pricedLines.map(({ item, unitPrice, lineNet }) => `
                                        <div class="stack-item">
                                            <div class="stack-name">${pickText(item.name, (item as any).nameAr)}</div>
                                            <div class="stack-line">
                                                ${!hideMoney
                                                    ? `<span>${escapeHtml(item.quantity || 1)} × ${Number(unitPrice).toFixed(2)}</span><span>${formatAmountHtml(lineNet)}</span>`
                                                    : `<span>×${escapeHtml(item.quantity || 1)}</span>`}
                                            </div>
                                            ${extrasHtml({ item })}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }
                    // TIMELINE: vertical flow with node dots — timeline school.
                    if (layout.items === 'timeline') {
                        return `
                            <div class="block">
                                <div class="tl-items">
                                    ${pricedLines.map(({ item, lineNet }) => `
                                        <div class="tl-item">
                                            <span class="tl-node"></span>
                                            <span class="tl-text">${pickText(item.name, (item as any).nameAr)} ×${escapeHtml(item.quantity || 1)}</span>
                                            ${!hideMoney ? `<span class="tl-total">${formatAmountHtml(lineNet)}</span>` : ''}
                                        </div>
                                        ${extrasHtml({ item })}
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }
                    // MINIMAL: single-line rows, no header — ultra / glance schools.
                    if (layout.items === 'minimal') {
                        return `
                            <div class="block">
                                <div class="mini-items">
                                    ${pricedLines.map(({ item, lineNet }) => `
                                        <div class="mini-row">
                                            <span class="mini-name">${pickText(item.name, (item as any).nameAr)} ×${escapeHtml(item.quantity || 1)}</span>
                                            ${!hideMoney ? `<span class="mini-total">${formatAmountHtml(lineNet)}</span>` : ''}
                                        </div>
                                        ${extrasHtml({ item })}
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }
                    const itemRows = pricedLines.map(({ item, unitPrice, lineNet, itemDiscount }) => {

                        return `
                            <tr>
                                <td class="col-item">
                                    <span class="item-name">${pickText(item.name, (item as any).nameAr)}</span>
                                    ${cfg.showModifiers ? (item.selectedModifiers || []).map((modifier) => `
                                        <div class="item-mod">
                                            + ${escapeHtml(cleanDisplayText(modifier.optionName || modifier.groupName || ''))}
                                            ${modifier.price > 0 ? `<span class="mod-price">(${Number(modifier.price).toFixed(2)})</span>` : ''}
                                        </div>
                                    `).join('') : ''}
                                    ${cfg.showNotes && item.notes ? `<div class="item-note">${escapeHtml(cleanDisplayText(item.notes))}</div>` : ''}
                                    ${showDiscountAnywhere && itemDiscount > 0 ? `<div class="item-discount">${isAr ? 'خصم' : 'Disc'}: -${Number(itemDiscount).toFixed(2)}</div>` : ''}
                                </td>
                                ${cfg.showQty ? `<td class="col-qty">${escapeHtml(item.quantity || 1)}</td>` : ''}
                                ${!hideMoney && cfg.showPrice ? `<td class="col-price">${formatAmountHtml(unitPrice)}</td>` : ''}
                                ${!hideMoney ? `<td class="col-total">${formatAmountHtml(lineNet)}</td>` : ''}
                            </tr>
                        `;
                    }).join('');

                    return `
                        ${layout.chapters ? chapterLabel('02', 'Items', 'الأصناف') : ''}
                        <div class="block">
                            <table class="items-table">
                                <tr class="items-header">
                                    <td class="col-item">${pickText('Item', ar.item)}</td>
                                    ${cfg.showQty ? `<td class="col-qty">${pickText('Qty', ar.qty)}</td>` : ''}
                                    ${!hideMoney && cfg.showPrice ? `<td class="col-price">${pickText('Price', ar.price)}</td>` : ''}
                                    ${!hideMoney ? `<td class="col-total">${pickText('Total', ar.total)}</td>` : ''}
                                </tr>
                                ${itemRows}
                            </table>
                        </div>
                    `;
                }

                case 'totals':
                    if (hideMoney) return '';
                    summaryRows.length = 0;
                    pushSummary(Boolean(cfg.showSubtotal), 'Subtotal', ar.subtotal, totals.subtotal);
                    pushSummary(Boolean(cfg.showDiscount && totals.itemDiscountTotal > 0), 'Item Discounts', ar.itemDiscounts, -totals.itemDiscountTotal, 'discount-row');
                    pushSummary(
                        Boolean(cfg.showDiscount && totals.orderDiscountAmount > 0),
                        `Discount (${totals.orderDiscountPercent}%)`,
                        `${ar.discount} (${totals.orderDiscountPercent}%)`,
                        -totals.orderDiscountAmount,
                        'discount-row',
                    );
                    pushSummary(Boolean(cfg.showTax), 'Tax', ar.tax, totals.tax);
                    pushSummary(Boolean(cfg.showTip && order.tipAmount && order.tipAmount > 0), 'Tip', ar.tip, order.tipAmount || 0);
                    return `
                        ${layout.chapters ? chapterLabel('03', 'Payment', 'الحساب') : ''}
                        <div class="block">
                            <table class="summary-table">${summaryRows.join('')}</table>
                            ${cfg.showTotal ? `
                                <div class="grand-total">
                                    <span class="grand-total-label">${pickText('TOTAL', ar.total)}</span>
                                    <span class="grand-total-value">${formatCurrencyHtml(currencySymbol, totals.total)}</span>
                                </div>
                            ` : ''}
                        </div>
                    `;

                case 'payment': {
                    if (hideMoney) return '';
                    if (!order.paymentMethod) return '';
                    // Normalize (trim/case) so custom/legacy method strings still
                    // match; unknown methods go through mojibake repair instead
                    // of printing raw bytes as garbage marks.
                    const methodKey = String(order.paymentMethod).trim().toUpperCase();
                    const payment = paymentLabels[methodKey];
                    const paymentText = payment
                        ? pickText(payment.en, payment.ar)
                        : escapeHtml(cleanDisplayText(order.paymentMethod, ''));
                    if (!paymentText) return '';
                    return `
                        <div class="block payment-section">
                            <span class="payment-pill">${pickText('Paid', ar.paid)}: ${paymentText}</span>
                        </div>
                    `;
                }

                case 'qrCode': {
                    if (hideMoney) return '';
                    const qrValue = cfg.url || (settings as any).receiptQrUrl || '';
                    const qrDefault = template.paperWidth === '58mm' ? 140 : 200;
                    const qrSize = Math.max(48, Math.min(280, Number(layout.qr || cfg.size || qrDefault)));
                    const directImageUrl = cfg.imageUrl || '';
                    const qrImageUrl = directImageUrl || (qrValue ? createQrDataUrl(qrValue, qrSize) : '');
                    if (!qrImageUrl) return '';
                    return `
                        <div class="block qr-block">
                            <img class="qr-image" src="${escapeHtml(qrImageUrl)}" alt="QR" width="${qrSize}" height="${qrSize}" />
                            ${qrValue ? `<div class="qr-text">${escapeHtml(qrValue)}</div>` : ''}
                        </div>
                    `;
                }

                case 'footer': {
                    const footerText = cleanDisplayText(
                        isAr ? (cfg.textAr || cfg.text) : (cfg.text || cfg.textAr),
                        isAr ? ar.thanks : 'Thank you for your visit!',
                    );
                    return `
                        <div class="block receipt-footer">
                            <div class="footer-thanks">${escapeHtml(footerText)}</div>
                            ${cfg.showTaxId && (settings as any).taxRegistrationNumber
                                ? `<div class="tax-id-line">${pickText('Tax ID', ar.taxId)}: ${escapeHtml((settings as any).taxRegistrationNumber)}</div>` : ''}
                            ${cfg.showPoweredBy ? `<div class="powered-by">Powered by Coduis Zen</div>` : ''}
                        </div>
                    `;
                }

                case 'separator':
                    return `<hr class="${cfg.style === 'solid' ? 'thick-sep' : 'dashed-sep'}" />`;

                case 'customText': {
                    const customText = cleanDisplayText(isAr ? (cfg.textAr || cfg.text) : (cfg.text || cfg.textAr), '');
                    if (!customText) return '';
                    const alignment = cfg.alignment === 'right'
                        ? textAlignEnd
                        : cfg.alignment === 'left'
                            ? textAlign
                            : 'center';
                    const fontWeight = cfg.bold ? 800 : 600;
                    const customFontSize = Number(cfg.fontSize || fontSizePx);
                    return `
                        <div class="block" style="text-align:${alignment};font-size:${customFontSize}px;font-weight:${fontWeight}">
                            ${escapeHtml(customText)}
                        </div>
                    `;
                }

                default:
                    return '';
            }
        })
        .join('');

    return `<!DOCTYPE html>
<html dir="${dir}" lang="${escapeHtml(lang)}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(settings.restaurantName || 'Receipt')}</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page { margin: 0; size: ${widthMm}mm auto; }
    * { box-sizing: border-box; }
    body {
        margin: 0 auto;
        padding: 2mm;
        width: ${bodyWidthMm}mm;
        max-width: 100%;
        color: #000;
        background: #fff;
        direction: ${dir};
        font-family: 'Cairo', Tahoma, Arial, sans-serif;
        font-size: ${fontSizePx}px;
        line-height: 1.52;
        font-weight: 600;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    img { display: block; margin: 0 auto; filter: grayscale(1) contrast(1.15); }
    .block { margin: ${isExpress ? 3 : 7}px 0; }
    .logo-block, .payment-section, .qr-block, .receipt-footer { text-align: center; }
    .header-block { text-align: center; padding-bottom: 8px; }
    .restaurant-name { font-size: ${fontSizePx + 8}px; font-weight: 900; line-height: 1.25; }
    .branch-name { font-size: ${fontSizePx}px; font-weight: 700; color: #000; margin-top: 2px; }
    .branch-info { font-size: ${Math.max(fontSizePx - 3, 12)}px; color: #000; font-weight: 600; margin-top: 1px; }
    .receipt-title {
        text-align: center;
        padding: 6px 0;
        margin: 2px 0 0;
        border-top: 2px solid #000;
        border-bottom: 1px dashed #000;
        background: #fff;
        color: #000;
        font-size: ${fontSizePx + 1}px;
        font-weight: 800;
        line-height: 1.9;
        letter-spacing: 0;
        overflow: visible;
        overflow-wrap: anywhere;
    }
    .order-meta {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, .9fr) minmax(0, 1.35fr);
        align-items: flex-start;
        gap: 6px;
        padding: 8px 0 10px;
    }
    .meta-block { display: flex; min-width: 0; flex-direction: column; gap: 3px; text-align: ${textAlign}; }
    .meta-center { text-align: center; }
    .meta-end { text-align: ${textAlignEnd}; }
    .meta-cashier {
        grid-column: 1 / -1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px dashed #000;
        font-weight: 600;
        font-size: ${Math.max(fontSizePx - 3, 12)}px;
        color: #000;
    }
    .meta-cashier span:last-child { font-weight: 800; }
    /* Shared primitives for the signature schools (each school refines). */
    .order-meta-micro { padding: 4px 0; }
    .micro-line { font-weight: 700; }
    .micro-dot { padding: 0 6px; font-weight: 400; }
    .micro-type { font-weight: 800; margin-top: 2px; }
    .micro-cashier { font-weight: 600; font-size: ${Math.max(fontSizePx - 4, 11)}px; margin-top: 2px; }
    .meta-row { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px dotted #000; }
    .meta-row span:first-child { font-weight: 600; }
    .meta-row span:last-child { font-weight: 800; }
    .chapter { display: flex; align-items: baseline; gap: 8px; margin: 10px 0 4px; }
    .chapter-num { font-weight: 900; }
    .chapter-text { font-weight: 700; text-transform: uppercase; }
    .stack-item { padding: 8px 2px; border-bottom: 1px dotted #000; }
    .stack-name { font-weight: 800; }
    .stack-line { display: flex; justify-content: space-between; margin-top: 2px; }
    .tl-item { display: flex; align-items: baseline; gap: 6px; padding: 6px 0; }
    .tl-text { flex: 1; font-weight: 800; }
    .mini-row { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px dotted #000; }
    /* EDGE-CLIP GUARD: in RTL any flex/grid child wider than its track
       spills out the LEFT edge and html2canvas cuts it ("قص من الشمال").
       Every flexible child must shrink (min-width:0) and wrap long words. */
    .order-meta > *, .twocol-cell, .meta-row > *, .chapter > *,
    .grand-total > *, .stack-line > *, .mini-row > *, .tl-item > *,
    .k-context-item { min-width: 0; max-width: 100%; }
    .twocol-value, .meta-row span:last-child, .chapter-text,
    .stack-name, .mini-name, .tl-text, .qr-text { overflow-wrap: anywhere; }
    /* KITCHEN-MODE: scannability boost for every school — giant names and
       quantities, money columns defensively hidden even if a block slips
       through, hero title. */
    body.kitchen-mode .receipt-title { font-size: ${fontSizePx + 6}px; font-weight: 900; }
    body.kitchen-mode .item-name { font-size: ${fontSizePx + 6}px; font-weight: 900; }
    body.kitchen-mode .items-table .col-qty { font-size: ${fontSizePx + 6}px; font-weight: 900; }
    body.kitchen-mode .items-table td { padding: 9px 2px; }
    body.kitchen-mode .col-price, body.kitchen-mode .col-total { display: none; }
    body.kitchen-mode .micro-line { font-size: ${fontSizePx + 4}px; font-weight: 800; }
    body.kitchen-mode .stack-name { font-size: ${fontSizePx + 5}px; }
    body.kitchen-mode .tl-text { font-size: ${fontSizePx + 4}px; }
    body.kitchen-mode .mini-row { font-size: ${fontSizePx + 3}px; font-weight: 800; }
    body.kitchen-mode .item-mod, body.kitchen-mode .item-note { font-size: ${Math.max(fontSizePx - 1, 14)}px; font-weight: 800; }
    .meta-label { font-size: ${Math.max(fontSizePx - 5, 10)}px; color: #000; font-weight: 600; text-transform: uppercase; white-space: nowrap; }
    .meta-value, .meta-time { display: block; font-weight: 800; font-size: ${fontSizePx}px; white-space: nowrap; unicode-bidi: isolate; }
    .type-badge {
        display: inline-block;
        padding: 3px 14px;
        border: 1.5px solid #000;
        background: #fff;
        color: #000;
        font-size: ${Math.max(fontSizePx - 3, 12)}px;
        font-weight: 800;
        line-height: 1.9;
        max-width: 100%;
        white-space: normal;
        overflow: visible;
        overflow-wrap: anywhere;
        text-align: center;
    }
    .customer-info { padding: 2px 0 4px; }
    .info-chip { padding: 2px 0; font-weight: 600; font-size: ${Math.max(fontSizePx - 2, 13)}px; color: #000; }
    .info-chip strong { font-weight: 800; }
    .items-table, .summary-table { width: 100%; border-collapse: collapse; }
    .items-table { table-layout: fixed; }
    .items-header td {
        font-size: ${Math.max(fontSizePx - 4, 12)}px;
        font-weight: 700;
        text-transform: uppercase;
        color: #000;
        padding-bottom: 4px;
        border-bottom: 2px solid #000;
    }
    .items-table td {
        padding: 7px 2px;
        vertical-align: top;
        border-bottom: 1px dotted #000;
        overflow-wrap: anywhere;
        word-break: normal;
    }
        .col-item { width: 44%; text-align: ${textAlign}; }
        .col-qty { width: 14%; text-align: center; }
        .col-price { width: 20%; text-align: center; }
        .col-total { width: 22%; text-align: ${textAlignEnd}; font-weight: 900; }
    .items-table .col-qty, .items-table .col-price, .items-table .col-total {
        direction: ltr;
        unicode-bidi: isolate;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }
    .item-name { display: block; font-weight: 800; font-size: ${fontSizePx + 2}px; line-height: 1.4; }
    .item-mod, .item-note { font-size: ${Math.max(fontSizePx - 3, 12)}px; color: #000; margin-top: 2px; line-height: 1.4; font-weight: 600; }
    .item-discount { font-size: ${Math.max(fontSizePx - 3, 12)}px; color: #000; margin-top: 2px; line-height: 1.4; font-weight: 800; }
    .mod-price { color: #000; font-weight: 600; }
    .summary-row td { padding: 5px 0; font-weight: 700; font-size: ${Math.max(fontSizePx - 2, 13)}px; text-align: ${textAlign}; }
    .summary-row td:last-child { text-align: ${textAlignEnd}; direction: ltr; unicode-bidi: isolate; white-space: nowrap; font-weight: 800; }
    .discount-row td { color: #000; }
    .money {
        display: inline-block;
        direction: ltr;
        unicode-bidi: isolate;
        white-space: nowrap;
        font-family: 'Cairo', Tahoma, Arial, sans-serif;
        font-weight: 800;
    }
    .money-compact {
        letter-spacing: 0 !important;
    }
    .grand-total {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: ${isExpress ? 8 : 12}px 12px;
        border: 3px solid #111;
        border-radius: 0;
        background: #fff;
        color: #000;
        font-weight: 900;
        margin: 10px 0 2px;
        overflow: hidden;
    }
    .grand-total-label { padding-inline: 2px; font-size: ${fontSizePx}px; }
    .grand-total-value { font-size: ${fontSizePx + 6}px; font-weight: 900; padding-inline: 2px; }
    .grand-total-label { text-align: ${textAlign}; }
    .grand-total-value { direction: ltr; unicode-bidi: isolate; white-space: nowrap; text-align: ${textAlignEnd}; }
    .payment-pill {
        display: inline-block;
        border: 1.5px solid #000;
        padding: 6px 20px;
        min-width: 110px;
        max-width: 100%;
        font-size: ${Math.max(fontSizePx - 3, 12)}px;
        font-weight: 800;
        line-height: 1.8;
        /* Wrap instead of clipping: a clipped half-glyph at the 384px edge
           rasterizes as garbage marks on thermal printers. */
        white-space: normal;
        overflow: visible;
        overflow-wrap: anywhere;
        text-align: center;
        background: #fff;
        color: #111;
    }
    .qr-image {
        margin: 0 auto 6px;
        padding: 8px;
        border: 1.5px solid #000;
        background: #fff;
        object-fit: contain;
        image-rendering: pixelated;
    }
    .qr-text { font-size: ${Math.max(fontSizePx - 4, 10)}px; color: #000; word-break: break-all; font-weight: 600; }
    .receipt-footer {
        padding-top: 10px;
        padding-bottom: 12px;
        border-top: 2px solid #000;
        margin-top: 10px;
    }
    .footer-thanks { font-size: ${fontSizePx + 1}px; font-weight: 800; }
    .tax-id-line, .powered-by { font-size: ${Math.max(fontSizePx - 4, 10)}px; color: #000; margin-top: 5px; font-weight: 600; }
    .dashed-sep, .thick-sep { border: none; margin: 8px 0; }
    .dashed-sep { border-top: 1px dashed #000; }
    .thick-sep { border-top: 2px solid #000; }

    /* ROYAL (default): calm hierarchy — hero restaurant name + hero order
       number + the single framed total. Air, not armor. */
    body.receipt-royal .header-block { border: 0; padding-bottom: 8px; border-bottom: 3px double #000; }
    body.receipt-royal .restaurant-name { font-size: ${fontSizePx + 10}px; letter-spacing: 0; }
    body.receipt-royal .receipt-title { background: #fff; color: #000; border-top: 0; border-left: 0; border-right: 0; border-bottom: 1px dashed #000; font-size: ${fontSizePx + 2}px; font-weight: 800; letter-spacing: 0; line-height: 1.9; padding: 6px 0; overflow: visible; }
    body.receipt-royal .order-meta { border: 0; padding: 8px 0; }
    body.receipt-royal .order-meta .meta-block:first-child .meta-value { font-size: ${fontSizePx + 12}px; line-height: 1.15; font-weight: 900; }
    body.receipt-royal .items-header td { color: #000; border: 0; border-bottom: 2px solid #000; }
    body.receipt-royal .item-name { font-size: ${fontSizePx + 3}px; }
    body.receipt-royal .summary-table { border-top: 0; }
    body.receipt-royal .grand-total { border-width: 5px; padding: 12px; }
    body.receipt-royal .receipt-footer { border-top: 3px double #000; }
    body.receipt-royal .payment-pill { border-width: 1.5px; }

    /* NEO: airy minimal. Hairline dividers, breathing room, strong total. */
    body.receipt-neo { line-height: 1.55; }
    body.receipt-neo .header-block { border: 0; border-bottom: 1px solid #000; padding-bottom: 8px; }
    body.receipt-neo .restaurant-name { font-size: ${fontSizePx + 6}px; font-weight: 900; }
    body.receipt-neo .receipt-title { background: #fff; color: #000; border: 0; border-bottom: 1px dashed #000; font-weight: 700; }
    body.receipt-neo .order-meta { border: 0; }
    body.receipt-neo .items-header td { color: #000; border: 0; border-bottom: 1px solid #000; }
    body.receipt-neo .items-table td { border-bottom: 0; padding: 8px 2px; }
    body.receipt-neo .items-table tr:not(.items-header) td { border-bottom: 1px dotted #000; }
    body.receipt-neo .grand-total { border-width: 2px; }
    body.receipt-neo .receipt-footer { border-top: 1px solid #000; }
    body.receipt-neo .payment-pill { border-width: 1px; }

    /* LEDGER: formal ruled ledger. Double rules, calm sections, tabular figures. */
    body.receipt-ledger .header-block { border-top: 3px double #000; border-bottom: 1px solid #000; padding: 10px 0 8px; }
    body.receipt-ledger .receipt-title { border-left: 0; border-right: 0; border-radius: 0; background: #fff; color: #000; border-top: 0; font-weight: 700; }
    body.receipt-ledger .order-meta { border-top: 0; border-bottom: 1px solid #000; }
    body.receipt-ledger .items-header td { border-top: 0; border-bottom: 2px solid #000; font-weight: 700; }
    body.receipt-ledger .summary-table { border-top: 0; }
    body.receipt-ledger .receipt-footer { border-top: 3px double #000; }

    /* EXPRESS: tidy paper-saver for rush counters and 58mm rolls. */
    body.receipt-express { line-height: 1.3; }
    body.receipt-express .logo-block img { max-height: 44px !important; }
    body.receipt-express .header-block { text-align: ${textAlign}; border: 0; border-bottom: 2px solid #000; padding: 0 0 6px; }
    body.receipt-express .restaurant-name { font-size: ${fontSizePx + 4}px; }
    body.receipt-express .branch-info { display: inline; margin-inline-end: 8px; }
    body.receipt-express .receipt-title { padding: 5px 0; }
    body.receipt-express .order-meta { border: 0; border-bottom: 2px solid #000; padding: 6px 0; }
    body.receipt-express .items-table td { padding-top: 4px; padding-bottom: 4px; border-bottom: 0; }
    body.receipt-express .items-table tr:not(.items-header) td { border-bottom: 1px dashed #000; }
    body.receipt-express .summary-table { border-top: 0; }
    body.receipt-express .grand-total { margin-inline: 0; padding: 8px 10px; }
    body.receipt-express .receipt-footer { border-top: 1px dashed #000; padding-top: 6px; }

    /* ═══ 12 signature schools (thermal-printable: pure black/white, no
       gradients, no shadows, rules + type + whitespace only) ═══ */

    /* 01 ZEN MINIMAL: calm, whitespace-led, centered. */
    body.receipt-zen { line-height: 1.6; text-align: center; }
    body.receipt-zen .header-block { border: 0; padding-bottom: 10px; }
    body.receipt-zen .restaurant-name { font-size: ${fontSizePx + 6}px; font-weight: 900; }
    body.receipt-zen .branch-name, body.receipt-zen .branch-info { font-weight: 600; }
    body.receipt-zen .receipt-title { border: 0; font-size: ${fontSizePx + 2}px; font-weight: 700; padding: 10px 0 2px; }
    body.receipt-zen .order-meta-micro { padding: 6px 0 10px; }
    body.receipt-zen .micro-line { font-weight: 600; font-size: ${fontSizePx - 1}px; }
    body.receipt-zen .micro-dot { padding: 0 8px; font-weight: 400; }
    body.receipt-zen .micro-type { font-weight: 800; margin-top: 4px; }
    body.receipt-zen .micro-cashier { font-weight: 600; font-size: ${Math.max(fontSizePx - 4, 11)}px; margin-top: 2px; }
    body.receipt-zen .items-header td { border: 0; font-weight: 600; color: #000; }
    body.receipt-zen .items-table td { border: 0; padding: 8px 2px; }
    body.receipt-zen .item-name { font-weight: 800; }
    body.receipt-zen .summary-row td { font-weight: 600; }
    body.receipt-zen .grand-total { border: 0; border-top: 2px solid #000; padding: 14px 4px; margin-top: 12px; }
    body.receipt-zen .grand-total-value { font-size: ${fontSizePx + 8}px; }
    body.receipt-zen .receipt-footer { border: 0; }
    body.receipt-zen .qr-block { padding-top: 10px; }
    body.receipt-zen .qr-image { border: 0; }

    /* 02 MODULAR: smart blocks on a calm grid. */
    body.receipt-modular .order-meta-twocol {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
        border: 2px solid #000; padding: 10px; margin: 6px 0;
    }
    body.receipt-modular .twocol-cell { display: flex; flex-direction: column; gap: 2px; }
    body.receipt-modular .twocol-label { font-size: ${Math.max(fontSizePx - 5, 10)}px; font-weight: 600; text-transform: uppercase; }
    body.receipt-modular .twocol-value { font-size: ${fontSizePx}px; font-weight: 800; }
    body.receipt-modular .items-table { border: 2px solid #000; }
    body.receipt-modular .items-table td { padding: 7px 6px; }
    body.receipt-modular .items-header td { background: #fff; border-bottom: 2px solid #000; font-weight: 800; }
    body.receipt-modular .summary-table { border: 2px solid #000; border-top: 0; }
    body.receipt-modular .summary-row td { padding: 5px 6px; }
    body.receipt-modular .grand-total { border: 2px solid #000; border-top: 0; margin-top: 0; }

    /* 03 CARD: stacked product cards, editorial rhythm. */
    body.receipt-card .stacked-items { padding: 4px 0; }
    body.receipt-card .stack-item { padding: 10px 2px; border-bottom: 1px dotted #000; }
    body.receipt-card .stack-name { font-size: ${fontSizePx + 3}px; font-weight: 800; line-height: 1.4; }
    body.receipt-card .stack-line { display: flex; justify-content: space-between; font-weight: 600; margin-top: 3px; }
    body.receipt-card .stack-line span:last-child { font-weight: 800; direction: ltr; unicode-bidi: isolate; }
    body.receipt-card .order-meta-micro { text-align: center; }
    body.receipt-card .micro-line { font-weight: 700; font-size: ${fontSizePx + 1}px; }
    body.receipt-card .grand-total { border: 0; border-top: 2px solid #000; }

    /* 04 ARABIC-FIRST: RTL editorial ledger rows. */
    body.receipt-arabic .order-meta-rows { padding: 6px 0; }
    body.receipt-arabic .meta-row {
        display: flex; justify-content: space-between; align-items: baseline;
        gap: 10px; padding: 5px 0; border-bottom: 1px dotted #000;
        font-size: ${fontSizePx}px;
    }
    body.receipt-arabic .meta-row span:first-child { font-weight: 600; }
    body.receipt-arabic .meta-row span:last-child { font-weight: 800; }
    body.receipt-arabic .items-table td { padding: 8px 2px; }
    body.receipt-arabic .item-name { font-size: ${fontSizePx + 3}px; }
    body.receipt-arabic .grand-total-value { font-size: ${fontSizePx + 8}px; }

    /* 05 SPLIT: numbered chapters organize the scan. */
    body.receipt-split .chapter { display: flex; align-items: baseline; gap: 8px; margin: 12px 0 4px; }
    body.receipt-split .chapter-num { font-size: ${fontSizePx + 6}px; font-weight: 900; }
    body.receipt-split .chapter-text { font-size: ${Math.max(fontSizePx - 2, 12)}px; font-weight: 700; text-transform: uppercase; }
    body.receipt-split .grand-total { border-width: 3px; }
    body.receipt-split .qr-block { padding-top: 8px; }

    /* 06 TIMELINE: one vertical flow with node dots. */
    body.receipt-timeline .order-meta-micro { text-align: center; }
    body.receipt-timeline .micro-line { font-weight: 800; font-size: ${fontSizePx + 6}px; }
    body.receipt-timeline .micro-type { font-weight: 600; }
    body.receipt-timeline .tl-items { border-inline-start: 2px solid #000; margin-inline-start: 6px; padding-inline-start: 0; }
    body.receipt-timeline .tl-item {
        position: relative; display: flex; align-items: baseline; gap: 6px;
        padding: 7px 0 7px 0; padding-inline-start: 16px;
    }
    body.receipt-timeline .tl-node {
        position: absolute; inset-inline-start: -7px; top: 14px;
        width: 12px; height: 12px; background: #000; border-radius: 50%;
    }
    body.receipt-timeline .tl-text { flex: 1; font-weight: 800; font-size: ${fontSizePx + 1}px; }
    body.receipt-timeline .tl-total { font-weight: 800; direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
    body.receipt-timeline .summary-row td { font-weight: 700; }
    body.receipt-timeline .grand-total { border: 0; border-top: 2px solid #000; }
    body.receipt-timeline .grand-total-value { font-size: ${fontSizePx + 8}px; }
    body.receipt-timeline .qr-block { padding-top: 10px; }

    /* 07 ULTRA: maximum paper efficiency, still premium. */
    body.receipt-ultra { line-height: 1.28; }
    body.receipt-ultra .logo-block img { max-height: 40px !important; }
    body.receipt-ultra .header-block { padding-bottom: 4px; }
    body.receipt-ultra .restaurant-name { font-size: ${fontSizePx + 3}px; }
    body.receipt-ultra .receipt-title { padding: 3px 0; font-size: ${fontSizePx}px; }
    body.receipt-ultra .order-meta-micro { padding: 2px 0; }
    body.receipt-ultra .micro-line { font-size: ${Math.max(fontSizePx - 2, 12)}px; font-weight: 700; }
    body.receipt-ultra .mini-items { padding: 2px 0; }
    body.receipt-ultra .mini-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px dotted #000; font-weight: 700; }
    body.receipt-ultra .mini-name { flex: 1; }
    body.receipt-ultra .mini-total { font-weight: 800; direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
    body.receipt-ultra .summary-row td { padding: 2px 0; }
    body.receipt-ultra .grand-total { border: 0; padding: 6px 0; margin-top: 4px; }
    body.receipt-ultra .grand-total-value { font-size: ${fontSizePx + 6}px; }
    body.receipt-ultra .receipt-footer { border-top: 1px dashed #000; padding-top: 5px; }
    body.receipt-ultra .qr-block { padding: 2px 0; }

    /* 08 SIGNATURE: the Coduis Zen identity — ring mark + framed total. */
    body.receipt-signature .restaurant-name::before {
        content: ''; display: block; width: 22px; height: 22px; margin: 0 auto 6px;
        border: 4px solid #000; border-radius: 50%;
    }
    body.receipt-signature .receipt-title { border: 0; font-weight: 700; letter-spacing: 2px; }
    body.receipt-signature .order-meta-micro { text-align: center; }
    body.receipt-signature .micro-line { font-weight: 700; }
    body.receipt-signature .stacked-items { padding: 4px 0; }
    body.receipt-signature .stack-item { padding: 9px 2px; border-bottom: 1px dotted #000; }
    body.receipt-signature .stack-name { font-size: ${fontSizePx + 2}px; font-weight: 800; }
    body.receipt-signature .stack-line { display: flex; justify-content: space-between; font-weight: 600; margin-top: 2px; }
    body.receipt-signature .stack-line span:last-child { font-weight: 800; direction: ltr; unicode-bidi: isolate; }
    body.receipt-signature .grand-total { flex-direction: column; gap: 6px; border: 3px solid #000; padding: 14px 8px; text-align: center; }
    body.receipt-signature .grand-total-value { font-size: ${fontSizePx + 8}px; }
    body.receipt-signature .qr-block { padding-top: 10px; }
    body.receipt-signature .qr-image { border-width: 2px; padding: 8px; }

    /* 09 QR HERO: total + QR are the two anchors. */
    body.receipt-qrhero .order-meta-micro { text-align: center; }
    body.receipt-qrhero .micro-line { font-weight: 800; font-size: ${fontSizePx + 2}px; }
    body.receipt-qrhero .grand-total { border: 0; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 14px 4px; }
    body.receipt-qrhero .grand-total-value { font-size: ${fontSizePx + 10}px; }
    body.receipt-qrhero .qr-block { padding: 12px 0 4px; }
    body.receipt-qrhero .qr-image { border: 0; }

    /* 10 NEGATIVE: luxury breathing room, monumental total. */
    body.receipt-negative { line-height: 1.7; }
    body.receipt-negative .block { margin: 12px 0; }
    body.receipt-negative .header-block { border: 0; }
    body.receipt-negative .restaurant-name { font-size: ${fontSizePx + 6}px; }
    body.receipt-negative .receipt-title { border: 0; font-size: ${fontSizePx + 4}px; font-weight: 700; }
    body.receipt-negative .order-meta-micro { text-align: center; padding: 8px 0; }
    body.receipt-negative .micro-line { font-weight: 600; }
    body.receipt-negative .items-table td { border: 0; padding: 10px 2px; }
    body.receipt-negative .items-header td { border: 0; font-weight: 600; }
    body.receipt-negative .summary-row td { font-weight: 600; }
    body.receipt-negative .grand-total { border: 0; flex-direction: column; gap: 8px; padding: 20px 4px; text-align: center; }
    body.receipt-negative .grand-total-value { font-size: ${fontSizePx + 16}px; }
    body.receipt-negative .receipt-footer { border: 0; }
    body.receipt-negative .qr-block { padding-top: 12px; }

    /* 11 GEOMETRIC: precise dot-and-rule rhythm. */
    body.receipt-geometric .header-block { border-bottom: 2px solid #000; }
    body.receipt-geometric .restaurant-name::after {
        content: '• • •'; display: block; font-size: 12px; letter-spacing: 6px; margin-top: 4px;
    }
    body.receipt-geometric .order-meta { border-bottom: 2px dotted #000; }
    body.receipt-geometric .items-table td { border-bottom: 2px dotted #000; }
    body.receipt-geometric .summary-row td { border-bottom: 2px dotted #000; }
    body.receipt-geometric .grand-total { border-style: double; border-width: 5px; }
    body.receipt-geometric .receipt-footer { border-top: 2px dotted #000; }

    /* 12 GLANCE: four zones, one-second comprehension. */
    body.receipt-glance .order-meta-micro { text-align: center; padding: 4px 0 8px; }
    body.receipt-glance .micro-line { font-weight: 900; font-size: ${fontSizePx + 10}px; }
    body.receipt-glance .micro-type, body.receipt-glance .micro-cashier { font-weight: 600; }
    body.receipt-glance .items-header { display: none; }
    body.receipt-glance .mini-items { padding: 4px 0; }
    body.receipt-glance .mini-row { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px dotted #000; font-weight: 800; font-size: ${fontSizePx + 1}px; }
    body.receipt-glance .mini-name { flex: 1; }
    body.receipt-glance .mini-total { direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
    body.receipt-glance .summary-row td { font-weight: 600; }
    body.receipt-glance .grand-total { border: 0; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 12px 4px; }
    body.receipt-glance .grand-total-value { font-size: ${fontSizePx + 12}px; }
    body.receipt-glance .qr-block { padding-top: 8px; }
</style>
</head>
<body class="receipt-${styleVariant}${hideMoney ? ' kitchen-mode' : ''}">${blockHtml}</body>
</html>`;
};
