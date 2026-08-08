import React, { useState, useMemo } from 'react';
import {
    X, ArrowLeftRight, Split, Move, Users,
    ShoppingCart, CheckCircle2, ChevronRight,
    Utensils, Wallet, Merge, Printer, RotateCcw
} from 'lucide-react';
import { Table, Order, TableStatus, OrderStatus } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { getTableManagementView, TableManagementMode } from '../tableManagementFlow';
import { getActionableErrorMessage } from '@/services/api';
import { findActiveTableOrder } from '@/utils/tableOrder';

interface TableManagementModalProps {
    sourceTable: Table;
    allTables: Table[];
    orders: Order[];
    onClose: () => void;
    onCloseTable: (tableId: string) => Promise<void> | void;
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
    const isRTL = lang === 'ar';

    const activeOrder = useMemo(
        () => findActiveTableOrder(orders, allTables, sourceTable.id),
        [orders, allTables, sourceTable.id],
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
        title: `إدارة طاولة ${sourceTable.name}`,
        edit: 'تعديل الطلب / إضافة أصناف',
        transfer_all: 'نقل الطلب بالكامل',
        transfer_items: 'نقل أصناف محددة',
        split: 'تقسيم الطاولة (فتح طاولة جديدة)',
        merge: 'دمج الطلب مع طاولة مشغولة',
        select_target: 'اختر الطاولة المستهدفة',
        select_items: 'اختر الأصناف المراد نقلها',
        confirm: 'تأكيد العملية',
        back: 'رجوع',
        cancel: 'إلغاء',
        no_order: 'لا يوجد طلب نشط لهذه الطاولة',
        items: 'الأصناف',
        available: 'طاولات متاحة',
        occupied: 'طاولات مشغولة',
        all_tables: 'كل الطاولات المناسبة',
        selected: 'محدد',
        select_all: 'اختيار الكل',
        clear_selection: 'إلغاء الاختيار',
        print_bill: 'طباعة شيك مؤقت',
        reset_table: 'حل تعليق الطاولة',
        reset_hint: 'يلغي الطلب النشط ويفرغ الطاولة بصلاحية المدير',
        failed: 'تعذر تنفيذ العملية. لم يتم تغيير الطلب.'
    } : {
        title: `Manage Table ${sourceTable.name}`,
        edit: 'Edit Order / Add Items',
        transfer_all: 'Transfer Entire Order',
        transfer_items: 'Transfer Specific Items',
        split: 'Split Table (New Order)',
        merge: 'Merge With Occupied Table',
        select_target: 'Select Target Table',
        select_items: 'Select Items to Move',
        confirm: 'Confirm Action',
        back: 'Back',
        cancel: 'Cancel',
        no_order: 'No active order found for this table',
        items: 'Items',
        available: 'Available Tables',
        occupied: 'Occupied Tables',
        all_tables: 'All Suitable Tables',
        selected: 'Selected',
        select_all: 'Select All',
        clear_selection: 'Clear Selection',
        print_bill: 'Print Temporary Bill',
        reset_table: 'Recover Stuck Table',
        reset_hint: 'Manager recovery cancels the active order and releases the table',
        failed: 'The action failed. The order was not changed.'
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

    const renderHeader = () => (
        <div className="flex items-center justify-between gap-3 p-4 lg:p-6 border-b border-border/10 bg-elevated/40 relative shrink-0">
            <div className="flex min-w-0 items-center gap-3 lg:gap-5">
                <div className="w-11 h-11 lg:w-14 lg:h-14 bg-main text-app rounded-2xl flex shrink-0 items-center justify-center shadow-2xl shadow-main/30 border border-main/20">
                    <ShoppingCart size={24} />
                </div>
                <div className="min-w-0">
                    <h2 className="truncate text-lg lg:text-2xl font-black text-main uppercase tracking-tight leading-tight">{t.title}</h2>
                    <div className="mt-1 flex items-center">
                        <p className={`truncate text-[10px] font-black uppercase tracking-[0.12em] px-2 lg:px-3 py-1 rounded-lg border ${activeOrder ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600' : 'bg-red-500/10 border-red-500/20 text-red-600'}`}>
                            {activeOrder
                                ? `${(activeOrder.items?.length ?? 0)} ${t.items} • ${(activeOrder.total ?? 0).toFixed(2)} EGP`
                                : t.no_order}
                        </p>
                    </div>
                </div>
            </div>
            <button type="button" aria-label={t.cancel} onClick={onClose} className="w-10 h-10 lg:w-12 lg:h-12 flex shrink-0 items-center justify-center text-muted hover:text-main hover:bg-elevated rounded-2xl transition-all border border-border/10 active:scale-90 shadow-sm">
                <X size={22} />
            </button>
        </div>
    );

    const renderActions = () => (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="p-4 lg:p-7 grid grid-cols-1 gap-3 lg:gap-5 bg-card overflow-y-auto pos-scroll">
            <div className="grid grid-cols-3 gap-2" aria-label={isRTL ? 'ملخص الطاولة' : 'Table summary'}>
                <div className="rounded-2xl border border-border/30 bg-elevated/40 p-3 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-muted">{isRTL ? 'الحالة' : 'Status'}</span>
                    <strong className="mt-1 block text-xs text-main">{activeOrder ? (isRTL ? 'مشغولة' : 'Occupied') : (isRTL ? 'بدون طلب' : 'No order')}</strong>
                </div>
                <div className="rounded-2xl border border-border/30 bg-elevated/40 p-3 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-muted">{isRTL ? 'رقم الطلب' : 'Order'}</span>
                    <strong className="mt-1 block text-xs tabular-nums text-main">{activeOrder?.orderNumber ?? '—'}</strong>
                </div>
                <div className="rounded-2xl border border-border/30 bg-elevated/40 p-3 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-muted">{isRTL ? 'المقاعد' : 'Seats'}</span>
                    <strong className="mt-1 block text-xs tabular-nums text-main">{sourceTable.seats}</strong>
                </div>
            </div>
            {/* Primary Action: Edit */}
            <button
                type="button"
                onClick={onEditOrder}
                className="w-full p-4 lg:p-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl lg:rounded-[2.5rem] flex items-center justify-between group hover:scale-[1.02] transition-all shadow-xl shadow-emerald-600/20 active:scale-95 border-b-4 border-emerald-800/40 relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <div className="flex items-center gap-3 lg:gap-5 relative z-10">
                    <div className="w-11 h-11 lg:w-14 lg:h-14 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner  border border-white/20">
                        <Utensils size={24} className="text-white" />
                    </div>
                    <div className="text-left">
                        <span className="block font-black text-sm lg:text-lg uppercase tracking-[0.05em]">{t.edit}</span>
                        <span className="text-[10px] font-bold text-emerald-100/70 uppercase tracking-widest">{isRTL ? 'إضافة أو تعديل الأصناف' : 'ADD OR CHANGE ITEMS'}</span>
                    </div>
                </div>
                <ChevronRight size={24} className={`opacity-70 group-hover:opacity-100 transition-all ${isRTL ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
            </button>

            {/* Secondary Action: Pay/Close */}
            <button
                type="button"
                onClick={() => void runImmediateAction(() => onCloseTable(sourceTable.id))}
                disabled={!activeOrder || isSubmitting}
                className="w-full p-4 lg:p-6 bg-main text-app rounded-3xl lg:rounded-[2.5rem] flex items-center justify-between group hover:scale-[1.02] transition-all shadow-xl shadow-black/20 active:scale-95 border-b-4 border-black/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 relative overflow-hidden"
            >
                <div className="flex items-center gap-3 lg:gap-5 relative z-10">
                    <div className="w-11 h-11 lg:w-14 lg:h-14 bg-app/10 rounded-2xl flex items-center justify-center shadow-inner border border-app/10">
                        <CheckCircle2 size={24} />
                    </div>
                    <div className="text-left">
                        <span className="block font-black text-sm lg:text-lg uppercase tracking-[0.05em]">
                            {isRTL ? 'إغلاق الطاولة' : 'CLOSE TABLE'}
                        </span>
                        <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest">
                            {isRTL ? 'إنهاء الطلب وتحرير الطاولة' : 'COMPLETE ORDER AND RELEASE TABLE'}
                        </span>
                    </div>
                </div>
                <Wallet size={24} className="opacity-40" />
            </button>

            <button
                type="button"
                onClick={() => void runImmediateAction(onPrintBill)}
                disabled={!activeOrder || isSubmitting}
                className="flex w-full items-center justify-between rounded-2xl border border-border/40 bg-elevated/40 p-4 text-main transition-colors hover:border-primary/40 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
            >
                <span className="flex items-center gap-3 text-xs font-black"><Printer size={20} className="text-primary" />{t.print_bill}</span>
                <ChevronRight size={18} className={isRTL ? 'rotate-180' : ''} />
            </button>

            <div className="flex items-center gap-4 py-2">
                <div className="h-px flex-1 bg-border/20" />
                <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">{isRTL ? 'عمليات النقل والدمج' : 'TRANSFER & MANAGEMENT'}</span>
                <div className="h-px flex-1 bg-border/20" />
            </div>

            {/* Management Grid */}
            <div className="grid grid-cols-2 gap-3 lg:gap-4">
                <button
                    type="button"
                    onClick={() => beginMode('TRANSFER_ALL')} disabled={!activeOrder}
                    className="p-3 lg:p-5 bg-card border border-border/40 text-main rounded-2xl lg:rounded-3xl flex flex-col items-center justify-center gap-2 lg:gap-3 transition-all group hover:bg-indigo-500 hover:text-white hover:border-indigo-500 active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500 group-hover:text-white group-hover:bg-white/20 transition-all border border-indigo-500/20 group-hover:border-transparent">
                        <ArrowLeftRight size={22} />
                    </div>
                    <span className="font-black text-[10px] uppercase tracking-widest text-center">{t.transfer_all}</span>
                </button>

                <button
                    type="button"
                    onClick={() => beginMode('TRANSFER_ITEMS')} disabled={!activeOrder}
                    className="p-3 lg:p-5 bg-card border border-border/40 text-main rounded-2xl lg:rounded-3xl flex flex-col items-center justify-center gap-2 lg:gap-3 transition-all group hover:bg-amber-500 hover:text-white hover:border-amber-500 active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 group-hover:text-white group-hover:bg-white/20 transition-all border border-amber-500/20 group-hover:border-transparent">
                        <Move size={22} />
                    </div>
                    <span className="font-black text-[10px] uppercase tracking-widest text-center">{t.transfer_items}</span>
                </button>

                <button
                    type="button"
                    onClick={() => beginMode('SPLIT')} disabled={!activeOrder}
                    className="p-3 lg:p-5 bg-card border border-border/40 text-main rounded-2xl lg:rounded-3xl flex flex-col items-center justify-center gap-2 lg:gap-3 transition-all group hover:bg-rose-500 hover:text-white hover:border-rose-500 active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 group-hover:text-white group-hover:bg-white/20 transition-all border border-rose-500/20 group-hover:border-transparent">
                        <Split size={22} />
                    </div>
                    <span className="font-black text-[10px] uppercase tracking-widest text-center">{t.split}</span>
                </button>

                <button
                    type="button"
                    onClick={() => beginMode('MERGE')} disabled={!activeOrder}
                    className="p-3 lg:p-5 bg-card border border-border/40 text-main rounded-2xl lg:rounded-3xl flex flex-col items-center justify-center gap-2 lg:gap-3 transition-all group hover:bg-teal-500 hover:text-white hover:border-teal-500 active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-teal-500/10 rounded-2xl flex items-center justify-center text-teal-500 group-hover:text-white group-hover:bg-white/20 transition-all border border-teal-500/20 group-hover:border-transparent">
                        <Merge size={22} />
                    </div>
                    <span className="font-black text-[10px] uppercase tracking-widest text-center">{t.merge}</span>
                </button>
            </div>

            {canResetTable && onResetTable && (
                <button
                    type="button"
                    onClick={() => void runImmediateAction(onResetTable)}
                    disabled={isSubmitting}
                    className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-start text-rose-700 transition-colors hover:bg-rose-500/15 disabled:opacity-50 dark:text-rose-300"
                >
                    <RotateCcw size={20} className="shrink-0" />
                    <span><strong className="block text-xs">{t.reset_table}</strong><small className="mt-1 block text-[10px] opacity-75">{t.reset_hint}</small></span>
                </button>
            )}
            {operationError && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-600">{operationError}</p>}
        </motion.div>
    );

    const renderTableSelector = (targetStatus: TableStatus | 'ANY') => {
        const targetTables = targetStatus === 'ANY'
            ? [...availableTables, ...occupiedTables]
            : targetStatus === TableStatus.AVAILABLE ? availableTables : occupiedTables;
        return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex h-full min-h-0 flex-col bg-card">
            <div className="flex-1 overflow-y-auto pos-scroll space-y-3 p-4 lg:p-6">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-xs font-black text-muted uppercase tracking-widest flex items-center gap-2">
                        <Users size={16} className="text-indigo-500" /> {t.select_target}
                    </h3>
                    <span className="text-[10px] font-bold text-muted bg-elevated/50 px-2 py-0.5 rounded-md border border-border/20">
                        {targetStatus === 'ANY' ? t.all_tables : targetStatus === TableStatus.AVAILABLE ? t.available : t.occupied}
                    </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 lg:gap-3">
                    {targetTables.map(table => (
                        <button
                            type="button"
                            key={table.id} onClick={() => setTargetTableId(table.id)}
                            className={`p-3 lg:p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${targetTableId === table.id ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20' : 'border-border/20 bg-elevated/40 hover:bg-elevated hover:border-primary/30 text-main shadow-sm'}`}
                        >
                            <span className="font-black text-lg">{table.name}</span>
                            <div className={`flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-card/50 ${targetTableId === table.id ? 'text-white/60' : 'text-muted'}`}>
                                <Users size={10} /> {table.seats}
                            </div>
                        </button>
                    ))}
                </div>
                {targetTables.length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-muted border-2 border-dashed border-border/40 rounded-3xl bg-elevated/10">
                        <ArrowLeftRight size={32} className="opacity-20 mb-3" />
                        <p className="text-xs font-black uppercase tracking-widest">{isRTL ? 'لا توجد طاولات مناسبة' : 'No suitable tables'}</p>
                    </div>
                )}
            </div>

