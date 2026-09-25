import React, { useState, useMemo } from 'react';
import {
    X, ArrowLeftRight, Split, Move, Users, Banknote, CreditCard, Smartphone, Landmark,
    ShoppingCart, CheckCircle2, ChevronRight,
    Utensils, Wallet, Merge, Printer, RotateCcw,
    Layers, Timer, Crown, CircleAlert, Loader2,
    ArrowLeft, ArrowRight, ReceiptText
} from 'lucide-react';
import { Table, Order, TableStatus, OrderStatus, PaymentMethod } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { getTableManagementView, TableManagementMode } from '../tableManagementFlow';
import { getActionableErrorMessage } from '@/services/api';
import { findActiveTableOrder, getActiveTableOrders, sumTableOrdersTotal } from '@/utils/tableOrder';
import { useAuthStore } from '@/stores/useAuthStore';

interface TableManagementModalProps {
    sourceTable: Table;
    allTables: Table[];
    orders: Order[];
    onClose: () => void;
    onCloseTable: (tableId: string, paymentMethod: string) => Promise<void> | void;
    onPrintBill: () => Promise<void> | void;
    onResetTable?: () => Promise<void> | void;
    canResetTable?: boolean;
    onMergeTables: (targetTableId: string, itemIds: string[]) => Promise<void> | void;
    onTransferTable: (targetTableId: string) => Promise<void> | void;
    onTransferItems: (targetTableId: string, itemIds: string[]) => Promise<void> | void;
    onSplitTable: (targetTableId: string, itemIds: string[]) => Promise<void> | void;
    onEditOrder: () => void;
    lang: 'en' | 'ar';
}

const URGENT_MINUTES = 25;
const EMPTY_PAYMENT_METHODS: any[] = [];

