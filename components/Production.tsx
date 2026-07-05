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
    AlertTriangle
} from 'lucide-react';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useAuthStore } from '../stores/useAuthStore';
import { translations } from '../services/translations';
import { ProductionStatus, ProductionOrder } from '../types';
import { useToast } from './Toast';

const Production: React.FC = () => {
    const { settings } = useAuthStore();
    const { inventory, warehouses, productionOrders, fetchInventory, fetchWarehouses, fetchProductionOrders, addProductionOrder, startProductionOrder, completeProductionOrder, cancelProductionOrder } = useInventoryStore();
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

    useEffect(() => {
        fetchProductionOrders();
        fetchInventory();
        fetchWarehouses();
    }, [fetchInventory, fetchProductionOrders, fetchWarehouses]);

    const compositeItems = useMemo(() => inventory.filter(i => i.isComposite), [inventory]);

    // Create Wizard Calculations
    const selectedCompositeItem = useMemo(() => compositeItems.find(i => i.id === targetItemId), [compositeItems, targetItemId]);

    const ingredientDeficits = useMemo(() => {
        if (!selectedCompositeItem || !selectedCompositeItem.bom || !warehouseId) return [];
        return selectedCompositeItem.bom.map(ing => {
            const inventoryItem = inventory.find(i => i.id === ing.itemId);
            const wq = inventoryItem?.warehouseQuantities?.find(w => w.warehouseId === warehouseId)?.quantity || 0;
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
    }, [selectedCompositeItem, quantityRequested, warehouseId, inventory, lang]);

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
        } catch (error) {
            showToast(tr('Could not start production batch.', 'تعذر بدء أمر الإنتاج.'), 'error');
        }
    };

    const handleCancelOrder = async (orderId: string) => {
        try {
            await cancelProductionOrder(orderId);
            showToast(tr('Production batch cancelled.', 'تم إلغاء أمر الإنتاج.'), 'success');
        } catch (error) {
            showToast(tr('Could not cancel production batch.', 'تعذر إلغاء أمر الإنتاج.'), 'error');
        }
    };

    const handleCreateOrder = async () => {
        if (!targetItemId || !warehouseId || quantityRequested <= 0) {
            showToast(tr('Select item, warehouse, and a valid quantity.', 'اختر المنتج والمخزن وكمية صحيحة.'), 'error');
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
        } catch (error) {
            showToast(tr('Could not create production batch.', 'تعذر إنشاء أمر الإنتاج.'), 'error');
        }
    };

    const handleCompleteSubmit = async () => {
        if (!orderToComplete || actualYield < 0) {
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
        <div className="p-4 md:p-8 lg:p-12 bg-app min-h-[calc(100vh-theme(spacing.16))] font-sans antialiased text-main flex flex-col pt-20 lg:pt-8 w-full">
            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-12">
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-2xl shadow-indigo-600/30">
                            <Factory size={32} />
                        </div>
                        <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                            {t.production}
                        </h2>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 font-bold text-sm uppercase tracking-widest">
                        {tr('Central Kitchen & Batch Production Control', 'إدارة خطوط الإنتاج والمطبخ المركزي')}
                    </p>
                </div>

                <div className="flex gap-4 w-full xl:w-auto">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex-1 xl:flex-none flex items-center justify-center gap-3 bg-indigo-600 text-white px-8 py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 font-black text-xs uppercase tracking-widest"
                    >
                        <Plus size={20} /> {tr('New Batch', 'تشغيلة إنتاج جديدة')}
                    </button>
                    <button onClick={() => setActiveTab('HISTORY')} className="flex-1 xl:flex-none flex items-center justify-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-8 py-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm font-black text-xs uppercase tracking-widest">
                        <History size={20} /> {tr('Batch Logs', 'سجل الإنتاج')}
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {[
                    { label: tr('Active Batches', 'تشغيلات نشطة'), value: productionOrders.filter(o => o.status === ProductionStatus.IN_PROGRESS).length, icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
                    { label: tr('Completed', 'مكتمل'), value: productionOrders.filter(o => o.status === ProductionStatus.COMPLETED).length, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
                    { label: tr('Pending Queue', 'قائمة الانتظار'), value: productionOrders.filter(o => o.status === ProductionStatus.PENDING).length, icon: ClipboardList, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
                    { label: tr('Planning Alerts', 'تنبيهات التخطيط'), value: lowStockCompositeItems.length, icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
                        <div className={`p-4 rounded-2xl ${stat.bg} ${stat.color} shadow-inner`}>
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
            <div className="flex gap-2 mb-8 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
                {(['ORDERS', 'PLANNING', 'HISTORY'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        {tab === 'ORDERS' ? tr('Active Orders', 'أوامر الإنتاج') : tab === 'PLANNING' ? tr('Planning', 'التخطيط') : tr('History', 'السجل')}
                    </button>
                ))}
            </div>

            {/* Main Content */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl shadow-indigo-600/5 overflow-hidden min-h-[360px] md:min-h-[440px] lg:min-h-[500px]">
                {activeTab === 'ORDERS' && (
                    <div className="p-8">
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
                                        <div key={order.id} className="p-6 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-[2rem] hover:border-indigo-500/40 transition-all group flex flex-col">
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform shadow-sm">
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
                                                        className="flex-1 py-3.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-600/10 transition-colors"
                                                    >
                                                        {tr('Start Batch', 'بدء التشغيل')} <ArrowRight size={14} />
                                                    </button>
                                                )}
                                                {order.status === ProductionStatus.IN_PROGRESS && (
                                                    <button
                                                        onClick={() => { setOrderToComplete(order); setActualYield(order.quantityRequested); setIsCompleteModalOpen(true); }}
                                                        className="flex-1 py-3.5 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 shadow-lg shadow-emerald-500/10 transition-colors"
                                                    >
                                                        {tr('Record Yield', 'تسجيل الإنتاج')} <CheckCircle2 size={14} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleCancelOrder(order.id)}
                                                    className="px-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 rounded-xl font-black text-[10px] uppercase hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-900/50 transition-colors"
                                                >
                                                    {tr('Cancel', 'إلغاء')}
                                                </button>
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
                                            <tr key={order.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="p-4 font-black text-xs text-slate-700 dark:text-slate-300">
                                                    {order.batchNumber}
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
                                    <input type="number" min={1} className="flex-1 px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-xl text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-0 outline-none transition-colors tabular-nums" value={quantityRequested} onChange={(e) => setQuantityRequested(Number(e.target.value || 0))} />
                                    <span className="text-sm font-black text-slate-400 uppercase w-16">{selectedCompositeItem?.unit || tr('Unit', 'وحدة')}</span>
                                </div>
                            </div>

                            {/* BOM Analysis */}
                            {selectedCompositeItem && warehouseId && quantityRequested > 0 && (
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
                                disabled={!targetItemId || !warehouseId || quantityRequested <= 0}
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
                                    min={0}
                                    className="w-full px-6 py-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5 font-black text-2xl text-emerald-700 dark:text-emerald-400 focus:border-emerald-500 focus:ring-0 outline-none transition-colors tabular-nums text-center"
                                    value={actualYield}
                                    onChange={(e) => setActualYield(Number(e.target.value || 0))}
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
        </div>
    );
};

export default Production;
