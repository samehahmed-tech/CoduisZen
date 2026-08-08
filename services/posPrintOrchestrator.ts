import { Branch, MenuCategory, Order, OrderItem, Printer } from '../types';
import { generateReceiptHTML } from './receiptTemplate';
import { generateKitchenTicketHTML } from './kitchenTicketTemplate';
import { PrintJob, printService } from '../src/services/printService';
import { findDefaultTemplate, findTemplateForPrinter, generateHtmlFromTemplate, selectReceiptTemplate } from './templateReceiptGenerator';
import { createImagePrintPayload } from './receiptImageRenderer';

interface KitchenPrintParams {
    order: Order;
    categories: MenuCategory[];
    printers: Printer[];
    branchId: string;
    maxKitchenPrinters?: number;
    settings: any;
    currencySymbol: string;
    lang: 'en' | 'ar';
    t: any;
    branch?: Branch;
}

interface ReceiptPrintParams {
    order: Order;
    printers?: Printer[];
    settings: any;
    currencySymbol: string;
    lang: 'en' | 'ar';
    t: any;
    branch?: Branch;
    title?: string;
}

const DEFAULT_MAX_KITCHEN_PRINTERS = 2;
export const POS_PRINT_STATION_KEY = 'restoflow_pos_print_station_id';

export const getCurrentPrintStationId = () => {
    if (typeof window === 'undefined') return '';
    try {
        return String(window.localStorage.getItem(POS_PRINT_STATION_KEY) || '').trim();
    } catch {
        return '';
    }
};

const normalizeMaxPrinters = (value?: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_KITCHEN_PRINTERS;
    return Math.floor(parsed);
};

const normalizeCopyCount = (value?: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 1;
    return Math.min(10, Math.floor(parsed));
};

const resolvePrinterDetails = (printer: Printer | undefined): Partial<PrintJob> => {
    if (!printer) return {};
    return {
        printerId: printer.id,
        printerAddress: printer.address,
        printerType: printer.type,
        targetGatewayId: (printer as any).gatewayId || (printer as any).stationId || undefined,
    };
};

const isOperationalPrinter = (printer: Printer) => printer.isActive && printer.isOnline !== false;

const getPrinterRoles = (printer?: Printer): string[] => {
    if (!printer) return [];
    const roles = Array.isArray(printer.roles) && printer.roles.length > 0 ? printer.roles : (printer.role ? [printer.role] : []);
    return roles.map((role) => String(role || '').toUpperCase());
};

const resolveBranchPrinters = (printers: Printer[], branchId: string) =>
    (printers || []).filter((p) => p.isActive && (!p.branchId || p.branchId === branchId));

const resolveOnlineBranchPrinters = (printers: Printer[], branchId: string) =>
    resolveBranchPrinters(printers, branchId).filter(isOperationalPrinter);

const itemMatchesStation = (item: OrderItem, category: MenuCategory | undefined, station: 'SHAWARMA' | 'CREPE') => {
    const text = [
        item.name,
        (item as any).nameAr,
        category?.name,
        (category as any)?.nameAr,
    ].join(' ').toLowerCase();

    if (station === 'SHAWARMA') {
        return text.includes('shawarma') || text.includes('شاورما');
    }

    return text.includes('crepe') || text.includes('كريب');
};

export const resolveKitchenPrinterIdsForItem = (
    item: OrderItem,
    categoryMap: Map<string, MenuCategory>,
    branchPrinters: Printer[],
    onlineBranchPrinters: Printer[],
    maxPrinters: number
): string[] => {
    const itemCategory = categoryMap.get(item.categoryId || '');
    const itemPrinterIds = Array.isArray(item.printerIds) ? item.printerIds : [];
    const categoryPrinterIds = Array.isArray(itemCategory?.printerIds)
        ? itemCategory.printerIds
        : (Array.isArray((itemCategory as any)?.kitchenPrinterIds) ? (itemCategory as any).kitchenPrinterIds : []);
    const assignedPrinterIds = itemPrinterIds.length > 0 ? itemPrinterIds : categoryPrinterIds;

    if (assignedPrinterIds.length === 0) {
        const smartRolePrinters = onlineBranchPrinters.filter((printer) => {
            const roles = getPrinterRoles(printer);
            return (roles.includes('SHAWARMA') && itemMatchesStation(item, itemCategory, 'SHAWARMA'))
                || (roles.includes('CREPE') && itemMatchesStation(item, itemCategory, 'CREPE'));
        });
        if (smartRolePrinters.length > 0) {
            return smartRolePrinters.slice(0, maxPrinters).map((p) => p.id);
        }

        const kitchenPrinters = onlineBranchPrinters.filter((p) => getPrinterRoles(p).includes('KITCHEN'));
        return kitchenPrinters.slice(0, maxPrinters).map((p) => p.id);
    }

    const validIds: string[] = [];
    for (const pid of assignedPrinterIds) {
        const printer = branchPrinters.find((p) => p.id === pid);
        if (printer && isOperationalPrinter(printer)) {
            validIds.push(pid);
        }
    }
    return Array.from(new Set(validIds));
};