const TableManagementModal: React.FC<TableManagementModalProps> = ({
    sourceTable,
    allTables,
    orders,
    onClose,
    onCloseTable,
    onPrintBill,
    onResetTable,
    canResetTable = false,
    onMergeTables,
    onTransferTable,
    onTransferItems,
    onSplitTable,
    onEditOrder,
    lang
}) => {
    const [mode, setMode] = useState<TableManagementMode>('ACTIONS');
    const [targetTableId, setTargetTableId] = useState<string | null>(null);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [isSelectingTarget, setIsSelectingTarget] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [operationError, setOperationError] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<string>(PaymentMethod.CASH);
    const isRTL = lang === 'ar';
    const currencySymbol = useAuthStore(state => state.settings.currencySymbol) || (isRTL ? 'ج.م' : 'EGP');
    const BackIcon = isRTL ? ArrowRight : ArrowLeft;
    const customPaymentMethods = useAuthStore(state => state.settings.customPaymentMethods || EMPTY_PAYMENT_METHODS);
    const paymentOptions = [
        { id: PaymentMethod.CASH, label: isRTL ? 'نقدي' : 'Cash', icon: Banknote },
        { id: PaymentMethod.VISA, label: isRTL ? 'فيزا' : 'Card', icon: CreditCard },
        { id: PaymentMethod.VODAFONE_CASH, label: isRTL ? 'فودافون كاش' : 'Vodafone Cash', icon: Smartphone },
        { id: PaymentMethod.INSTAPAY, label: isRTL ? 'إنستا باي' : 'InstaPay', icon: Landmark },
        ...customPaymentMethods.filter((method: any) => method.isActive !== false).map((method: any) => ({
            id: method.id,
            label: isRTL ? method.nameAr || method.name : method.name,
            icon: CreditCard,
        })),
    ];

    const activeOrder = useMemo(
        () => findActiveTableOrder(orders, allTables, sourceTable.id),
        [orders, allTables, sourceTable.id],
    );

    // A table can hold several open rounds (one order per kitchen send).
    // Everything bill-related (items, totals, pay, transfer) aggregates ALL
    // of them — the linked order alone would read as "half the bill".
    const tableOrders = useMemo(
        () => getActiveTableOrders(orders, allTables, sourceTable.id),
        [orders, allTables, sourceTable.id],
    );
    const tableItems = useMemo(
        () => tableOrders.flatMap(order => order.items || []),
        [tableOrders],
    );

    const availableTables = useMemo(() =>
        allTables.filter(t => t.id !== sourceTable.id && t.status === TableStatus.AVAILABLE),
        [allTables, sourceTable.id]);

    const occupiedTables = useMemo(() =>
        allTables.filter(
            t =>
                t.id !== sourceTable.id &&
                (
                    t.status === TableStatus.OCCUPIED ||
                    t.status === TableStatus.WAITING_FOOD ||
                    t.status === TableStatus.READY_TO_PAY
                )
        ),
        [allTables, sourceTable.id]);

    // Live totals per table = sum of ALL open rounds (same aggregation as
    // the floor map). Each order is counted once under its own table, so
    // nothing is ever summed twice.
    const liveTotals = useMemo(() => {
        const seen = new Set<string>();
        const map: Record<string, number> = {};
        for (const o of orders) {
            if (!o?.id || seen.has(o.id)) continue;
            seen.add(o.id);
            if (!o.tableId) continue;
            if ([OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(o.status)) continue;
            map[o.tableId] = Number(map[o.tableId] || 0) + Number(o.total || 0);
        }
        return map;
    }, [orders]);

    const elapsedMinutes = useMemo(() => {
        if (!activeOrder?.createdAt) return null;
        return Math.max(1, Math.floor((Date.now() - new Date(activeOrder.createdAt).getTime()) / 60000));
    }, [activeOrder]);
    const isUrgent = !!elapsedMinutes && elapsedMinutes > URGENT_MINUTES;

    const itemsCount = tableItems.reduce((s, i) => s + (i.quantity || 0), 0);
    const orderTotal = sumTableOrdersTotal(tableOrders);
    const selectedTotal = useMemo(() =>
        tableItems
            .filter(i => selectedItems.includes(i.cartId))
            .reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0),
        [tableItems, selectedItems]);

    const toggleItem = (cartId: string) => {
        setSelectedItems(prev =>
            prev.includes(cartId) ? prev.filter(id => id !== cartId) : [...prev, cartId]
        );
    };

    const beginMode = (nextMode: Exclude<TableManagementMode, 'ACTIONS'>) => {
        setMode(nextMode);
        setTargetTableId(null);
        setSelectedItems([]);
        setIsSelectingTarget(false);
        setOperationError('');
    };

    const resetFlow = () => {
        setMode('ACTIONS');
        setTargetTableId(null);
        setSelectedItems([]);
        setIsSelectingTarget(false);
        setOperationError('');
    };

    const t = isRTL ? {
        title: `طاولة ${sourceTable.name}`,
        subtitle: 'إدارة الطاولة والطلب النشط',
        occupied: 'مشغولة',
        no_order: 'بدون طلب نشط',
        order: 'طلب',
        items: 'صنف',
        elapsed: 'المدة',
        seats: 'مقاعد',
        total: 'الإجمالي',
        min_suffix: 'د',
        edit: 'تعديل الطلب',
        edit_hint: 'إضافة أو تعديل الأصناف',
        pay_close: 'إغلاق ودفع',
        pay_close_hint: 'إنهاء الطلب وتحرير الطاولة',
        temp_bill: 'شيك مؤقت',
        temp_bill_hint: 'طباعة قبل الدفع',
        advanced: 'نقل ودمج',
        transfer_all: 'نقل الطلب',
        transfer_all_hint: 'نقل كامل لطاولة فارغة',
        transfer_items: 'نقل أصناف',
        transfer_items_hint: 'نقل أصناف محددة فقط',
        split: 'تقسيم الطاولة',
        split_hint: 'فتح طاولة جديدة ببعض الأصناف',
        merge: 'دمج مع طاولة',
        merge_hint: 'دمج في طاولة مشغولة',
        select_target: 'اختر الطاولة المستهدفة',
        select_items: 'اختر الأصناف المراد نقلها',
        step_items: 'الأصناف',
        step_target: 'الطاولة',
        step_confirm: 'تأكيد',
        confirm: 'تأكيد العملية',
        back: 'رجوع',
        cancel: 'إلغاء',
        next: 'التالي',
        selected: 'محدد',
        select_all: 'اختيار الكل',
        clear_selection: 'إلغاء الاختيار',
        print_bill: 'طباعة شيك مؤقت',
        reset_table: 'حل تعليق الطاولة',
        reset_hint: 'يلغي الطلب النشط ويفرغ الطاولة بصلاحية المدير',
        failed: 'تعذر تنفيذ العملية. لم يتم تغيير الطلب.',
        no_tables: 'لا توجد طاولات مناسبة',
        no_items_move: 'لا توجد أصناف للنقل',
        available: 'طاولات متاحة',
        occupied_tables: 'طاولات مشغولة',
        all_tables: 'كل الطاولات المناسبة',
        free: 'فارغة',
        vip: 'طاولة مميزة VIP',
    } : {
        title: `Table ${sourceTable.name}`,
        subtitle: 'Manage table & live order',
        occupied: 'Occupied',
        no_order: 'No live order',
        order: 'Order',
        items: 'items',
        elapsed: 'Elapsed',
        seats: 'Seats',
        total: 'Total',
        min_suffix: 'm',
        edit: 'Edit Order',
        edit_hint: 'Add or change items',
        pay_close: 'Close & Pay',
        pay_close_hint: 'Complete order & release table',
        temp_bill: 'Temp Bill',
        temp_bill_hint: 'Print before payment',
        advanced: 'Transfer & merge',
        transfer_all: 'Move Order',
        transfer_all_hint: 'Move all to a free table',
        transfer_items: 'Move Items',
        transfer_items_hint: 'Move selected items only',
        split: 'Split Table',
        split_hint: 'Open a new table with items',
        merge: 'Merge Tables',
        merge_hint: 'Merge into an occupied table',
        select_target: 'Select target table',
        select_items: 'Select items to move',
        step_items: 'Items',
        step_target: 'Table',
        step_confirm: 'Confirm',
        confirm: 'Confirm Action',
        back: 'Back',
        cancel: 'Cancel',
        next: 'Next',
        selected: 'selected',
        select_all: 'Select all',
        clear_selection: 'Clear selection',
        print_bill: 'Print Temporary Bill',
        reset_table: 'Recover Stuck Table',
        reset_hint: 'Manager recovery cancels the active order and releases the table',
        failed: 'The action failed. The order was not changed.',
        no_tables: 'No suitable tables',
        no_items_move: 'No items to move',
        available: 'Available Tables',
        occupied_tables: 'Occupied Tables',
        all_tables: 'All Suitable Tables',
        free: 'Free',
        vip: 'VIP table',
    };

    const confirmOperation = async () => {
        if (!targetTableId || isSubmitting) return;
        setIsSubmitting(true);
        setOperationError('');
        try {
            if (mode === 'TRANSFER_ALL') await onTransferTable(targetTableId);
            else if (mode === 'TRANSFER_ITEMS') await onTransferItems(targetTableId, selectedItems);
            else if (mode === 'SPLIT') await onSplitTable(targetTableId, selectedItems);
            else if (mode === 'MERGE') await onMergeTables(targetTableId, selectedItems);
        } catch (error) {
            setOperationError(getActionableErrorMessage(error, lang) || t.failed);
        } finally {
            setIsSubmitting(false);
        }
    };

    const runImmediateAction = async (action: () => Promise<void> | void) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setOperationError('');
        try {
            await action();
        } catch (error) {
            setOperationError(getActionableErrorMessage(error, lang) || t.failed);
        } finally {
            setIsSubmitting(false);
        }
    };

    const modeMeta: Record<Exclude<TableManagementMode, 'ACTIONS'>, { title: string; hint: string; steps: string[] }> = {
        TRANSFER_ALL: { title: t.transfer_all, hint: t.transfer_all_hint, steps: [t.step_target, t.step_confirm] },
        TRANSFER_ITEMS: { title: t.transfer_items, hint: t.transfer_items_hint, steps: [t.step_items, t.step_target, t.step_confirm] },
        SPLIT: { title: t.split, hint: t.split_hint, steps: [t.step_items, t.step_target, t.step_confirm] },
        MERGE: { title: t.merge, hint: t.merge_hint, steps: [t.step_target, t.step_confirm] },
    };

    // ── Hero header ──────────────────────────────────────────────────────────
    const renderHeader = () => (
        <div className="relative shrink-0 overflow-hidden border-b border-border/10 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
            <div className="flex items-start justify-between gap-3 p-4 lg:p-6 pb-3">
                <div className="flex min-w-0 items-center gap-3 lg:gap-4">
                    <div className="w-13 h-13 lg:w-16 lg:h-16 shrink-0 rounded-3xl bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/30">
                        <ShoppingCart size={26} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-xl lg:text-3xl font-black text-main tracking-tight leading-tight">{t.title}</h2>
                            {sourceTable.isVIP && (
                                <span title={t.vip} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-warning/15 border border-warning/30">
                                    <Crown size={14} className="text-warning fill-warning" />
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 text-[11px] font-bold text-muted">{t.subtitle}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${activeOrder ? 'bg-primary/10 border-primary/25 text-primary' : 'bg-danger/10 border-danger/25 text-danger'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${activeOrder ? 'bg-primary' : 'bg-danger'}`} />
                                {activeOrder ? t.occupied : t.no_order}
                            </span>
                            {activeOrder?.orderNumber && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tabular-nums bg-elevated border border-border/40 text-muted">
                                    <ReceiptText size={11} />
                                    {t.order} #{activeOrder.orderNumber}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <button type="button" aria-label={t.cancel} onClick={onClose} className="w-10 h-10 lg:w-11 lg:h-11 flex shrink-0 items-center justify-center text-muted hover:text-main bg-card/70 hover:bg-elevated rounded-2xl transition-all border border-border/20 active:scale-90 shadow-sm">
                    <X size={20} />
                </button>
            </div>

            {/* Stat strip */}
            <div className="grid grid-cols-4 gap-2 px-4 lg:px-6 pb-4">
                <div className="rounded-2xl border border-border/30 bg-card/70 backdrop-blur px-2 py-2.5 text-center">
                    <Layers size={14} className="mx-auto text-primary" />
                    <div className="mt-1 text-sm font-black tabular-nums text-main">{itemsCount}</div>
                    <div className="text-[8px] font-black uppercase tracking-widest text-muted">{t.items}</div>
                </div>
                <div className={`rounded-2xl border px-2 py-2.5 text-center ${isUrgent ? 'border-danger/30 bg-danger/10' : 'border-border/30 bg-card/70 backdrop-blur'}`}>
                    <Timer size={14} className={`mx-auto ${isUrgent ? 'text-danger' : 'text-primary'}`} />
                    <div className={`mt-1 text-sm font-black tabular-nums ${isUrgent ? 'text-danger' : 'text-main'}`}>
                        {elapsedMinutes !== null ? `${elapsedMinutes}${t.min_suffix}` : '—'}
                    </div>
                    <div className="text-[8px] font-black uppercase tracking-widest text-muted">{t.elapsed}</div>
                </div>
                <div className="rounded-2xl border border-border/30 bg-card/70 backdrop-blur px-2 py-2.5 text-center">
                    <Users size={14} className="mx-auto text-primary" />
                    <div className="mt-1 text-sm font-black tabular-nums text-main">{sourceTable.seats}</div>
                    <div className="text-[8px] font-black uppercase tracking-widest text-muted">{t.seats}</div>
                </div>
                <div className="rounded-2xl border border-primary/30 bg-primary/10 px-2 py-2.5 text-center">
                    <Wallet size={14} className="mx-auto text-primary" />
                    <div className="mt-1 text-sm font-black tabular-nums text-primary">{orderTotal > 0 ? orderTotal.toFixed(0) : '—'}</div>
                    <div className="text-[8px] font-black uppercase tracking-widest text-primary/70">{t.total} {currencySymbol}</div>
                </div>
            </div>
        </div>
    );

    const ErrorAlert = () => operationError ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs font-bold text-danger">
            <CircleAlert size={16} className="shrink-0 mt-0.5" />
            <span>{operationError}</span>
        </div>
    ) : null;

    const Spinner = () => <Loader2 size={16} className="animate-spin" />;

    // ── ACTIONS view ─────────────────────────────────────────────────────────
    const ActionCard = ({ icon, tint, title, hint, onClick, disabled }: {
        icon: React.ReactNode; tint: string; title: string; hint: string;
        onClick: () => void; disabled?: boolean;
    }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="group p-4 bg-card border border-border/40 rounded-3xl flex items-center gap-3 text-start transition-all hover:border-primary/40 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
            <span className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center border transition-transform group-hover:scale-110 ${tint}`}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs font-black text-main">{title}</strong>
                <small className="mt-0.5 block truncate text-[10px] font-bold text-muted">{hint}</small>
            </span>
            <ChevronRight size={16} className={`shrink-0 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all ${isRTL ? 'rotate-180 group-hover:-translate-x-0.5' : ''}`} />
        </button>
    );

    const renderActions = () => (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="p-4 lg:p-6 grid grid-cols-1 gap-3 bg-card overflow-y-auto pos-scroll">
            {/* Hero: edit + pay */}
            <div className="grid grid-cols-1 gap-3">
                {activeOrder && (
                    <div className="rounded-3xl border border-border/40 bg-elevated/30 p-3 sm:p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wallet size={15} /></span>
                                <div className="min-w-0">
                                    <span className="block text-[10px] font-black uppercase tracking-widest text-muted">{isRTL ? 'طريقة الدفع' : 'Payment method'}</span>
                                    <span className="block truncate text-xs font-black text-main">{paymentOptions.find(option => option.id === paymentMethod)?.label}</span>
                                </div>
                            </div>
                            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black tabular-nums text-primary">{orderTotal.toFixed(2)} {currencySymbol}</span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-none sm:grid sm:grid-cols-4 sm:overflow-visible">
                            {paymentOptions.map(option => {
                                const Icon = option.icon;
                                return <button key={option.id} type="button" onClick={() => setPaymentMethod(option.id)} aria-pressed={paymentMethod === option.id} className={`flex min-w-[112px] shrink-0 snap-start items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-[10px] font-black transition sm:min-w-0 ${paymentMethod === option.id ? 'border-primary bg-primary text-white shadow-md' : 'border-border/40 bg-card text-muted hover:border-primary/40 hover:text-main'}`}><Icon size={15} /><span className="truncate">{option.label}</span></button>;
                            })}
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    onClick={onEditOrder}
                    className="group relative min-h-[76px] overflow-hidden rounded-3xl bg-primary p-4 text-start text-white shadow-xl shadow-primary/30 transition-all hover:brightness-110 hover:shadow-primary/40 active:scale-[0.98] sm:p-5"
                >
                    <span className="absolute inset-0 bg-gradient-to-r from-white/25 to-transparent translate-x-[-110%] group-hover:translate-x-[110%] transition-transform duration-700" />
                    <span className="w-12 h-12 shrink-0 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                        <Utensils size={22} />
                    </span>
                    <span className="min-w-0 relative">
                        <strong className="block text-sm lg:text-base font-black uppercase tracking-wide">{t.edit}</strong>
                        <small className="mt-0.5 block truncate text-[10px] font-bold text-white/70">
                            {activeOrder ? `${itemsCount} ${t.items} • ${orderTotal.toFixed(0)} ${currencySymbol}` : t.edit_hint}
                        </small>
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => void runImmediateAction(() => onCloseTable(sourceTable.id, paymentMethod))}
                    disabled={!activeOrder || isSubmitting}
                    className="group relative min-h-[76px] overflow-hidden rounded-3xl bg-success p-4 text-start text-white shadow-xl shadow-success/30 transition-all hover:brightness-110 hover:shadow-success/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:p-5"
                >
                    <span className="absolute inset-0 bg-gradient-to-r from-white/25 to-transparent translate-x-[-110%] group-hover:translate-x-[110%] transition-transform duration-700" />
                    <span className="w-12 h-12 shrink-0 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                        {isSubmitting ? <Spinner /> : <CheckCircle2 size={22} />}
                    </span>
                    <span className="min-w-0 relative">
                        <strong className="block text-sm lg:text-base font-black uppercase tracking-wide">{t.pay_close}</strong>
                        <small className="mt-0.5 block truncate text-[10px] font-bold text-white/70">
                            {activeOrder ? `${t.total}: ${orderTotal.toFixed(2)} ${currencySymbol}` : t.pay_close_hint}
                        </small>
                    </span>
                </button>
            </div>

            <button
                type="button"
                onClick={() => void runImmediateAction(onPrintBill)}
                disabled={!activeOrder || isSubmitting}
                className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-elevated/30 px-4 py-3.5 text-main transition-all hover:border-primary/50 hover:bg-primary/5 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.99]"
            >
                <span className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                    <Printer size={18} />
                </span>
                <span className="flex-1 text-start">
                    <strong className="block text-xs font-black">{t.temp_bill}</strong>
                    <small className="block text-[10px] font-bold text-muted">{t.temp_bill_hint}</small>
                </span>
                <ChevronRight size={16} className={`text-muted ${isRTL ? 'rotate-180' : ''}`} />
            </button>

            <div className="flex items-center gap-3 pt-1">
                <div className="h-px flex-1 bg-border/30" />
                <span className="text-[9px] font-black text-muted uppercase tracking-[0.3em]">{t.advanced}</span>
                <div className="h-px flex-1 bg-border/30" />
            </div>

            {/* Management grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ActionCard
                    icon={<ArrowLeftRight size={20} />}
                    tint="bg-info/10 border-info/25 text-info"
                    title={t.transfer_all}
                    hint={t.transfer_all_hint}
                    onClick={() => beginMode('TRANSFER_ALL')}
                    disabled={!activeOrder}
                />
                <ActionCard
                    icon={<Move size={20} />}
                    tint="bg-warning/10 border-warning/25 text-warning"
                    title={t.transfer_items}
                    hint={t.transfer_items_hint}
                    onClick={() => beginMode('TRANSFER_ITEMS')}
                    disabled={!activeOrder}
                />
                <ActionCard
                    icon={<Split size={20} />}
                    tint="bg-danger/10 border-danger/25 text-danger"
                    title={t.split}
                    hint={t.split_hint}
                    onClick={() => beginMode('SPLIT')}
                    disabled={!activeOrder}
                />
                <ActionCard
                    icon={<Merge size={20} />}
                    tint="bg-success/10 border-success/25 text-success"
                    title={t.merge}
                    hint={t.merge_hint}
                    onClick={() => beginMode('MERGE')}
                    disabled={!activeOrder}
                />
            </div>

            {canResetTable && onResetTable && (
                <button
                    type="button"
                    onClick={() => void runImmediateAction(onResetTable)}
                    disabled={isSubmitting}
                    className="flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-start text-danger transition-colors hover:bg-danger/10 disabled:opacity-50 active:scale-[0.99]"
                >
                    <RotateCcw size={20} className="shrink-0" />
                    <span><strong className="block text-xs font-black">{t.reset_table}</strong><small className="mt-0.5 block text-[10px] font-bold opacity-75">{t.reset_hint}</small></span>
                </button>
            )}
            <ErrorAlert />
        </motion.div>
    );

    // ── Flow stepper ─────────────────────────────────────────────────────────
    const renderStepper = () => {
        if (mode === 'ACTIONS') return null;
        const meta = modeMeta[mode];
        const view = getTableManagementView(mode, isSelectingTarget);
        const activeIndex = view === 'ITEMS' ? 0 : view === 'TABLES' ? meta.steps.length - 2 : 0;
        return (
            <div className="shrink-0 border-b border-border/10 bg-elevated/30 px-4 lg:px-6 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={resetFlow}
                        aria-label={t.back}
                        className="w-9 h-9 shrink-0 rounded-xl bg-card border border-border/30 text-muted hover:text-main hover:border-primary/40 flex items-center justify-center transition-all active:scale-95"
                    >
                        <BackIcon size={17} />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-main">{meta.title}</div>
                        <div className="truncate text-[10px] font-bold text-muted">{meta.hint}</div>
                    </div>
                </div>
                <div className="mt-2.5 flex items-center gap-1.5" aria-hidden="true">
                    {meta.steps.map((step, i) => {
                        const done = i < activeIndex;
                        const current = i === activeIndex;
                        return (
                            <React.Fragment key={step}>
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${done ? 'bg-success text-white' : current ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-elevated text-muted border border-border/30'}`}>
                                        {done ? '✓' : i + 1}
                                    </span>
                                    <span className={`text-[9px] font-black uppercase tracking-wider ${current ? 'text-primary' : done ? 'text-success' : 'text-muted'}`}>{step}</span>
                                </div>
                                {i < meta.steps.length - 1 && <div className={`h-px flex-1 ${done ? 'bg-success/50' : 'bg-border/40'}`} />}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        );
    };

    const TargetTableButton = ({ table }: { table: Table }) => {
        const selected = targetTableId === table.id;
        const isFree = table.status === TableStatus.AVAILABLE;
        const total = liveTotals[table.id];
        return (
            <button
                type="button"
                key={table.id}
                onClick={() => setTargetTableId(table.id)}
                className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[5.5rem] ${selected ? 'border-primary bg-primary text-white shadow-xl shadow-primary/25' : 'border-border/25 bg-elevated/40 hover:bg-elevated hover:border-primary/40 text-main shadow-sm'}`}
            >
                <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${selected ? 'bg-white' : isFree ? 'bg-success' : 'bg-primary'}`} />
                    <span className="font-black text-base tabular-nums">{table.name}</span>
                </span>
                <span className={`flex items-center gap-1 text-[9px] font-bold tabular-nums px-2 py-0.5 rounded-full ${selected ? 'bg-white/20 text-white' : 'bg-card text-muted border border-border/30'}`}>
                    <Users size={10} /> {table.seats}
                    {total !== undefined && total > 0 && <span>• {total.toFixed(0)}</span>}
                </span>
            </button>
        );
    };

    const renderTableSelector = (targetStatus: TableStatus | 'ANY') => {
        const targetTables = targetStatus === 'ANY'
            ? [...availableTables, ...occupiedTables]
            : targetStatus === TableStatus.AVAILABLE ? availableTables : occupiedTables;
        return (
            <motion.div initial={{ opacity: 0, x: isRTL ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: isRTL ? 20 : -20 }} className="flex h-full min-h-0 flex-col bg-card">
                <div className="flex-1 overflow-y-auto pos-scroll p-4 lg:p-6">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h3 className="text-[11px] font-black text-muted uppercase tracking-widest flex items-center gap-2">
                            <Users size={15} className="text-primary" /> {t.select_target}
                        </h3>
                        <span className="text-[10px] font-bold text-muted bg-elevated px-2 py-1 rounded-lg border border-border/30 uppercase tracking-widest">
                            {targetStatus === 'ANY' ? t.all_tables : targetStatus === TableStatus.AVAILABLE ? t.available : t.occupied_tables}
                        </span>
                    </div>
                    {targetTables.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 lg:gap-2.5">
                            {targetTables.map(table => (
                                <TargetTableButton key={table.id} table={table} />
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-muted border-2 border-dashed border-border/40 rounded-3xl bg-elevated/20">
                            <ArrowLeftRight size={30} className="opacity-20 mb-3" />
                            <p className="text-[11px] font-black uppercase tracking-widest">{t.no_tables}</p>
                        </div>
                    )}
                </div>

                <div className="px-4 lg:px-6 pb-1"><ErrorAlert /></div>
                <div className="flex gap-2.5 p-4 lg:p-6 pt-2 border-t border-border/10 bg-elevated/30 shrink-0">
                    <button
                        type="button"
                        onClick={() => {
                            setTargetTableId(null);
                            if ((mode === 'TRANSFER_ITEMS' || mode === 'SPLIT') && isSelectingTarget) {
                                setIsSelectingTarget(false);
                            } else {
                                resetFlow();
                            }
                        }}
                        className="px-5 py-3.5 bg-card border border-border/30 rounded-2xl font-black text-[11px] uppercase tracking-widest text-main hover:bg-elevated transition-colors active:scale-95 shadow-sm"
                    >
                        {(mode === 'TRANSFER_ITEMS' || mode === 'SPLIT') && isSelectingTarget ? t.back : t.cancel}
                    </button>
                    <button
                        type="button"
                        disabled={!targetTableId || isSubmitting}
                        onClick={confirmOperation}
                        className="flex-1 py-3.5 bg-primary text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-primary/25 disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        {isSubmitting && <Spinner />}
                        {t.confirm}
                    </button>
                </div>
            </motion.div>
        );
    };

    const renderItemSelector = () => (
        <motion.div initial={{ opacity: 0, x: isRTL ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: isRTL ? 20 : -20 }} className="flex h-full min-h-0 flex-col bg-card">
            <div className="flex-1 overflow-y-auto pos-scroll p-4 lg:p-6">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-[11px] font-black text-muted uppercase tracking-widest flex items-center gap-2">
                        <ShoppingCart size={15} className="text-primary" /> {t.select_items}
                    </h3>
                    <div className="flex items-center gap-2">
                        {selectedItems.length > 0 && (
                            <span className="text-[10px] font-black tabular-nums text-primary bg-primary/10 border border-primary/25 px-2 py-1 rounded-lg">
                                {selectedTotal.toFixed(0)} {currencySymbol}
                            </span>
                        )}
                        <span className="text-[10px] font-bold text-muted bg-elevated px-2 py-1 rounded-lg border border-border/30 tabular-nums">
                            {selectedItems.length} {t.selected}
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setSelectedItems(selectedItems.length === (tableItems?.length ?? 0)
                        ? []
                        : (tableItems ?? []).map(item => item.cartId))}
                    className="mb-3 text-[11px] font-black text-primary hover:underline"
                >
                    {selectedItems.length === (tableItems?.length ?? 0) ? t.clear_selection : t.select_all}
                </button>
                <div className="space-y-2">
                    {(tableItems ?? []).map(item => {
                        const checked = selectedItems.includes(item.cartId);
                        return (
                            <div
                                key={item.cartId} onClick={() => toggleItem(item.cartId)}
                                role="checkbox"
                                tabIndex={0}
                                aria-checked={checked}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        toggleItem(item.cartId);
                                    }
                                }}
                                className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between gap-3 active:scale-[0.99] ${checked ? 'border-primary bg-primary/5 shadow-md shadow-primary/10' : 'border-border/25 bg-elevated/40 hover:bg-elevated'}`}
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-primary border-primary text-white' : 'bg-card border-border/40 text-transparent'}`}>
                                        <CheckCircle2 size={14} />
                                    </span>
                                    <span className="min-w-0 truncate font-black text-sm text-main">{item.name}</span>
                                    <span className={`shrink-0 text-[10px] font-black tabular-nums px-2 py-0.5 rounded-lg ${checked ? 'bg-primary text-white' : 'bg-elevated text-muted border border-border/30'}`}>
                                        ×{item.quantity}
                                    </span>
                                </div>
                                <span className="shrink-0 font-black text-sm text-main tabular-nums">{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</span>
                            </div>
                        );
                    })}
                </div>
                {(tableItems ?? []).length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-muted border-2 border-dashed border-border/40 rounded-3xl bg-elevated/20">
                        <ArrowLeftRight size={30} className="opacity-20 mb-3" />
                        <p className="text-[11px] font-black uppercase tracking-widest">{t.no_items_move}</p>
                    </div>
                )}
            </div>

            <div className="px-4 lg:px-6 pb-1"><ErrorAlert /></div>
            <div className="flex gap-2.5 p-4 lg:p-6 pt-2 border-t border-border/10 bg-elevated/30 shrink-0">
                <button type="button" onClick={resetFlow} className="px-5 py-3.5 bg-card border border-border/30 rounded-2xl font-black text-[11px] uppercase tracking-widest text-main hover:bg-elevated transition-colors active:scale-95 shadow-sm">
                    {t.cancel}
                </button>
                <button
                    type="button"
                    disabled={selectedItems.length === 0}
                    onClick={() => setIsSelectingTarget(true)}
                    className="flex-1 py-3.5 bg-primary text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-primary/25 disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                    {t.next}
                    <ChevronRight size={15} className={isRTL ? 'rotate-180' : ''} />
                    <span className="opacity-60 font-bold normal-case tracking-normal">({t.select_target})</span>
                </button>
            </div>
        </motion.div>
    );

    const currentView = getTableManagementView(mode, isSelectingTarget);

    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 theme-modal-overlay z-[300] flex items-center justify-center p-2 sm:p-4">
                <div className="absolute inset-0" onClick={onClose} />
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t.title}
                    initial={{ y: 60, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 60, scale: 0.97, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className={`theme-modal-content w-full max-w-2xl relative overflow-hidden flex flex-col rounded-[2rem] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] ${isRTL ? 'text-right' : 'text-left'}`}
                >
                    {renderHeader()}
                    {renderStepper()}

                    <div className="flex-1 min-h-0 overflow-hidden relative">
                        <AnimatePresence mode="wait">
                            {currentView === 'ACTIONS' ? (
                                <div key="actions-view" className="h-full overflow-hidden flex flex-col">{renderActions()}</div>
                            ) : (
                                <div key="multi-step-view" className="h-full">
                                    {currentView === 'ITEMS'
                                        ? renderItemSelector()
                                        : renderTableSelector(mode === 'MERGE'
                                            ? TableStatus.OCCUPIED
                                            : mode === 'TRANSFER_ITEMS' ? 'ANY' : TableStatus.AVAILABLE)
                                    }
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default TableManagementModal;
