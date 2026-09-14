
import React, { useEffect, useRef, useState } from 'react';
import {
    Printer as PrinterIcon, Plus, Search, Edit3, Trash2,
    X, Network, Monitor, Building2,
    AlertCircle, RefreshCcw
} from 'lucide-react';
import { OrderStatus, OrderType, PaymentMethod, Printer, PrinterRole } from '../types';
import { printGatewayApi } from '../services/api/printGateway';
import { settingsApi } from '../services/api/settings';
import { printService } from '../src/services/printService';
import { findDefaultTemplate, findLatestTemplate, findTemplateForPrinter, generateHtmlFromTemplate } from '../services/templateReceiptGenerator';
import { generateReceiptHTML } from '../services/receiptTemplate';
import { createImagePrintPayload } from '../services/receiptImageRenderer';

// Stores
import { useAuthStore } from '../stores/useAuthStore';
import { useConfirm } from './common/ConfirmProvider';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds between heartbeat cycles

const PrinterManager: React.FC = () => {
    const { printers, branches, settings, updateSettings, fetchPrinters, createPrinterInDB, updatePrinterInDB, deletePrinterFromDB, heartbeatPrinterInDB } = useAuthStore();
    const { confirm } = useConfirm();
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const isAr = lang === 'ar';
    const tr = (en: string, ar: string) => isAr ? ar : en;
    const copy = {
        title: isAr ? 'إدارة الطابعات' : 'Printer Management',
        subtitle: isAr ? 'توصيل الطابعات، توزيع الأقسام، ومراقبة أوامر الطباعة الحية' : 'Configure printers, station routing, and the live print queue.',
        addPrinter: isAr ? 'إضافة طابعة' : 'Add Printer',
        search: isAr ? 'ابحث باسم الطابعة أو الكود أو العنوان...' : 'Search printers...',
        queueTitle: isAr ? 'مراقبة أوامر الطباعة' : 'Print Queue Monitor',
        queueSubtitle: isAr ? 'تابع الطباعة التلقائية والأخطاء في الفرع الحالي' : 'Live branch queue and failures',
        clearAll: isAr ? 'مسح الكل' : 'Clear All',
        refresh: isAr ? 'تحديث' : 'Refresh',
        noJobs: isAr ? 'لا توجد أوامر طباعة حديثة.' : 'No recent print jobs.',
        bridgeHint: isAr ? 'شغّل Print Bridge فقط؛ النظام يتعرف عليه ويرسل أوامر الفرع تلقائيًا بدون إعدادات إضافية.' : 'Start Print Bridge and the system automatically sends this branch\'s print jobs.',
        queued: isAr ? 'منتظر' : 'Queued',
        processing: isAr ? 'جاري' : 'Processing',
        completed: isAr ? 'تم' : 'Completed',
        failed: isAr ? 'فشل' : 'Failed',
        total: isAr ? 'الإجمالي' : 'Total',
    };

    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testPrintingId, setTestPrintingId] = useState<string | null>(null);
    const [testPrintResult, setTestPrintResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
    const [localPrinterDevices, setLocalPrinterDevices] = useState<Array<{ id: string; name: string; address: string; type: string; isDefault?: boolean; isOffline?: boolean }>>([]);
    const [localPrinterLoading, setLocalPrinterLoading] = useState(false);
    const [localPrinterError, setLocalPrinterError] = useState<string | null>(null);
    const [bridgeHealth, setBridgeHealth] = useState<any | null>(null);
    const [queueLoading, setQueueLoading] = useState(false);
    const [queueError, setQueueError] = useState<string | null>(null);
    const [queueStats, setQueueStats] = useState<{ queued: number; processing: number; completed: number; failed: number; total: number }>({
        queued: 0, processing: 0, completed: 0, failed: 0, total: 0,
    });
    const [queueJobs, setQueueJobs] = useState<any[]>([]);
    const [printerModal, setPrinterModal] = useState<{
        isOpen: boolean;
        mode: 'ADD' | 'EDIT';
        printer: Printer;
    } | null>(null);

    // Keep a ref to the current printers list so the heartbeat interval
    // always reads fresh data without re-triggering the useEffect.
    const printersRef = useRef(printers);
    printersRef.current = printers;

    const filteredPrinters = (printers || []).filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(p.address || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const primaryCashierPrinterId = settings.primaryCashierPrinterId || '';
    const cashierReceiptCopies = Math.max(1, Math.min(10, Number(settings.cashierReceiptCopies || 1)));
    const brandingByType = settings.receiptBrandingByOrderType || {};
    const printerRoleOptions: Array<{ value: PrinterRole; label: string; icon: string }> = [
        { value: 'PACKAGING', label: tr('Packaging', 'التغليف'), icon: 'PKG' },
        { value: 'GRILL', label: tr('Grill', 'الشواية'), icon: 'GRL' },
        { value: 'HOT_LINE', label: tr('Hot Line', 'الخط الساخن'), icon: 'HOT' },
        { value: 'COLD_STATION', label: tr('Cold Station', 'المحطة الباردة'), icon: 'CLD' },
        { value: 'FRY', label: tr('Fryer', 'القلاية'), icon: 'FRY' },
        { value: 'BAR', label: tr('Bar', 'البار'), icon: 'BAR' },
        { value: 'BAKERY', label: tr('Bakery', 'المخبوزات'), icon: 'BKY' },
        { value: 'SHAWARMA', label: tr('Shawarma', 'الشاورما'), icon: 'SHW' },
        { value: 'CREPE', label: tr('Crepe', 'الكريب'), icon: 'CRP' },
        { value: 'DESSERT', label: tr('Dessert', 'الحلويات'), icon: 'DST' },
        { value: 'KITCHEN', label: tr('General Kitchen', 'المطبخ العام'), icon: 'KTN' },
        { value: 'CASHIER', label: tr('Cashier', 'الكاشير'), icon: 'CSH' },
        { value: 'OTHER', label: tr('Other', 'أخرى'), icon: 'OTH' },
    ];
    const roleLabel = (role?: string) => printerRoleOptions.find((option) => option.value === role)?.label || role || tr('Other', 'أخرى');
    const orderTypeLabel = (type: OrderType) => ({
        [OrderType.DINE_IN]: tr('Dine-In', 'داخل الصالة'),
        [OrderType.TAKEAWAY]: tr('Takeaway', 'تيك أواي'),
        [OrderType.DELIVERY]: tr('Delivery', 'دليفري'),
        [OrderType.PICKUP]: tr('Pickup', 'استلام'),
    } as Record<string, string>)[type] || type;
    const printStatusLabel = (status?: string) => ({
        QUEUED: copy.queued,
        PROCESSING: copy.processing,
        COMPLETED: copy.completed,
        FAILED: copy.failed,
    } as Record<string, string>)[String(status || '').toUpperCase()] || status || '-';

    const handlePrimaryCashierChange = async (printerId: string) => {
        try {
            const selected = printers.find((printer) => printer.id === printerId);
            if (selected) {
                await updatePrinterInDB({ ...selected, isPrimaryCashier: true });
            }
            await settingsApi.updateBulk({
                primaryCashierPrinterId: printerId,
                autoPrintReceiptOnSubmit: Boolean(printerId),
            });
            updateSettings({
                primaryCashierPrinterId: printerId,
                autoPrintReceiptOnSubmit: Boolean(printerId),
            });
            await fetchPrinters();
        } catch (error: any) {
            setTestPrintResult({
                id: 'settings',
                ok: false,
                msg: error?.message || tr('Failed to save primary printer', 'تعذر حفظ طابعة الكاشير الأساسية'),
            });
            setTimeout(() => setTestPrintResult(null), 7000);
        }
    };

    const handleCashierCopiesChange = async (value: string) => {
        const copies = Math.max(1, Math.min(10, Number(value || 1)));
        updateSettings({ cashierReceiptCopies: copies });
        try {
            await settingsApi.updateBulk({ cashierReceiptCopies: copies });
        } catch (error: any) {
            setTestPrintResult({
                id: 'settings',
                ok: false,
                msg: error?.message || tr('Failed to save receipt copies', 'تعذر حفظ عدد نسخ الكاشير'),
            });
            setTimeout(() => setTestPrintResult(null), 7000);
        }
    };

    const updateBranding = (type: OrderType, field: 'logoUrl' | 'qrUrl', value: string) => {
        const current = settings.receiptBrandingByOrderType || {};
        updateSettings({
            receiptBrandingByOrderType: {
                ...current,
                [type]: {
                    ...current[type],
                    [field]: value,
                },
            },
        });
    };

    const getEffectiveReceiptSettings = (type: OrderType) => {
        const override = settings.receiptBrandingByOrderType?.[type] || {};
        return {
            ...settings,
            receiptLogoUrl: override.logoUrl || settings.receiptLogoUrl || '',
            receiptQrUrl: override.qrUrl || settings.receiptQrUrl || '',
        };
    };

    useEffect(() => {
        fetchPrinters();
    }, [fetchPrinters]);

    // Gateway capability registry: which bridge machines are online and which
    // Windows printers they see — powers the routing status badge per printer.
    const [bridgeRegistry, setBridgeRegistry] = useState<Array<{ gatewayId: string; online: boolean; lastSeenAt: string | null; branchId: string | null; printers: string[] }>>([]);
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            printGatewayApi.getBridges()
                .then((rows) => { if (!cancelled) setBridgeRegistry(rows || []); })
                .catch(() => { if (!cancelled) setBridgeRegistry([]); });
        };
        load();
        const timer = window.setInterval(load, 20000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, []);

    const gatewayStatusFor = (printer: Printer): { label: string; cls: string; gateway: string | null } => {
        const isLocal = String(printer.type || '').toUpperCase() !== 'NETWORK';
        if (!isLocal) return { label: tr('Network printer', 'طابعة شبكة'), cls: 'bg-sky-50 dark:bg-sky-900/10 text-sky-600 border-sky-100', gateway: printer.gatewayId || null };
        const boundId = printer.gatewayId || printer.stationId || null;
        if (boundId) {
            const entry = bridgeRegistry.find(b => b.gatewayId === boundId);
            if (entry?.online) return { label: `${tr('Online on', 'متصل على')} ${boundId}`, cls: 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 border-emerald-100', gateway: boundId };
            if (entry) return { label: `${tr('Bound to', 'مرتبطة بـ')} ${boundId} (${tr('offline', 'أوفلاين')})`, cls: 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 border-amber-100', gateway: boundId };
            return { label: `${tr('Bound to', 'مرتبطة بـ')} ${boundId} (${tr('never seen', 'لم يُرصد')})`, cls: 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 border-amber-100', gateway: boundId };
        }
        const addr = String(printer.address || '');
        const capable = bridgeRegistry.find(b => b.printers.some(name => name === addr || name === addr.replace(/^windows:/, '')));
        if (capable?.online) return { label: `${tr('Auto-routed to', 'توجيه تلقائي إلى')} ${capable.gatewayId}`, cls: 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 border-emerald-100', gateway: capable.gatewayId };
        return { label: tr('Unbound — may not print', 'غير مربوطة — قد لا تطبع'), cls: 'bg-rose-50 dark:bg-rose-900/10 text-rose-600 border-rose-100', gateway: null };
    };

    const bridgeUrls = () => {
        const host = window.location.hostname;
        const urls = ['http://localhost:3002'];
        if (host && !['localhost', '127.0.0.1'].includes(host)) urls.push(`http://${host}:3002`);
        return urls;
    };

    const localPrinterOptions = localPrinterDevices.filter((device) => (
        device.address?.startsWith('usb:') || device.address?.startsWith('windows:')
    ));

    const makePrinterCode = (printer: Printer) => (
        printer.code?.trim()
        || `${printer.type}-${printer.name}-${Date.now()}`.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
        || `PRN-${Date.now()}`
    );

    const displayPrinterAddress = (address = '') => address.replace(/^windows:/, '');

    const fetchBridge = async (path: string) => {
        let lastError: any;
        for (const base of bridgeUrls()) {
            try {
                const response = await fetch(`${base}${path}`);
                if (!response.ok) throw new Error(`Bridge ${response.status}`);
                return response;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('Print bridge is not reachable');
    };

    const loadLocalPrinterDevices = async () => {
        setLocalPrinterLoading(true);
        setLocalPrinterError(null);
        try {
            const response = await fetchBridge('/printers');
            const data = await response.json();
            setLocalPrinterDevices(Array.isArray(data?.printers) ? data.printers : []);
        } catch (error: any) {
            setLocalPrinterDevices([]);
            setLocalPrinterError(error?.message || 'Print bridge is not reachable');
        } finally {
            setLocalPrinterLoading(false);
        }
    };

    const loadBridgeHealth = async () => {
        try {
            const response = await fetchBridge('/health');
            setBridgeHealth(await response.json());
            setLocalPrinterError(null);
        } catch (error: any) {
            setBridgeHealth(null);
            setLocalPrinterError(error?.message || 'Print bridge is not reachable');
        }
    };

    useEffect(() => {
        loadBridgeHealth();
        const healthTimer = window.setInterval(loadBridgeHealth, 10_000);
        return () => window.clearInterval(healthTimer);
    }, []);

    useEffect(() => {
        if (printerModal?.isOpen && printerModal.printer.type === 'LOCAL') {
            loadLocalPrinterDevices();
        }
    }, [printerModal?.isOpen, printerModal?.printer.type]);

    // Heartbeat: fire once after mount, then every HEARTBEAT_INTERVAL_MS.
    // Uses a ref so the interval callback always sees the latest printers
    // WITHOUT re-running the effect (which was causing the infinite 429 cascade).
    useEffect(() => {
        let cancelled = false;

        const runHeartbeats = async () => {
            const currentPrinters = printersRef.current || [];
            const targets = currentPrinters.filter((p) => p.type === 'NETWORK');
            if (targets.length === 0) return;
            // Heartbeat each printer sequentially to avoid burst requests
            for (const p of targets) {
                if (cancelled) break;
                await heartbeatPrinterInDB(p.id).catch(() => undefined);
            }
        };

        // Initial heartbeat with a small delay to let the component settle
        const initialTimeout = window.setTimeout(runHeartbeats, 2000);
        const timer = window.setInterval(runHeartbeats, HEARTBEAT_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(initialTimeout);
            window.clearInterval(timer);
        };
    }, [heartbeatPrinterInDB]);

    const loadQueue = async () => {
        setQueueLoading(true);
        setQueueError(null);
        try {
            const branchId = settings.activeBranchId;
            const data = await printGatewayApi.getJobs({ branchId, limit: 20 });
            setQueueStats(data.stats || { queued: 0, processing: 0, completed: 0, failed: 0, total: 0 });
            setQueueJobs(Array.isArray(data.jobs) ? data.jobs : []);
        } catch (error: any) {
            setQueueError(error?.message || 'Failed to load print queue');
        } finally {
            setQueueLoading(false);
        }
    };

    useEffect(() => {
        loadQueue();
        const timer = window.setInterval(loadQueue, 5000);
        return () => window.clearInterval(timer);
    }, [settings.activeBranchId]);

    const handleSave = async () => {
        if (!printerModal) return;
        const nextPrinter = {
            ...printerModal.printer,
            name: printerModal.printer.name.trim(),
            address: printerModal.printer.type === 'LOCAL'
                && printerModal.printer.address.trim()
                && !printerModal.printer.address.trim().includes(':')
                ? `windows:${printerModal.printer.address.trim()}`
                : printerModal.printer.address.trim(),
            code: makePrinterCode(printerModal.printer),
            stationId: (printerModal.printer.stationId || '').trim(),
            gatewayId: (printerModal.printer.gatewayId || '').trim(),
            branchId: printerModal.printer.branchId || settings.activeBranchId || branches[0]?.id || '',
        };
        if (!nextPrinter.name || !nextPrinter.address || !nextPrinter.branchId) {
            setTestPrintResult({
                id: 'modal',
                ok: false,
                msg: tr('Printer name, branch, and address are required.', 'اسم الطابعة والفرع والعنوان مطلوبين.'),
            });
            setTimeout(() => setTestPrintResult(null), 7000);
            return;
        }
        setIsSaving(true);
        try {
            const persistedPrinter = printerModal.mode === 'ADD'
                ? { ...nextPrinter, id: `prn-${Date.now()}` }
                : nextPrinter;
            if (printerModal.mode === 'ADD') {
                await createPrinterInDB(persistedPrinter);
            } else {
                await updatePrinterInDB(persistedPrinter);
            }
            if (persistedPrinter.isPrimaryCashier) {
                const primaryCashierPrinterId = persistedPrinter.id;
                await settingsApi.updateBulk({ primaryCashierPrinterId, autoPrintReceiptOnSubmit: true });
                updateSettings({ primaryCashierPrinterId, autoPrintReceiptOnSubmit: true });
            }
            await fetchPrinters();
            setPrinterModal(null);
            setTestPrintResult({
                id: 'settings',
                ok: true,
                msg: printerModal.mode === 'ADD'
                    ? tr('Printer saved successfully.', 'تم حفظ الطابعة بنجاح.')
                    : tr('Printer updated successfully.', 'تم تحديث الطابعة بنجاح.'),
            });
            setTimeout(() => setTestPrintResult(null), 5000);
        } catch (error: any) {
            setTestPrintResult({
                id: 'modal',
                ok: false,
                msg: error?.message || tr('Failed to save printer.', 'تعذر حفظ الطابعة.'),
            });
            setTimeout(() => setTestPrintResult(null), 7000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: tr('Delete printer', 'حذف الطابعة'),
            message: tr('This printer will be removed from routing and print tests. Continue?', 'سيتم حذف الطابعة من التوجيه واختبارات الطباعة. هل تريد المتابعة؟'),
            confirmText: tr('Delete', 'حذف'),
            cancelText: tr('Cancel', 'إلغاء'),
            variant: 'danger',
        });
        if (!ok) return;
        await deletePrinterFromDB(id);
    };

    const handlePacketTest = async (id: string) => {
        setTestingId(id);
        await heartbeatPrinterInDB(id);
        setTestingId(null);
    };

    const resolveTargetGatewayId = (printer: Printer) => {
        const gatewayId = String((printer as any).gatewayId || '').trim();
        const stationId = String((printer as any).stationId || '').trim();
        return gatewayId || stationId || undefined;
    };

    const handleReceiptPipelineTestPrintV2 = async (printer: Printer) => {
        setTestPrintingId(printer.id);
        setTestPrintResult(null);
        try {
            const branch = branches.find((item) => item.id === (printer.branchId || settings.activeBranchId)) || branches[0];
            const linkedTemplate = findTemplateForPrinter(printer.id, 'receipt') || findDefaultTemplate('receipt') || findLatestTemplate('receipt');
            const printerWidth = Number((printer as any).paperWidth || 0);
            const paperWidth = printerWidth > 0
                ? (printerWidth <= 58 ? '58mm' : '80mm')
                : (linkedTemplate?.paperWidth || '80mm');
            const sampleOrder = {
                id: `test-v2-${printer.id}-${Date.now()}`,
                orderNumber: 9999,
                type: OrderType.DINE_IN,
                branchId: branch?.id || settings.activeBranchId || 'b1',
                tableId: 'T-7',
                customerName: lang === 'ar' ? '\u0639\u0645\u064a\u0644 \u062a\u062c\u0631\u064a\u0628\u064a' : 'Test Customer',
                customerPhone: '01000000000',
                deliveryAddress: lang === 'ar' ? '\u0627\u062e\u062a\u0628\u0627\u0631 \u0637\u0628\u0627\u0639\u0629 \u0639\u0631\u0628\u064a \u0648\u0627\u0636\u062d' : 'Print test - no symbols expected',
                items: [
                    {
                        id: 'itm-test-v2-1',
                        cartId: 'cart-test-v2-1',
                        name: 'Chicken Shawarma',
                        nameAr: '\u0634\u0627\u0648\u0631\u0645\u0627 \u0641\u0631\u0627\u062e',
                        price: 95,
                        categoryId: 'test',
                        isAvailable: true,
                        quantity: 2,
                        selectedModifiers: [
                            { groupName: 'Sauce', optionName: lang === 'ar' ? '\u062b\u0648\u0645\u064a\u0629' : 'Garlic', price: 0 },
                        ],
                        notes: lang === 'ar' ? '\u0628\u062f\u0648\u0646 \u0628\u0635\u0644 - \u0627\u062e\u062a\u0628\u0627\u0631 \u0639\u0631\u0628\u064a' : 'No onions - English test',
                    },
                    {
                        id: 'itm-test-v2-2',
                        cartId: 'cart-test-v2-2',
                        name: 'Fries',
                        nameAr: '\u0628\u0637\u0627\u0637\u0633',
                        price: 35,
                        categoryId: 'test',
                        isAvailable: true,
                        quantity: 1,
                        selectedModifiers: [],
                    },
                ],
                status: OrderStatus.PENDING,
                subtotal: 225,
                tax: 31.5,
                total: 256.5,
                discount: 0,
                createdAt: new Date(),
                paymentMethod: PaymentMethod.CASH,
                notes: lang === 'ar'
                    ? `\u0627\u062e\u062a\u0628\u0627\u0631 \u0637\u0627\u0628\u0639\u0629: ${printer.name} | \u0627\u0644\u0639\u0631\u0628\u064a \u064a\u062c\u0628 \u0623\u0646 \u064a\u0638\u0647\u0631 \u0628\u0648\u0636\u0648\u062d`
                    : `Printer test: ${printer.name} | Arabic should render clearly`,
                tipAmount: 0,
            };
            const effectiveSettings = getEffectiveReceiptSettings(sampleOrder.type);
            const testReceiptSettings = {
                ...effectiveSettings,
                receiptQrUrl: effectiveSettings.receiptQrUrl || 'https://coduis.com/restoflow-test-receipt',
            };

            const htmlReceipt = linkedTemplate
                ? generateHtmlFromTemplate({
                    template: linkedTemplate,
                    order: sampleOrder,
                    settings: testReceiptSettings,
                    currencySymbol: settings.currencySymbol || 'EGP',
                    lang,
                    branch,
                    title: lang === 'ar' ? '\u0634\u064a\u0643 \u0627\u062e\u062a\u0628\u0627\u0631 \u0627\u0644\u0637\u0628\u0627\u0639\u0629' : 'Printer Test Receipt',
                })
                : generateReceiptHTML({
                    order: sampleOrder,
                    settings: testReceiptSettings,
                    currencySymbol: settings.currencySymbol || 'EGP',
                    lang,
                    t: {},
                    branch,
                    title: lang === 'ar' ? '\u0634\u064a\u0643 \u0627\u062e\u062a\u0628\u0627\u0631 \u0627\u0644\u0637\u0628\u0627\u0639\u0629' : 'Printer Test Receipt',
                });

            const imagePayload = await createImagePrintPayload(htmlReceipt, paperWidth);
            const ok = await printService.print({
                type: 'RECEIPT',
                content: imagePayload.content,
                contentType: 'image',
                printerId: printer.id,
                printerAddress: printer.address,
                printerType: printer.type,
                targetGatewayId: resolveTargetGatewayId(printer),
                branchId: sampleOrder.branchId,
            });

            setTestPrintResult({
                id: printer.id,
                ok,
                msg: ok
                    ? (lang === 'ar'
                        ? `\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0634\u064a\u0643 \u0627\u062e\u062a\u0628\u0627\u0631 \u0641\u0639\u0644\u064a \u0628\u062a\u0635\u0645\u064a\u0645: ${linkedTemplate?.nameAr || linkedTemplate?.name || '\u0627\u0644\u0642\u0627\u0644\u0628 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a'}.`
                        : `Real receipt test sent with template: ${linkedTemplate?.name || 'Default receipt'}.`)
                    : (lang === 'ar'
                        ? '\u0641\u0634\u0644 \u0625\u0631\u0633\u0627\u0644 \u0634\u064a\u0643 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631. \u062a\u0623\u0643\u062f \u0645\u0646 \u0627\u0644\u0640 bridge \u0648\u0627\u0644\u0637\u0627\u0628\u0639\u0629.'
                        : 'Failed to send the test receipt. Check the bridge and printer.'),
            });
        } catch (err: any) {
            setTestPrintResult({ id: printer.id, ok: false, msg: err?.message || tr('Print error', 'خطأ في الطباعة') });
        } finally {
            setTestPrintingId(null);
            setTimeout(() => setTestPrintResult(null), 7000);
        }
    };

    const handleRetryJob = async (jobId: string) => {
        await printGatewayApi.retryJob(jobId, { branchId: settings.activeBranchId });
        await loadQueue();
    };

    const handleCancelJob = async (jobId: string) => {
        try {
            await printGatewayApi.cancelJob(jobId, { branchId: settings.activeBranchId });
            await loadQueue();
        } catch { /* ignore - queue will refresh anyway */ }
    };

    return (
        <div className="p-8 space-y-8 animate-fade-in transition-all pb-24 min-h-screen bg-slate-50 dark:bg-slate-950" dir={isAr ? 'rtl' : 'ltr'}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-4">
                        <PrinterIcon className="text-indigo-600" size={36} />
                        {copy.title}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-70">
                        {copy.subtitle}
                    </p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <button
                        onClick={() => setPrinterModal({
                            isOpen: true,
                            mode: 'ADD',
                            printer: {
                                id: '',
                                code: '',
                                name: '',
                                type: 'LOCAL',
                                address: '',
                                isActive: true,
                                isPrimaryCashier: false,
                                stationId: '',
                                gatewayId: '',
                                role: 'CASHIER',
                                roles: ['CASHIER'],
                                paperWidth: 80,
                                branchId: branches[0]?.id || '',
                            }
                        })}
                        className="w-full sm:w-auto flex items-center justify-center gap-3 bg-indigo-600 text-white px-10 py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all active:scale-95"
                    >
                        <Plus size={20} />
                        {copy.addPrinter}
                    </button>
                </div>
            </div>
            {testPrintResult && testPrintResult.id === 'settings' && (
                <div className={`rounded-2xl border px-5 py-4 text-xs font-black uppercase tracking-widest ${testPrintResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'}`}>
                    {testPrintResult.ok ? '[OK]' : '[ERR]'} {testPrintResult.msg}
                </div>
            )}

            <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-indigo-900/40 dark:bg-slate-900">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-indigo-600 p-3 text-white">
                            <Monitor size={22} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 dark:text-white">
                                {isAr ? 'مسار الطباعة التلقائية' : 'Automatic Print Flow'}
                            </h3>
                            <p className="mt-1 max-w-4xl text-xs font-bold leading-relaxed text-slate-500 dark:text-slate-400">
                                {copy.bridgeHint}
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-black uppercase tracking-widest sm:grid-cols-4">
                        <span className="rounded-2xl bg-slate-100 px-4 py-3 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{isAr ? 'الأوردر' : 'Order'}</span>
                        <span className="rounded-2xl bg-indigo-50 px-4 py-3 text-indigo-600 dark:bg-indigo-900/20">{isAr ? 'السيرفر' : 'Server'}</span>
                        <span className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-600 dark:bg-amber-900/20">{isAr ? 'الطابور' : 'Queue'}</span>
                        <span className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-600 dark:bg-emerald-900/20">Bridge</span>
                    </div>
                    <button
                        type="button"
                        onClick={loadBridgeHealth}
                        className="rounded-2xl bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-black"
                    >
                        {bridgeHealth ? tr('Bridge ready', 'Bridge متصل وجاهز') : tr('Check Bridge', 'فحص Bridge')}
                    </button>
                </div>
                {localPrinterError && !bridgeHealth && (
                    <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-amber-600">
                        {tr('Local bridge is not reachable on this device.', 'الـ Bridge المحلي مش ظاهر على الجهاز ده. شغله على جهاز الطباعة أو فعّل dry run للتجربة.')}
                    </p>
                )}
            </div>

            {/* Stats & Search */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="md:col-span-3 relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder={copy.search}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-16 pr-8 py-5 card-primary border-2 border-transparent focus:border-indigo-500/20 rounded-[2.5rem] outline-none shadow-sm font-bold text-sm"
                    />
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 p-6 rounded-[2.5rem] flex flex-col items-center justify-center shadow-sm">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">{isAr ? 'الطابعات النشطة' : 'ACTIVE PRINTERS'}</p>
                    <p className="text-3xl font-black text-emerald-600">{printers.filter(p => p.isActive).length} <span className="text-xs opacity-40">/ {printers.length}</span></p>
                </div>
            </div>

            <div className="card-primary rounded-[2.5rem] border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <div className="mb-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{tr('Primary Cashier Printer', 'طابعة الكاشير الأساسية')}</p>
                        <select
                            value={primaryCashierPrinterId}
                            onChange={(e) => handlePrimaryCashierChange(e.target.value)}
                            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none"
                        >
                            <option value="">{tr('Auto (no forced printer)', 'تلقائي بدون إجبار طابعة')}</option>
                            {printers.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} {p.code ? `(${p.code})` : ''}</option>
                            ))}
                        </select>
                    </div>
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{tr('Cashier receipt copies', 'عدد نسخ الكاشير')}</p>
                        <input
                            type="number"
                            min={1}
                            max={10}
                            value={cashierReceiptCopies}
                            onChange={(e) => handleCashierCopiesChange(e.target.value)}
                            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none"
                        />
                    </div>
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{tr('Global Receipt Branding (fallback)', 'هوية الإيصال العامة')}</p>
                        <div className="grid grid-cols-1 gap-2">
                            <input
                                type="text"
                                placeholder={tr('Logo URL', 'رابط اللوجو')}
                                value={settings.receiptLogoUrl || ''}
                                onChange={(e) => updateSettings({ receiptLogoUrl: e.target.value })}
                                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none"
                            />
                            <input
                                type="text"
                                placeholder={tr('QR URL', 'رابط QR')}
                                value={settings.receiptQrUrl || ''}
                                onChange={(e) => updateSettings({ receiptQrUrl: e.target.value })}
                                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none"
                            />
                        </div>
                    </div>
                </div>
                <div className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">{tr('Receipt Branding by Order Type', 'هوية الإيصال حسب نوع الطلب')}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[OrderType.DINE_IN, OrderType.TAKEAWAY, OrderType.DELIVERY, OrderType.PICKUP].map((type) => (
                            <div key={type} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{orderTypeLabel(type)}</p>
                                <input
                                    type="text"
                                    placeholder={tr('Logo URL', 'رابط اللوجو')}
                                    value={brandingByType[type]?.logoUrl || ''}
                                    onChange={(e) => updateBranding(type, 'logoUrl', e.target.value)}
                                    className="w-full mb-2 p-2 rounded-lg card-primary text-[11px] font-bold outline-none"
                                />
                                <input
                                    type="text"
                                    placeholder={tr('QR URL', 'رابط QR')}
                                    value={brandingByType[type]?.qrUrl || ''}
                                    onChange={(e) => updateBranding(type, 'qrUrl', e.target.value)}
                                    className="w-full p-2 rounded-lg card-primary text-[11px] font-bold outline-none"
                                />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                    <div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-widest">{copy.queueTitle}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{copy.queueSubtitle}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={async () => { await printGatewayApi.purgeJobs({ branchId: settings.activeBranchId }); await loadQueue(); }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-100 dark:bg-red-900/20 text-red-600 text-[10px] font-black uppercase tracking-widest hover:bg-red-200 dark:hover:bg-red-900/40 transition-all"
                        >
                            {copy.clearAll}
                        </button>
                        <button
                            onClick={loadQueue}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest"
                        >
                            <RefreshCcw size={12} className={queueLoading ? 'animate-spin' : ''} />
                            {copy.refresh}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                    <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 p-3"><p className="text-[10px] font-black text-amber-600">{copy.queued}</p><p className="text-xl font-black text-amber-600">{queueStats.queued}</p></div>
                    <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 p-3"><p className="text-[10px] font-black text-indigo-600">{copy.processing}</p><p className="text-xl font-black text-indigo-600">{queueStats.processing}</p></div>
                    <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-3"><p className="text-[10px] font-black text-emerald-600">{copy.completed}</p><p className="text-xl font-black text-emerald-600">{queueStats.completed}</p></div>
                    <div className="rounded-2xl bg-rose-50 dark:bg-rose-900/20 p-3"><p className="text-[10px] font-black text-rose-600">{copy.failed}</p><p className="text-xl font-black text-rose-600">{queueStats.failed}</p></div>
                    <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-3"><p className="text-[10px] font-black text-slate-500">{copy.total}</p><p className="text-xl font-black text-slate-700 dark:text-slate-200">{queueStats.total}</p></div>
                </div>

                {queueError && <p className="text-xs font-black text-rose-500 mb-4">{queueError}</p>}

                <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                    {queueJobs.length === 0 && !queueLoading && (
                        <div className="text-[11px] font-bold text-slate-500">{copy.noJobs}</div>
                    )}
                    {queueJobs.map((job) => {
                        const status = String(job.status || '').toUpperCase();
                        const isQueued = status === 'QUEUED';
                        const isFailed = status === 'FAILED';
                        const isProcessing = status === 'PROCESSING';
                        return (
                            <div key={job.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-black text-slate-800 dark:text-white truncate">{job.id}</p>
                                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{job.type} | {printStatusLabel(job.status)} | {tr('attempts', 'المحاولات')} {job.attempts}/{job.max_attempts}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        {tr('Printer', 'الطابعة')}: {job.printer_id || '-'} | Bridge: {job.target_gateway_id || tr('Any unassigned bridge', 'أي Bridge غير مخصص')}
                                    </p>
                                    {job.status === 'QUEUED' && (
                                        <p className="text-[10px] font-bold text-amber-600">
                                            {job.target_gateway_id
                                                ? tr('Waiting for the matching bridge gateway to claim this job.', 'مستني Bridge بنفس الـ Gateway ID يستلم المهمة.')
                                                : tr('Waiting for the branch bridge to come online.', 'مستني Bridge الفرع يشتغل؛ الاستلام والطباعة تلقائيان.')}
                                        </p>
                                    )}
                                    {job.last_error && <p className="text-[10px] font-bold text-rose-500 truncate">{job.last_error}</p>}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    {isFailed && (
                                        <button
                                            onClick={() => handleRetryJob(job.id)}
                                            className="px-3 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all"
                                             title={tr('Retry', 'إعادة المحاولة')}
                                        >
                                             {tr('Retry', 'إعادة')}
                                        </button>
                                    )}
                                    {(isQueued || isFailed) && (
                                         <button
                                             onClick={() => handleCancelJob(job.id)}
                                             className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-all"
                                             title={lang === 'ar' ? 'إلغاء مهمة الطباعة' : 'Cancel print job'}
                                             aria-label={lang === 'ar' ? 'إلغاء مهمة الطباعة' : 'Cancel print job'}
                                         >
                                              {tr('Cancel', 'إلغاء')}
                                         </button>
                                    )}
                                    {isProcessing && (
                                        <button
                                            onClick={() => handleCancelJob(job.id)}
                                            className="px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-200 dark:hover:bg-amber-800/40 transition-all"
                                            title={lang === 'ar' ? 'إيقاف' : 'Stop'}
                                        >
                                             {tr('Stop', 'إيقاف')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Printer Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                {filteredPrinters.length === 0 && (
                    <div className="md:col-span-2 xl:col-span-3 rounded-[2.5rem] border-2 border-dashed border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20">
                            <PrinterIcon size={34} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white">
                            {isAr ? 'لا توجد طابعات مطابقة' : 'No matching printers'}
                        </h3>
                        <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-relaxed text-slate-500">
                            {isAr ? 'أضف طابعة كاشير أو مطبخ، ثم اربط أقسام المنيو بالطابعات المناسبة من صفحة المنيو.' : 'Add a cashier or kitchen printer, then link menu sections to the correct printers from the menu page.'}
                        </p>
                        <button
                            type="button"
                            onClick={() => setPrinterModal({
                                isOpen: true,
                                mode: 'ADD',
                                printer: {
                                    id: '',
                                    name: '',
                                    code: '',
                                    type: 'LOCAL',
                                    address: '',
                                    isActive: true,
                                    branchId: settings.activeBranchId || branches[0]?.id || '',
                                    role: 'CASHIER',
                                    roles: ['CASHIER'],
                                    stationId: '',
                                    gatewayId: '',
                                    isPrimaryCashier: false,
                                    paperWidth: 80,
                                },
                            })}
                            className="mt-6 rounded-2xl bg-indigo-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                        >
                            {copy.addPrinter}
                        </button>
                    </div>
                )}
                {filteredPrinters.map(printer => {
                    const branch = branches.find(b => b.id === printer.branchId);
                    return (
                        <div key={printer.id} className="group card-primary rounded-[3rem] border border-slate-200 dark:border-slate-800 p-8 shadow-sm hover:shadow-2xl transition-all relative overflow-hidden flex flex-col border-b-[8px] border-b-indigo-600/5 hover:border-b-indigo-600 duration-150">
                            <div className="flex justify-between items-start mb-8">
                                <div className={`p-5 rounded-3xl shadow-lg transition-all ${printer.isActive ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                    {printer.type === 'NETWORK' ? <Network size={28} /> : <Monitor size={28} />}
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" aria-label={tr('Edit Printer', 'تعديل الطابعة')} onClick={() => setPrinterModal({ isOpen: true, mode: 'EDIT', printer })} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm"><Edit3 size={18} /></button>
                                    <button type="button" aria-label={tr('Delete Printer', 'حذف الطابعة')} onClick={() => handleDelete(printer.id)} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all shadow-sm"><Trash2 size={18} /></button>
                                </div>
                            </div>

                            <div className="space-y-6 flex-1">
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">{printer.name}</h3>
                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mt-1">
                                         {printer.code || tr('NO-CODE', 'بدون كود')} | {((Array.isArray(printer.roles) ? printer.roles : [printer.role])).filter(Boolean).map(roleLabel).join(', ') || tr('Other', 'أخرى')}
                                    </p>
                                    <p className="mt-2 text-[10px] font-black text-slate-500">
                                        {Number(printer.paperWidth || 80) <= 58 ? '58mm / 384 dots' : '80mm / 576 dots'}
                                    </p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                                         <Building2 size={14} className="text-indigo-500" /> {branch?.nameAr || branch?.name || tr('No Branch', 'بدون فرع')}
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-inner">
                                    <div className="flex-1 overflow-hidden">
                                         <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">{printer.type === 'NETWORK' ? tr('IP ADDRESS', 'عنوان IP') : tr('PRINTER ID', 'معرف الطابعة')}</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-white truncate font-mono tracking-tighter">{displayPrinterAddress(printer.address)}</p>
                                    </div>
                                    <div className={`w-3 h-3 rounded-full shadow-[0_0_12px] ${printer.isActive ? 'bg-emerald-500 shadow-emerald-500/50 animate-pulse' : 'bg-slate-300 shadow-transparent'}`} />
                                </div>

                                {(() => {
                                    const gw = gatewayStatusFor(printer);
                                    return (
                                        <div className={`mt-3 px-4 py-2.5 rounded-2xl border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${gw.cls}`} title={gw.gateway || undefined}>
                                            <Monitor size={13} className="shrink-0" />
                                            <span className="truncate">{gw.label}</span>
                                        </div>
                                    );
                                })()}

                            </div>

                            <div className="mt-10 flex gap-3">
                                <button
                                    onClick={() => handlePacketTest(printer.id)}
                                    disabled={testingId === printer.id}
                                    className="flex-1 py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {testingId === printer.id ? tr('Pinging...', 'جاري الفحص...') : tr('Ping', 'فحص الاتصال')}
                                </button>
                                <button
                                    onClick={() => handleReceiptPipelineTestPrintV2(printer)}
                                    disabled={testPrintingId === printer.id}
                                    className="flex-[2.2] py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {testPrintingId === printer.id ? tr('Testing...', 'جاري التجربة...') : tr('Print Test Receipt', 'طباعة إيصال تجريبي')}
                                </button>
                                <div className={`flex-1 py-4 rounded-2xl flex items-center justify-center font-black text-[10px] uppercase tracking-widest border ${printer.isActive ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 border-emerald-100' : 'bg-rose-50 dark:bg-rose-900/10 text-rose-600 border-rose-100'}`}>
                                    {(printer.isOnline ?? printer.isActive) ? tr('Online', 'متصل') : tr('Offline', 'غير متصل')}
                                </div>
                            </div>
                            {testPrintResult && testPrintResult.id === printer.id && (
                                <div className={`mt-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-center animate-in fade-in duration-150 ${testPrintResult.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 border border-rose-200 dark:border-rose-800'}`}>
                                    {testPrintResult.ok ? '[OK]' : '[ERR]'} {testPrintResult.msg}
                                </div>
                            )}
                            <div className="mt-3 flex items-center justify-between text-[10px] font-bold">
                                <span className={`${printer.isPrimaryCashier ? 'text-indigo-600' : 'text-slate-400'}`}>
                                    {printer.isPrimaryCashier ? tr('Primary Cashier Printer', 'طابعة الكاشير الأساسية') : tr('Secondary Printer', 'طابعة ثانوية')}
                                </span>
                                <span className="text-slate-400">
                                    {printer.lastHeartbeatAt ? `${tr('Last ping', 'آخر فحص')}: ${new Date(printer.lastHeartbeatAt).toLocaleString()}` : tr('No heartbeat yet', 'لا يوجد فحص حتى الآن')}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Printer Modal */}
            {printerModal && (
                <div className="fixed inset-0 bg-slate-950/60  flex items-end sm:items-center justify-center z-[110] p-2 sm:p-4 animate-in fade-in duration-150">
                    <div className="card-primary w-full max-w-xl rounded-[2rem] sm:rounded-[3.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col transform animate-in zoom-in-95 duration-400 max-h-[92vh]">
                        <div className="p-4 sm:p-10 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start sm:items-center gap-3 sm:gap-4 bg-slate-50/50 dark:bg-slate-950/20">
                            <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                                <div className="p-3 sm:p-5 bg-indigo-600 text-white rounded-2xl sm:rounded-[2rem] shadow-2xl shadow-indigo-600/30 shrink-0">
                                    <PrinterIcon size={22} className="sm:hidden" />
                                    <PrinterIcon size={32} className="hidden sm:block" />
                                </div>
                                <div className="min-w-0">
                                     <h3 className="text-base sm:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight truncate">{printerModal.mode === 'ADD' ? tr('Add Printer', 'إضافة طابعة') : tr('Edit Printer', 'تعديل طابعة')}</h3>
                                      <p className="text-[9px] sm:text-[10px] font-black text-slate-400 tracking-[0.2em] sm:tracking-[0.3em] uppercase mt-1 truncate">{tr('Name, branch, type, and address', 'الاسم والفرع والنوع والعنوان')}</p>
                                </div>
                            </div>
                            <button type="button" aria-label={tr('Close', 'إغلاق')} onClick={() => setPrinterModal(null)} className="p-2 sm:p-4 card-primary text-slate-400 rounded-xl sm:rounded-2xl shadow-sm hover:rotate-90 hover:text-rose-500 transition-all shrink-0"><X size={20} className="sm:hidden" /><X size={24} className="hidden sm:block" /></button>
                        </div>

                        <div className="p-4 sm:p-10 space-y-6 sm:space-y-10 overflow-y-auto">
                            {testPrintResult?.id === 'modal' && (
                                <div className={`rounded-2xl border px-4 py-3 text-[10px] font-black uppercase tracking-widest ${testPrintResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'}`}>
                                    {testPrintResult.ok ? '[OK]' : '[ERR]'} {testPrintResult.msg}
                                </div>
                            )}
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                                 <div className="space-y-3">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{tr('Printer Name', 'اسم الطابعة')}</label>
                                    <input
                                        type="text"
                                        value={printerModal.printer.name}
                                        onChange={(e) => setPrinterModal({ ...printerModal, printer: { ...printerModal.printer, name: e.target.value } })}
                                        className="w-full p-4 sm:p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl sm:rounded-3xl font-black text-xs uppercase tracking-widest outline-none focus:ring-4 focus:ring-indigo-500/10 border-2 border-transparent focus:border-indigo-600 transition-all shadow-inner"
                                        placeholder={tr('Cashier, Kitchen, Bar...', 'كاشير، مطبخ، بار...')}
                                    />
                                </div>
                                 <div className="space-y-3">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{tr('Branch', 'الفرع')}</label>
                                    <select
                                        value={printerModal.printer.branchId}
                                        onChange={(e) => setPrinterModal({ ...printerModal, printer: { ...printerModal.printer, branchId: e.target.value } })}
                                        className="w-full p-4 sm:p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl sm:rounded-3xl font-black text-[10px] uppercase tracking-widest outline-none focus:ring-4 focus:ring-indigo-500/10 border-2 border-transparent focus:border-indigo-600 transition-all shadow-inner appearance-none"
                                    >
                                        {branches.map(b => (
                                             <option key={b.id} value={b.id}>{b.nameAr || b.name}</option>
                                        ))}
                                     </select>
                                 </div>
                              </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{tr('Printer job', 'تطبع إيه؟')}</label>
                                <p className="text-[10px] text-slate-400 ml-1">{tr('Choose where this printer is used. You can select more than one.', 'اختار استخدام الطابعة. ممكن تختار أكثر من واحد.')}</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {printerRoleOptions.map((role) => {
                                        const roles = printerModal.printer.roles || (printerModal.printer.role ? [printerModal.printer.role] : []);
                                        const isSelected = roles.includes(role.value);
                                        return (
                                            <button
                                                key={role.value}
                                                type="button"
                                                onClick={() => {
                                                    const newRoles = isSelected
                                                        ? roles.filter(r => r !== role.value)
                                                        : [...roles, role.value];
                                                    setPrinterModal({
                                                        ...printerModal,
                                                        printer: {
                                                            ...printerModal.printer,
                                                            roles: newRoles,
                                                            role: newRoles[0] || 'OTHER',
                                                        }
                                                    });
                                                }}
                                                className={`p-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-transparent hover:border-indigo-300'}`}
                                            >
                                                <span className="text-base">{role.icon}</span> {role.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{tr('Cashier Main Printer', 'طابعة الكاشير الرئيسية')}</label>
                                    <button
                                        onClick={() => setPrinterModal({ ...printerModal, printer: { ...printerModal.printer, isPrimaryCashier: !printerModal.printer.isPrimaryCashier } })}
                                        className={`w-full p-4 sm:p-5 rounded-2xl sm:rounded-3xl font-black text-[10px] uppercase tracking-widest border-2 transition-all ${printerModal.printer.isPrimaryCashier ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-transparent'}`}
                                    >
                                        {printerModal.printer.isPrimaryCashier ? tr('PRIMARY ENABLED', 'مفعلة كأساسية') : tr('SET AS PRIMARY', 'تعيين كأساسية')}
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{tr('Paper width', 'مقاس ورق الطابعة')}</label>
                                    <select
                                        value={Number(printerModal.printer.paperWidth || 80) <= 58 ? 58 : 80}
                                        onChange={(e) => setPrinterModal({
                                            ...printerModal,
                                            printer: { ...printerModal.printer, paperWidth: Number(e.target.value) },
                                        })}
                                        className="w-full p-4 sm:p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl sm:rounded-3xl font-black text-[10px] uppercase tracking-widest outline-none border-2 border-transparent focus:border-indigo-600"
                                    >
                                        <option value={80}>80mm — 576 dots</option>
                                        <option value={58}>58mm — 384 dots</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{tr('Connection Type', 'نوع الاتصال')}</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <button
                                        onClick={() => setPrinterModal({ ...printerModal, printer: { ...printerModal.printer, type: 'NETWORK' } })}
                                        className={`p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border-2 transition-all flex flex-col items-center gap-3 sm:gap-4 ${printerModal.printer.type === 'NETWORK' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 shadow-lg' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}
                                    >
                                        <Network size={24} className="sm:hidden" />
                                        <Network size={32} className="hidden sm:block" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">{tr('Network / IP', 'شبكة / IP')}</span>
                                    </button>
                                    <button
                                        onClick={() => setPrinterModal({ ...printerModal, printer: { ...printerModal.printer, type: 'LOCAL' } })}
                                        className={`p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border-2 transition-all flex flex-col items-center gap-3 sm:gap-4 ${printerModal.printer.type === 'LOCAL' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 shadow-lg' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}
                                    >
                                        <Monitor size={24} className="sm:hidden" />
                                        <Monitor size={32} className="hidden sm:block" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">{tr('USB on this device', 'USB على الجهاز')}</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                                    {printerModal.printer.type === 'NETWORK' ? tr('Printer IP Address', 'IP الطابعة') : tr('USB Printer', 'طابعة USB')}
                                </label>
                                <input
                                    type="text"
                                    value={printerModal.printer.address}
                                    onChange={(e) => setPrinterModal({ ...printerModal, printer: { ...printerModal.printer, address: e.target.value } })}
                                    className="w-full p-4 sm:p-5 bg-slate-900 text-indigo-400 rounded-2xl sm:rounded-3xl font-black text-xs font-mono outline-none border-2 border-indigo-950 shadow-2xl tracking-tighter"
                                    placeholder={printerModal.printer.type === 'NETWORK' ? '192.168.1.50' : tr('Choose from list or type printer name', 'اختار من القائمة أو اكتب اسم الطابعة')}
                                />
                                {printerModal.printer.type === 'LOCAL' && (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                {tr('Available USB printers on this device', 'طابعات USB المتاحة على الجهاز')}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={loadLocalPrinterDevices}
                                                disabled={localPrinterLoading}
                                                className="rounded-xl bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-indigo-600 shadow-sm disabled:opacity-60 dark:bg-slate-800"
                                            >
                                                {localPrinterLoading ? tr('Loading...', 'تحميل...') : copy.refresh}
                                            </button>
                                        </div>
                                        {localPrinterOptions.length > 0 ? (
                                            <select
                                                value={printerModal.printer.address}
                                                onChange={(e) => {
                                                    const device = localPrinterOptions.find((item) => item.address === e.target.value);
                                                    setPrinterModal({
                                                        ...printerModal,
                                                        printer: {
                                                            ...printerModal.printer,
                                                            address: e.target.value,
                                                            name: printerModal.mode === 'ADD' ? (device?.name || printerModal.printer.name || '') : (printerModal.printer.name || device?.name || ''),
                                                        },
                                                    });
                                                }}
                                                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-xs font-black text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                            >
                                                <option value="">{tr('Select connected USB printer', 'اختار الطابعة المتوصلة USB')}</option>
                                                {localPrinterOptions.map((device) => (
                                                    <option key={device.id} value={device.address}>
                                                        {device.name}{device.isDefault ? tr(' - Default', ' - افتراضية') : ''}{device.isOffline ? tr(' - Offline', ' - غير متصلة') : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <p className="text-[10px] font-bold leading-relaxed text-amber-600">
                                                {localPrinterError
                                                    ? tr('Start the Print Bridge on the cashier device, then refresh. You can still type manually.', 'شغل Print Bridge على جهاز الكاشير ثم اضغط تحديث. يمكن الكتابة يدويًا مؤقتًا.')
                                                    : tr('No USB printers detected yet.', 'لا توجد طابعات USB مكتشفة حتى الآن.')}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6 bg-amber-50 dark:bg-amber-900/20 rounded-2xl sm:rounded-[2rem] border border-amber-100/50 dark:border-amber-800/30">
                                <AlertCircle size={20} className="text-amber-500 flex-shrink-0 sm:hidden" />
                                <AlertCircle size={24} className="text-amber-500 flex-shrink-0 hidden sm:block" />
                                <p className="text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase leading-relaxed tracking-widest">
                                     {tr('Save, then press Print Test Receipt from the printer card.', 'احفظ، ثم اضغط طباعة إيصال تجريبي من كارت الطابعة.')}
                                </p>
                            </div>
                        </div>

                        <div className="p-4 sm:p-10 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/20 flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
                            <button
                                onClick={() => setPrinterModal(null)}
                                disabled={isSaving}
                                className="w-full sm:flex-1 py-4 sm:py-5 card-primary text-slate-500 rounded-xl sm:rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-200 dark:border-slate-800 hover:bg-slate-100 transition-all shadow-sm"
                            >
                                 {tr('Cancel', 'إلغاء')}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="w-full sm:flex-[2] py-4 sm:py-5 bg-indigo-600 text-white rounded-xl sm:rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                 {isSaving ? tr('Saving...', 'جاري الحفظ...') : tr('Save', 'حفظ')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PrinterManager;
