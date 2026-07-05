import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Headset, RefreshCw, Users, Bike, Ban, Clock3, Percent, DollarSign,
    PhoneCall, Route, AlertTriangle, CheckCircle2, Eye, X, MessageSquare,
    TrendingUp, Timer, MapPin, Volume2, VolumeX, Download, BarChart3,
    Building2, Activity, Star, Shield, Zap, Hash, ChevronDown, ChevronUp,
    Send, Gauge, Phone, Wifi, WifiOff, RotateCcw, Calendar, Server,
    RefreshCcw, ClipboardList
} from 'lucide-react';
import { getActionableErrorMessage } from '../../services/api/core';
import { callCenterSupervisorApi, deliveryApi } from '../../services/api/delivery';
import { ordersApi } from '../../services/api/orders';
import { customersApi } from '../../services/api/customers';
import { useAuthStore } from '../../stores/useAuthStore';

type AnyOrder = Record<string, any>;
type AnyDriver = Record<string, any>;
type Escalation = {
    id: string;
    orderId: string;
    branchId?: string | null;
    status: 'OPEN' | 'RESOLVED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    reason: string;
    notes?: string | null;
    createdBy?: string | null;
    createdAt: string;
    assignedTo?: string | null;
    resolvedBy?: string | null;
    resolvedAt?: string | null;
    resolutionNotes?: string | null;
};
type CoachingNote = {
    id: string;
    agentId: string;
    branchId?: string | null;
    note: string;
    tags?: string[];
    createdBy?: string | null;
    createdAt: string;
};
type DiscountViolation = {
    orderId: string;
    branchId?: string | null;
    agentId?: string | null;
    status: string;
    subtotal: number;
    discount: number;
    total: number;
    discountPercent: number;
    createdAt: string;
    approved?: boolean;
};

type Tab = 'overview' | 'agents' | 'drivers' | 'escalations' | 'quality' | 'branches' | 'failed' | 'daily';

const getOrderDate = (o: AnyOrder) => new Date(o.created_at || o.createdAt || Date.now());
const getOrderStatus = (o: AnyOrder) => String(o.status || '').toUpperCase();
const getOrderTotal = (o: AnyOrder) => Number(o.total || 0);
const getOrderDiscount = (o: AnyOrder) => Number(o.discount || 0);
const getOrderBranch = (o: AnyOrder) => String(o.branch_id || o.branchId || '');
const getOrderAgent = (o: AnyOrder) => String(o.call_center_agent_id || o.callCenterAgentId || '');
const getOrderDriver = (o: AnyOrder) => String(o.driver_id || o.driverId || '');
const getCustomerName = (o: AnyOrder) => o.customer_name || o.customerName || '-';
const getCustomerPhone = (o: AnyOrder) => o.customer_phone || o.customerPhone || '';
const getDeliveryAddress = (o: AnyOrder) => o.delivery_address || o.deliveryAddress || '-';
const getOrderNumber = (o: AnyOrder) => o.order_number || o.orderNumber || o.id;
const getCancelReason = (o: AnyOrder) => o.cancel_reason || o.cancelReason || '';

/* ── Tiny sparkline using SVG ────────────────────────────────────── */
const MiniSparkline: React.FC<{ data: number[]; color?: string; height?: number; width?: number }> = ({
    data, color = '#6366f1', height = 28, width = 80,
}) => {
    if (data.length < 2) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const points = data
        .map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`)
        .join(' ');
    return (
        <svg width={width} height={height} className="inline-block">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

/* ── Priority badge ──────────────────────────────────────────────── */
const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
    const colors: Record<string, string> = {
        CRITICAL: 'bg-red-600 text-white',
        HIGH: 'bg-orange-500 text-white',
        MEDIUM: 'bg-amber-400 text-slate-900',
        LOW: 'bg-slate-200 text-slate-700',
    };
    return (
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${colors[priority] || colors.LOW}`}>
            {priority}
        </span>
    );
};