            {operationError && (
                <p role="alert" className="mx-4 mb-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-600 lg:mx-6">
                    {operationError}
                </p>
            )}
            <div className="flex gap-3 lg:gap-4 p-4 lg:p-6 border-t border-border/10 bg-elevated/40 shrink-0">
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
                    className="flex-1 py-3 lg:py-4 bg-card border border-border/20 rounded-2xl font-black text-xs uppercase tracking-widest text-main hover:bg-elevated transition-colors active:scale-95 shadow-sm"
                >
                    {(mode === 'TRANSFER_ITEMS' || mode === 'SPLIT') && isSelectingTarget ? t.back : t.cancel}
                </button>
                <button
                    type="button"
                    disabled={!targetTableId || isSubmitting}
                    onClick={confirmOperation}
                    className="flex-[2] py-3 lg:py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95 transition-all border border-primary/20"
                >
                    {isSubmitting ? '…' : t.confirm}
                </button>
            </div>
        </motion.div>
        );
    };

const renderItemSelector = () => (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex h-full min-h-0 flex-col bg-card">
            <div className="flex-1 overflow-y-auto pos-scroll space-y-3 p-4 lg:p-6">
                <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="text-xs font-black text-muted uppercase tracking-widest flex items-center gap-2">
                        <ShoppingCart size={16} className="text-indigo-500" /> {t.select_items}
                    </h3>
                    <span className="text-[10px] font-bold text-muted bg-elevated/50 px-2 py-0.5 rounded-md border border-border/20 uppercase tracking-widest">
                        {selectedItems.length} {t.selected}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => setSelectedItems(selectedItems.length === (activeOrder?.items?.length ?? 0)
                        ? []
                        : (activeOrder?.items ?? []).map(item => item.cartId))}
                    className="mb-2 text-[10px] font-black text-primary hover:underline"
                >
                    {selectedItems.length === (activeOrder?.items?.length ?? 0) ? t.clear_selection : t.select_all}
                </button>
                <div className="space-y-2 pr-1">
                    {(activeOrder?.items ?? []).map(item => (
                        <div
                            key={item.cartId} onClick={() => toggleItem(item.cartId)}
                            role="checkbox"
                            tabIndex={0}
                            aria-checked={selectedItems.includes(item.cartId)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    toggleItem(item.cartId);
                                }
                            }}
                            className={`p-3 lg:p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between gap-3 shadow-sm active:scale-[0.98] ${selectedItems.includes(item.cartId) ? 'border-primary bg-primary/5' : 'border-border/20 bg-elevated/40 hover:bg-elevated'}`}
                        >
                            <div className="flex min-w-0 items-center gap-3 lg:gap-4">
                                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors shadow-sm ${selectedItems.includes(item.cartId) ? 'bg-primary border-primary shadow-inner' : 'bg-card border-border/40'}`}>
                                    {selectedItems.includes(item.cartId) && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-3 h-3 bg-white rounded-sm rotate-45" />}
                                </div>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm border border-border/10 ${selectedItems.includes(item.cartId) ? 'bg-primary text-white' : 'bg-elevated text-main'}`}>
                                    {item.quantity}
                                </div>
                                <span className={`min-w-0 truncate font-black text-sm tracking-tight ${selectedItems.includes(item.cartId) ? 'text-primary' : 'text-main'}`}>{item.name}</span>
                            </div>
                            <span className="font-black text-sm text-main opacity-80 tabular-nums">{(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                </div>
                {(activeOrder?.items ?? []).length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-muted border-2 border-dashed border-border/40 rounded-3xl bg-elevated/10">
                        <ArrowLeftRight size={32} className="opacity-20 mb-3" />
                        <p className="text-xs font-black uppercase tracking-widest">{isRTL ? 'لا توجد أصناف للنقل' : 'No items to transfer'}</p>
                    </div>
                )}
            </div>

            <div className="flex gap-3 lg:gap-4 p-4 lg:p-6 border-t border-border/10 bg-elevated/40 shrink-0">
                <button type="button" onClick={resetFlow} className="flex-1 py-3 lg:py-4 bg-card border border-border/20 rounded-2xl font-black text-xs uppercase tracking-widest text-main hover:bg-elevated transition-colors active:scale-95 shadow-sm">
                    {t.cancel}
                </button>
                <button
                    type="button"
                    disabled={selectedItems.length === 0}
                    onClick={() => setIsSelectingTarget(true)}
                    className="flex-[2] py-3 lg:py-4 flex flex-col items-center justify-center bg-primary text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95 transition-all border border-primary/20"
                >
                    <span className="text-xs">{isRTL ? 'التالي' : 'Next'}</span>
                    <span className="text-[9px] opacity-60">({t.select_target})</span>
                </button>
            </div>
        </motion.div>
    );

    const currentView = getTableManagementView(mode, isSelectingTarget);

    return (
        <AnimatePresence>
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 theme-modal-overlay z-[300] flex items-center justify-center p-2 sm:p-3">
                <div className="absolute inset-0" onClick={onClose} />
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t.title}
                    initial={{ y: "100%", scale: 1 }} animate={{ y: 0, scale: 1 }} exit={{ y: "100%", scale: 1 }} transition={{ type: "spring", duration: 0.15 }}
                    className={`theme-modal-content w-full max-w-2xl relative overflow-hidden flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1.5rem)] ${isRTL ? 'text-right' : 'text-left'}`}
                >
                    {renderHeader()}

                    <div className="flex-1 min-h-0 overflow-hidden relative">
                        <AnimatePresence mode="wait">
                            {currentView === 'ACTIONS' ? (
                                <div key="actions-view">{renderActions()}</div>
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