const resolveFallbackKitchenPrinter = (
    _branchPrinters: Printer[],
    onlineBranchPrinters: Printer[]
): Printer | undefined => {
    const kitchenPrinters = onlineBranchPrinters.filter((p) => getPrinterRoles(p).includes('KITCHEN'));
    return kitchenPrinters[0];
};

const resolvePrimaryCashierPrinter = (
    printers: Printer[],
    branchId: string,
    settings: any
): Printer | undefined => {
    const branchPrinters = resolveBranchPrinters(printers, branchId);
    const online = branchPrinters.filter(isOperationalPrinter);
    const currentStationId = getCurrentPrintStationId();

    if (currentStationId) {
        const stationPrinter = online.find((p: any) => {
            const roles = getPrinterRoles(p);
            return roles.includes('CASHIER')
                && [p.stationId, p.gatewayId, p.code, p.id]
                    .map((value) => String(value || '').trim().toLowerCase())
                    .includes(currentStationId.toLowerCase());
        });
        if (stationPrinter) return stationPrinter;
    }

    const configuredCashierPrinterId = settings?.primaryCashierPrinterId || settings?.defaultCashierPrinterId;
    if (configuredCashierPrinterId) {
        const found = online.find((p) => p.id === configuredCashierPrinterId);
        if (found) return found;
    }

    const primaryCashierPrinter = online.find((p) => p.isPrimaryCashier === true);
    if (primaryCashierPrinter) return primaryCashierPrinter;

    const cashierPrinter = online.find((p) => {
        const roles = getPrinterRoles(p);
        return roles.includes('CASHIER') || roles.includes('RECEIPT');
    });
    return cashierPrinter;
};

export const hasCashierPrinterConfigured = (printers: Printer[], branchId: string, settings: any) =>
    Boolean(resolvePrimaryCashierPrinter(printers || [], branchId, settings));

const resolvePrinterPaperWidth = (printer?: Printer, linkedTemplate?: { paperWidth?: '58mm' | '80mm' } | null): '58mm' | '80mm' => {
    const printerWidth = Number((printer as any)?.paperWidth || 0);
    if (printerWidth > 0) return printerWidth <= 58 ? '58mm' : '80mm';
    if (linkedTemplate?.paperWidth) return linkedTemplate.paperWidth;
    return '80mm';
};

const buildKitchenTitle = (
    lang: 'en' | 'ar',
    t: any,
    targetPrinter?: Printer,
    isFallback?: boolean
) => {
    const roleLabel = targetPrinter ? ` (${getPrinterRoles(targetPrinter).join('/') || targetPrinter.role || 'OTHER'})` : '';
    const fallbackLabel = isFallback ? (lang === 'ar' ? ' - \u0628\u062F\u064A\u0644' : ' - Fallback') : '';
    const printerLabel = targetPrinter?.name ? ` - ${targetPrinter.name}${roleLabel}` : '';
    return `${t.kitchen_ticket || (lang === 'ar' ? '\u062A\u0630\u0643\u0631\u0629 \u0627\u0644\u0645\u0637\u0628\u062E' : 'Kitchen Ticket')}${printerLabel}${fallbackLabel}`;
};

