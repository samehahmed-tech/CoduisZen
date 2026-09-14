import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    ArrowUpDown,
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
    Flame,
    LayoutGrid,
    Link,
    List,
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
    Store,
    Timer,
    Trash2,
    User,
    UtensilsCrossed,
    Wallet,
    X,
    XCircle,
    Zap,
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
import { useVirtualizer } from '@tanstack/react-virtual';
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
    deliverySource: raw.delivery_source || raw.deliverySource,
    source: raw.source,
    deliveryFee: raw.delivery_fee || raw.deliveryFee,
    createdAt: new Date(raw.created_at || raw.createdAt || new Date()),
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    syncStatus: raw.sync_status || raw.syncStatus || 'SYNCED',
});

type SortMode = 'newest' | 'oldest' | 'highest' | 'waiting';
type ViewMode = 'list' | 'board';
type DetailTab = 'ops' | 'items' | 'customer';

const CLOSED_STATUSES = [OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED];
const BOARD_COLUMNS: { key: string; titleAr: string; titleEn: string; statuses: OrderStatus[] }[] = [
    { key: 'PENDING', titleAr: 'معلق', titleEn: 'Pending', statuses: [OrderStatus.PENDING] },
    { key: 'PREPARING', titleAr: 'تحضير', titleEn: 'Preparing', statuses: [OrderStatus.PREPARING] },
    { key: 'READY', titleAr: 'جاهز', titleEn: 'Ready', statuses: [OrderStatus.READY] },
    { key: 'WAY', titleAr: 'في الطريق', titleEn: 'On way', statuses: [OrderStatus.OUT_FOR_DELIVERY] },
    { key: 'DONE', titleAr: 'منتهي', titleEn: 'Done', statuses: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
];

const OrdersCenter: React.FC = () => {
    const { settings, branches, printers, hasPermission } = useAuthStore(useShallow((state) => ({ settings: state.settings, branches: state.branches, printers: state.printers, hasPermission: state.hasPermission })));
    const { updateOrderStatus } = useOrderStore();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // Custody guard (mirrors server orderStatusPolicy): in-house delivery
    // orders must have a driver before leaving (OUT_FOR_DELIVERY) or closing
    // (DELIVERED). Aggregator orders are delivered by the platform — exempt.
    const isInHouseDelivery = (order: Order) => {
        if (order.type !== OrderType.DELIVERY) return false;
        const source = String((order as any).deliverySource || '').trim().toLowerCase();
        const origin = String((order as any).source || '').trim().toLowerCase();
        return !((source && source !== 'restaurant') || origin.startsWith('platform:'));
    };
    const needsDriverForNext = (order: Order, nextStatus?: OrderStatus) => {
        const target = nextStatus || nextActionFor(order)?.status;
        if (!target) return false;
        return isInHouseDelivery(order)
            && (target === OrderStatus.OUT_FOR_DELIVERY || target === OrderStatus.DELIVERED)
            && !String((order as any).driverId || '').trim();
    };

    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const t = translations[lang] || translations.en;

    // ── data ──────────────────────────────────────────────
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [liveTick, setLiveTick] = useState(0);
    const loadRequestRef = useRef(0);

    // ── filters / view ────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [branchFilter, setBranchFilter] = useState<string>(settings.activeBranchId || 'ALL');
    const [dateFilter, setDateFilter] = useState<string>(() => (
        branches.find(branch => branch.id === settings.activeBranchId)?.businessDate
        || formatLocalDate(new Date())
    ));
    const [sortMode, setSortMode] = useState<SortMode>('newest');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [onlyDelayed, setOnlyDelayed] = useState(false);
    const [onlyUrgent, setOnlyUrgent] = useState(false);
    const [detailTab, setDetailTab] = useState<DetailTab>('ops');

    // ── selection / actions ───────────────────────────────
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

    const reviewOnlyCopy = isAr
        ? 'هذا اليوم للمراجعة فقط. لا يمكن تعديل أو إلغاء أوردر بعد انتهاء يوم تشغيله.'
        : 'This day is review-only. Orders cannot be changed or cancelled after their business day ends.';

    const copy = {
        title: isAr ? 'مركز الطلبات' : 'Orders Center',
        subtitle: isAr ? 'غرفة عمليات ذكية — راقب، رتّب، وتدخّل في الوقت المناسب' : 'Smart ops room — monitor, prioritize and act in time',
        live: isAr ? 'مباشر' : 'Live',
        search: isAr ? 'بحث برقم الطلب، العميل، الهاتف، العنوان...' : 'Search order, customer, phone, address...',
        all: isAr ? 'الكل' : 'All',
        allStatuses: isAr ? 'كل الحالات' : 'All statuses',
        allBranches: isAr ? 'كل الفروع' : 'All branches',
        noOrders: isAr ? 'لا توجد طلبات مطابقة' : 'No matching orders',
        noOrdersHint: isAr ? 'جرّب توسيع الفلاتر أو امسح البحث' : 'Try widening filters or clearing search',
        clearFilters: isAr ? 'مسح كل الفلاتر' : 'Clear all filters',
        allDates: isAr ? 'كل التواريخ' : 'All dates',
        today: isAr ? 'اليوم' : 'Today',
        pipeline: isAr ? 'خط التشغيل' : 'Pipeline',
        sort: isAr ? 'الترتيب' : 'Sort',
        sortNewest: isAr ? 'الأحدث' : 'Newest',
        sortOldest: isAr ? 'الأقدم' : 'Oldest',
        sortHighest: isAr ? 'الأعلى قيمة' : 'Highest value',
        sortWaiting: isAr ? 'الأطول انتظاراً' : 'Longest waiting',
        delayedOnly: isAr ? 'المتأخر فقط' : 'Delayed only',
        urgentOnly: isAr ? 'العاجل فقط' : 'Urgent only',
        kpiActive: isAr ? 'قيد التشغيل' : 'In progress',
        kpiAttention: isAr ? 'يحتاج تدخل' : 'Needs action',
        kpiDelivery: isAr ? 'دليفري' : 'Delivery',
        kpiRevenue: isAr ? 'إيراد اليوم' : "Today's revenue",
        kpiWait: isAr ? 'متوسط الانتظار' : 'Avg wait',
        kpiUrgent: isAr ? 'عاجل' : 'Urgent',
        min: isAr ? 'د' : 'm',
        customer: isAr ? 'العميل' : 'Customer',
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
        nextAction: isAr ? 'الإجراء التالي' : 'Next action',
        quickComms: isAr ? 'تواصل سريع' : 'Quick comms',
        checklist: isAr ? 'قائمة التجهيز' : 'Packing checklist',
        checklistHint: isAr ? 'علّم كل صنف قبل خروج الدليفري' : 'Check every item before dispatch',
        checklistDone: isAr ? 'مكتمل' : 'done',
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
        tabOps: isAr ? 'التشغيل' : 'Ops',
        tabItems: isAr ? 'الأصناف' : 'Items',
        tabCustomer: isAr ? 'العميل' : 'Customer',
        slaOk: isAr ? 'في الموعد' : 'On time',
        slaWarn: isAr ? 'يقترب من التأخير' : 'Getting late',
        slaLate: isAr ? 'متأخر' : 'Late',
        board: isAr ? 'لوحة' : 'Board',
        list: isAr ? 'قائمة' : 'List',
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

    const getOrderAgeMins = (createdAt: string | Date) => Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));

    const slaFor = (order: Order): 'ok' | 'warn' | 'late' => {
        if (CLOSED_STATUSES.includes(order.status)) return 'ok';
        const age = getOrderAgeMins(order.createdAt);
        if (age >= 30) return 'late';
        if (age >= 15) return 'warn';
        return 'ok';
    };

    const getStatusIcon = (status: OrderStatus, size = 14) => {
        switch (status) {
            case OrderStatus.PENDING: return <Clock size={size} className="text-amber-500" />;
            case OrderStatus.PREPARING: return <ChefHat size={size} className="text-cyan-500" />;
            case OrderStatus.READY: return <Package size={size} className="text-indigo-500" />;
            case OrderStatus.OUT_FOR_DELIVERY: return <Bike size={size} className="text-violet-500" />;
            case OrderStatus.DELIVERED:
            case OrderStatus.COMPLETED:
                return <CheckCircle size={size} className="text-emerald-500" />;
            case OrderStatus.CANCELLED: return <XCircle size={size} className="text-rose-500" />;
            default: return <AlertCircle size={size} className="text-muted" />;
        }
    };

    // ── loading (same API contract) ───────────────────────
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

    // Live clock for ages (re-render each minute)
    useEffect(() => {
        const id = window.setInterval(() => setLiveTick(v => v + 1), 60000);
        return () => window.clearInterval(id);
    }, []);

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
        setDetailTab('ops');
    }, [selectedOrderId]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (voidModalOrderId) closeVoidModal();
            else if (refundModalOrderId) closeRefundModal();
            else if (showApprovalModal) setShowApprovalModal(false);
            else if (selectedOrderId) setSelectedOrderId(null);
        };
        const handleArrows = (event: KeyboardEvent) => {
            const tag = (event.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (voidModalOrderId || refundModalOrderId || showApprovalModal) return;
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            setSelectedOrderId(prev => {
                const ids = sortedOrdersRef.current.map(o => o.id);
                if (ids.length === 0) return prev;
                const idx = prev ? ids.indexOf(prev) : -1;
                const next = event.key === 'ArrowDown'
                    ? ids[Math.min(ids.length - 1, idx + 1)]
                    : ids[Math.max(0, idx <= 0 ? 0 : idx - 1)];
                return next ?? prev;
            });
        };
        window.addEventListener('keydown', handleEscape);
        window.addEventListener('keydown', handleArrows);
        return () => {
            window.removeEventListener('keydown', handleEscape);
            window.removeEventListener('keydown', handleArrows);
        };
    }, [refundModalOrderId, selectedOrderId, showApprovalModal, voidModalOrderId]);

    // ── smart aggregations ────────────────────────────────
    const stats = useMemo(() => {
        void liveTick;
        const acc = { active: 0, delayed: 0, delivery: 0, urgent: 0, revenue: 0, waitSum: 0, waitN: 0 };
        const perStatus: Record<string, number> = {};
        for (const order of orders) {
            perStatus[order.status] = (perStatus[order.status] || 0) + 1;
            if (!CLOSED_STATUSES.includes(order.status)) {
                acc.active += 1;
                acc.waitSum += getOrderAgeMins(order.createdAt);
                acc.waitN += 1;
            }
            if (slaFor(order) === 'late') acc.delayed += 1;
            if (order.type === OrderType.DELIVERY) acc.delivery += 1;
            if (order.isUrgent && !CLOSED_STATUSES.includes(order.status)) acc.urgent += 1;
            if (![OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status)) acc.revenue += Number(order.total || 0);
        }
        return { ...acc, avgWait: acc.waitN ? Math.round(acc.waitSum / acc.waitN) : 0, perStatus };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orders, liveTick]);

    const filteredSorted = useMemo(() => {
        void liveTick;
        const q = searchQuery.trim().toLowerCase();
        const base = orders.filter(order => {
            if (q && !(
                order.id.toLowerCase().includes(q) ||
                String(order.orderNumber || '').includes(q) ||
                String(order.customerName || '').toLowerCase().includes(q) ||
                String(order.customerPhone || '').includes(q) ||
                String(order.deliveryAddress || '').toLowerCase().includes(q)
            )) return false;
            if (onlyDelayed && slaFor(order) !== 'late') return false;
            if (onlyUrgent && !order.isUrgent) return false;
            return true;
        });
        const sorted = [...base];
        switch (sortMode) {
            case 'oldest': sorted.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)); break;
            case 'highest': sorted.sort((a, b) => Number(b.total || 0) - Number(a.total || 0)); break;
            case 'waiting':
                sorted.sort((a, b) => {
                    const rank = (o: Order) => (CLOSED_STATUSES.includes(o.status) ? 1 : 0) * 100000 - getOrderAgeMins(o.createdAt);
                    return rank(a) - rank(b);
                });
                break;
            case 'newest':
            default: sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)); break;
        }
        return sorted;
    }, [orders, searchQuery, onlyDelayed, onlyUrgent, sortMode, liveTick]);

    const sortedOrdersRef = useRef<Order[]>([]);
    sortedOrdersRef.current = filteredSorted;

    const ordersScrollRef = useRef<HTMLDivElement | null>(null);
    const ordersVirtualizer = useVirtualizer({
        count: viewMode === 'list' ? filteredSorted.length : 0,
        getScrollElement: () => ordersScrollRef.current,
        estimateSize: () => 118,
        overscan: 8,
    });

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
    const orderStatusOptions = useMemo(() => Array.from(new Set(Object.values(OrderStatus))), []);

    const toggleItemCheck = (cartId: string) => {
        setCheckedItems(prev => {
            const next = new Set(prev);
            if (next.has(cartId)) next.delete(cartId);
            else next.add(cartId);
            return next;
        });
    };

    const nextActionFor = (order: Order): { status: OrderStatus; label: string; icon: React.ReactNode } | null => {
        if (order.status === OrderStatus.PENDING) return { status: OrderStatus.PREPARING, label: copy.sendKitchen, icon: <Send size={15} /> };
        if (order.status === OrderStatus.PREPARING) return { status: OrderStatus.READY, label: copy.markReady, icon: <CheckSquare size={15} /> };
        if (order.status === OrderStatus.READY && order.type === OrderType.DELIVERY) return { status: OrderStatus.OUT_FOR_DELIVERY, label: copy.outDelivery, icon: <Bike size={15} /> };
        if (order.status === OrderStatus.OUT_FOR_DELIVERY || (order.status === OrderStatus.READY && order.type !== OrderType.DELIVERY)) {
            return {
                status: order.type === OrderType.DINE_IN ? OrderStatus.COMPLETED : OrderStatus.DELIVERED,
                label: copy.complete,
                icon: <Banknote size={15} />,
            };
        }
        return null;
    };

    // ── mutations (same contracts) ────────────────────────
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

    const clearAllFilters = () => {
        setSearchQuery('');
        setStatusFilter('ALL');
        setTypeFilter('ALL');
        setBranchFilter('ALL');
        setDateFilter('');
        setOnlyDelayed(false);
        setOnlyUrgent(false);
    };
    const hasActiveFilters = Boolean(searchQuery || statusFilter !== 'ALL' || typeFilter !== 'ALL' || branchFilter !== 'ALL' || dateFilter || onlyDelayed || onlyUrgent);

    const slaBadge = (sla: 'ok' | 'warn' | 'late') => {
        if (sla === 'late') return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700"><Flame size={11} />{copy.slaLate}</span>;
        if (sla === 'warn') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700"><Timer size={11} />{copy.slaWarn}</span>;
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700"><Zap size={11} />{copy.slaOk}</span>;
    };

    const renderOrderCard = (order: Order, compact = false) => {
        const age = getOrderAgeMins(order.createdAt);
        const sla = slaFor(order);
        const selected = selectedOrderId === order.id;
        const tableName = getTableDisplayName(order);
        const next = nextActionFor(order);
        return (
            <button
                onClick={() => setSelectedOrderId(order.id)}
                aria-pressed={selected}
                className={`group relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-2xl border p-3 text-start transition-all ${
                    selected
                        ? 'border-primary bg-primary/[0.06] shadow-lg ring-2 ring-primary/25'
                        : sla === 'late'
                            ? 'border-rose-200 bg-card hover:border-rose-300 hover:shadow-md'
                            : 'border-border bg-card hover:border-primary/40 hover:shadow-md'
                } ${compact ? '' : ''}`}
            >
                <span className={`absolute inset-y-0 ${isAr ? 'right-0' : 'left-0'} w-1 ${sla === 'late' ? 'bg-rose-500' : sla === 'warn' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-primary text-white' : 'bg-elevated text-main'}`}>
                    {order.type === OrderType.DELIVERY ? <Bike size={19} /> : order.type === OrderType.DINE_IN ? <UtensilsCrossed size={19} /> : <Store size={19} />}
                </div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-black text-main">{formatDisplayId(order)}</span>
                        <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-black text-muted">{getTypeLabel(order.type)}</span>
                        {tableName && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">{copy.table} {tableName}</span>}
                        {order.isUrgent && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-amber-950">URGENT</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-muted">
                        <span className="max-w-[130px] truncate">{order.customerName || (isAr ? 'عميل' : 'Customer')}</span>
                        {order.customerPhone && <span className="inline-flex items-center gap-1" dir="ltr"><Phone size={11} />{order.customerPhone}</span>}
                        <span className={`inline-flex items-center gap-1 font-black ${sla === 'late' ? 'text-rose-600' : sla === 'warn' ? 'text-amber-600' : ''}`}>
                            <Clock size={11} />{age}{copy.min}
                        </span>
                    </div>
                    {!compact && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {slaBadge(sla)}
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-app px-2 py-0.5 text-[10px] font-black text-main">
                                {getStatusIcon(order.status, 11)}{getStatusLabel(order.status)}
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="text-sm font-black text-primary">{Number(order.total || 0).toFixed(0)} <span className="text-[10px]">{settings.currencySymbol || 'EGP'}</span></div>
                    {compact
                        ? <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-app px-2 py-1 text-[10px] font-black">{getStatusIcon(order.status, 11)}{getStatusLabel(order.status)}</span>
                        : next && !CLOSED_STATUSES.includes(order.status) && ![OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status) && (
                            needsDriverForNext(order, next.status)
                                ? (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={e => { e.stopPropagation(); navigate('/dispatch'); }}
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); navigate('/dispatch'); } }}
                                        title={isAr ? 'عين طيار من شاشة التوصيل أولاً — ممنوع خروج الطلب بدون طيار' : 'Assign a driver from dispatch first — orders cannot leave without a driver'}
                                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[10px] font-black text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                                    >
                                        <Bike size={11} />{isAr ? 'عين طيار' : 'Assign driver'}
                                    </span>
                                ) : (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={e => { e.stopPropagation(); handleUpdateStatus(order.id, next.status); }}
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleUpdateStatus(order.id, next.status); } }}
                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                                    >
                                        {next.icon}{next.label}
                                    </span>
                                )
                        )}
                </div>
            </button>
        );
    };

    if (isLoading && orders.length === 0) {
        return <div className="h-full p-8"><PageSkeleton type="table" rows={10} /></div>;
    }

    const pipelineTabs = [{ key: 'ALL', label: copy.all, count: orders.length }, ...orderStatusOptions.map(s => ({ key: s, label: getStatusLabel(s as OrderStatus), count: stats.perStatus[s] || 0 }))];

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-app text-main" dir={isAr ? 'rtl' : 'ltr'}>
            {/* ── Command header ─────────────────────────── */}
            <header className="shrink-0 border-b border-border bg-card px-4 pb-3 pt-3 xl:px-5">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-white shadow-lg">
                            <ClipboardCheck size={22} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="truncate text-lg font-black leading-6">{copy.title}</h1>
                                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                                    <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" /></span>
                                    {copy.live}
                                </span>
                            </div>
                            <p className="mt-0.5 truncate text-[11px] font-bold text-muted">{copy.subtitle}</p>
                        </div>
                    </div>
                    <div className="ms-auto flex flex-1 flex-wrap items-center justify-end gap-2">
                        <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
                            <Search className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-3' : 'left-3'}`} size={15} />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                aria-label={copy.search}
                                placeholder={copy.search}
                                className={`h-10 w-full rounded-xl border border-border bg-elevated text-xs font-bold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${isAr ? 'pl-3 pr-9' : 'pl-9 pr-3'}`}
                            />
                        </div>
                        <div className="flex h-10 items-center gap-1 rounded-xl border border-border bg-elevated p-1">
                            <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title={copy.list} className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black transition ${viewMode === 'list' ? 'bg-card text-primary shadow' : 'text-muted hover:text-main'}`}>
                                <List size={14} />{copy.list}
                            </button>
                            <button type="button" onClick={() => setViewMode('board')} aria-pressed={viewMode === 'board'} title={copy.board} className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black transition ${viewMode === 'board' ? 'bg-card text-primary shadow' : 'text-muted hover:text-main'}`}>
                                <LayoutGrid size={14} />{copy.board}
                            </button>
                        </div>
                        <div className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-elevated px-2.5">
                            <ArrowUpDown size={13} className="shrink-0 text-muted" />
                            <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)} aria-label={copy.sort} className="bg-transparent text-[11px] font-black text-main outline-none">
                                <option value="newest">{copy.sortNewest}</option>
                                <option value="oldest">{copy.sortOldest}</option>
                                <option value="highest">{copy.sortHighest}</option>
                                <option value="waiting">{copy.sortWaiting}</option>
                            </select>
                        </div>
                        <button type="button" aria-label={isAr ? 'تحديث الطلبات' : 'Refresh orders'} onClick={loadOrders} disabled={isLoading} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-muted transition hover:text-main disabled:opacity-60">
                            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* KPI strip */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                    <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-elevated/50 px-3 py-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Zap size={16} /></div>
                        <div><div className="text-[10px] font-black text-muted">{copy.kpiActive}</div><div className="text-lg font-black leading-5">{stats.active}</div></div>
                    </div>
                    <button type="button" onClick={() => setOnlyDelayed(v => !v)} aria-pressed={onlyDelayed} className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-start transition ${onlyDelayed ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-200' : stats.delayed > 0 ? 'border-rose-300 bg-rose-50/60' : 'border-border bg-elevated/50'}`}>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700"><Flame size={16} /></div>
                        <div><div className="text-[10px] font-black text-muted">{copy.kpiAttention}</div><div className={`text-lg font-black leading-5 ${stats.delayed > 0 ? 'text-rose-600' : ''}`}>{stats.delayed}</div></div>
                    </button>
                    <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-elevated/50 px-3 py-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Bike size={16} /></div>
                        <div><div className="text-[10px] font-black text-muted">{copy.kpiDelivery}</div><div className="text-lg font-black leading-5">{stats.delivery}</div></div>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-elevated/50 px-3 py-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Wallet size={16} /></div>
                        <div className="min-w-0"><div className="text-[10px] font-black text-muted">{copy.kpiRevenue}</div><div className="truncate text-lg font-black leading-5">{stats.revenue.toFixed(0)} <span className="text-[10px] font-bold text-muted">{settings.currencySymbol || 'EGP'}</span></div></div>
                    </div>
                    <div className="col-span-2 flex items-center gap-2.5 rounded-2xl border border-border bg-elevated/50 px-3 py-2 sm:col-span-1">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Timer size={16} /></div>
                        <div><div className="text-[10px] font-black text-muted">{copy.kpiWait}</div><div className="text-lg font-black leading-5">{stats.avgWait}{copy.min}</div></div>
                        {stats.urgent > 0 && (
                            <button type="button" onClick={() => setOnlyUrgent(v => !v)} className={`ms-auto rounded-full px-2.5 py-1 text-[10px] font-black transition ${onlyUrgent ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}>
                                {copy.kpiUrgent}: {stats.urgent}
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Filter ops bar ─────────────────────────── */}
            <div className="shrink-0 border-b border-border bg-card/70 px-4 py-2 xl:px-5">
                <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-wider text-muted"><Filter size={11} />{copy.pipeline}</span>
                    {pipelineTabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setStatusFilter(tab.key)}
                            aria-pressed={statusFilter === tab.key}
                            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-black transition ${statusFilter === tab.key ? 'bg-primary text-white shadow' : 'border border-border bg-elevated text-muted hover:text-main'}`}
                        >
                            {tab.label}
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${statusFilter === tab.key ? 'bg-white/25 text-white' : 'bg-app text-muted'}`}>{tab.count}</span>
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-elevated p-1">
                        {['ALL', OrderType.DELIVERY, OrderType.DINE_IN, OrderType.TAKEAWAY, OrderType.PICKUP].map(type => (
                            <button
                                key={type}
                                onClick={() => setTypeFilter(type)}
                                aria-pressed={typeFilter === type}
                                className={`h-8 shrink-0 rounded-lg px-3 text-[11px] font-black transition ${typeFilter === type ? 'bg-primary text-white shadow' : 'text-muted hover:text-main'}`}
                            >
                                {getTypeLabel(type)}
                            </button>
                        ))}
                    </div>
                    <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-elevated px-2.5">
                        <Calendar size={12} className="shrink-0 text-muted" />
                        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="bg-transparent text-[11px] font-black text-main outline-none" />
                        {dateFilter ? (
                            <button type="button" onClick={() => setDateFilter('')} className="shrink-0 text-[10px] font-black text-muted hover:text-main">{copy.allDates}</button>
                        ) : (
                            <button type="button" onClick={() => {
                                const activeBranch = branches.find(branch => branch.id === branchFilter);
                                setDateFilter(activeBranch?.businessDate || formatLocalDate(new Date()));
                            }} className="shrink-0 text-[10px] font-black text-muted hover:text-main">{copy.today}</button>
                        )}
                    </div>
                    <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-elevated px-2.5">
                        <MapPin size={12} className="shrink-0 text-muted" />
                        <select value={branchFilter} onChange={e => {
                            const nextBranchId = e.target.value;
                            setBranchFilter(nextBranchId);
                            const nextBranch = branches.find(branch => branch.id === nextBranchId);
                            setDateFilter(nextBranch?.businessDate || formatLocalDate(new Date()));
                        }} className="max-w-[150px] bg-transparent text-[11px] font-black text-main outline-none">
                            <option value="ALL">{copy.allBranches}</option>
                            {branches.map(branch => <option key={branch.id} value={branch.id}>{isAr ? branch.nameAr || branch.name : branch.name}</option>)}
                        </select>
                    </div>
                    <span className="ms-auto hidden text-[11px] font-black text-muted sm:inline">{filteredSorted.length} / {orders.length}</span>
                </div>
            </div>

            {error && (
                <div role="alert" className="mx-4 mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700">
                    <span>{error}</span>
                    <button type="button" onClick={loadOrders} disabled={isLoading} className="rounded-lg border border-rose-300 px-3 py-1.5 text-[11px] font-black transition hover:bg-rose-100 disabled:opacity-50">
                        {isAr ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                </div>
            )}

            {/* ── Main split ─────────────────────────────── */}
            <div className="flex min-h-0 flex-1 overflow-hidden max-[1100px]:flex-col">
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {filteredSorted.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted">
                            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-elevated"><ClipboardCheck size={30} className="opacity-50" /></div>
                            <p className="text-sm font-black text-main">{copy.noOrders}</p>
                            <p className="mt-1 text-xs font-bold text-muted">{copy.noOrdersHint}</p>
                            {hasActiveFilters && (
                                <button type="button" onClick={clearAllFilters} className="mt-4 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-black text-main transition hover:bg-primary/10">
                                    {copy.clearFilters}
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'list' ? (
                        <div ref={ordersScrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 xl:p-4">
                            <div style={{ height: `${ordersVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                                {ordersVirtualizer.getVirtualItems().map(virtualRow => {
                                    const order = filteredSorted[virtualRow.index];
                                    if (!order) return null;
                                    return (
                                        <div
                                            key={order.id}
                                            data-index={virtualRow.index}
                                            ref={ordersVirtualizer.measureElement}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, paddingBottom: '10px' }}
                                        >
                                            {renderOrderCard(order)}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-x-auto overflow-y-hidden p-3 xl:grid-cols-5 xl:p-4">
                            {BOARD_COLUMNS.map(col => {
                                const colOrders = filteredSorted.filter(o => col.statuses.includes(o.status));
                                return (
                                    <div key={col.key} className="flex min-h-0 min-w-[220px] flex-col rounded-2xl border border-border bg-elevated/40">
                                        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
                                            <span className="text-[11px] font-black text-main">{isAr ? col.titleAr : col.titleEn}</span>
                                            <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-black text-muted">{colOrders.length}</span>
                                        </div>
                                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                                            {colOrders.map(order => <div key={order.id}>{renderOrderCard(order, true)}</div>)}
                                            {colOrders.length === 0 && <div className="rounded-xl border border-dashed border-border p-4 text-center text-[10px] font-bold text-muted">—</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* ── Details drawer ─────────────────────── */}
                {selectedOrder && (
                    <button
                        type="button"
                        aria-label={isAr ? 'إغلاق تفاصيل الطلب' : 'Close order details'}
                        onClick={() => setSelectedOrderId(null)}
                        className="fixed inset-0 z-[90] cursor-default bg-slate-950/25 backdrop-blur-[1px] min-[1100px]:hidden"
                    />
                )}
                <aside
                    role={selectedOrder ? 'dialog' : undefined}
                    aria-modal={selectedOrder ? true : undefined}
                    aria-label={selectedOrder ? copy.orderDetails : undefined}
                    className={`z-[100] flex min-h-0 w-full flex-col border-border bg-card shadow-2xl transition-transform duration-200 max-[1100px]:fixed max-[1100px]:inset-y-0 max-[1100px]:w-full max-[1100px]:max-w-[520px] max-[1100px]:${isAr ? 'left-0 max-[1100px]:border-r' : 'right-0 max-[1100px]:border-l'} min-[1100px]:w-[420px] min-[1100px]:shrink-0 min-[1100px]:border-s ${selectedOrder ? 'translate-x-0' : `pointer-events-none max-[1100px]:${isAr ? 'max-[1100px]:-translate-x-full' : 'max-[1100px]:translate-x-full'} min-[1100px]:hidden`}`}
                >
                    {selectedOrder ? (
                        <>
                            <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-base font-black">{formatDisplayId(selectedOrder)}</h2>
                                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-app px-2.5 py-1 text-[10px] font-black">
                                                {getStatusIcon(selectedOrder.status, 12)}{getStatusLabel(selectedOrder.status)}
                                            </span>
                                            {slaBadge(slaFor(selectedOrder))}
                                        </div>
                                        <p className="mt-1.5 text-[11px] font-bold text-muted">
                                            {getTypeLabel(selectedOrder.type)}
                                            {selectedTableName ? ` • ${copy.table} ${selectedTableName}` : ''}
                                            {` • ${getOrderAgeMins(selectedOrder.createdAt)}${copy.min}`}
                                            {` • ${Number(selectedOrder.total || 0).toFixed(2)} ${settings.currencySymbol || 'EGP'}`}
                                        </p>
                                    </div>
                                    <button type="button" aria-label={isAr ? 'إغلاق تفاصيل الطلب' : 'Close order details'} onClick={() => setSelectedOrderId(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition hover:bg-rose-50 hover:text-rose-600">
                                        <X size={17} />
                                    </button>
                                </div>
                                {/* stepper */}
                                <div className="mt-3 flex items-center gap-1">
                                    {[OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY].map((s, i, arr) => {
                                        const orderIdx = [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.COMPLETED].indexOf(selectedOrder.status);
                                        const done = i < Math.min(orderIdx, 4);
                                        const current = i === Math.min(orderIdx, 4);
                                        return (
                                            <React.Fragment key={s}>
                                                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] ${done ? 'border-emerald-500 bg-emerald-500 text-white' : current ? 'border-primary bg-primary text-white' : 'border-border bg-elevated text-muted'}`}>
                                                    {done ? <CheckCircle size={13} /> : getStatusIcon(s, 12)}
                                                </div>
                                                {i < arr.length - 1 && <div className={`h-0.5 min-w-0 flex-1 rounded ${done ? 'bg-emerald-500' : 'bg-border'}`} />}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                                {/* detail tabs */}
                                <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-elevated p-1">
                                    {([['ops', copy.tabOps], ['items', `${copy.tabItems} (${selectedOrder.items.length})`], ['customer', copy.tabCustomer]] as [DetailTab, string][]).map(([tab, label]) => (
                                        <button key={tab} onClick={() => setDetailTab(tab)} aria-pressed={detailTab === tab} className={`h-9 rounded-lg text-[11px] font-black transition ${detailTab === tab ? 'bg-card text-primary shadow' : 'text-muted hover:text-main'}`}>{label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                                {detailTab === 'ops' && (
                                    <div className="space-y-4">
                                        {selectedOrderReadOnly && (
                                            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-black leading-5 text-amber-900">{reviewOnlyCopy}</div>
                                        )}
                                        {/* next action hero */}
                                        {(() => {
                                            const next = nextActionFor(selectedOrder);
                                            if (!next || [OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(selectedOrder.status)) {
                                                return (
                                                    <div className="rounded-2xl border border-border bg-elevated/50 p-4 text-center text-xs font-black text-muted">
                                                        {isAr ? 'لا يوجد إجراء تالٍ — الطلب مغلق' : 'No next action — order is closed'}
                                                    </div>
                                                );
                                            }
                                            const needsCheck = selectedOrder.status === OrderStatus.READY && selectedOrder.type === OrderType.DELIVERY;
                                            const missingDriver = needsDriverForNext(selectedOrder, next.status);
                                            const blocked = Boolean(pendingOrderAction) || selectedOrderReadOnly || (needsCheck && checkedItems.size !== selectedOrder.items.length);
                                            if (missingDriver) {
                                                return (
                                                    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                                                        <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-amber-700">{copy.nextAction}</div>
                                                        <button
                                                            onClick={() => navigate('/dispatch')}
                                                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-black text-white shadow-lg transition hover:bg-amber-600"
                                                        >
                                                            <Bike size={16} />{isAr ? 'عين طيار من التوصيل أولاً' : 'Assign driver from dispatch first'}
                                                        </button>
                                                        <p className="mt-2 text-center text-[11px] font-black text-amber-700">
                                                            {isAr ? 'ممنوع خروج طلب توصيل داخلي أو إغلاقه بدون طيار مسؤول (نقدية ومراقبة)' : 'In-house delivery cannot leave or close without an accountable driver (cash + monitoring)'}
                                                        </p>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div className="rounded-2xl border border-primary/30 bg-primary/[0.05] p-4">
                                                    <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">{copy.nextAction}</div>
                                                    <button
                                                        onClick={() => handleUpdateStatus(selectedOrder.id, next.status)}
                                                        disabled={blocked}
                                                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white shadow-lg transition hover:bg-emerald-700 disabled:opacity-40"
                                                    >
                                                        {next.icon}{next.label}
                                                    </button>
                                                    {needsCheck && (
                                                        <p className="mt-2 text-center text-[11px] font-black text-muted">
                                                            {copy.checklist}: {checkedItems.size}/{selectedOrder.items.length} {copy.checklistDone}
                                                            {' — '}{copy.checklistHint}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {/* totals */}
                                        <section className="rounded-2xl border border-border bg-app p-4">
                                            <h3 className="mb-3 text-[11px] font-black uppercase tracking-wider text-muted">{copy.totals}</h3>
                                            <div className="space-y-2 text-sm font-bold">
                                                <div className="flex justify-between text-muted"><span>{copy.subtotal}</span><span>{Number(selectedOrder.subtotal || 0).toFixed(2)}</span></div>
                                                <div className="flex justify-between text-muted"><span>{copy.tax}</span><span>{Number(selectedOrder.tax || 0).toFixed(2)}</span></div>
                                                {Number(selectedOrder.deliveryFee || 0) > 0 && <div className="flex justify-between text-muted"><span>{copy.deliveryFee}</span><span>{Number(selectedOrder.deliveryFee || 0).toFixed(2)}</span></div>}
                                                {Number(selectedOrder.discount || 0) > 0 && <div className="flex justify-between text-emerald-600"><span>{copy.discount}</span><span>-{Number(selectedOrder.discount || 0).toFixed(2)}</span></div>}
                                                <div className="flex justify-between border-t border-border pt-3 text-lg font-black text-main"><span>{copy.total}</span><span className="text-primary">{Number(selectedOrder.total || 0).toFixed(2)}</span></div>
                                            </div>
                                        </section>
                                        {/* dates */}
                                        <section className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="rounded-xl border border-border bg-app px-3 py-2.5">
                                                <span className="block text-[10px] font-bold text-muted">{copy.systemBusinessDate}</span>
                                                <span className="mt-1 block font-black">{formatBusinessDate(selectedBranch?.businessDate)}</span>
                                            </div>
                                            <div className="rounded-xl border border-border bg-app px-3 py-2.5">
                                                <span className="block text-[10px] font-bold text-muted">{copy.orderBusinessDate}</span>
                                                <span className="mt-1 block font-black">{formatBusinessDate(selectedOrder.businessDate)}</span>
                                            </div>
                                            <div className="col-span-2 rounded-xl border border-border bg-app px-3 py-2.5">
                                                <span className="block text-[10px] font-bold text-muted">{copy.orderCreatedAt}</span>
                                                <span className="mt-1 block font-black">{formatDateTime(selectedOrder.createdAt)}</span>
                                            </div>
                                        </section>
                                        {/* quick comms */}
                                        <section>
                                            <h3 className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted">{copy.quickComms}</h3>
                                            <div className="grid grid-cols-2 gap-2">
                                                {(selectedOrder.status === OrderStatus.PENDING || selectedOrder.status === OrderStatus.PREPARING) && (
                                                    <button onClick={() => handleSendPaymentLink(selectedOrder)} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-[11px] font-black text-blue-700 disabled:opacity-50">
                                                        <Link size={14} />{copy.payLink}
                                                    </button>
                                                )}
                                                {slaFor(selectedOrder) === 'late' && (
                                                    <button onClick={() => handleApology(selectedOrder)} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 text-[11px] font-black text-orange-700 disabled:opacity-50">
                                                        <MessageCircle size={14} />{copy.apology}
                                                    </button>
                                                )}
                                                <button onClick={() => handlePrintReceipt(selectedOrder)} disabled={Boolean(pendingOrderAction)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-elevated text-[11px] font-black disabled:opacity-50">
                                                    <Printer size={14} />{copy.print}
                                                </button>
                                                <button
                                                    onClick={() => handleVoidOrder(selectedOrder.id)}
                                                    disabled={Boolean(pendingOrderAction) || [OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(selectedOrder.status)}
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 text-[11px] font-black text-white disabled:opacity-50"
                                                >
                                                    <Trash2 size={14} />{copy.void}
                                                </button>
                                            </div>
                                            {[OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(selectedOrder.status) && hasPermission(AppPermission.OP_PROCESS_REFUND) && (
                                                <button onClick={() => { setRefundModalOrderId(selectedOrder.id); setRefundReason(''); setRefundReasonCategory('CUSTOMER_REQUEST'); }} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 text-xs font-black text-white disabled:opacity-50">
                                                    <RotateCcw size={15} />{copy.refund}
                                                </button>
                                            )}
                                        </section>
                                    </div>
                                )}

                                {detailTab === 'items' && (
                                    <div>
                                        <div className="mb-3 rounded-2xl border border-border bg-elevated/40 p-3 text-[11px] font-bold text-muted">
                                            {copy.checklistHint} — {checkedItems.size}/{selectedOrder.items.length} {copy.checklistDone}
                                        </div>
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
                                    </div>
                                )}

                                {detailTab === 'customer' && (
                                    <div className="space-y-4">
                                        <section className="rounded-2xl border border-border bg-app p-4">
                                            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-muted"><User size={13} />{copy.customer}</h3>
                                            <div className="space-y-3 text-sm">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-xs font-bold text-muted">{isAr ? 'الاسم' : 'Name'}</span>
                                                    <span className="font-black">{selectedOrder.customerName || '-'}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-xs font-bold text-muted">{isAr ? 'الهاتف' : 'Phone'}</span>
                                                    <span className="inline-flex items-center gap-1 font-black text-primary" dir="ltr"><Phone size={13} />{selectedOrder.customerPhone || copy.noPhone}</span>
                                                </div>
                                                <div>
                                                    <div className="mb-1 flex items-center gap-1 text-xs font-bold text-muted"><MapPin size={13} />{copy.address}</div>
                                                    <p className="text-sm font-semibold leading-6">{selectedOrder.deliveryAddress || copy.noAddress}</p>
                                                </div>
                                            </div>
                                        </section>
                                        {(selectedOrder.notes || selectedOrder.kitchenNotes || selectedOrder.deliveryNotes) ? (
                                            <section>
                                                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted">{copy.notes}</h3>
                                                <div className="space-y-2">
                                                    {selectedOrder.notes && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">{selectedOrder.notes}</p>}
                                                    {selectedOrder.kitchenNotes && <p className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold leading-6 text-cyan-900">{selectedOrder.kitchenNotes}</p>}
                                                    {selectedOrder.deliveryNotes && <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-semibold leading-6 text-violet-900">{selectedOrder.deliveryNotes}</p>}
                                                </div>
                                            </section>
                                        ) : (
                                            <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs font-bold text-muted">—</p>
                                        )}
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={() => handleSendPaymentLink(selectedOrder)} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-[11px] font-black text-blue-700 disabled:opacity-50">
                                                <Link size={14} />{copy.payLink}
                                            </button>
                                            <button onClick={() => handleApology(selectedOrder)} disabled={Boolean(pendingOrderAction) || selectedOrderReadOnly} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 text-[11px] font-black text-orange-700 disabled:opacity-50">
                                                <MessageCircle size={14} />{copy.apology}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="hidden flex-1 flex-col items-center justify-center p-8 text-center text-muted min-[1100px]:flex">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated">
                                <Eye size={28} />
                            </div>
                            <h2 className="text-sm font-black text-main">{isAr ? 'اختار أوردر لعرض التفاصيل' : 'Select an order to view details'}</h2>
                            <p className="mt-1 text-[11px] font-bold">↑ ↓ {isAr ? 'للتنقل بين الطلبات' : 'to navigate'}</p>
                        </div>
                    )}
                </aside>
            </div>

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
                        <div className="space-y-3 p-5">
                            <div>
                                <label className="mb-2 block text-xs font-black text-muted">{copy.refundCategory}</label>
                                <select value={refundReasonCategory} onChange={e => setRefundReasonCategory(e.target.value as any)} className="h-11 w-full rounded-xl border border-border bg-app px-3 text-sm font-bold outline-none focus:border-primary">
                                    <option value="CUSTOMER_REQUEST">{isAr ? 'طلب عميل' : 'Customer request'}</option>
                                    <option value="QUALITY">{isAr ? 'جودة' : 'Quality'}</option>
                                    <option value="WRONG_ORDER">{isAr ? 'طلب خاطئ' : 'Wrong order'}</option>
                                    <option value="OVERCHARGE">{isAr ? 'زيادة في السعر' : 'Overcharge'}</option>
                                    <option value="OTHER">{isAr ? 'أخرى' : 'Other'}</option>
                                </select>
                            </div>
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
