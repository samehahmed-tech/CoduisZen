import React, { useEffect, useState, useMemo } from 'react';
import {
    Factory,
    Plus,
    ClipboardList,
    ArrowRight,
    CheckCircle2,
    Clock,
    AlertCircle,
    Package,
    Layers,
    History,
    X,
    TrendingUp,
    Scale,
    AlertTriangle,
    Eye,
    Pencil,
    Trash2,
    Save,
    Bot,
    Activity,
    Zap
} from 'lucide-react';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useAuthStore } from '../stores/useAuthStore';
import { translations } from '../services/translations';
import { ProductionStatus, ProductionOrder } from '../types';
import { productionApi } from '../services/api/procurement';
import { useToast } from './Toast';

const Production: React.FC = () => {
    const { settings } = useAuthStore();
    const { inventory, warehouses, productionOrders, fetchInventory, fetchWarehouses, fetchProductionOrders, addProductionOrder, startProductionOrder, completeProductionOrder, cancelProductionOrder, updateProductionOrder, deleteProductionOrder } = useInventoryStore();
    const lang = settings.language || 'en';
    const t = translations[lang];
    const isAr = lang === 'ar';
    const tr = (en: string, ar: string) => isAr ? ar : en;
    const { showToast } = useToast();

    const [activeTab, setActiveTab] = useState<'ORDERS' | 'PLANNING' | 'HISTORY'>('ORDERS');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);

    // Create Wizard State
    const [targetItemId, setTargetItemId] = useState('');
    const [warehouseId, setWarehouseId] = useState('');
    const [quantityRequested, setQuantityRequested] = useState(1);

    // Complete Modal State
    const [orderToComplete, setOrderToComplete] = useState<ProductionOrder | null>(null);
    const [actualYield, setActualYield] = useState(0);

    // Order Detail / Edit / Confirm State
    const [detailOrder, setDetailOrder] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [editForm, setEditForm] = useState<{ quantityRequested: number; warehouseId: string; batchNumber: string; notes: string } | null>(null);
    const [editSaving, setEditSaving] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ kind: 'cancel' | 'delete'; id: string; batch: string } | null>(null);
    const [confirmBusy, setConfirmBusy] = useState(false);

    const openOrderDetail = async (id: string) => {
        setDetailLoading(true);
        setDetailOrder({ id, _loading: true } as any);
        try {
            const detail = await productionApi.getOrderById(id);
            setDetailOrder(detail);
        } catch (error: any) {
            showToast(error?.message || tr('Could not load order details.', 'تعذر تحميل تفاصيل الأمر.'), 'error');
            setDetailOrder(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const openEditForm = (detail: any) => {
        setEditForm({
            quantityRequested: Number(detail.quantityRequested || 1),
            warehouseId: detail.warehouseId || '',
            batchNumber: detail.batchNumber || '',
            notes: detail.notes || '',
        });
    };

    const submitEditForm = async () => {
        if (!detailOrder?.id || !editForm) return;
        if (!Number.isFinite(editForm.quantityRequested) || editForm.quantityRequested <= 0) {
            showToast(tr('Enter a valid quantity.', 'ادخل كمية صحيحة.'), 'error');
            return;
        }
        setEditSaving(true);
        try {
            await updateProductionOrder(detailOrder.id, {
                quantityRequested: editForm.quantityRequested,
                warehouseId: editForm.warehouseId || undefined,
                batchNumber: editForm.batchNumber.trim() || undefined,
                notes: editForm.notes.trim() ? editForm.notes.trim() : null,
            });
            const detail = await productionApi.getOrderById(detailOrder.id);
            setDetailOrder(detail);
            setEditForm(null);
            showToast(tr('Order updated.', 'تم تعديل أمر الإنتاج.'), 'success');
        } catch (error: any) {
            const raw = String(error?.message || '');
            showToast(
                raw.includes('ONLY_PLANNED_ORDERS_EDITABLE')
                    ? tr('Only planned orders can be edited.', 'لا يمكن تعديل أمر بدأ تنفيذه بالفعل.')
                    : (raw || tr('Could not update order.', 'تعذر تعديل الأمر.')),
                'error'
            );
        } finally {
            setEditSaving(false);
        }
    };

    const submitConfirmAction = async () => {
        if (!confirmAction) return;
        setConfirmBusy(true);
        try {
            if (confirmAction.kind === 'cancel') await cancelProductionOrder(confirmAction.id);
            else await deleteProductionOrder(confirmAction.id);
            setConfirmAction(null);
            setDetailOrder(null);
            setEditForm(null);
            showToast(
                confirmAction.kind === 'cancel'
                    ? tr('Order cancelled.', 'تم إلغاء أمر الإنتاج.')
                    : tr('Order deleted.', 'تم حذف أمر الإنتاج.'),
                'success'
            );
        } catch (error: any) {
            const raw = String(error?.message || '');
            showToast(
                raw.includes('ONLY_PLANNED_ORDERS_DELETABLE')
                    ? tr('Only planned orders can be deleted — cancel started ones instead.', 'لا يمكن حذف أمر بدأ تنفيذه — ألغه بدلاً من ذلك.')
                    : (raw || tr('Action failed.', 'فشل تنفيذ الإجراء.')),
                'error'
            );
        } finally {
            setConfirmBusy(false);
        }
    };

    useEffect(() => {
        fetchProductionOrders();
        fetchInventory();
        fetchWarehouses();
    }, [fetchInventory, fetchProductionOrders, fetchWarehouses]);

    const compositeItems = useMemo(() => inventory.filter(i => i.isComposite), [inventory]);

    // Create Wizard Calculations
    const selectedCompositeItem = useMemo(() => compositeItems.find(i => i.id === targetItemId), [compositeItems, targetItemId]);
    const automaticWarehouseId = useMemo(() => {
        const activeWarehouses = warehouses.filter(w => w.isActive !== false);
        return activeWarehouses.find(w => String(w.type || '').toUpperCase() === 'PRODUCTION')?.id
            || activeWarehouses.find(w => String(w.type || '').toUpperCase() === 'KITCHEN')?.id
            || activeWarehouses.find(w => String(w.type || '').toUpperCase() === 'MAIN')?.id
            || activeWarehouses[0]?.id
            || '';
    }, [warehouses]);
    const effectiveWarehouseId = warehouseId || automaticWarehouseId;

    const ingredientDeficits = useMemo(() => {
        if (!selectedCompositeItem || !selectedCompositeItem.bom || !effectiveWarehouseId) return [];
        return selectedCompositeItem.bom.map(ing => {
            const ingredientItemId = ing.itemId || (ing as any).inventoryItemId;
            const inventoryItem = inventory.find(i => i.id === ingredientItemId);
            const wq = inventoryItem?.warehouseQuantities?.find(w => w.warehouseId === effectiveWarehouseId)?.quantity || 0;
            const requiredQty = ing.quantity * quantityRequested;
            const deficit = requiredQty > wq ? requiredQty - wq : 0;
            return {
                ingredientName: lang === 'ar' ? (inventoryItem?.nameAr || inventoryItem?.name) : inventoryItem?.name,
                requiredQty,
                availableQty: wq,
                deficit,
                unit: inventoryItem?.unit || '',
            };
        });
    }, [selectedCompositeItem, quantityRequested, effectiveWarehouseId, inventory, lang]);

    const hasDeficits = ingredientDeficits.some(d => d.deficit > 0);
    const activeOrders = useMemo(
        () => productionOrders.filter(o => o.status === ProductionStatus.PENDING || o.status === ProductionStatus.IN_PROGRESS),
        [productionOrders]
    );
    const historyOrders = useMemo(
        () => productionOrders.filter(o => o.status === ProductionStatus.COMPLETED || o.status === ProductionStatus.CANCELLED),
        [productionOrders]
    );
    const lowStockCompositeItems = useMemo(
        () => compositeItems.filter(i => {
            const qty = i.warehouseQuantities?.reduce((s, w) => s + w.quantity, 0) || 0;
            return qty <= i.threshold;
        }),
        [compositeItems]
    );
    const automaticRuns = useMemo(
        () => historyOrders.filter(order => String(order.batchNumber || '').startsWith('AUTO-') || String(order.id || '').startsWith('PROD-AUTO-')),
        [historyOrders]
    );
    const pendingCount = productionOrders.filter(o => o.status === ProductionStatus.PENDING).length;
    const inProgressCount = productionOrders.filter(o => o.status === ProductionStatus.IN_PROGRESS).length;

    const getStatusStyles = (status: ProductionStatus) => {
        switch (status) {
            case ProductionStatus.COMPLETED: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case ProductionStatus.IN_PROGRESS: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case ProductionStatus.PENDING: return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case ProductionStatus.CANCELLED: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
            default: return '';
        }
    };

    const getStatusLabel = (status: ProductionStatus) => {
        switch (status) {
            case ProductionStatus.COMPLETED: return tr('Completed', 'مكتمل');
            case ProductionStatus.IN_PROGRESS: return tr('In Progress', 'قيد التشغيل');
            case ProductionStatus.PENDING: return tr('Pending', 'قيد الانتظار');
            case ProductionStatus.CANCELLED: return tr('Cancelled', 'ملغي');
            default: return status;
        }
    };

    const handleStartOrder = async (orderId: string) => {
        try {
            await startProductionOrder(orderId);
            showToast(tr('Production batch started.', 'تم بدء أمر الإنتاج.'), 'success');
        } catch (error: any) {
            const raw = String(error?.message || '');
            const msg = raw.includes('INSUFFICIENT_STOCK')
                ? tr('Not enough stock — even after auto-producing sub-recipes. Receive or produce components first.', 'الرصيد غير كافٍ حتى بعد الإنتاج التلقائي للمكونات — استلم أو أنتج المكونات أولاً.')
                : raw.includes('INGREDIENT_ITEM_INACTIVE')
                    ? tr('One of the ingredients is inactive.', 'أحد المكونات غير نشط.')
                    : raw || tr('Could not start production batch.', 'تعذر بدء أمر الإنتاج.');
            showToast(msg, 'error');
        }
    };

    // Card-level cancel routes through the same confirm modal as the detail
    // view — previously one tap cancelled with no confirmation.
    const handleCancelOrder = (orderId: string, batch?: string) => {
        setConfirmAction({ kind: 'cancel', id: orderId, batch: batch || orderId });
    };

    const handleCreateOrder = async () => {
        if (!targetItemId || quantityRequested <= 0) {
            showToast(tr('Select item, warehouse, and a valid quantity.', 'اختر المنتج والمخزن وكمية صحيحة.'), 'error');
            return;
        }
        // Explicit warehouse only: silently falling back to another branch's
        // warehouse posts consumption to the wrong stock.
        if (!warehouseId) {
            showToast(tr('Select the production warehouse explicitly.', 'اختر مخزن التشغيل صراحة.'), 'error');
            return;
        }
        try {
            await addProductionOrder({
                id: `TMP-${Date.now()}`,
                targetItemId,
                quantityRequested,
                quantityProduced: 0,
                warehouseId,
                status: ProductionStatus.PENDING,
                batchNumber: `B-${Date.now()}`,
                createdAt: new Date(),
                actorId: settings.currentUser?.id || 'system',
                ingredientsConsumed: [],
            });
            showToast(tr('Production batch created.', 'تم إنشاء أمر الإنتاج.'), 'success');
            setIsCreateModalOpen(false);
            setTargetItemId('');
            setWarehouseId('');
            setQuantityRequested(1);
        } catch (error: any) {
            const raw = String(error?.message || '');
            const msg = raw.includes('no recipe or BOM')
                ? tr('This item has no recipe or BOM — add its recipe first.', 'الصنف المختار ليس له وصفة أو مكونات — أضف الوصفة أولاً ثم أعد المحاولة.')
                : raw.includes('PRODUCTION_WAREHOUSE_NOT_FOUND')
                    ? tr('No warehouse found — create a production warehouse for the branch first.', 'لا يوجد مخزن — أنشئ مخزن إنتاج للفرع أولاً ثم أعد المحاولة.')
                    : raw.includes('WAREHOUSE_INACTIVE')
                        ? tr('The selected warehouse is inactive.', 'المخزن المختار غير نشط.')
                        : raw.includes('TARGET_ITEM_INACTIVE')
                            ? tr('The selected item is inactive.', 'الصنف المختار غير نشط.')
                            : raw || tr('Could not create production batch.', 'تعذر إنشاء أمر الإنتاج.');
            showToast(msg, 'error');
        }
    };

    const handleCompleteSubmit = async () => {
        if (!orderToComplete || !Number.isFinite(actualYield) || actualYield < 0.001) {
            showToast(tr('Enter a valid produced quantity.', 'ادخل كمية إنتاج صحيحة.'), 'error');
            return;
        }
        try {
            await completeProductionOrder(orderToComplete.id, actualYield);
            showToast(tr('Production batch completed.', 'تم إغلاق أمر الإنتاج.'), 'success');
            setIsCompleteModalOpen(false);
            setOrderToComplete(null);
        } catch (error) {
            showToast(tr('Could not complete production batch.', 'تعذر إغلاق أمر الإنتاج.'), 'error');
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-10 bg-stone-100 dark:bg-[#0d1512] min-h-[calc(100vh-theme(spacing.16))] font-sans antialiased text-main flex flex-col pt-20 lg:pt-8 w-full overflow-x-hidden">
            {/* Header */}
            <div className="relative flex flex-col xl:flex-row justify-between items-stretch gap-6 mb-8 lg:mb-10">
                <div className="relative overflow-hidden bg-[#18231e] text-[#f4f0e7] p-6 sm:p-8 lg:p-10 border border-[#314138] min-h-[210px] flex flex-col justify-between xl:flex-1">
                    <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full border border-[#c9a86a]/20" aria-hidden="true" />
                    <div className="absolute right-8 top-8 h-3 w-3 rounded-full bg-[#d8a85b] shadow-[0_0_0_7px_rgba(216,168,91,0.12)]" aria-hidden="true" />
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-[#d8a85b] text-[#18231e] flex items-center justify-center">
                            <Factory size={22} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.28em] text-[#b8c4bb]">
                            {tr('Operations / Production', 'التشغيل / الإنتاج')}
                        </span>
                    </div>
                    <div>
                        <h1 className="text-3xl sm:text-5xl font-black tracking-[-0.06em] leading-none">
                            {t.production}
                        </h1>
                        <p className="mt-3 max-w-xl text-sm text-[#b8c4bb] leading-relaxed">
                            {tr('A live control room for what the kitchen must make next — with automatic production triggered by sales.', 'غرفة تحكم حية توضّح ما يجب إنتاجه الآن — مع تشغيل الإنتاج تلقائيًا عند البيع.')}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 xl:w-[360px] bg-[#f4f0e7] dark:bg-[#17211d] border border-[#d7d2c8] dark:border-[#314138]">
                    <div className="col-span-2 p-5 border-b border-[#d7d2c8] dark:border-[#314138] flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-500 dark:text-[#9eafa3]">{tr('Live line status', 'حالة خط التشغيل')}</p>
                            <p className="mt-1 text-lg font-black text-stone-900 dark:text-white">{inProgressCount > 0 ? tr('Production is moving', 'الإنتاج يعمل الآن') : tr('Ready for the next run', 'جاهز للتشغيلة التالية')}</p>
                        </div>
                        <Activity className={inProgressCount > 0 ? 'text-emerald-500 animate-pulse' : 'text-[#d8a85b]'} size={24} aria-hidden="true" />
                    </div>
                    <div className="p-5 border-r border-[#d7d2c8] dark:border-[#314138]">
                        <p className="text-3xl font-black text-stone-900 dark:text-white">{pendingCount}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-[#9eafa3]">{tr('Queued', 'منتظر')}</p>
                    </div>
                    <div className="p-5">
                        <p className="text-3xl font-black text-[#bd7b2f]">{automaticRuns.length}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-[#9eafa3]">{tr('Auto runs', 'تشغيل تلقائي')}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full mb-8">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex-1 flex items-center justify-center gap-3 bg-[#bd7b2f] text-white px-6 py-4 rounded-none hover:bg-[#a86925] transition-colors font-black text-xs uppercase tracking-[0.16em] min-h-[48px]"
                    >
                        <Plus size={20} /> {tr('Plan a production run', 'خطط لتشغيلة إنتاج')}
                    </button>
                    <button onClick={() => setActiveTab('HISTORY')} className="flex-1 flex items-center justify-center gap-3 bg-transparent dark:text-[#e6e0d3] border border-stone-300 dark:border-[#46564c] text-stone-700 px-6 py-4 rounded-none hover:bg-white/70 dark:hover:bg-[#17211d] transition-colors font-black text-xs uppercase tracking-[0.16em] min-h-[48px]">
                        <History size={20} /> {tr('Batch Logs', 'سجل الإنتاج')}
                    </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-stone-300 dark:bg-[#314138] mb-8 border border-stone-300 dark:border-[#314138]">
                {[
                    { label: tr('Active Batches', 'تشغيلات نشطة'), value: productionOrders.filter(o => o.status === ProductionStatus.IN_PROGRESS).length, icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
                    { label: tr('Completed', 'مكتمل'), value: productionOrders.filter(o => o.status === ProductionStatus.COMPLETED).length, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
                    { label: tr('Pending Queue', 'قائمة الانتظار'), value: productionOrders.filter(o => o.status === ProductionStatus.PENDING).length, icon: ClipboardList, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
                    { label: tr('Planning Alerts', 'تنبيهات التخطيط'), value: lowStockCompositeItems.length, icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10' },
                ].map((stat, i) => (
                    <div key={i} className="bg-[#f4f0e7] dark:bg-[#17211d] p-4 sm:p-6 flex items-center gap-4">
                        <div className={`p-3 ${stat.bg} ${stat.color}`}>
                            <stat.icon size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest mb-1">{stat.label}</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 overflow-x-auto border-b border-stone-300 dark:border-[#314138]">
                {(['ORDERS', 'PLANNING', 'HISTORY'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-5 py-3 rounded-none text-[10px] font-black uppercase tracking-[0.16em] transition-all whitespace-nowrap border-b-2 ${activeTab === tab ? 'border-[#bd7b2f] text-[#bd7b2f]' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'}`}
                    >
                        {tab === 'ORDERS' ? tr('Active Orders', 'أوامر الإنتاج') : tab === 'PLANNING' ? tr('Planning', 'التخطيط') : tr('History', 'السجل')}
                    </button>
                ))}
            </div>

            {/* Main Content */}
            <div className="bg-[#f4f0e7] dark:bg-[#17211d] border border-stone-300 dark:border-[#314138] overflow-hidden min-h-[360px] md:min-h-[440px] lg:min-h-[500px]">
                {activeTab === 'ORDERS' && (
                    <div className="p-8">
                        <div className="mb-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-[#bd7b2f] bg-[#ede6d8] dark:bg-[#1f2c25] px-5 py-4" role="status">
                            <div className="flex items-start gap-3">
                                <Zap className="mt-0.5 text-[#bd7b2f] shrink-0" size={18} aria-hidden="true" />
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.14em] text-stone-900 dark:text-white">{tr('Sales can trigger production automatically', 'البيع يشغّل الإنتاج تلقائيًا')}</p>
                                    <p className="mt-1 text-xs text-stone-600 dark:text-[#b8c4bb]">{tr('Pending production orders are consumed inside the sale transaction, then the finished quantity is deducted immediately.', 'أوامر الإنتاج المعلّقة تُنفّذ داخل عملية البيع، ثم تُخصم الكمية النهائية فورًا.')}</p>
                                </div>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#bd7b2f] whitespace-nowrap">{tr('AUTO-READY', 'جاهز تلقائيًا')}</span>
                        </div>
                        {activeOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-40">
                                <Layers size={80} className="mb-6 text-slate-400" />
                                <p className="text-xl font-black uppercase tracking-tighter text-slate-700 dark:text-slate-300">{tr('No Active Production Orders', 'لا توجد أوامر تشغيل نشطة')}</p>
                                <p className="text-sm font-bold uppercase tracking-widest mt-2 text-slate-500">{tr('Create a production batch to start.', 'ابدأ بإنشاء تشغيلة جديدة.')}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {activeOrders.map(order => {
                                    const item = inventory.find(i => i.id === order.targetItemId);
                                    return (
                                        <div key={order.id} className="p-6 bg-white/60 dark:bg-[#122019] border border-stone-200 dark:border-[#314138] hover:border-[#bd7b2f]/60 transition-colors group flex flex-col">
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-[#ede6d8] dark:bg-[#27372d] border border-stone-200 dark:border-[#46564c] flex items-center justify-center text-[#bd7b2f] group-hover:translate-y-[-2px] transition-transform">
                                                        <Package size={24} />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-slate-900 dark:text-white uppercase leading-tight">{lang === 'ar' ? item?.nameAr || item?.name : item?.name}</h4>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{tr('Batch', 'تشغيلة')}: <span className="text-slate-700 dark:text-slate-300">{order.batchNumber}</span></p>
                                                    </div>
                                                </div>
                                                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusStyles(order.status)}`}>
                                                    {getStatusLabel(order.status)}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 mb-6">
                                                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{tr('Target Yield', 'الكمية المطلوبة')}</p>
                                                    <p className="text-xl font-black text-slate-800 dark:text-slate-100">{order.quantityRequested} {item?.unit}</p>
                                                </div>
                                                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{tr('Created At', 'تاريخ الإنشاء')}</p>
                                                    <p className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase">
                                                        {new Date(order.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex gap-3 mt-auto">
                                                {order.status === ProductionStatus.PENDING && (
                                                    <button
                                                        onClick={() => handleStartOrder(order.id)}
                                                        className="flex-1 py-3.5 bg-[#18231e] text-white rounded-none font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#26372d] transition-colors min-h-[48px]"
                                                    >
                                                        {tr('Start Batch', 'بدء التشغيل')} <ArrowRight size={14} />
                                                    </button>
                                                )}
                                                {order.status === ProductionStatus.IN_PROGRESS && (
                                                <>
                                                <button
                                                    onClick={() => { setOrderToComplete(order); setActualYield(order.quantityRequested); setIsCompleteModalOpen(true); }}
                                                    className="flex-1 py-3.5 bg-emerald-600 text-white rounded-none font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors min-h-[48px]"
                                                >
                                                    {tr('Record Yield', 'تسجيل الإنتاج')} <CheckCircle2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => openOrderDetail(order.id)}
                                                    title={tr('View details', 'عرض التفاصيل')}
                                                    className="px-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-indigo-500 rounded-xl font-black text-[10px] uppercase hover:border-indigo-300 transition-colors"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleCancelOrder(order.id, (order as any).batchNumber)}
                                                    className="px-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 rounded-xl font-black text-[10px] uppercase hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-900/50 transition-colors"
                                                >
                                                    {tr('Cancel', 'إلغاء')}
                                                </button>
                                                </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'PLANNING' && (
                    <div className="p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white">{tr('Production Planning', 'تخطيط الإنتاج')}</h3>
                                <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">{tr('Composite items below threshold', 'أصناف مجمعة انخفض مخزونها عن الحد الأدنى')}</p>
                            </div>
                            <span className="px-3 py-1.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-lg text-xs font-black uppercase flex items-center gap-2">
                                <AlertCircle size={14} /> {tr('Auto Suggestions', 'اقتراحات تلقائية')}
                            </span>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">{tr('Composite Item', 'الصنف المجمع')}</th>
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">{tr('Current Stock', 'كمية المخزن')}</th>
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">{tr('Threshold', 'الحد الأدنى')}</th>
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">{tr('Action', 'إجراء')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lowStockCompositeItems.map((item) => {
                                        const currentStock = item.warehouseQuantities?.reduce((s, w) => s + w.quantity, 0) || 0;
                                        return (
                                            <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                                                            <Layers size={14} />
                                                        </div>
                                                        <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                                                            {lang === 'ar' ? item.nameAr || item.name : item.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className="font-black text-rose-500 px-2.5 py-1 bg-rose-50 dark:bg-rose-500/10 rounded-md text-sm">
                                                        {currentStock} {item.unit}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <span className="font-bold text-slate-600 dark:text-slate-400 text-sm">
                                                        {item.threshold} {item.unit}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <button
                                                        onClick={() => { setTargetItemId(item.id); setIsCreateModalOpen(true); }}
                                                        className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                                                    >
                                                        {tr('Produce', 'إنتاج')}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {lowStockCompositeItems.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-sm">
                                                {tr('All stock levels are optimal', 'لا توجد أصناف تحت الحد الأدنى')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'HISTORY' && (
                    <div className="p-8">
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">{tr('Batch', 'التشغيلة')}</th>
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">{tr('Item', 'الصنف')}</th>
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">{tr('Target', 'المستهدف')}</th>
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">{tr('Actual', 'الفعلي')}</th>
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">{tr('Status', 'الحالة')}</th>
                                        <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">{tr('Date', 'التاريخ')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyOrders.map((order) => {
                                        const item = inventory.find(i => i.id === order.targetItemId);
                                        return (
                                            <tr key={order.id} onClick={() => openOrderDetail(order.id)} title={tr('View details', 'عرض التفاصيل')} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer">
                                                <td className="p-4 font-black text-xs text-slate-700 dark:text-slate-300">
                                                    <div className="flex flex-col gap-1">
                                                        <span>{order.batchNumber}</span>
                                                        {String(order.batchNumber || '').startsWith('AUTO-') && (
                                                            <span className="w-fit px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 text-[9px] font-black uppercase tracking-widest border border-cyan-500/25">
                                                                {tr('Automatic', 'تلقائي')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 font-bold text-sm text-slate-800 dark:text-slate-200">
                                                    {lang === 'ar' ? item?.nameAr || item?.name : item?.name}
                                                </td>
                                                <td className="p-4 font-bold text-slate-500 text-sm">
                                                    {order.quantityRequested}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`font-black px-2.5 py-1 rounded-md text-sm ${order.quantityProduced < order.quantityRequested ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                        {order.quantityProduced} {item?.unit}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusStyles(order.status)}`}>
                                                        {getStatusLabel(order.status)}
                                                    </span>
                                                </td>
                                                <td className="p-4 font-bold text-slate-500 text-xs">
                                                    {new Date(order.completedAt || order.createdAt).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Smart Create Batch Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60  p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                            <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white flex items-center gap-3">
                                <Factory size={24} className="text-indigo-600" />
                                {tr('Batch Creation Wizard', 'معالج إنشاء أمر إنتاج')}
                            </h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="p-2 bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full border border-slate-200 dark:border-slate-700 transition-colors shadow-sm">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{tr('Composite Item / Recipe', 'المنتج النهائي / الوصفة')}</label>
                                    <select className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-800 dark:text-slate-100 focus:border-indigo-500 focus:ring-0 outline-none transition-colors" value={targetItemId} onChange={(e) => setTargetItemId(e.target.value)}>
                                        <option value="">-- {tr('Select Item', 'اختر المنتج')} --</option>
                                        {compositeItems.map((item) => (
                                            <option key={item.id} value={item.id}>{lang === 'ar' ? item.nameAr || item.name : item.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{tr('Production Warehouse', 'مخزن التشغيل')}</label>
                                    <select className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-800 dark:text-slate-100 focus:border-indigo-500 focus:ring-0 outline-none transition-colors" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                                        <option value="">-- {tr('Select Warehouse', 'اختر المخزن')} --</option>
                                        {warehouses.map((w) => (
                                            <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{tr('Target Yield Quantity', 'كمية الإنتاج المستهدفة')}</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min="0.001"
                                        step="0.001"
                                        className="flex-1 px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-xl text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-0 outline-none transition-colors tabular-nums"
                                        value={Number.isFinite(quantityRequested) && quantityRequested > 0 ? quantityRequested : ''}
                                        placeholder="0"
                                        onChange={(e) => {
                                            const quantity = e.currentTarget.valueAsNumber;
                                            setQuantityRequested(Number.isFinite(quantity) && quantity >= 0 ? quantity : 0);
                                        }}
                                    />
                                    <span className="text-sm font-black text-slate-400 uppercase w-16">{selectedCompositeItem?.unit || tr('Unit', 'وحدة')}</span>
                                </div>
                            </div>

                            {/* BOM Analysis */}
                            {selectedCompositeItem && effectiveWarehouseId && quantityRequested > 0 && (
                                <div className="mt-8">
                                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                                        <TrendingUp size={16} className="text-indigo-500" />
                                        {tr('Ingredient & Stock Analysis', 'تحليل المكونات والمخزون')}
                                    </h4>

                                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 dark:bg-slate-800">
                                                <tr>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tr('Ingredient', 'المكون')}</th>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tr('Required', 'المطلوب')}</th>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tr('Available', 'المتاح')}</th>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tr('Status', 'الحالة')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ingredientDeficits.map((def, idx) => (
                                                    <tr key={idx} className="border-t border-slate-100 dark:border-slate-800">
                                                        <td className="p-3 font-bold text-sm text-slate-800 dark:text-slate-200">{def.ingredientName}</td>
                                                        <td className="p-3 font-bold text-slate-600 dark:text-slate-400">{def.requiredQty} <span className="text-xs uppercase opacity-70">{def.unit}</span></td>
                                                        <td className="p-3 font-bold text-slate-600 dark:text-slate-400">{def.availableQty} <span className="text-xs uppercase opacity-70">{def.unit}</span></td>
                                                        <td className="p-3">
                                                            {def.deficit > 0 ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-600 text-[10px] font-black uppercase tracking-widest">
                                                                    <AlertTriangle size={12} /> {tr('Short by', 'ناقص')} {def.deficit}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase tracking-widest">
                                                                    <CheckCircle2 size={12} /> {tr('Sufficient', 'كاف')}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {hasDeficits && (
                                        <div className="mt-4 p-4 rounded-xl bg-rose-50/50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-900/30 flex gap-3 text-rose-600">
                                            <AlertTriangle size={20} className="shrink-0" />
                                            <p className="text-xs font-bold leading-relaxed">
                                                {tr('Insufficient stock for one or more ingredients in the selected warehouse. You can still create the batch, but fulfillment may be blocked until stock is received.', 'المخزون الحالي لا يكفي لإتمام هذه الكمية. يمكنك المتابعة، لكن التنفيذ قد يتوقف لحين استلام أو تحويل المخزون.')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex gap-4">
                            <button
                                onClick={handleCreateOrder}
                                disabled={!targetItemId || quantityRequested <= 0}
                                className="flex-1 h-14 rounded-xl bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus size={18} /> {tr('Create Batch', 'إنشاء أمر الإنتاج')}
                            </button>
                            <button onClick={() => setIsCreateModalOpen(false)} className="px-8 h-14 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-black text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                {tr('Cancel', 'إلغاء')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Complete Batch Modal */}
            {isCompleteModalOpen && orderToComplete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60  p-4 animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="p-8 text-center space-y-4">
                            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Scale size={40} />
                            </div>
                            <h3 className="text-2xl font-black uppercase text-slate-900 dark:text-white">
                                {tr('Record Actual Yield', 'تسجيل الإنتاج وتحديد الهدر')}
                            </h3>
                            <p className="text-sm font-bold text-slate-500 leading-relaxed">
                                {isAr ? `الكمية المستهدفة للتشغيلة كانت ${orderToComplete.quantityRequested}. برجاء إدخال الكمية الفعلية الصالحة الناتجة عن التصنيع لحساب الهدر بدقة.` : `Target yield was ${orderToComplete.quantityRequested}. Please enter the valid actual amount produced for accurate cost and waste tracking.`}
                            </p>

                            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-left text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{tr('Actual Yield Quantity', 'الكمية الفعلية المنتجة')}</label>
                                <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    className="w-full px-6 py-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5 font-black text-2xl text-emerald-700 dark:text-emerald-400 focus:border-emerald-500 focus:ring-0 outline-none transition-colors tabular-nums text-center"
                                    value={Number.isFinite(actualYield) && actualYield > 0 ? actualYield : ''}
                                    placeholder="0"
                                    onChange={(e) => {
                                        const quantity = e.currentTarget.valueAsNumber;
                                        setActualYield(Number.isFinite(quantity) && quantity >= 0 ? quantity : 0);
                                    }}
                                />
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-800 flex gap-4">
                            <button
                                onClick={handleCompleteSubmit}
                                className="flex-1 h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
                            >
                                {tr('Confirm & Complete', 'اعتماد وإغلاق')}
                            </button>
                            <button onClick={() => { setIsCompleteModalOpen(false); setOrderToComplete(null); }} className="px-6 h-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-colors">
                                {tr('Cancel', 'إلغاء')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Order Detail Modal */}
            {detailOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200" onClick={() => { if (!detailLoading) { setDetailOrder(null); setEditForm(null); } }}>
                    <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        {detailOrder._loading || detailLoading && !detailOrder.batchNumber ? (
                            <div className="p-16 text-center text-slate-500 font-black uppercase tracking-widest text-sm">{tr('Loading details...', 'جاري تحميل التفاصيل...')}</div>
                        ) : (
                            <>
                                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-start justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white">
                                                {isAr ? detailOrder.targetItemNameAr || detailOrder.targetItemName : detailOrder.targetItemName}
                                            </h3>
                                            {detailOrder.isAutomatic && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-600 text-[10px] font-black uppercase tracking-widest border border-cyan-500/25">
                                                    <Bot size={12} /> {tr('Automatic', 'تلقائي')}
                                                </span>
                                            )}
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusStyles(detailOrder.status)}`}>
                                                {getStatusLabel(detailOrder.status)}
                                            </span>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                                            {tr('Batch', 'تشغيلة')}: <span className="text-slate-700 dark:text-slate-300">{detailOrder.batchNumber}</span>
                                            {' • '}{detailOrder.id}
                                        </p>
                                        {detailOrder.notes && (
                                            <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">{detailOrder.notes}</p>
                                        )}
                                    </div>
                                    <button onClick={() => { setDetailOrder(null); setEditForm(null); }} className="p-2 bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 rounded-full border border-slate-200 dark:border-slate-700 shrink-0">
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[
                                            { label: tr('Target', 'المستهدف'), value: `${detailOrder.quantityRequested} ${detailOrder.targetUnit || ''}` },
                                            { label: tr('Actual', 'الفعلي'), value: `${detailOrder.quantityProduced} ${detailOrder.targetUnit || ''}` },
                                            { label: tr('Warehouse', 'المخزن'), value: detailOrder.warehouseName || '-' },
                                            { label: tr('Created', 'أُنشئ'), value: detailOrder.createdAt ? new Date(detailOrder.createdAt).toLocaleString() : '-' },
                                            { label: tr('Started', 'بدأ'), value: detailOrder.startedAt ? new Date(detailOrder.startedAt).toLocaleString() : '-' },
                                            { label: tr('Completed', 'اكتمل'), value: detailOrder.completedAt ? new Date(detailOrder.completedAt).toLocaleString() : '-' },
                                            { label: tr('By', 'بواسطة'), value: detailOrder.actorId || 'system' },
                                            { label: tr('Order ID', 'رقم الأمر'), value: String(detailOrder.id || '').slice(0, 18) },
                                        ].map((m, i) => (
                                            <div key={i} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{m.label}</p>
                                                <p className="text-xs font-black text-slate-800 dark:text-slate-100 break-words">{m.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">
                                            {tr('Ingredients', 'المكونات')} ({(detailOrder.ingredients || []).length})
                                        </h4>
                                        {(detailOrder.ingredients || []).length === 0 ? (
                                            <p className="text-xs font-bold text-slate-400">{tr('No ingredients recorded.', 'لا توجد مكونات مسجلة.')}</p>
                                        ) : (
                                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                                <table className="w-full text-left">
                                                    <thead className="bg-slate-50 dark:bg-slate-800">
                                                        <tr>
                                                            <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tr('Ingredient', 'المكون')}</th>
                                                            <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tr('Required', 'المطلوب')}</th>
                                                            <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tr('Actual', 'الفعلي')}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(detailOrder.ingredients || []).map((ing: any, idx: number) => (
                                                            <tr key={idx} className="border-t border-slate-100 dark:border-slate-800">
                                                                <td className="p-3 font-bold text-sm text-slate-800 dark:text-slate-200">{isAr ? ing.nameAr || ing.name : ing.name}</td>
                                                                <td className="p-3 font-bold text-sm text-slate-600 dark:text-slate-400">{ing.requiredQty} <span className="text-xs uppercase opacity-70">{ing.unit}</span></td>
                                                                <td className="p-3 font-bold text-sm text-slate-600 dark:text-slate-400">{ing.actualQty ?? '—'} <span className="text-xs uppercase opacity-70">{ing.unit}</span></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">
                                            {tr('Stock Movements', 'حركات المخزون')} ({(detailOrder.movements || []).length})
                                        </h4>
                                        {(detailOrder.movements || []).length === 0 ? (
                                            <p className="text-xs font-bold text-slate-400">{tr('No movements yet — stock moves when the batch starts and completes.', 'لا توجد حركات بعد — يتحرك المخزون عند بدء التشغيل وإغلاقها.')}</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {(detailOrder.movements || []).map((mv: any) => (
                                                    <div key={mv.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{mv.reason || mv.type}</p>
                                                            <p className="text-[10px] font-bold text-slate-400">{mv.createdAt ? new Date(mv.createdAt).toLocaleString() : ''} • {mv.performedBy}</p>
                                                        </div>
                                                        <span className="text-xs font-black text-slate-700 dark:text-slate-200 shrink-0">{mv.quantity} <span className="text-[10px] text-slate-400">{mv.type}</span></span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-wrap gap-2">
                                    {(detailOrder.status === ProductionStatus.PENDING || (detailOrder.status as string) === 'PLANNED') && (
                                        <>
                                            <button onClick={() => openEditForm(detailOrder)} className="flex-1 min-w-[140px] py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700">
                                                <Pencil size={14} /> {tr('Edit Order', 'تعديل الأمر')}
                                            </button>
                                            <button onClick={() => setConfirmAction({ kind: 'delete', id: detailOrder.id, batch: detailOrder.batchNumber })} className="flex-1 min-w-[140px] py-3 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-50">
                                                <Trash2 size={14} /> {tr('Delete', 'حذف')}
                                            </button>
                                        </>
                                    )}
                                    {(detailOrder.status === ProductionStatus.PENDING || (detailOrder.status as string) === 'PLANNED' || detailOrder.status === ProductionStatus.IN_PROGRESS) && (
                                        <button onClick={() => setConfirmAction({ kind: 'cancel', id: detailOrder.id, batch: detailOrder.batchNumber })} className="flex-1 min-w-[140px] py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50">
                                            {tr('Cancel Order', 'إلغاء الأمر')}
                                        </button>
                                    )}
                                    <button onClick={() => { setDetailOrder(null); setEditForm(null); }} className="px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest">
                                        {tr('Close', 'إغلاق')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Edit Order Modal */}
            {detailOrder && editForm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200" onClick={() => !editSaving && setEditForm(null)}>
                    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                            <h3 className="text-lg font-black uppercase text-slate-900 dark:text-white flex items-center gap-2">
                                <Pencil size={18} className="text-indigo-600" /> {tr('Edit Production Order', 'تعديل أمر الإنتاج')}
                            </h3>
                            <p className="text-[11px] font-bold text-slate-500 mt-1">{tr('Only planned orders can be edited — quantities rescale ingredients automatically.', 'التعديل متاح للأوامر المخططة فقط — تتعدل المكونات تلقائياً مع الكمية.')}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{tr('Target Quantity', 'الكمية المستهدفة')}</label>
                                <input type="number" min="0.001" step="0.001" value={editForm.quantityRequested}
                                    onChange={(e) => setEditForm({ ...editForm, quantityRequested: Number(e.target.value) })}
                                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-lg outline-none focus:border-indigo-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{tr('Warehouse', 'المخزن')}</label>
                                <select value={editForm.warehouseId} onChange={(e) => setEditForm({ ...editForm, warehouseId: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-sm outline-none focus:border-indigo-500">
                                    {warehouses.filter(w => w.isActive !== false).map((w) => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{tr('Batch No.', 'رقم التشغيلة')}</label>
                                <input type="text" value={editForm.batchNumber} onChange={(e) => setEditForm({ ...editForm, batchNumber: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-sm outline-none focus:border-indigo-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{tr('Notes', 'ملاحظات')}</label>
                                <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2}
                                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-sm outline-none focus:border-indigo-500 resize-none" />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex gap-3">
                            <button onClick={submitEditForm} disabled={editSaving} className="flex-1 py-3.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-50">
                                <Save size={14} /> {tr('Save Changes', 'حفظ التعديلات')}
                            </button>
                            <button onClick={() => setEditForm(null)} disabled={editSaving} className="px-6 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
                                {tr('Back', 'رجوع')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel / Delete Confirm Modal */}
            {confirmAction && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200" onClick={() => !confirmBusy && setConfirmAction(null)}>
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 text-center">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${confirmAction.kind === 'delete' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                <AlertTriangle size={26} />
                            </div>
                            <h3 className="text-lg font-black uppercase text-slate-900 dark:text-white">
                                {confirmAction.kind === 'delete' ? tr('Delete Order?', 'حذف الأمر؟') : tr('Cancel Order?', 'إلغاء الأمر؟')}
                            </h3>
                            <p className="text-xs font-bold text-slate-500 mt-2 leading-relaxed">
                                {confirmAction.kind === 'delete'
                                    ? tr(`Delete batch ${confirmAction.batch} permanently? Only planned orders can be deleted.`, `حذف التشغيلة ${confirmAction.batch} نهائياً؟ الحذف متاح للأوامر المخططة فقط.`)
                                    : tr(`Cancel batch ${confirmAction.batch}? Reserved stock will be released back.`, `إلغاء التشغيلة ${confirmAction.batch}؟ سيُرد المخزون المحجوز.`)} 
                            </p>
                        </div>
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex gap-3">
                            <button onClick={submitConfirmAction} disabled={confirmBusy} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-white disabled:opacity-50 ${confirmAction.kind === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
                                {tr('Confirm', 'تأكيد')}
                            </button>
                            <button onClick={() => setConfirmAction(null)} disabled={confirmBusy} className="flex-1 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
                                {tr('Back', 'رجوع')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Production;