export const printKitchenTicketsByRouting = async ({
    order,
    categories,
    printers,
    branchId,
    maxKitchenPrinters,
    settings,
    currencySymbol,
    lang,
    t,
    branch,
}: KitchenPrintParams): Promise<void> => {
    const maxPrinters = normalizeMaxPrinters(maxKitchenPrinters);
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const branchPrinters = resolveBranchPrinters(printers || [], branchId);
    const onlineBranchPrinters = resolveOnlineBranchPrinters(printers || [], branchId);

    const grouped = new Map<string, { items: OrderItem[]; isFallback: boolean }>();
    const failedPrinterIds: string[] = [];

    const packagingPrinters = onlineBranchPrinters.filter((printer) => getPrinterRoles(printer).includes('PACKAGING'));
    for (const printer of packagingPrinters) {
        grouped.set(printer.id, {
            items: [...(order.items || [])],
            isFallback: false,
        });
    }

    for (const item of order.items || []) {
        const resolvedPrinterIds = resolveKitchenPrinterIdsForItem(item, categoryMap, branchPrinters, onlineBranchPrinters, maxPrinters);
        const targets = resolvedPrinterIds.length > 0 ? resolvedPrinterIds : ['_fallback'];

        for (const printerId of targets) {
            const targetPrinter = printerId === '_fallback'
                ? resolveFallbackKitchenPrinter(branchPrinters, onlineBranchPrinters)
                : branchPrinters.find((p) => p.id === printerId) || resolveFallbackKitchenPrinter(branchPrinters, onlineBranchPrinters);

            // Never send a kitchen ticket to an arbitrary/default printer.
            // With no kitchen route, the cashier receipt pipeline remains independent.
            if (!targetPrinter) continue;

            const groupedPrinterId = targetPrinter?.id || '_fallback';
            if (targetPrinter && getPrinterRoles(targetPrinter).includes('PACKAGING') && grouped.has(groupedPrinterId)) {
                continue;
            }
            if (!grouped.has(groupedPrinterId)) {
                const isFallback = printerId === '_fallback' || (targetPrinter ? targetPrinter.isOnline === false : false);
                grouped.set(groupedPrinterId, { items: [], isFallback });
            }
            grouped.get(groupedPrinterId)!.items.push(item);
        }
    }

    for (const [printerId, payload] of grouped.entries()) {
        const targetPrinter = printerId === '_fallback'
            ? resolveFallbackKitchenPrinter(branchPrinters, onlineBranchPrinters)
            : branchPrinters.find((p) => p.id === printerId) || resolveFallbackKitchenPrinter(branchPrinters, onlineBranchPrinters);

        const ticketTitle = buildKitchenTitle(lang, t, targetPrinter, payload.isFallback);
        const ticketOrder = { ...order, items: payload.items };

        try {
            const linkedTemplate = targetPrinter ? findTemplateForPrinter(targetPrinter.id, 'kitchen') : null;
            const htmlTicket = linkedTemplate
                ? generateHtmlFromTemplate({
                    template: linkedTemplate,
                    order: ticketOrder,
                    settings,
                    currencySymbol,
                    lang,
                    branch,
                    title: ticketTitle,
                })
                : generateKitchenTicketHTML({
                    order: ticketOrder,
                    items: payload.items,
                    settings,
                    lang,
                    t,
                    branch,
                    title: ticketTitle,
                    printerName: targetPrinter?.name,
                });
            const imagePayload = await createImagePrintPayload(htmlTicket, resolvePrinterPaperWidth(targetPrinter, linkedTemplate));
            const printOk = await printService.print({
                type: 'KITCHEN',
                ...resolvePrinterDetails(targetPrinter),
                branchId,
                content: imagePayload.content,
                contentType: imagePayload.contentType,
            });
            if (!printOk) failedPrinterIds.push(printerId);
        } catch (error) {
            console.error('[print] kitchen ticket failed', { orderId: order.id, printerId, error });
            failedPrinterIds.push(printerId);
        }
    }

    if (failedPrinterIds.length > 0) throw new Error('KITCHEN_PRINT_QUEUE_FAILED');
};

export const printOrderReceipt = async ({
    order,
    printers,
    settings,
    currencySymbol,
    lang,
    t,
    branch,
    title,
}: ReceiptPrintParams): Promise<void> => {
    const resolveReceiptAssetUrl = (value?: string) => {
        const source = String(value || '').trim();
        if (!source || /^(data:|https?:|blob:)/i.test(source) || typeof window === 'undefined') return source;
        try { return new URL(source, window.location.origin).href; } catch { return source; }
    };
    const receiptBrandingByOrderType = settings?.receiptBrandingByOrderType || {};
    const override = receiptBrandingByOrderType?.[order.type] || {};
    const effectiveSettings = {
        ...settings,
        receiptLogoUrl: resolveReceiptAssetUrl(override.logoUrl || settings?.receiptLogoUrl || ''),
        receiptQrUrl: override.qrUrl || settings?.receiptQrUrl || '',
    };
    const primaryCashierPrinter = resolvePrimaryCashierPrinter(printers || [], order.branchId, settings);

    const receiptTitle = title || t.order_receipt || (lang === 'ar' ? '\u0625\u064A\u0635\u0627\u0644 \u0628\u064A\u0639' : 'Order Receipt');

    const activeReceiptTemplate = selectReceiptTemplate({
        templates: settings?.receiptTemplates,
        defaultTemplateId: settings?.defaultReceiptTemplateId,
        templateByOrderType: settings?.receiptTemplateByOrderType,
        orderType: order.type,
        printerId: primaryCashierPrinter?.id,
    }) || findDefaultTemplate('receipt');
    const paperWidth = resolvePrinterPaperWidth(primaryCashierPrinter, activeReceiptTemplate);
    if (!primaryCashierPrinter) throw new Error('NO_CASHIER_PRINTER_CONFIGURED');

    const htmlReceipt = activeReceiptTemplate
        ? generateHtmlFromTemplate({
            template: activeReceiptTemplate,
            order,
            settings: effectiveSettings,
            currencySymbol,
            lang,
            branch,
            title: receiptTitle,
        })
        : generateReceiptHTML({
            order,
            settings: effectiveSettings,
            currencySymbol,
            lang,
            t,
            branch,
            title: receiptTitle,
        });

    const imagePayload = await createImagePrintPayload(htmlReceipt, paperWidth);
    const copies = normalizeCopyCount(settings?.cashierReceiptCopies);
    const queued = await Promise.all(Array.from({ length: copies }, () => printService.print({
        type: 'RECEIPT',
        ...resolvePrinterDetails(primaryCashierPrinter),
        branchId: order.branchId,
        content: imagePayload.content,
        contentType: 'image',
    })));
    if (!queued.every(Boolean)) throw new Error('RECEIPT_PRINT_QUEUE_FAILED');
};

