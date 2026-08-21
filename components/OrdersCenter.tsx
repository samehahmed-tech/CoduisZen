import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    Banknote,
    Bike,
    Calendar,
    CheckCircle,
    CheckSquare,
    ChefHat,
    ClipboardCheck,
    Clock,
    Eye,
    Filter,
    Link,
    MapPin,
    MessageCircle,
    Package,
    Phone,
    Printer,
    RefreshCw,
    RotateCcw,
    Search,
    Send,
    ShoppingBag,
    Trash2,
    User,
    X,
    XCircle,
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { useOrderStore } from '../stores/useOrderStore';
import { AppPermission, Order, OrderStatus, OrderType } from '../types';
import { translations } from '../services/translations';
import { ordersApi } from '../services/api/orders';
import { refundApi } from '../services/api/refunds';
import { useToast } from './Toast';
import { apiRequest, getActionableErrorMessage } from '../services/api/core';
import PageSkeleton from './common/PageSkeleton';
import { formatDisplayId } from '../src/utils/idGenerator';
import { ManagerApprovalModal } from '../src/features/pos/components/ManagerApprovalModal';
import { printOrderReceipt } from '../services/posPrintOrchestrator';
import { socketService } from '../services/socketService';
import { getTableDisplayName } from '../src/utils/tableDisplay';
import { formatLocalDate } from '../utils/formatters';

const normalizeOrder = (raw: any): Order => ({
    id: String(raw.id),
    orderNumber: raw.order_number || raw.orderNumber,
    type: raw.type as OrderType,
    branchId: raw.branch_id || raw.branchId,
    shiftId: raw.shift_id || raw.shiftId,
    tableId: raw.table_id || raw.tableId,
    tableName: raw.table_name || raw.tableName,
    businessDate: raw.business_date || raw.businessDate || null,
    customerId: raw.customer_id || raw.customerId,
    customerName: raw.customer_name || raw.customerName,
    customerPhone: raw.customer_phone || raw.customerPhone,
    deliveryAddress: raw.delivery_address || raw.deliveryAddress,
    isCallCenterOrder: raw.is_call_center_order || raw.isCallCenterOrder,
    items: (raw.items || []).map((item: any, index: number) => ({
        ...item,
        cartId: item.cartId || item.id || `${raw.id}-${index}`,
        selectedModifiers: item.selectedModifiers || item.modifiers || [],
    })),
    status: raw.status as OrderStatus,
    subtotal: Number(raw.subtotal || 0),
    tax: Number(raw.tax || 0),
    total: Number(raw.total || 0),
    discount: raw.discount,
    freeDelivery: raw.free_delivery || raw.freeDelivery,
    isUrgent: raw.is_urgent || raw.isUrgent,
    paymentMethod: raw.payment_method || raw.paymentMethod,
    notes: raw.notes,
    kitchenNotes: raw.kitchen_notes || raw.kitchenNotes,
    deliveryNotes: raw.delivery_notes || raw.deliveryNotes,
    driverId: raw.driver_id || raw.driverId,
    deliveryFee: raw.delivery_fee || raw.deliveryFee,
    createdAt: new Date(raw.created_at || raw.createdAt || new Date()),
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    syncStatus: raw.sync_status || raw.syncStatus || 'SYNCED',
});

