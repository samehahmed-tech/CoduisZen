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

export type ReceiptStyleVariant = 'royal' | 'neo' | 'ledger' | 'express';
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
    const fontSizePx = template.fontSize === 'small' ? 19 : template.fontSize === 'large' ? 26 : 23;
    // Legacy factory variants map onto the new design system so stored
    // templates keep a polished look: classic→ledger, compact→express, bold→royal.
    const LEGACY_VARIANT_MAP: Record<string, ReceiptStyleVariant> = {
        classic: 'ledger',
        compact: 'express',
        bold: 'royal',
    };
    const rawVariant = String(template.styleVariant || 'royal');
    const styleVariant: ReceiptStyleVariant = (['royal', 'neo', 'ledger', 'express'] as string[]).includes(rawVariant)
        ? rawVariant as ReceiptStyleVariant
        : LEGACY_VARIANT_MAP[rawVariant] || 'royal';
    const isExpress = styleVariant === 'express';
    const isRoyal = styleVariant === 'royal';
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
                    return `
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
                    const itemRows = (order.items || []).map((item) => {
                        const modsPrice = (item.selectedModifiers || []).reduce((s, m) => s + (m.price || 0), 0);
                        const unitPrice = (item.price || 0) + modsPrice;
                        const lineGross = unitPrice * (item.quantity || 1);
                        let itemDiscount = 0;
                        if ((item as any).itemDiscount && (item as any).itemDiscount > 0) {
                            itemDiscount = (item as any).itemDiscountType === 'percent'
                                ? lineGross * ((item as any).itemDiscount / 100)
                                : (item as any).itemDiscount;
                        }
                        const lineNet = lineGross - itemDiscount;

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
                                ${cfg.showPrice ? `<td class="col-price">${formatAmountHtml(unitPrice)}</td>` : ''}
                                <td class="col-total">${formatAmountHtml(lineNet)}</td>
                            </tr>
                        `;
                    }).join('');

                    return `
                        <div class="block">
                            <table class="items-table">
                                <tr class="items-header">
                                    <td class="col-item">${pickText('Item', ar.item)}</td>
                                    ${cfg.showQty ? `<td class="col-qty">${pickText('Qty', ar.qty)}</td>` : ''}
                                    ${cfg.showPrice ? `<td class="col-price">${pickText('Price', ar.price)}</td>` : ''}
                                    <td class="col-total">${pickText('Total', ar.total)}</td>
                                </tr>
                                ${itemRows}
                            </table>
                        </div>
                    `;
                }

                case 'totals':
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
                    const qrValue = cfg.url || (settings as any).receiptQrUrl || '';
                    const qrSize = Math.max(48, Math.min(280, Number(cfg.size || (template.paperWidth === '58mm' ? 140 : 200))));
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
        padding: 1mm;
        width: ${bodyWidthMm}mm;
        max-width: 100%;
        color: #111;
        background: #fff;
        direction: ${dir};
        font-family: 'Cairo', Tahoma, Arial, sans-serif;
        font-size: ${fontSizePx}px;
        line-height: 1.38;
        font-weight: 800;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    img { display: block; margin: 0 auto; filter: grayscale(1) contrast(1.15); }
    .block { margin: ${isExpress ? 2 : 5}px 0; }
    .logo-block, .payment-section, .qr-block, .receipt-footer { text-align: center; }
    .header-block { text-align: center; padding-bottom: ${isExpress ? 4 : 8}px; border-bottom: ${isRoyal ? 4 : 2}px solid #111; }
    .restaurant-name { font-size: ${fontSizePx + 6}px; font-weight: 900; line-height: 1.2; }
    .branch-name { font-size: ${Math.max(fontSizePx - 1, 14)}px; font-weight: 900; color: #222; }
    .branch-info { font-size: ${Math.max(fontSizePx - 2, 13)}px; color: #333; font-weight: 900; }
    .receipt-title {
        text-align: center;
        padding: 8px 6px;
        border: 1px dashed #111;
        border-radius: 4px;
        background: #f5f5f5;
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
        gap: 4px;
        padding: 6px 0;
        border-bottom: 1px dashed #ccc;
    }
    .meta-block { display: flex; min-width: 0; flex-direction: column; gap: 2px; text-align: ${textAlign}; }
    .meta-center { text-align: center; }
    .meta-end { text-align: ${textAlignEnd}; }
    .meta-label { font-size: ${Math.max(fontSizePx - 4, 10)}px; color: #444; font-weight: 900; text-transform: uppercase; white-space: nowrap; }
    .meta-value, .meta-time { display: block; font-weight: 900; white-space: nowrap; unicode-bidi: isolate; }
    .type-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 12px;
        border-radius: 12px;
        border: 1.5px solid #111;
        background: #fff;
        color: #111;
        font-size: ${Math.max(fontSizePx - 2, 13)}px;
        font-weight: 900;
        line-height: 1.9;
        min-width: 0;
        max-width: 100%;
        white-space: normal;
        overflow: visible;
        overflow-wrap: anywhere;
        text-align: center;
    }
    .customer-info { padding: 2px 0; }
    .info-chip { padding: 3px 0; font-weight: 900; color: #222; }
    .items-table, .summary-table { width: 100%; border-collapse: collapse; }
    .items-table { table-layout: fixed; }
    .items-header td {
        font-size: ${Math.max(fontSizePx - 3, 13)}px;
        font-weight: 900;
        text-transform: uppercase;
        color: #777;
        border-bottom: 2px solid #222;
    }
    .items-table td {
        padding: 5px 2px;
        vertical-align: top;
        border-bottom: 1px dashed #e5e5e5;
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
    .item-name { display: block; font-weight: 900; font-size: ${fontSizePx + 2}px; line-height: 1.34; }
    .item-mod, .item-note { font-size: ${Math.max(fontSizePx - 2, 14)}px; color: #222; margin-top: 2px; line-height: 1.32; font-weight: 900; }
    .item-discount { font-size: ${Math.max(fontSizePx - 2, 14)}px; color: #111; margin-top: 2px; line-height: 1.32; font-weight: 900; }
    .mod-price { color: #999; }
    .summary-row td { padding: 4px 0; font-weight: 900; text-align: ${textAlign}; }
    .summary-row td:last-child { text-align: ${textAlignEnd}; direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
    .discount-row td { color: #111; }
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
        padding: ${isExpress ? 6 : 9}px 10px;
        border: 3px solid #111;
        border-radius: 4px;
        background: #fff;
        color: #000;
        font-weight: 900;
        margin: 6px 2px 0;
        overflow: hidden;
    }
    .grand-total-label { padding-inline: 2px; }
    .grand-total-value { font-size: ${fontSizePx + 3}px; font-weight: 900; padding-inline: 2px; }
    .grand-total-label { text-align: ${textAlign}; }
    .grand-total-value { direction: ltr; unicode-bidi: isolate; white-space: nowrap; text-align: ${textAlignEnd}; }
    .payment-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1.5px solid #333;
        border-radius: 12px;
        padding: 7px 18px;
        min-width: 110px;
        max-width: 100%;
        font-size: ${Math.max(fontSizePx - 2, 13)}px;
        font-weight: 900;
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
        padding: 4px;
        border: 1px solid #111;
        background: #fff;
        object-fit: contain;
        image-rendering: pixelated;
    }
    .qr-text { font-size: ${Math.max(fontSizePx - 3, 11)}px; color: #333; word-break: break-all; font-weight: 800; }
    .receipt-footer {
        padding-top: 8px;
        padding-bottom: 10px;
        border-top: 2px solid #111;
        margin-top: 8px;
    }
    .footer-thanks { font-size: ${fontSizePx + 1}px; font-weight: 800; }
    .tax-id-line, .powered-by { font-size: ${Math.max(fontSizePx - 3, 10)}px; color: #555; margin-top: 4px; font-weight: 800; }
    .dashed-sep, .thick-sep { border: none; margin: 6px 0; }
    .dashed-sep { border-top: 1px dashed #bbb; }
    .thick-sep { border-top: 2px solid #222; }

    /* ROYAL (default): inverted title band, hero order number, zebra rows,
       framed total. Striking hierarchy, still calm to read. */
    body.receipt-royal .header-block { border: 0; padding-bottom: 6px; border-bottom: 2px solid #111; }
    body.receipt-royal .restaurant-name { font-size: ${fontSizePx + 8}px; letter-spacing: -0.5px; }
    body.receipt-royal .receipt-title { background: #111; color: #fff; border: 0; border-radius: 0; font-size: ${fontSizePx + 4}px; letter-spacing: 0; line-height: 1.9; padding: 10px 6px; overflow: visible; }
    body.receipt-royal .order-meta { border: 3px solid #111; border-radius: 4px; padding: 6px 8px; }
    body.receipt-royal .order-meta .meta-block:first-child .meta-value { font-size: ${fontSizePx + 10}px; line-height: 1.1; }
    body.receipt-royal .items-header td { color: #111; border-top: 3px solid #111; border-bottom: 3px solid #111; }
    body.receipt-royal .items-table tr:not(.items-header):nth-child(even) td { background: #eee; }
    body.receipt-royal .item-name { font-size: ${fontSizePx + 3}px; }
    body.receipt-royal .summary-table { border-top: 2px solid #111; }
    body.receipt-royal .grand-total { border-width: 5px; padding: 10px; }
    body.receipt-royal .receipt-footer { border-top: 3px double #111; }
    body.receipt-royal .payment-pill { border-width: 2.5px; border-radius: 8px; }

    /* NEO: airy minimal. Hairline dividers, breathing room, soft total card. */
    body.receipt-neo { line-height: 1.5; }
    body.receipt-neo .header-block { border: 0; border-bottom: 1px solid #111; padding-bottom: 6px; }
    body.receipt-neo .restaurant-name { font-size: ${fontSizePx + 5}px; font-weight: 800; }
    body.receipt-neo .receipt-title { background: #fff; border: 1px solid #111; border-radius: 8px; }
    body.receipt-neo .order-meta { border: 0; border-bottom: 1px dashed #999; }
    body.receipt-neo .items-header td { color: #555; border: 0; border-bottom: 1px solid #111; }
    body.receipt-neo .items-table td { border-bottom: 0; padding: 6px 2px; }
    body.receipt-neo .items-table tr:not(.items-header) td { border-bottom: 1px dotted #bbb; }
    body.receipt-neo .grand-total { border-radius: 10px; border-width: 2px; }
    body.receipt-neo .receipt-footer { border-top: 1px solid #111; }
    body.receipt-neo .payment-pill { border-radius: 12px; }

    /* LEDGER: formal ruled ledger. Double rules, calm sections, tabular figures. */
    body.receipt-ledger .header-block { border-top: 3px double #111; border-bottom: 3px double #111; padding: 8px 0; }
    body.receipt-ledger .receipt-title { border-left: 0; border-right: 0; border-radius: 0; background: #fff; border-top: 0; }
    body.receipt-ledger .order-meta { border-top: 1px solid #111; border-bottom: 1px solid #111; }
    body.receipt-ledger .items-header td { border-top: 1px solid #111; border-bottom: 2px solid #111; }
    body.receipt-ledger .summary-table { border-top: 2px solid #111; }
    body.receipt-ledger .receipt-footer { border-top: 3px double #111; }

    /* EXPRESS: dense paper-saver for rush counters and 58mm rolls. */
    body.receipt-express { line-height: 1.22; }
    body.receipt-express .logo-block img { max-height: 44px !important; }
    body.receipt-express .header-block { text-align: ${textAlign}; border: 0; border-bottom: 2px solid #111; padding: 0 0 4px; }
    body.receipt-express .restaurant-name { font-size: ${fontSizePx + 3}px; }
    body.receipt-express .branch-info { display: inline; margin-inline-end: 8px; }
    body.receipt-express .receipt-title { padding: 4px 0; }
    body.receipt-express .order-meta { border-top: 2px solid #111; border-bottom: 2px solid #111; padding: 4px 0; }
    body.receipt-express .items-table td { padding-top: 3px; padding-bottom: 3px; border-bottom: 0; }
    body.receipt-express .items-table tr:not(.items-header):nth-child(even) td { background: #f0f0f0; }
    body.receipt-express .summary-table { border-top: 2px solid #111; }
    body.receipt-express .grand-total { margin-inline: 0; padding: 6px 8px; }
    body.receipt-express .receipt-footer { border-top: 1px dashed #111; padding-top: 5px; }
</style>
</head>
<body class="receipt-${styleVariant}">${blockHtml}</body>
</html>`;
};