/* ── Status dot ──────────────────────────────────────────────────── */
const StatusDot: React.FC<{ status: string }> = ({ status }) => {
    const s = status.toUpperCase();
    const colors: Record<string, string> = {
        AVAILABLE: 'bg-emerald-500',
        ON_DELIVERY: 'bg-amber-500 animate-pulse',
        BREAK: 'bg-slate-400',
        OFFLINE: 'bg-red-500',
        ONLINE: 'bg-emerald-500 animate-pulse',
        BUSY: 'bg-amber-500',
        AWAY: 'bg-slate-400',
    };
    return <span className={`inline-block w-2 h-2 rounded-full ${colors[s] || 'bg-slate-300'}`} />;
};


export const useCallCenterState = () => {

    const { settings, branches, users } = useAuthStore();
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const currency = settings.currencySymbol || (lang === 'ar' ? 'ج.م' : 'EGP');
    const branchId = settings.activeBranchId || '';

    /* ── State ──────────────────────────────────────────────────── */
    const [fromDate, setFromDate] = React.useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    });
    const [toDate, setToDate] = React.useState(() => new Date().toISOString().slice(0, 10));
    const [selectedBranch, setSelectedBranch] = React.useState(branchId);
    const [orders, setOrders] = React.useState<AnyOrder[]>([]);
    const [drivers, setDrivers] = React.useState<AnyDriver[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [escalations, setEscalations] = React.useState<Escalation[]>([]);
    const [coachingNotes, setCoachingNotes] = React.useState<CoachingNote[]>([]);
    const [discountViolations, setDiscountViolations] = React.useState<DiscountViolation[]>([]);

    const [escalatingOrderId, setEscalatingOrderId] = React.useState<string | null>(null);
    const [resolvingEscalationId, setResolvingEscalationId] = React.useState<string | null>(null);
    const [isScanningEscalations, setIsScanningEscalations] = React.useState(false);
    const [coachingAgentId, setCoachingAgentId] = React.useState<string>('');
    const [coachingNoteInput, setCoachingNoteInput] = React.useState('');
    const [isSavingCoaching, setIsSavingCoaching] = React.useState(false);
    const [isApprovingDiscountOrderId, setIsApprovingDiscountOrderId] = React.useState<string | null>(null);

    const [showFilters, setShowFilters] = React.useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
    const [activeTab, setActiveTab] = React.useState<Tab>('overview');
    const [orderDetailId, setOrderDetailId] = React.useState<string | null>(null);
    const [customerProfile, setCustomerProfile] = React.useState<any | null>(null);
    const [isLoadingCustomer, setIsLoadingCustomer] = React.useState(false);
    const [lastRefresh, setLastRefresh] = React.useState<Date>(new Date());
    const [autoRefresh, setAutoRefresh] = React.useState(true);
    const [soundEnabled, setSoundEnabled] = React.useState(true);
    const [branchHealthData, setBranchHealthData] = React.useState<any>(null);
    const [isLoadingBranchHealth, setIsLoadingBranchHealth] = React.useState(false);
    const [failedOrdersData, setFailedOrdersData] = React.useState<any>(null);
    const [isLoadingFailedOrders, setIsLoadingFailedOrders] = React.useState(false);
    const [retryingOrderId, setRetryingOrderId] = React.useState<string | null>(null);
    const [dailySummary, setDailySummary] = React.useState<any>(null);
    const [isLoadingDailySummary, setIsLoadingDailySummary] = React.useState(false);
    const [dailyReviewDate, setDailyReviewDate] = React.useState(() => new Date().toISOString().slice(0, 10));
    const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
        pending: true, cancelled: true, escalations: true, coaching: true, discount: true,
    });
    const prevEscalationCountRef = React.useRef(0);

    /* ── Toggle section ─────────────────────────────────────────── */
    const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

    /* ── Data loading ───────────────────────────────────────────── */
    const load = React.useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        setError(null);
        try {
            const orderParams: any = {
                limit: 500,
                from_date: fromDate,
                to_date: toDate,
                source: 'call_center',
                is_call_center_order: true,
            };
            if (selectedBranch) orderParams.branch_id = selectedBranch;
            const [allOrders, allDrivers] = await Promise.all([
                ordersApi.getAll(orderParams),
                deliveryApi.getDrivers(selectedBranch ? { branchId: selectedBranch } : undefined),
            ]);
            const [escalationData, coachingData, discountAbuseData] = await Promise.all([
                callCenterSupervisorApi.getEscalations({ status: 'OPEN', ...(selectedBranch ? { branchId: selectedBranch } : {}) }),
                callCenterSupervisorApi.getCoachingNotes(selectedBranch ? { branchId: selectedBranch } : undefined),
                callCenterSupervisorApi.getDiscountAbuse({
                    ...(selectedBranch ? { branchId: selectedBranch } : {}),
                    startDate: fromDate, endDate: toDate,
                    thresholdPercent: 20, thresholdAmount: 120,
                }),
            ]);

            const ccOrders = (Array.isArray(allOrders) ? allOrders : []).filter((o) => {
                const source = String(o.source || '').toLowerCase();
                return o.is_call_center_order === true || o.isCallCenterOrder === true || source === 'call_center';
            });

            /* Sound notification for new escalations */
            const newEscalations = Array.isArray(escalationData) ? escalationData : [];
            if (soundEnabled && newEscalations.length > prevEscalationCountRef.current && prevEscalationCountRef.current > 0) {
                try {
                    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain); gain.connect(audioCtx.destination);
                    osc.type = 'sine'; osc.frequency.value = 880;
                    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                    osc.start(); osc.stop(audioCtx.currentTime + 0.5);
                } catch { /* audio not available */ }
            }
            prevEscalationCountRef.current = newEscalations.length;

            setOrders(ccOrders);
            setDrivers(Array.isArray(allDrivers) ? allDrivers : []);
            setEscalations(newEscalations);
            setCoachingNotes(Array.isArray(coachingData) ? coachingData : []);
            setDiscountViolations(Array.isArray(discountAbuseData?.violations) ? discountAbuseData.violations : []);
            setLastRefresh(new Date());
        } catch (e: any) {
            setError(e?.message || 'Failed to load call center overview');
            setOrders([]); setDrivers([]); setEscalations([]); setCoachingNotes([]); setDiscountViolations([]);
        } finally {
            setIsLoading(false);
        }
    }, [fromDate, toDate, selectedBranch, soundEnabled]);

    React.useEffect(() => { load(); }, [load]);

    /* ── Auto-refresh every 30s ─────────────────────────────────── */
    React.useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => load(true), 30000);
        return () => clearInterval(interval);
    }, [autoRefresh, load]);

    /* ── Responsive layout ──────────────────────────────────────── */
    React.useEffect(() => {
        const updateLayout = () => { if (window.innerWidth >= 1024) setShowFilters(true); };
        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    /* ── Metrics ────────────────────────────────────────────────── */
    const metrics = React.useMemo(() => {
        const totalOrders = orders.length;
        const delivered = orders.filter(o => getOrderStatus(o) === 'DELIVERED').length;
        const cancelled = orders.filter(o => getOrderStatus(o) === 'CANCELLED').length;
        const active = orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(getOrderStatus(o))).length;
        const revenue = orders.reduce((sum, o) => sum + getOrderTotal(o), 0);
        const discounts = orders.reduce((sum, o) => sum + getOrderDiscount(o), 0);
        const oldPending = orders.filter(o => {
            const status = getOrderStatus(o);
            if (!['PENDING', 'PREPARING', 'READY'].includes(status)) return false;
            return (Date.now() - getOrderDate(o).getTime()) / 60000 >= 20;
        }).length;

        /* SLA metrics */
        const deliveredOrders = orders.filter(o => getOrderStatus(o) === 'DELIVERED');
        const waitTimes = orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(getOrderStatus(o)))
            .map(o => (Date.now() - getOrderDate(o).getTime()) / 60000);
        const avgWaitTime = waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;

        const deliveryTimes = deliveredOrders.map(o => {
            const created = getOrderDate(o).getTime();
            const updated = new Date(o.updated_at || o.updatedAt || created).getTime();
            return (updated - created) / 60000;
        }).filter(t => t > 0 && t < 300);
        const avgDeliveryTime = deliveryTimes.length > 0 ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length : 0;

        const slaTarget = 45; // 45 minutes SLA
        const withinSla = deliveredOrders.filter(o => {
            const created = getOrderDate(o).getTime();
            const updated = new Date(o.updated_at || o.updatedAt || created).getTime();
            return (updated - created) / 60000 <= slaTarget;
        }).length;
        const slaCompliance = deliveredOrders.length > 0 ? (withinSla / deliveredOrders.length) * 100 : 100;

        return {
            totalOrders, delivered, cancelled, active, revenue, discounts, oldPending,
            cancelRate: totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0,
            avgWaitTime, avgDeliveryTime, slaCompliance,
            deliveryRate: totalOrders > 0 ? (delivered / totalOrders) * 100 : 0,
        };
    }, [orders]);

    /* ── Hourly order distribution for sparkline ────────────────── */
    const hourlyData = React.useMemo(() => {
        const hours = Array(24).fill(0);
        orders.forEach(o => {
            const h = getOrderDate(o).getHours();
            hours[h]++;
        });
        return hours;
    }, [orders]);

    /* ── Agent Statistics ───────────────────────────────────────── */
    const agentStats = React.useMemo(() => {
        const map = new Map<string, {
            id: string; name: string; orders: number; revenue: number;
            cancelled: number; discounts: number; pending: number;
            delivered: number; avgTime: number; hourly: number[];
        }>();
        for (const o of orders) {
            const id = getOrderAgent(o) || 'UNASSIGNED';
            const foundUser = users.find(u => u.id === id);
            const name = foundUser?.name || id;
            const entry = map.get(id) || {
                id, name, orders: 0, revenue: 0, cancelled: 0, discounts: 0,
                pending: 0, delivered: 0, avgTime: 0, hourly: Array(24).fill(0),
            };
            entry.orders += 1;
            entry.revenue += getOrderTotal(o);
            entry.discounts += getOrderDiscount(o);
            entry.hourly[getOrderDate(o).getHours()]++;
            if (getOrderStatus(o) === 'CANCELLED') entry.cancelled += 1;
            if (getOrderStatus(o) === 'DELIVERED') entry.delivered += 1;
            if (!['DELIVERED', 'CANCELLED'].includes(getOrderStatus(o))) entry.pending += 1;
            map.set(id, entry);
        }
        return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    }, [orders, users]);

    const coachingNotesByAgent = React.useMemo(() => {
        const map = new Map<string, CoachingNote[]>();
        for (const note of coachingNotes) {
            const arr = map.get(note.agentId) || [];
            arr.push(note);
            map.set(note.agentId, arr);
        }
        return map;
    }, [coachingNotes]);

    /* ── Driver Statistics ──────────────────────────────────────── */
    const activeOrdersByDriver = React.useMemo(() => {
        const m = new Map<string, AnyOrder[]>();
        for (const o of orders) {
            const driverId = getOrderDriver(o);
            if (!driverId) continue;
            if (['DELIVERED', 'CANCELLED'].includes(getOrderStatus(o))) continue;
            const arr = m.get(driverId) || [];
            arr.push(o);
            m.set(driverId, arr);
        }
        return m;
    }, [orders]);

    const driverStats = React.useMemo(() => {
        return drivers.map(d => {
            const id = String(d.id || '');
            const assigned = orders.filter(o => getOrderDriver(o) === id);
            const deliveredOrders = assigned.filter(o => getOrderStatus(o) === 'DELIVERED');
            const activeOrders = activeOrdersByDriver.get(id) || [];
            const deliveryTimes = deliveredOrders.map(o => {
                const created = getOrderDate(o).getTime();
                const updated = new Date(o.updated_at || o.updatedAt || created).getTime();
                return (updated - created) / 60000;
            }).filter(t => t > 0 && t < 300);
            const avgDeliveryTime = deliveryTimes.length > 0 ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length : 0;
            /* Estimated time for current active order */
            const currentOrder = activeOrders[0];
            const currentWait = currentOrder ? Math.floor((Date.now() - getOrderDate(currentOrder).getTime()) / 60000) : 0;

            return {
                id,
                name: d.name || d.fullName || id,
                status: String(d.status || 'UNKNOWN'),
                branchId: String(d.branchId || d.branch_id || ''),
                branchName: branches.find(b => b.id === (d.branchId || d.branch_id))?.name || '',
                totalAssigned: assigned.length,
                delivered: deliveredOrders.length,
                activeCount: activeOrders.length,
                currentRoute: currentOrder ? getDeliveryAddress(currentOrder) : '-',
                avgDeliveryTime,
                currentWait,
                isDelayed: currentWait > 45,
            };
        }).sort((a, b) => b.activeCount - a.activeCount);
    }, [drivers, orders, activeOrdersByDriver, branches]);

    /* ── Branch Comparison ──────────────────────────────────────── */
    const branchComparison = React.useMemo(() => {
        if (selectedBranch) return [];
        const map = new Map<string, {
            id: string; name: string; orders: number; revenue: number;
            cancelled: number; avgWait: number; delivered: number;
        }>();
        for (const o of orders) {
            const bId = getOrderBranch(o);
            const br = branches.find(b => b.id === bId);
            const entry = map.get(bId) || {
                id: bId, name: br?.name || bId || 'Unknown', orders: 0,
                revenue: 0, cancelled: 0, avgWait: 0, delivered: 0,
            };
            entry.orders += 1;
            entry.revenue += getOrderTotal(o);
            if (getOrderStatus(o) === 'CANCELLED') entry.cancelled += 1;
            if (getOrderStatus(o) === 'DELIVERED') entry.delivered += 1;
            map.set(bId, entry);
        }
        return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    }, [orders, branches, selectedBranch]);

    /* ── Filtered order lists ───────────────────────────────────── */
    const cancelledOrders = React.useMemo(
        () => orders.filter(o => getOrderStatus(o) === 'CANCELLED').slice(0, 15), [orders],
    );
    const pendingOrders = React.useMemo(
        () => orders.filter(o => ['PENDING', 'PREPARING', 'READY'].includes(getOrderStatus(o)))
            .sort((a, b) => getOrderDate(a).getTime() - getOrderDate(b).getTime()).slice(0, 20),
        [orders],
    );
    const escalatedOrderIds = React.useMemo(() => new Set(escalations.map(e => e.orderId)), [escalations]);

    /* ── The order being viewed in detail ───────────────────────── */
    const detailOrder = React.useMemo(() => {
        if (!orderDetailId) return null;
        return orders.find(o => String(o.id) === orderDetailId) || null;
    }, [orderDetailId, orders]);

    /* ── Customer lookup ────────────────────────────────────────── */
    const loadCustomer = async (phone: string) => {
        if (!phone || phone === '-') return;
        setIsLoadingCustomer(true);
        try {
            const result = await customersApi.getByPhone(phone);
            setCustomerProfile(result);
        } catch {
            setCustomerProfile(null);
        } finally {
            setIsLoadingCustomer(false);
        }
    };

    /* ── Actions ────────────────────────────────────────────────── */
    const createEscalation = async (order: AnyOrder) => {
        const orderId = String(order.id || '').trim();
        if (!orderId || escalatedOrderIds.has(orderId)) return;
        setEscalatingOrderId(orderId);
        try {
            const mins = Math.floor((Date.now() - getOrderDate(order).getTime()) / 60000);
            const priority: Escalation['priority'] = mins >= 45 ? 'CRITICAL' : mins >= 30 ? 'HIGH' : 'MEDIUM';
            const created = await callCenterSupervisorApi.createEscalation({
                orderId,
                branchId: selectedBranch || branchId || undefined,
                priority,
                reason: mins >= 45 ? 'SLA_BREACH' : 'SLA_RISK',
                notes: `Auto escalation from supervisor board at ${mins}m pending`,
            });
            setEscalations(prev => [created, ...prev]);
        } catch (e: any) {
            setError(getActionableErrorMessage(e, lang));
        } finally {
            setEscalatingOrderId(null);
        }
    };

    const resolveEscalation = async (id: string) => {
        setResolvingEscalationId(id);
        try {
            await callCenterSupervisorApi.resolveEscalation(id, 'Resolved by supervisor');
            setEscalations(prev => prev.filter(e => e.id !== id));
        } catch (e: any) {
            setError(getActionableErrorMessage(e, lang));
        } finally {
            setResolvingEscalationId(null);
        }
    };

    const scanEscalations = async () => {
        setIsScanningEscalations(true);
        try {
            const result = await callCenterSupervisorApi.scanEscalations({
                thresholdMinutes: 20,
                branchId: selectedBranch || branchId || undefined,
            });
            if (Array.isArray(result.escalations) && result.escalations.length > 0) {
                setEscalations(prev => [...result.escalations, ...prev]);
            }
        } catch (e: any) {
            setError(getActionableErrorMessage(e, lang));
        } finally {
            setIsScanningEscalations(false);
        }
    };

    const saveCoachingNote = async () => {
        const agentId = coachingAgentId.trim();
        const note = coachingNoteInput.trim();
        if (!agentId || !note) return;
        setIsSavingCoaching(true);
        try {
            const created = await callCenterSupervisorApi.addCoachingNote({
                agentId, note,
                branchId: selectedBranch || branchId || undefined,
            });
            setCoachingNotes(prev => [created, ...prev]);
            setCoachingNoteInput('');
        } catch (e: any) {
            setError(getActionableErrorMessage(e, lang));
        } finally {
            setIsSavingCoaching(false);
        }
    };

    const approveDiscountViolation = async (violation: DiscountViolation, status: 'APPROVED' | 'REJECTED') => {
        setIsApprovingDiscountOrderId(violation.orderId);
        try {
            await callCenterSupervisorApi.approveDiscountViolation({
                orderId: violation.orderId,
                agentId: violation.agentId || undefined,
                branchId: selectedBranch || branchId || undefined,
                status,
                reason: status === 'APPROVED' ? 'Manager approved high discount' : 'Manager rejected high discount',
            });
            setDiscountViolations(prev => prev.filter(v => v.orderId !== violation.orderId));
        } catch (e: any) {
            setError(getActionableErrorMessage(e, lang));
        } finally {
            setIsApprovingDiscountOrderId(null);
        }
    };

    /* ── Export to CSV ──────────────────────────────────────────── */
    const exportCSV = () => {
        const headers = ['Order #', 'Status', 'Customer', 'Phone', 'Address', 'Agent', 'Total', 'Discount', 'Date'];
        const rows = orders.map(o => [
            getOrderNumber(o), getOrderStatus(o), getCustomerName(o), getCustomerPhone(o),
            getDeliveryAddress(o), getOrderAgent(o), getOrderTotal(o).toFixed(2),
            getOrderDiscount(o).toFixed(2), getOrderDate(o).toLocaleString(),
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `call-center-report-${fromDate}-to-${toDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    /* ── Formatters ─────────────────────────────────────────────── */
    const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n || 0);
    const fmtMoney = (n: number) => `${fmt(n)} ${currency}`;
    const fmtMins = (n: number) => n >= 60 ? `${Math.floor(n / 60)}h ${Math.round(n % 60)}m` : `${Math.round(n)}m`;
    const timeAgo = (d: Date) => {
        const secs = Math.floor((Date.now() - d.getTime()) / 1000);
        if (secs < 60) return lang === 'ar' ? `منذ ${secs} ثانية` : `${secs}s ago`;
        const mins = Math.floor(secs / 60);
        return lang === 'ar' ? `منذ ${mins} دقيقة` : `${mins}m ago`;
    };

    /* ── Tab definitions ────────────────────────────────────────── */
    /* ── Load branch health ──────────────────────────────────────── */
    const loadBranchHealth = React.useCallback(async () => {
        setIsLoadingBranchHealth(true);
        try {
            const data = await callCenterSupervisorApi.getBranchHealth();
            setBranchHealthData(data);
        } catch (e: any) {
            setError(getActionableErrorMessage(e, lang));
        } finally {
            setIsLoadingBranchHealth(false);
        }
    }, [lang]);

    /* ── Load failed orders ─────────────────────────────────────── */
    const loadFailedOrders = React.useCallback(async () => {
        setIsLoadingFailedOrders(true);
        try {
            const data = await callCenterSupervisorApi.getFailedOrders(selectedBranch ? { branchId: selectedBranch } : undefined);
            setFailedOrdersData(data);
        } catch (e: any) {
            setError(getActionableErrorMessage(e, lang));
        } finally {
            setIsLoadingFailedOrders(false);
        }
    }, [selectedBranch, lang]);

    const retryOrder = async (orderId: string) => {
        setRetryingOrderId(orderId);
        try {
            await callCenterSupervisorApi.retryFailedOrder(orderId);
            await loadFailedOrders();
        } catch (e: any) {
            setError(getActionableErrorMessage(e, lang));
        } finally {
            setRetryingOrderId(null);
        }
    };

    /* ── Load daily summary ─────────────────────────────────────── */
    const loadDailySummary = React.useCallback(async () => {
        setIsLoadingDailySummary(true);
        try {
            const data = await callCenterSupervisorApi.getDailyOrderSummary({
                ...(selectedBranch ? { branchId: selectedBranch } : {}),
                date: dailyReviewDate,
            });
            setDailySummary(data);
        } catch (e: any) {
            setError(getActionableErrorMessage(e, lang));
        } finally {
            setIsLoadingDailySummary(false);
        }
    }, [selectedBranch, dailyReviewDate, lang]);

    /* Auto-load tab data on tab change */
    React.useEffect(() => {
        if (activeTab === 'branches') loadBranchHealth();
        if (activeTab === 'failed') loadFailedOrders();
        if (activeTab === 'daily') loadDailySummary();
    }, [activeTab, loadBranchHealth, loadFailedOrders, loadDailySummary]);

    const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
        { id: 'overview', label: lang === 'ar' ? 'نظرة عامة' : 'Overview', icon: BarChart3 },
        { id: 'agents', label: lang === 'ar' ? 'الموظفين' : 'Agents', icon: Users, badge: agentStats.length },
        { id: 'drivers', label: lang === 'ar' ? 'الطيارين' : 'Drivers', icon: Bike, badge: driverStats.filter(d => d.status === 'AVAILABLE' || d.status === 'ON_DELIVERY').length },
        { id: 'escalations', label: lang === 'ar' ? 'التصعيدات' : 'Escalations', icon: AlertTriangle, badge: escalations.length },
        { id: 'quality', label: lang === 'ar' ? 'الجودة' : 'Quality', icon: Shield, badge: discountViolations.length },
        { id: 'branches', label: lang === 'ar' ? 'الفروع' : 'Branches', icon: Server, badge: branchHealthData?.summary?.offline },
        { id: 'failed', label: lang === 'ar' ? 'طلبات فاشلة' : 'Failed Sync', icon: WifiOff, badge: failedOrdersData?.total },
        { id: 'daily', label: lang === 'ar' ? 'مراجعة يومية' : 'Daily Review', icon: Calendar },
    ];

    /* ── KPI cards ──────────────────────────────────────────────── */
    const kpis = [
        {
            icon: PhoneCall, label: lang === 'ar' ? 'إجمالي الطلبات' : 'Total Orders',
            value: fmt(metrics.totalOrders), sub: lang === 'ar' ? 'طلب كول سنتر' : 'call center orders',
            color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30',
        },
        {
            icon: Gauge, label: lang === 'ar' ? 'التزام SLA' : 'SLA Compliance',
            value: `${metrics.slaCompliance.toFixed(1)}%`,
            sub: lang === 'ar' ? `هدف 45 دقيقة` : `Target: 45 min`,
            color: metrics.slaCompliance >= 90 ? 'text-emerald-600' : metrics.slaCompliance >= 70 ? 'text-amber-600' : 'text-red-600',
            bg: metrics.slaCompliance >= 90 ? 'bg-emerald-50 dark:bg-emerald-950/30' : metrics.slaCompliance >= 70 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-red-50 dark:bg-red-950/30',
        },
        {
            icon: Timer, label: lang === 'ar' ? 'متوسط الانتظار' : 'Avg Wait Time',
            value: fmtMins(metrics.avgWaitTime),
            sub: lang === 'ar' ? 'للطلبات النشطة' : 'active orders',
            color: metrics.avgWaitTime > 30 ? 'text-red-600' : metrics.avgWaitTime > 15 ? 'text-amber-600' : 'text-emerald-600',
            bg: metrics.avgWaitTime > 30 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30',
        },
        {
            icon: Clock3, label: lang === 'ar' ? 'متوسط التوصيل' : 'Avg Delivery',
            value: fmtMins(metrics.avgDeliveryTime),
            sub: `${fmt(metrics.delivered)} ${lang === 'ar' ? 'تم التوصيل' : 'delivered'}`,
            color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30',
        },
        {
            icon: DollarSign, label: lang === 'ar' ? 'مبيعات الكول سنتر' : 'CC Revenue',
            value: fmtMoney(metrics.revenue), sub: `${metrics.deliveryRate.toFixed(0)}% ${lang === 'ar' ? 'معدل التوصيل' : 'delivery rate'}`,
            color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30',
        },
        {
            icon: Ban, label: lang === 'ar' ? 'الإلغاءات' : 'Cancellations',
            value: `${fmt(metrics.cancelled)}`, sub: `${metrics.cancelRate.toFixed(1)}% ${lang === 'ar' ? 'معدل الإلغاء' : 'cancel rate'}`,
            color: metrics.cancelRate > 10 ? 'text-red-600' : 'text-slate-600',
            bg: metrics.cancelRate > 10 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-slate-50 dark:bg-slate-800/50',
        },
        {
            icon: AlertTriangle, label: lang === 'ar' ? 'معلقة +20 دقيقة' : 'Stale (>20min)',
            value: fmt(metrics.oldPending),
            sub: `${fmt(escalations.length)} ${lang === 'ar' ? 'تصعيد مفتوح' : 'escalations'}`,
            color: metrics.oldPending > 0 ? 'text-red-600' : 'text-emerald-600',
            bg: metrics.oldPending > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30',
        },
        {
            icon: Percent, label: lang === 'ar' ? 'الخصومات' : 'Discounts',
            value: fmtMoney(metrics.discounts),
            sub: `${fmt(discountViolations.length)} ${lang === 'ar' ? 'مخالفة' : 'violations'}`,
            color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30',
        },
    ];


    return { activeTab, setActiveTab, lang, currency, branches, users, orders, drivers, escalations, coachingNotes, discountViolations, metrics, hourlyData, agentStats, coachingNotesByAgent, activeOrdersByDriver, driverStats, branchComparison, cancelledOrders, pendingOrders, escalatedOrderIds, detailOrder, customerProfile, isLoadingCustomer, branchHealthData, isLoadingBranchHealth, failedOrdersData, isLoadingFailedOrders, retryingOrderId, dailySummary, isLoadingDailySummary, dailyReviewDate, expandedSections, setExpandedSections, createEscalation, resolveEscalation, scanEscalations, saveCoachingNote, approveDiscountViolation, loadCustomer, retryOrder, loadBranchHealth, loadFailedOrders, loadDailySummary, fmt, fmtMoney, fmtMins, timeAgo, coachingAgentId, setCoachingAgentId, coachingNoteInput, setCoachingNoteInput, isSavingCoaching, isScanningEscalations, resolvingEscalationId, escalatingOrderId, isApprovingDiscountOrderId, setDailyReviewDate, toggleSection, getOrderStatus, getOrderDate, getOrderTotal, getOrderDiscount, getOrderBranch, getOrderAgent, getOrderDriver, getCustomerName, getCustomerPhone, getDeliveryAddress, getOrderNumber, getCancelReason, StatusDot, PriorityBadge, MiniSparkline, setOrderDetailId, orderDetailId, isLoading, selectedBranch, setSelectedBranch, autoRefresh, setAutoRefresh, soundEnabled, setSoundEnabled, showFilters, setShowFilters, fromDate, setFromDate, toDate, setToDate, lastRefresh, load, exportCSV, tabs, kpis };
};