const OrdersCenter: React.FC = () => {
    const { settings, branches, printers, hasPermission } = useAuthStore();
    const { updateOrderStatus } = useOrderStore();
    const { showToast } = useToast();

    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const t = translations[lang] || translations.en;

    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [branchFilter, setBranchFilter] = useState<string>(settings.activeBranchId || 'ALL');
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [approvalAction, setApprovalAction] = useState<(approval?: { id: number }) => void>(() => {});
    const [approvalReferenceId, setApprovalReferenceId] = useState<string | null>(null);
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
    const [pendingOrderAction, setPendingOrderAction] = useState<string | null>(null);
    const [voidModalOrderId, setVoidModalOrderId] = useState<string | null>(null);
    const [voidReason, setVoidReason] = useState('');
    const [refundModalOrderId, setRefundModalOrderId] = useState<string | null>(null);
    const [refundReason, setRefundReason] = useState('');
    const [refundReasonCategory, setRefundReasonCategory] = useState<'QUALITY' | 'WRONG_ORDER' | 'CUSTOMER_REQUEST' | 'OVERCHARGE' | 'OTHER'>('CUSTOMER_REQUEST');
    const loadRequestRef = useRef(0);
    const [dateFilter, setDateFilter] = useState<string>(() => (
        branches.find(branch => branch.id === settings.activeBranchId)?.businessDate
        || formatLocalDate(new Date())
    ));
    const reviewOnlyCopy = isAr
        ? 'هذا اليوم للمراجعة فقط. لا يمكن تعديل أو إلغاء أوردر بعد انتهاء يوم تشغيله.'
        : 'This day is review-only. Orders cannot be changed or cancelled after their business day ends.';

    const copy = {
        title: isAr ? 'مركز الطلبات' : 'Orders Center',
        subtitle: isAr ? 'قائمة تشغيل واضحة لكل أوردرات الفروع' : 'Operational list for all branch orders',
        search: isAr ? 'بحث برقم الطلب، العميل، الهاتف...' : 'Search order, customer, phone...',
        all: isAr ? 'الكل' : 'All',
        allStatuses: isAr ? 'كل الحالات' : 'All statuses',
        allBranches: isAr ? 'كل الفروع' : 'All branches',
        noOrders: isAr ? 'لا توجد طلبات مطابقة' : 'No matching orders',
        allDates: isAr ? 'كل التواريخ' : 'All dates',
        today: isAr ? 'اليوم' : 'Today',
        selectOrder: isAr ? 'اختار أوردر لعرض التفاصيل' : 'Select an order to view details',
        customer: isAr ? 'بيانات العميل' : 'Customer',
        address: isAr ? 'العنوان' : 'Address',
        items: isAr ? 'الأصناف' : 'Items',
        totals: isAr ? 'الإجمالي' : 'Totals',
        notes: isAr ? 'ملاحظات' : 'Notes',
        orderDetails: isAr ? 'تفاصيل الأوردر' : 'Order details',
        systemBusinessDate: isAr ? 'تاريخ تشغيل النظام' : 'System business date',
        orderBusinessDate: isAr ? 'تاريخ تشغيل الأوردر' : 'Order business date',
        orderCreatedAt: isAr ? 'وقت إنشاء الأوردر' : 'Order created at',
        table: isAr ? 'ترابيزة' : 'Table',
        notSet: isAr ? 'غير محدد' : 'Not set',
        noAddress: isAr ? 'لا يوجد عنوان مسجل' : 'No address recorded',
        noPhone: isAr ? 'لا يوجد هاتف' : 'No phone',
        print: isAr ? 'طباعة' : 'Print',
        void: isAr ? 'إلغاء' : 'Void',
        sendKitchen: isAr ? 'إرسال للمطبخ' : 'Send to kitchen',
        markReady: isAr ? 'تجهيز جاهز' : 'Mark ready',
        outDelivery: isAr ? 'خروج للدليفري' : 'Out for delivery',
        complete: isAr ? 'إكمال وتسوية' : 'Complete',
        payLink: isAr ? 'طلب دفع' : 'Payment request',
        apology: isAr ? 'اعتذار' : 'Apology',
        subtotal: isAr ? 'قبل الضريبة' : 'Subtotal',
        tax: isAr ? 'ضريبة' : 'Tax',
        deliveryFee: isAr ? 'دليفري' : 'Delivery',
        discount: isAr ? 'خصم' : 'Discount',
        total: isAr ? 'المطلوب' : 'Total',
        voidReasonTitle: isAr ? 'سبب إلغاء الطلب' : 'Cancellation reason',
        voidReasonHelp: isAr ? 'اكتب سبب واضح يظهر في المراجعة والتقارير.' : 'Enter a clear reason for audit and reports.',
        voidReasonPlaceholder: isAr ? 'مثال: العميل طلب الإلغاء' : 'Example: customer requested cancellation',
        cancel: isAr ? 'رجوع' : 'Cancel',
        confirmVoid: isAr ? 'تأكيد الإلغاء' : 'Confirm void',
        refund: isAr ? 'طلب استرداد' : 'Request refund',
        refundReasonTitle: isAr ? 'سبب استرداد الطلب' : 'Refund reason',
        refundReasonHelp: isAr ? 'سيُرسل الطلب للموافقة قبل تنفيذ الاسترداد.' : 'The request will require approval before processing.',
        refundReasonPlaceholder: isAr ? 'مثال: خطأ في الطلب أو شكوى جودة' : 'Example: wrong order or quality complaint',
        refundCategory: isAr ? 'تصنيف السبب' : 'Reason category',
        confirmRefund: isAr ? 'إرسال طلب الاسترداد' : 'Submit refund request',
    };

    const statusLabels: Record<string, { ar: string; en: string }> = {
        [OrderStatus.PENDING]: { ar: 'معلق', en: 'Pending' },
        [OrderStatus.PREPARING]: { ar: 'تحضير', en: 'Preparing' },
        [OrderStatus.READY]: { ar: 'جاهز', en: 'Ready' },
        [OrderStatus.OUT_FOR_DELIVERY]: { ar: 'في الطريق', en: 'On way' },
        [OrderStatus.DELIVERED]: { ar: 'تم التسليم', en: 'Delivered' },
        [OrderStatus.COMPLETED]: { ar: 'مكتمل', en: 'Completed' },
        [OrderStatus.REFUNDED]: { ar: 'مرتجع', en: 'Refunded' },
        [OrderStatus.CANCELLED]: { ar: 'ملغي', en: 'Cancelled' },
    };

    const typeLabels: Record<string, { ar: string; en: string }> = {
        ALL: { ar: 'الكل', en: 'All' },
        [OrderType.DELIVERY]: { ar: 'دليفري', en: 'Delivery' },
        [OrderType.DINE_IN]: { ar: 'صالة', en: 'Dine-in' },
        [OrderType.TAKEAWAY]: { ar: 'تيك أواي', en: 'Takeaway' },
        [OrderType.PICKUP]: { ar: 'استلام', en: 'Pickup' },
    };

    const getStatusLabel = (status: OrderStatus) => isAr ? statusLabels[status]?.ar || status : statusLabels[status]?.en || status;
    const getTypeLabel = (type: string) => isAr ? typeLabels[type]?.ar || type : typeLabels[type]?.en || type;
    const formatBusinessDate = (value?: string | null) => value || copy.notSet;
    const formatDateTime = (value?: string | Date | null) => {
        if (!value) return copy.notSet;
        const parsed = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsed.getTime())) return copy.notSet;
        return parsed.toLocaleString(isAr ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    };

    const getStatusIcon = (status: OrderStatus) => {
        switch (status) {
            case OrderStatus.PENDING: return <Clock size={14} className="text-amber-500" />;
            case OrderStatus.PREPARING: return <ChefHat size={14} className="text-cyan-500" />;
            case OrderStatus.READY: return <Package size={14} className="text-indigo-500" />;
            case OrderStatus.OUT_FOR_DELIVERY: return <Bike size={14} className="text-violet-500" />;
            case OrderStatus.DELIVERED:
            case OrderStatus.COMPLETED:
                return <CheckCircle size={14} className="text-emerald-500" />;
            case OrderStatus.CANCELLED: return <XCircle size={14} className="text-rose-500" />;
            default: return <AlertCircle size={14} className="text-muted" />;
        }
    };

    const getOrderAgeMins = (createdAt: string | Date) => Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));

    const loadOrders = useCallback(async () => {
        const requestId = ++loadRequestRef.current;
        setIsLoading(true);
        setError(null);
        try {
            const params: any = { limit: 150 };
            if (statusFilter !== 'ALL') params.status = statusFilter;
            if (branchFilter !== 'ALL') params.branch_id = branchFilter;
            if (typeFilter !== 'ALL') params.type = typeFilter;
            if (dateFilter) params.date = dateFilter;

            const data = await ordersApi.getAll(params);
            if (requestId === loadRequestRef.current) setOrders(Array.isArray(data) ? data.map(normalizeOrder) : []);
        } catch (err: any) {
            if (requestId === loadRequestRef.current) setError(getActionableErrorMessage(err, lang as any));
        } finally {
            if (requestId === loadRequestRef.current) setIsLoading(false);
        }
    }, [statusFilter, branchFilter, typeFilter, dateFilter, lang]);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    const orderMatchesFilters = useCallback((order: Order) => {
        if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
        if (branchFilter !== 'ALL' && order.branchId !== branchFilter) return false;
        if (typeFilter !== 'ALL' && order.type !== typeFilter) return false;
        if (dateFilter && (order.businessDate || formatLocalDate(order.createdAt)) !== dateFilter) return false;
        return true;
    }, [branchFilter, dateFilter, statusFilter, typeFilter]);

    useEffect(() => {
        const upsertOrder = (raw: any) => {
            if (!raw?.id) return;
            const normalized = normalizeOrder(raw);
            setOrders(prev => {
                if (!orderMatchesFilters(normalized)) return prev.filter(order => order.id !== normalized.id);
                const exists = prev.some(order => order.id === normalized.id);
                if (!exists) return [normalized, ...prev];
                return prev.map(order => order.id === normalized.id ? { ...order, ...normalized } : order);
            });
        };
        const patchOrder = (payload: any) => {
            if (!payload?.id) return;
            setOrders(prev => prev.flatMap(order => {
                if (order.id !== payload.id) return [order];
                const normalized = normalizeOrder({ ...order, ...payload });
                return orderMatchesFilters(normalized) ? [normalized] : [];
            }));
        };
        socketService.on('order:created', upsertOrder);
        socketService.on('order:updated', patchOrder);
        socketService.on('order:status', patchOrder);
        socketService.on('dispatch:assigned', patchOrder);
        return () => {
            socketService.off('order:created', upsertOrder);
            socketService.off('order:updated', patchOrder);
            socketService.off('order:status', patchOrder);
            socketService.off('dispatch:assigned', patchOrder);
        };
    }, [orderMatchesFilters]);

    useEffect(() => {
        setCheckedItems(new Set());
    }, [selectedOrderId]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (voidModalOrderId) closeVoidModal();
            else if (refundModalOrderId) closeRefundModal();
            else if (showApprovalModal) setShowApprovalModal(false);
            else if (selectedOrderId) setSelectedOrderId(null);
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [refundModalOrderId, selectedOrderId, showApprovalModal, voidModalOrderId]);

    const filteredOrders = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return orders;
        return orders.filter(order =>
            order.id.toLowerCase().includes(q) ||
            String(order.orderNumber || '').includes(q) ||
            String(order.customerName || '').toLowerCase().includes(q) ||
            String(order.customerPhone || '').includes(q) ||
            String(order.deliveryAddress || '').toLowerCase().includes(q)
        );
    }, [orders, searchQuery]);

    const selectedOrder = useMemo(
        () => orders.find(order => order.id === selectedOrderId) || null,
        [orders, selectedOrderId],
    );
    const selectedBranch = selectedOrder
        ? branches.find(branch => branch.id === selectedOrder.branchId)
        : branches.find(branch => branch.id === settings.activeBranchId);
    const selectedOrderBusinessDate = selectedOrder
        ? selectedOrder.businessDate || formatLocalDate(selectedOrder.createdAt)
        : null;
    const selectedBranchBusinessDate = selectedBranch?.businessDate || formatLocalDate(new Date());
    const selectedOrderReadOnly = Boolean(
        selectedOrderBusinessDate && selectedOrderBusinessDate !== selectedBranchBusinessDate,
    );
    const selectedTableName = selectedOrder ? getTableDisplayName(selectedOrder) : '';

    const { activeCount, delayedCount, deliveryCount } = useMemo(() => {
        const closedStatuses = [OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED];
        return orders.reduce((counts, order) => {
            if (!closedStatuses.includes(order.status)) counts.activeCount += 1;
            if (getOrderAgeMins(order.createdAt) >= 30 && !closedStatuses.includes(order.status)) counts.delayedCount += 1;
            if (order.type === OrderType.DELIVERY) counts.deliveryCount += 1;
            return counts;
        }, { activeCount: 0, delayedCount: 0, deliveryCount: 0 });
    }, [orders]);
    const orderStatusOptions = useMemo(() => Array.from(new Set(Object.values(OrderStatus))), []);

    const toggleItemCheck = (cartId: string) => {
        setCheckedItems(prev => {
            const next = new Set(prev);
            if (next.has(cartId)) next.delete(cartId);
            else next.add(cartId);
            return next;
        });
    };

    const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
        const actionKey = `${orderId}:${newStatus}`;
        if (pendingOrderAction) return;
        setPendingOrderAction(actionKey);
        setOrders(prev => prev.map(order => order.id === orderId ? { ...order, status: newStatus } : order));
        try {
            await updateOrderStatus(orderId, newStatus, undefined, undefined, { skipVersionCheck: true });
            window.dispatchEvent(new CustomEvent('restoflow:orders-changed', {
                detail: { orderId, status: newStatus, changedAt: Date.now() },
            }));
            showToast(isAr ? 'تم تحديث حالة الطلب' : 'Order status updated', 'success');
            loadOrders();
        } catch (err: any) {
            loadOrders();
            showToast(getActionableErrorMessage(err, lang as any), 'error');
        } finally {
            setPendingOrderAction(null);
        }
    };

    const executeVoidOrder = async (orderId: string, reason: string, approvalId?: number) => {
        if (pendingOrderAction) return;
        setPendingOrderAction(`${orderId}:VOID`);
        setOrders(prev => prev.map(order => order.id === orderId ? { ...order, status: OrderStatus.CANCELLED } : order));
        try {
            await updateOrderStatus(orderId, OrderStatus.CANCELLED, undefined, reason.trim(), {
                skipVersionCheck: true,
                approvalId,
            });
            const changedAt = Date.now();
            const changeDetail = { orderId, status: OrderStatus.CANCELLED, changedAt };
            window.dispatchEvent(new CustomEvent('restoflow:orders-changed', { detail: changeDetail }));
            localStorage.setItem('restoflow:orders-changed', JSON.stringify(changeDetail));
            showToast(isAr ? 'تم إلغاء الطلب' : 'Order cancelled', 'success');
            loadOrders();
        } catch (err: any) {
            loadOrders();
            showToast(getActionableErrorMessage(err, lang as any), 'error');
        } finally {
            setPendingOrderAction(null);
        }
    };

    const closeVoidModal = () => {
        if (pendingOrderAction) return;
        setVoidModalOrderId(null);
        setVoidReason('');
    };

    const submitVoidOrder = () => {
        if (!voidModalOrderId) return;
        const reason = voidReason.trim();
        if (!reason) {
            showToast(isAr ? 'سبب الإلغاء مطلوب' : 'Cancellation reason is required', 'error');
            return;
        }
        if (!hasPermission(AppPermission.OP_VOID_ORDER)) {
            const orderId = voidModalOrderId;
            setApprovalReferenceId(orderId);
            setApprovalAction(() => approval => executeVoidOrder(orderId, reason, approval?.id));
            setShowApprovalModal(true);
            setVoidModalOrderId(null);
            setVoidReason('');
            return;
        }
        setVoidModalOrderId(null);
        setVoidReason('');
        executeVoidOrder(voidModalOrderId, reason);
    };

    const handleVoidOrder = (orderId: string) => {
        setVoidModalOrderId(orderId);
        setVoidReason('');
    };

    const closeRefundModal = () => {
        if (pendingOrderAction) return;
        setRefundModalOrderId(null);
        setRefundReason('');
        setRefundReasonCategory('CUSTOMER_REQUEST');
    };

    const submitRefundRequest = async () => {
        if (!refundModalOrderId || pendingOrderAction) return;
        const reason = refundReason.trim();
        if (!reason) {
            showToast(isAr ? 'سبب الاسترداد مطلوب' : 'Refund reason is required', 'error');
            return;
        }

        setPendingOrderAction(`${refundModalOrderId}:REFUND`);
        try {
            await refundApi.requestRefund({
                orderId: refundModalOrderId,
                type: 'FULL',
                reason,
                reasonCategory: refundReasonCategory,
                refundMethod: 'ORIGINAL_PAYMENT',
            });
            setRefundModalOrderId(null);
            setRefundReason('');
            setRefundReasonCategory('CUSTOMER_REQUEST');
            showToast(isAr ? 'تم إرسال طلب الاسترداد للموافقة' : 'Refund request sent for approval', 'success');
        } catch (err: any) {
            showToast(getActionableErrorMessage(err, lang as any), 'error');
        } finally {
            setPendingOrderAction(null);
        }
    };

    const handlePrintReceipt = async (order: Order) => {
        try {
            await printOrderReceipt({
                order,
                printers,
                settings,
                currencySymbol: settings.currencySymbol || 'EGP',
                lang,
                t,
                branch: branches.find(branch => branch.id === order.branchId),
            });
            showToast(isAr ? 'جاري طباعة الفاتورة' : 'Printing receipt...', 'success');
        } catch {
            showToast(isAr ? 'تعذر الطباعة' : 'Print failed', 'error');
        }
    };

    const handleSendPaymentLink = async (order: Order) => {
        if (!order.customerPhone) {
            showToast(isAr ? 'لا يوجد رقم هاتف مسجل' : 'No customer phone available', 'error');
            return;
        }
        const amount = `${Number(order.total || 0).toFixed(2)} ${settings.currencySymbol || 'EGP'}`;
        const text = isAr
            ? `مرحبا ${order.customerName || 'عميلنا العزيز'}، إجمالي طلبك ${amount}. يرجى إتمام الدفع مع الفرع أو عند الاستلام. رقم الطلب ${formatDisplayId(order)}.`
            : `Hi ${order.customerName || 'Customer'}, your order total is ${amount}. Please complete payment with the branch or on receipt. Order ${formatDisplayId(order)}.`;
        try {
            await apiRequest('/whatsapp/send-message', { method: 'POST', body: JSON.stringify({ to: order.customerPhone, text }) });
            showToast(isAr ? 'تم إرسال طلب الدفع' : 'Payment request sent', 'success');
        } catch {
            showToast(isAr ? 'فشل إرسال طلب الدفع' : 'Failed to send payment request', 'error');
        }
    };

    const handleApology = async (order: Order) => {
        if (!order.customerPhone) {
            showToast(isAr ? 'لا يوجد رقم هاتف مسجل' : 'No customer phone available', 'error');
            return;
        }
        const text = isAr
            ? `مرحبا ${order.customerName || 'عميلنا العزيز'}، نعتذر عن التأخير في طلبك. نعمل على متابعته الآن.`
            : `Hi ${order.customerName || 'Customer'}, sorry for the delay. We are following up on your order now.`;
        try {
            await apiRequest('/whatsapp/send-message', { method: 'POST', body: JSON.stringify({ to: order.customerPhone, text }) });
            showToast(isAr ? 'تم إرسال رسالة الاعتذار' : 'Apology message sent', 'success');
        } catch {
            showToast(isAr ? 'فشل إرسال الرسالة' : 'Failed to send message', 'error');
        }
    };

    if (isLoading && orders.length === 0) {
        return <div className="h-full p-8"><PageSkeleton type="table" rows={10} /></div>;
    }

    return (
        <div className="flex h-full min-h-0 overflow-hidden bg-app text-main max-[1100px]:flex-col" dir={isAr ? 'rtl' : 'ltr'}>
            <section className="flex min-w-0 min-h-0 flex-1 flex-col">
                <header className="border-b border-border bg-card px-4 py-3 xl:px-5 xl:py-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <ClipboardCheck size={23} />
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-main">{copy.title}</h1>
                                <p className="mt-1 text-xs font-bold text-muted">{copy.subtitle}</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-3' : 'left-3'}`} size={15} />
                                <input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    aria-label={copy.search}
                                    placeholder={copy.search}
                                    className={`h-10 w-full min-w-[220px] rounded-xl border border-border bg-elevated text-sm font-bold outline-none focus:border-primary xl:h-11 xl:min-w-[260px] ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
                                />
                            </div>
                            <button type="button" aria-label={isAr ? 'تحديث الطلبات' : 'Refresh orders'} onClick={loadOrders} disabled={isLoading} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-muted transition hover:text-main disabled:opacity-60 xl:h-11 xl:w-11">
                                <RefreshCw size={17} className={isLoading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>
                </header>

                <div className="border-b border-border bg-card/60 px-4 py-2 xl:px-5 xl:py-3">
                    <div className="mb-2 flex gap-2 overflow-x-auto xl:mb-3">
                        {['ALL', OrderType.DELIVERY, OrderType.DINE_IN, OrderType.TAKEAWAY, OrderType.PICKUP].map(type => (
                            <button
                                key={type}
                                onClick={() => setTypeFilter(type)}
                                aria-pressed={typeFilter === type}
                                className={`h-9 shrink-0 rounded-xl px-3 text-xs font-black transition xl:h-10 xl:px-4 ${typeFilter === type ? 'bg-primary text-white' : 'border border-border bg-elevated text-muted hover:text-main'}`}
                            >
                                {getTypeLabel(type)}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-elevated px-3">
                            <Filter size={13} className="text-muted" />
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-transparent text-xs font-black text-main outline-none">
                                <option value="ALL">{copy.allStatuses}</option>
                                {orderStatusOptions.map(status => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
                            </select>
                        </div>
                        <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-elevated px-3">
                            <Calendar size={13} className="text-muted" />
                            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="bg-transparent text-xs font-black text-main outline-none" />
                            {dateFilter ? (
                                <button type="button" onClick={() => setDateFilter('')} className="text-[10px] font-black text-muted hover:text-main">
                                    {copy.allDates}
                                </button>
                            ) : (
                                <button type="button" onClick={() => {
                                    const activeBranch = branches.find(branch => branch.id === branchFilter);
                                    setDateFilter(activeBranch?.businessDate || formatLocalDate(new Date()));
                                }} className="text-[10px] font-black text-muted hover:text-main">
                                    {copy.today}
                                </button>
                            )}
                        </div>
                        <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-elevated px-3">
                            <MapPin size={13} className="text-muted" />
                            <select value={branchFilter} onChange={e => {
                                const nextBranchId = e.target.value;
                                setBranchFilter(nextBranchId);
                                const nextBranch = branches.find(branch => branch.id === nextBranchId);
                                setDateFilter(nextBranch?.businessDate || formatLocalDate(new Date()));
                            }} className="bg-transparent text-xs font-black text-main outline-none">
                                <option value="ALL">{copy.allBranches}</option>
                                {branches.map(branch => <option key={branch.id} value={branch.id}>{isAr ? branch.nameAr || branch.name : branch.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-b border-border bg-app px-4 py-2 xl:gap-3 xl:px-5 xl:py-3">
                    <div className="rounded-xl border border-border bg-card px-3 py-1.5 xl:py-2">
                        <div className="text-[10px] font-black text-muted">{isAr ? 'نشط' : 'Active'}</div>
                        <div className="text-lg font-black text-main">{activeCount}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-card px-3 py-1.5 xl:py-2">
                        <div className="text-[10px] font-black text-muted">{isAr ? 'دليفري' : 'Delivery'}</div>
                        <div className="text-lg font-black text-main">{deliveryCount}</div>
                    </div>
                    <div className={`rounded-xl border bg-card px-3 py-1.5 xl:py-2 ${delayedCount > 0 ? 'border-rose-300' : 'border-border'}`}>
                        <div className="text-[10px] font-black text-muted">{isAr ? 'متأخر' : 'Delayed'}</div>
                        <div className={`text-lg font-black ${delayedCount > 0 ? 'text-rose-600' : 'text-main'}`}>{delayedCount}</div>
                    </div>
                </div>

                {error && (
                    <div role="alert" className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                        <span>{error}</span>
                        <button type="button" onClick={loadOrders} disabled={isLoading} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-black transition hover:bg-rose-100 disabled:opacity-50">
                            {isAr ? 'إعادة المحاولة' : 'Retry'}
                        </button>
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto p-3 xl:p-5">
                    {filteredOrders.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card text-muted">
                            <ClipboardCheck size={46} className="mb-3 opacity-50" />
                            <p className="text-sm font-black">{copy.noOrders}</p>
                            {(searchQuery || statusFilter !== 'ALL' || typeFilter !== 'ALL' || branchFilter !== 'ALL' || dateFilter) && (
                                <button type="button" onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); setTypeFilter('ALL'); setBranchFilter('ALL'); setDateFilter(''); }} className="mt-3 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-black text-main transition hover:bg-primary/10">
                                    {isAr ? 'مسح كل الفلاتر' : 'Clear all filters'}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {filteredOrders.map(order => {
                                const age = getOrderAgeMins(order.createdAt);
                                const delayed = age >= 30 && ![OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(order.status);
                                const selected = selectedOrderId === order.id;
                                const tableName = getTableDisplayName(order);
                                return (
                                    <button
                                        key={order.id}
                                        onClick={() => setSelectedOrderId(order.id)}
                                        aria-pressed={selected}
                                        className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-start transition xl:gap-4 xl:rounded-2xl xl:p-4 ${
                                            selected ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : delayed ? 'border-rose-300 bg-rose-50/60 hover:bg-rose-50' : 'border-border bg-card hover:bg-elevated'
                                        }`}
                                    >
                                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${selected ? 'bg-primary text-white' : 'bg-elevated text-main'}`}>
                                            <ClipboardCheck size={19} />
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-black text-main">{formatDisplayId(order)}</span>
                                                <span className="rounded-full bg-elevated px-2 py-1 text-[10px] font-black text-muted">{getTypeLabel(order.type)}</span>
                                                {tableName && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black text-primary">{copy.table} {tableName}</span>}
                                                {order.isUrgent && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">URGENT</span>}
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold text-muted">
                                                <span className="truncate">{order.customerName || (isAr ? 'عميل' : 'Customer')}</span>
                                                {order.customerPhone && <span className="inline-flex items-center gap-1"><Phone size={12} />{order.customerPhone}</span>}
                                                <span className={delayed ? 'inline-flex items-center gap-1 text-rose-600' : 'inline-flex items-center gap-1'}>
                                                    <Clock size={12} />{age}m
                                                </span>
                                                {order.deliveryAddress && <span className="hidden truncate lg:inline-flex lg:max-w-[260px]">{order.deliveryAddress}</span>}
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2">
                                            <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-app px-2.5 py-1.5 text-[11px] font-black text-main">
                                                {getStatusIcon(order.status)}
                                                {getStatusLabel(order.status)}
                                            </div>
                                            <div className="text-sm font-black text-primary">{Number(order.total || 0).toFixed(2)} {settings.currencySymbol || 'EGP'}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {selectedOrder && (
                <button
                    type="button"
                    aria-label={isAr ? 'إغلاق تفاصيل الطلب' : 'Close order details'}
                    onClick={() => setSelectedOrderId(null)}
                    className="fixed inset-0 z-[90] cursor-default bg-slate-950/25 backdrop-blur-[1px]"
                />
            )}

            <aside
                role={selectedOrder ? 'dialog' : undefined}
                aria-modal={selectedOrder ? true : undefined}
                aria-label={selectedOrder ? copy.orderDetails : undefined}
                className={`fixed inset-y-0 z-[100] flex w-full max-w-[520px] min-h-0 flex-col border-border bg-card shadow-2xl transition-transform duration-200 ${isAr ? 'left-0 border-r' : 'right-0 border-l'} ${selectedOrder ? 'translate-x-0' : `pointer-events-none ${isAr ? '-translate-x-full' : 'translate-x-full'}`}`}
            >
                {selectedOrder ? (
                    <>
                        <div className="shrink-0 border-b border-border px-4 py-3 xl:px-5 xl:py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-black text-main">{copy.orderDetails}</h2>
                                    <p className="mt-1 text-xs font-bold text-muted">{formatDisplayId(selectedOrder)} - {getStatusLabel(selectedOrder.status)}</p>
                                </div>
                                <button type="button" aria-label={isAr ? 'إغلاق تفاصيل الطلب' : 'Close order details'} onClick={() => setSelectedOrderId(null)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted transition hover:bg-rose-50 hover:text-rose-600">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto p-3 xl:p-5">
                            <section className="mb-5 rounded-2xl border border-border bg-elevated/40 p-4">
                                <div className="mb-3 flex items-center justify-between text-[11px] font-black text-muted">
                                    <span>{isAr ? 'مسار الحالة' : 'Status flow'}</span>
                                    <span>{getOrderAgeMins(selectedOrder.createdAt)}m</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-card">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{
                                            width: selectedOrder.status === OrderStatus.DELIVERED || selectedOrder.status === OrderStatus.COMPLETED ? '100%' :
                                                selectedOrder.status === OrderStatus.OUT_FOR_DELIVERY ? '78%' :
                                                    selectedOrder.status === OrderStatus.READY ? '55%' :
                                                        selectedOrder.status === OrderStatus.PREPARING ? '32%' : '14%',
                                        }}
                                    />
                                </div>
                                <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                    <div className="rounded-xl border border-border bg-card px-3 py-2">
                                        <span className="block font-bold text-muted">{copy.systemBusinessDate}</span>
                                        <span className="mt-1 block font-black text-main">{formatBusinessDate(selectedBranch?.businessDate)}</span>
                                    </div>
                                    <div className="rounded-xl border border-border bg-card px-3 py-2">
                                        <span className="block font-bold text-muted">{copy.orderBusinessDate}</span>
                                        <span className="mt-1 block font-black text-main">{formatBusinessDate(selectedOrder.businessDate)}</span>
                                    </div>
                                    <div className="rounded-xl border border-border bg-card px-3 py-2 sm:col-span-2">
                                        <span className="block font-bold text-muted">{copy.orderCreatedAt}</span>
                                        <span className="mt-1 block font-black text-main">{formatDateTime(selectedOrder.createdAt)}</span>
                                    </div>
                                    {selectedTableName && (
                                        <div className="rounded-xl border border-border bg-card px-3 py-2 sm:col-span-2">
                                            <span className="block font-bold text-muted">{copy.table}</span>
                                            <span className="mt-1 block font-black text-primary">{selectedTableName}</span>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="mb-5">
                                <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted">
                                    <User size={14} />
                                    {copy.customer}
                                </h3>
                                <div className="rounded-2xl border border-border bg-app p-4">
                                    <div className="grid grid-cols-1 gap-3 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-xs font-bold text-muted">{isAr ? 'الاسم' : 'Name'}</span>
                                            <span className="font-black text-main">{selectedOrder.customerName || '-'}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-xs font-bold text-muted">{isAr ? 'الهاتف' : 'Phone'}</span>
                                            <span className="inline-flex items-center gap-1 font-black text-primary"><Phone size={13} />{selectedOrder.customerPhone || copy.noPhone}</span>
                                        </div>
                                        <div>
                                            <div className="mb-1 flex items-center gap-1 text-xs font-bold text-muted"><MapPin size={13} />{copy.address}</div>
                                            <p className="text-sm font-semibold leading-6 text-main">{selectedOrder.deliveryAddress || copy.noAddress}</p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {(selectedOrder.notes || selectedOrder.kitchenNotes || selectedOrder.deliveryNotes) && (
                                <section className="mb-5">
                                    <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-muted">{copy.notes}</h3>
                                    <div className="space-y-2">
                                        {selectedOrder.notes && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">{selectedOrder.notes}</p>}
                                        {selectedOrder.kitchenNotes && <p className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold leading-6 text-cyan-900">{selectedOrder.kitchenNotes}</p>}
                                        {selectedOrder.deliveryNotes && <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-semibold leading-6 text-violet-900">{selectedOrder.deliveryNotes}</p>}
                                    </div>
                                </section>
                            )}

                            <section className="mb-5">
                                <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted">
                                    <ShoppingBag size={14} />
                                    {copy.items} ({selectedOrder.items.length})
                                </h3>
                                <div className="space-y-2">
                                    {selectedOrder.items.map((item, index) => {
                                        const cartId = item.cartId || `${selectedOrder.id}-${index}`;
                                        const needsChecklist = !selectedOrderReadOnly
                                            && selectedOrder.status === OrderStatus.READY
                                            && selectedOrder.type === OrderType.DELIVERY;
                                        const checked = checkedItems.has(cartId);
                                        return (
                                            <button
                                                key={cartId}
                                                onClick={() => needsChecklist && toggleItemCheck(cartId)}
                                                className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-start transition ${
                                                    checked ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-app hover:bg-elevated'
                                                } ${needsChecklist ? 'cursor-pointer' : 'cursor-default'}`}
                                            >
                                                <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black ${checked ? 'bg-emerald-600 text-white' : 'bg-card text-main'}`}>
                                                    {needsChecklist && checked ? <CheckSquare size={14} /> : item.quantity}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className={`block truncate text-sm font-black text-main ${checked ? 'line-through opacity-70' : ''}`}>
                                                        {isAr ? item.nameAr || item.name : item.name}
                                                    </span>
                                                    {item.notes && <span className="mt-1 block text-xs font-semibold text-muted">{item.notes}</span>}
                                                </span>
                                                <span className="text-sm font-black text-primary">{Number(item.price * item.quantity || 0).toFixed(2)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="rounded-2xl border border-border bg-app p-4">
                                <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-muted">{copy.totals}</h3>
                                <div className="space-y-2 text-sm font-bold">
                                    <div className="flex justify-between text-muted"><span>{copy.subtotal}</span><span>{Number(selectedOrder.subtotal || 0).toFixed(2)}</span></div>
                                    <div className="flex justify-between text-muted"><span>{copy.tax}</span><span>{Number(selectedOrder.tax || 0).toFixed(2)}</span></div>
                                    {Number(selectedOrder.deliveryFee || 0) > 0 && <div className="flex justify-between text-muted"><span>{copy.deliveryFee}</span><span>{Number(selectedOrder.deliveryFee || 0).toFixed(2)}</span></div>}
                                    {Number(selectedOrder.discount || 0) > 0 && <div className="flex justify-between text-emerald-600"><span>{copy.discount}</span><span>-{Number(selectedOrder.discount || 0).toFixed(2)}</span></div>}
                                    <div className="flex justify-between border-t border-border pt-3 text-lg font-black text-main"><span>{copy.total}</span><span>{Number(selectedOrder.total || 0).toFixed(2)}</span></div>
                                </div>
                            </section>
                        </div>

                        <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-md">
                            {selectedOrderReadOnly && (
                                <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-900">
                                    {reviewOnlyCopy}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                {selectedOrder.status === OrderStatus.PENDING && (
                                    <button onClick={() => handleUpdateStatus(selectedOrder.id, OrderStatus.PREPARING)} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-600 text-xs font-black text-white disabled:opacity-50">
                                        <Send size={15} />{copy.sendKitchen}
                                    </button>
                                )}
                                {selectedOrder.status === OrderStatus.PREPARING && (
                                    <button onClick={() => handleUpdateStatus(selectedOrder.id, OrderStatus.READY)} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-xs font-black text-white disabled:opacity-50">
                                        <CheckSquare size={15} />{copy.markReady}
                                    </button>
                                )}
                                {selectedOrder.status === OrderStatus.READY && selectedOrder.type === OrderType.DELIVERY && (
                                    <button
                                        onClick={() => handleUpdateStatus(selectedOrder.id, OrderStatus.OUT_FOR_DELIVERY)}
                                         disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly || checkedItems.size !== selectedOrder.items.length}
                                        className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-black text-white disabled:opacity-40"
                                    >
                                        <Bike size={15} />{copy.outDelivery}
                                    </button>
                                )}
                                {(selectedOrder.status === OrderStatus.OUT_FOR_DELIVERY || (selectedOrder.status === OrderStatus.READY && selectedOrder.type !== OrderType.DELIVERY)) && (
                                     <button onClick={() => handleUpdateStatus(
                                         selectedOrder.id,
                                         selectedOrder.type === OrderType.DINE_IN ? OrderStatus.COMPLETED : OrderStatus.DELIVERED,
                                     )} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-black text-white disabled:opacity-50">
                                        <Banknote size={15} />{copy.complete}
                                    </button>
                                )}
                                {(selectedOrder.status === OrderStatus.PENDING || selectedOrder.status === OrderStatus.PREPARING) && (
                                     <button onClick={() => handleSendPaymentLink(selectedOrder)} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-black text-blue-700 disabled:opacity-50">
                                        <Link size={15} />{copy.payLink}
                                    </button>
                                )}
                                {getOrderAgeMins(selectedOrder.createdAt) >= 30 && ![OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(selectedOrder.status) && (
                                     <button onClick={() => handleApology(selectedOrder)} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 text-xs font-black text-orange-700 disabled:opacity-50">
                                        <MessageCircle size={15} />{copy.apology}
                                    </button>
                                )}
                                 <button onClick={() => handlePrintReceipt(selectedOrder)} disabled={Boolean(pendingOrderAction)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-elevated text-xs font-black text-main disabled:opacity-50">
                                    <Printer size={15} />{copy.print}
                                </button>
                                  <button
                                    onClick={() => handleVoidOrder(selectedOrder.id)}
                                    disabled={Boolean(pendingOrderAction)
                                        || [OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(selectedOrder.status)}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 text-xs font-black text-white disabled:opacity-50"
                                  >
                                     <Trash2 size={15} />{copy.void}
                                 </button>
                                 {[OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(selectedOrder.status) && hasPermission(AppPermission.OP_PROCESS_REFUND) && (
                                     <button onClick={() => { setRefundModalOrderId(selectedOrder.id); setRefundReason(''); setRefundReasonCategory('CUSTOMER_REQUEST'); }} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-600 text-xs font-black text-white disabled:opacity-50">
                                         <RotateCcw size={15} />{copy.refund}
                                     </button>
                                 )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated">
                            <Eye size={30} />
                        </div>
                        <h2 className="text-sm font-black">{copy.selectOrder}</h2>
                    </div>
                )}
            </aside>

            <ManagerApprovalModal
                isOpen={showApprovalModal}
                onClose={() => {
                    setShowApprovalModal(false);
                    setApprovalReferenceId(null);
                }}
                onApproved={approvalAction}
                actionName="VOID_ORDER"
                referenceId={approvalReferenceId || undefined}
            />

            {voidModalOrderId && (
                <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/60 p-4" onClick={closeVoidModal}>
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                            <div>
                                <h3 className="text-base font-black text-main">{copy.voidReasonTitle}</h3>
                                <p className="mt-1 text-sm font-semibold text-muted">{copy.voidReasonHelp}</p>
                            </div>
                            <button type="button" aria-label={isAr ? 'إغلاق نافذة الإلغاء' : 'Close cancellation dialog'} onClick={closeVoidModal} disabled={Boolean(pendingOrderAction)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-app text-muted hover:text-main disabled:opacity-50">
                                <X size={17} />
                            </button>
                        </div>
                        <div className="p-5">
                            <label className="mb-2 block text-xs font-black text-muted">{copy.voidReasonTitle}</label>
                            <textarea
                                value={voidReason}
                                onChange={event => setVoidReason(event.target.value)}
                                rows={4}
                                autoFocus
                                maxLength={240}
                                placeholder={copy.voidReasonPlaceholder}
                                className="w-full resize-none rounded-xl border border-border bg-app p-3 text-sm font-bold text-main outline-none focus:border-primary"
                            />
                            <div className="mt-2 text-end text-[11px] font-black text-muted">{voidReason.trim().length}/240</div>

                        </div>
                        <div className="flex gap-3 border-t border-border p-4">
                            <button onClick={closeVoidModal} disabled={Boolean(pendingOrderAction)} className="flex-1 rounded-xl border border-border bg-app py-3 text-xs font-black text-muted hover:text-main disabled:opacity-50">
                                {copy.cancel}
                            </button>
                            <button onClick={submitVoidOrder} disabled={Boolean(pendingOrderAction) || !voidReason.trim()} className="flex-1 rounded-xl bg-rose-600 py-3 text-xs font-black text-white disabled:opacity-50">
                                {copy.confirmVoid}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {refundModalOrderId && (
                <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/60 p-4" onClick={closeRefundModal}>
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                            <div>
                                <h3 className="text-base font-black text-main">{copy.refundReasonTitle}</h3>
                                <p className="mt-1 text-sm font-semibold text-muted">{copy.refundReasonHelp}</p>
                            </div>
                            <button onClick={closeRefundModal} disabled={Boolean(pendingOrderAction)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-app text-muted hover:text-main disabled:opacity-50">
                                <X size={17} />
                            </button>
                        </div>
                        <div className="p-5">
                            <textarea
                                value={refundReason}
                                onChange={event => setRefundReason(event.target.value)}
                                rows={4}
                                autoFocus
                                maxLength={1000}
                                placeholder={copy.refundReasonPlaceholder}
                                className="w-full resize-none rounded-xl border border-border bg-app p-3 text-sm font-bold text-main outline-none focus:border-primary"
                            />
                        </div>
                        <div className="flex gap-3 border-t border-border p-4">
                            <button onClick={closeRefundModal} disabled={Boolean(pendingOrderAction)} className="flex-1 rounded-xl border border-border bg-app py-3 text-xs font-black text-muted hover:text-main disabled:opacity-50">
                                {copy.cancel}
                            </button>
                            <button onClick={submitRefundRequest} disabled={Boolean(pendingOrderAction) || !refundReason.trim()} className="flex-1 rounded-xl bg-amber-600 py-3 text-xs font-black text-white disabled:opacity-50">
                                {copy.confirmRefund}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrdersCenter;
