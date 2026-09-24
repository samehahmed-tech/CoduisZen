
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import {
    Phone,
    Search,
    MapPin,
    Truck,
    Plus,
    Minus,
    Trash2,
    CheckCircle2,
    Clock,
    ArrowRight,
    User,
    Navigation,
    ShoppingBag,
    Headset,
    Gift,
    Star,
    History,
    Timer,
    AlertCircle,
    Percent,
    RefreshCcw,
    Pause,
    Play,
    Edit3,
    MessageSquare,
    PhoneCall,
    PhoneOff,
    TrendingUp,
    Users,
    Package,
    Home,
    Zap,
    MapPinned,
    Bike,
    Ban,
    X,
    ChevronDown,
    Copy,
    ExternalLink,
    Sparkles,
    UserPlus,
    Save,
    Eye,
    Filter,
    ChefHat,
    CheckCircle,
    XCircle,
    ArrowUpRight,
    Building2,
    LayoutGrid,
    Rows3,
    Sparkles,
    List,
    Activity,
    Printer,
    FileText,
    CreditCard,
    Ticket,
    MonitorPlay,
    Briefcase,
    DollarSign
} from 'lucide-react';
import {
    OrderItem,
    OrderStatus,
    OrderType,
    Order,
    AppPermission
} from '../types';

// Stores
import { useCRMStore } from '../stores/useCRMStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useMenuStore } from '../stores/useMenuStore';
import { useOrderStore } from '../stores/useOrderStore';

// Services
import { translations } from '../services/translations';
import { printDriverTicket, printOrderReceipt } from '../services/posPrintOrchestrator';
import { getActionableErrorMessage } from '../services/api/core';
import { deliveryApi } from '../services/api/delivery';
import { customersApi } from '../services/api/customers';
import { useToast } from './Toast';

// POS Components
import ItemGrid from '../src/features/pos/components/ItemGrid';
import CategoryTabs from '../src/features/pos/components/CategoryTabs';
import CartItem from '../src/features/pos/components/CartItem';
import NoteModal from '../src/features/pos/components/NoteModal';
import ItemOptionsModal from '../src/features/pos/components/ItemOptionsModal';
import { ManagerApprovalModal } from '../src/features/pos/components/ManagerApprovalModal';
import AddressMapPicker from './common/AddressMapPicker';
import DeliveryZonePicker from './common/DeliveryZonePicker';
import { useRecipeAvailability } from './callcenter/useRecipeAvailability';
import { MenuShortNotice, CartShortWarning } from './callcenter/RecipeWarningBanner';
import { resolveBranchPrice } from '../utils/branchPricing';
import { applyPlatformMarkup } from '../services/platformPricing';

// ============================================================================
// ?? INTELLIGENT CALL CENTER MODULE v2.0
// Enterprise-grade call center for restaurant operations
// Features: Customer Registration, Real-time Order Tracking, Multi-branch View
// ============================================================================

const DriverAssignmentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAssign: (driverId: string, driverName?: string) => Promise<void> | void;
    branchId: string;
    orderId?: string;
    lang: 'en' | 'ar';
}> = ({ isOpen, onClose, onAssign, branchId, orderId, lang }) => {
    const [drivers, setDrivers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const loadDrivers = async () => {
            if (!isOpen || !branchId) return;
            setIsLoading(true);
            setErrorMessage(null);
            try {
                const data = await deliveryApi.getDrivers({ branchId });
                setDrivers(Array.isArray(data) ? data : []);
            } catch (error: any) {
                setErrorMessage(getActionableErrorMessage(error, lang));
                setDrivers([]);
            } finally {
                setIsLoading(false);
            }
        };
        loadDrivers();
    }, [isOpen, branchId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60  p-4 sm:p-6 p-safe ">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative w-full max-w-md bg-card/90  rounded-[2.5rem] p-8 shadow-2xl border border-border/50 animate-in zoom-in-95 duration-150">
                <div className="text-center mb-8">
                    <h2 className="text-xl font-black text-main uppercase tracking-tight">{lang === 'ar' ? 'تعيين طيار' : 'Assign Dispatcher'}</h2>
                    <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-1">
                        {lang === 'ar' ? `اختر طيار للفرع: ${branchId}` : `Select driver for branch: ${branchId}`} {orderId ? (lang === 'ar' ? `| طلب ${orderId}` : `| Order ${orderId}`) : ''}
                    </p>
                </div>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {isLoading && (
                        <div className="p-6 text-center text-xs font-bold text-muted">{lang === 'ar' ? 'جاري تحميل الطيارين...' : 'Loading drivers...'}</div>
                    )}
                    {!isLoading && errorMessage && (
                        <div className="p-4 rounded-[1.2rem] bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold">{errorMessage}</div>
                    )}
                    {!isLoading && !errorMessage && drivers.length === 0 && (
                        <div className="p-6 text-center text-xs font-bold text-muted">{lang === 'ar' ? 'لا يوجد طيارين متاحين لهذا الفرع.' : 'No drivers available for this branch.'}</div>
                    )}
                    {!isLoading && !errorMessage && drivers.map(driver => {
                        const isAvailable = String(driver.status || '').toUpperCase() === 'AVAILABLE';
                        const isAssigningThisDriver = assigningDriverId === driver.id;
                        return (
                            <button
                                key={driver.id}
                                disabled={!isAvailable || isAssigningThisDriver}
                                onClick={async () => {
                                    setAssigningDriverId(driver.id);
                                    setErrorMessage(null);
                                    try {
                                        await onAssign(driver.id, driver.name || driver.fullName || 'Driver');
                                        onClose();
                                    } catch (error: any) {
                                        setErrorMessage(getActionableErrorMessage(error, lang));
                                    } finally {
                                        setAssigningDriverId(null);
                                    }
                                }}
                                className={`w-full p-5 rounded-[1.5rem] flex items-center justify-between transition-all border shadow-sm ${isAvailable ? 'bg-elevated/80 border-border/50 hover:bg-indigo-500/5 hover:border-indigo-500/30 hover:shadow-indigo-500/10 group' : 'opacity-50 cursor-not-allowed bg-card/30 border-transparent'}`}
                            >
                                <div className="text-left">
                                    <p className="font-black uppercase text-sm tracking-tight text-main">{driver.name || driver.fullName || 'Driver'}</p>
                                    <p className="text-[10px] font-bold text-muted tracking-widest mt-0.5">{driver.phone || '-'}</p>
                                </div>
                                <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${isAvailable ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 group-hover:bg-indigo-500/10 group-hover:text-indigo-500 group-hover:border-indigo-500/20' : 'bg-muted/10 text-muted border-transparent'}`}>
                                    {isAssigningThisDriver ? (lang === 'ar' ? 'جاري التعيين' : 'ASSIGNING') : String(driver.status || 'UNKNOWN')}
                                </div>
                            </button>
                        );
                    })}
                </div>

                <button onClick={onClose} className="w-full mt-8 py-4 text-[10px] font-black uppercase text-muted tracking-widest hover:text-rose-500 transition-colors">{lang === 'ar' ? 'إلغاء التعيين' : 'Cancel Dispatch'}</button>
            </div>
        </div>
    );
};

// Customer Registration Modal Component
const InlineCustomerRegistration: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    initialPhone: string;
    onSave: (customer: any) => Promise<void> | void;
    lang: 'en' | 'ar';
    zones: any[];
    branchId?: string;
    branches?: { id: string; name: string; nameAr?: string }[];
    onZonesChange?: (zones: any[]) => void;
}> = ({ isOpen, onClose, initialPhone, onSave, lang, zones, branchId, branches, onZonesChange }) => {
    const [form, setForm] = useState({
        name: '',
        phone: initialPhone,
        email: '',
        address: '',
        zoneId: '',
        area: '',
        building: '',
        floor: '',
        apartment: '',
        landmark: '',
        notes: '',
        lat: undefined as number | undefined,
        lng: undefined as number | undefined,
        addressLabel: undefined as string | undefined
    });
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        setForm(f => ({ ...f, phone: initialPhone }));
    }, [initialPhone]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!form.name || !form.phone || !form.address) return;
        // Egyptian mobile validation + zone required (drives branch + fee).
        const digits = String(form.phone).replace(/\D/g, '').replace(/^002/, '').replace(/^2(?=01)/, '');
        if (!/^01[0-9]{9}$/.test(digits)) {
            setErrorMessage(lang === 'ar' ? 'رقم الهاتف يجب أن يكون موبايل مصري صحيح (01xxxxxxxxx)' : 'Phone must be a valid Egyptian mobile (01xxxxxxxxx)');
            return;
        }
        if (!form.zoneId) {
            setErrorMessage(lang === 'ar' ? 'اختيار المنطقة إجباري (يحدد الفرع والرسوم)' : 'Zone is required (drives branch and fee)');
            return;
        }
        setIsSaving(true);
        setErrorMessage(null);
        try {
            await onSave({
                id: `CUS-${Date.now()}`,
                ...form,
                phone: digits,
                source: 'call_center',
                createdAt: new Date(),
                visits: 0,
                totalSpent: 0,
                loyaltyTier: 'Bronze'
            });
        } catch (error: any) {
            setErrorMessage(getActionableErrorMessage(error, lang));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-app/80 animate-in fade-in zoom-in-95 duration-150">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="bg-white dark:bg-gray-900 w-full max-w-2xl shadow-2xl border border-border flex flex-col relative overflow-hidden max-h-[85vh] animate-in zoom-in-95 slide-in-from-bottom-4 rounded-none sm:rounded-sm md:rounded-xl">
                <div className="p-6 border-b border-border flex justify-between items-center relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-cyan-500/5 pointer-events-none rounded-t-[2.5rem]" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner">
                            <UserPlus size={28} className="text-indigo-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-main uppercase tracking-tight">{lang === 'ar' ? 'تسجيل عميل جديد' : 'New Customer'}</h3>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-0.5">{lang === 'ar' ? 'أدخل بيانات العميل' : 'Enter customer details'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 text-gray-400 dark:text-gray-500 transition-all border border-gray-200 dark:border-gray-700 relative z-10 active:scale-95">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 group">
                            <label className="text-[9px] font-black uppercase text-muted tracking-[0.2em] mb-1.5 block group-focus-within:text-indigo-500 transition-colors">{lang === 'ar' ? 'الاسم *' : 'Name *'}</label>
                            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-elevated rounded-[1.2rem] py-3.5 px-5 text-sm font-bold outline-none border border-border/50 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all text-main placeholder-muted" placeholder={lang === 'ar' ? 'اسم العميل' : 'Customer name'} />
                        </div>
                        <div className="group">
                            <label className="text-[9px] font-black uppercase text-muted tracking-[0.2em] mb-1.5 block group-focus-within:text-indigo-500 transition-colors">{lang === 'ar' ? 'الهاتف *' : 'Phone *'}</label>
                            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-elevated rounded-[1.2rem] py-3.5 px-5 text-sm font-bold outline-none border border-border/50 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all text-main" />
                        </div>
                        <div className="group">
                            <label className="text-[9px] font-black uppercase text-muted tracking-[0.2em] mb-1.5 block group-focus-within:text-indigo-500 transition-colors">{lang === 'ar' ? 'البريد' : 'Email'}</label>
                            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-elevated rounded-[1.2rem] py-3.5 px-5 text-sm font-bold outline-none border border-border/50 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all text-main placeholder-muted" placeholder="optional@email.com" />
                        </div>
                    </div>

                    <div className="pt-5 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-4">
                            <MapPin size={16} className="text-cyan-500" />
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500">{lang === 'ar' ? 'عنوان التوصيل' : 'Delivery Address'}</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 group">
                                <DeliveryZonePicker
                                    zones={zones}
                                    value={form.zoneId || ''}
                                    branchId={branchId}
                                    branches={branches}
                                    lang={lang}
                                    onZonesChange={onZonesChange}
                                    onChange={(zoneId, selectedZone) => setForm({ ...form, zoneId, area: selectedZone ? (selectedZone.nameAr || selectedZone.name) : form.area })}
                                    label={lang === 'ar' ? 'المنطقة (من السيستم + إضافة جديدة بسعر التوصيل) *' : 'Delivery Zone (system list + quick-add with fee) *'}
                                    placeholder={lang === 'ar' ? 'اختر المنطقة...' : 'Select delivery zone...'}
                                />
                            </div>
                            <div className="col-span-2 group">
                                <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full bg-elevated/50 border border-cyan-500/30 rounded-[1.2rem] py-3.5 px-5 text-sm font-bold outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/20 transition-all text-main placeholder-cyan-500/50" placeholder={lang === 'ar' ? 'العنوان بالتفصيل *' : 'Street Address *'} />
                            </div>
                            <input type="text" value={form.building} onChange={e => setForm({ ...form, building: e.target.value })} className="w-full bg-elevated rounded-[1.2rem] py-3.5 px-5 text-sm font-bold outline-none border border-border/50 focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10 transition-all text-main placeholder-muted" placeholder={lang === 'ar' ? 'المبنى' : 'Building'} />
                            <div className="flex gap-2">
                                <input type="text" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} className="w-full bg-elevated rounded-[1.2rem] py-3.5 px-4 text-sm font-bold outline-none border border-border/50 focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10 transition-all text-main placeholder-muted" placeholder={lang === 'ar' ? 'الدور' : 'Floor'} />
                                <input type="text" value={form.apartment} onChange={e => setForm({ ...form, apartment: e.target.value })} className="w-full bg-elevated rounded-[1.2rem] py-3.5 px-4 text-sm font-bold outline-none border border-border/50 focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10 transition-all text-main placeholder-muted" placeholder={lang === 'ar' ? 'الشقة' : 'Apt'} />
                            </div>
                            <div className="col-span-2">
                                <input type="text" value={form.landmark} onChange={e => setForm({ ...form, landmark: e.target.value })} className="w-full bg-elevated rounded-[1.2rem] py-3.5 px-5 text-sm font-bold outline-none border border-border/50 focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10 transition-all text-main placeholder-muted" placeholder={lang === 'ar' ? 'علامة مميزة' : 'Landmark'} />
                            </div>
                        </div>
                    </div>

                    <AddressMapPicker
                        lang={lang}
                        compact
                        value={{ address: form.address, lat: form.lat, lng: form.lng, label: form.addressLabel }}
                        onChange={(pin) => setForm({ ...form, address: pin.address, lat: pin.lat, lng: pin.lng, addressLabel: pin.label })}
                    />

                    <div className="group">
                        <label className="text-[9px] font-black uppercase text-muted tracking-[0.2em] mb-1.5 block group-focus-within:text-indigo-500 transition-colors">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-elevated rounded-[1.2rem] py-3.5 px-5 text-sm font-bold outline-none border border-border/50 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all text-main placeholder-muted resize-none h-24" placeholder={lang === 'ar' ? 'ملاحظات إضافية...' : 'Additional notes...'} />
                    </div>
                    {errorMessage && (
                        <div className="rounded-[1rem] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-500">
                            {errorMessage}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-border/50 flex gap-4 bg-app/50 rounded-b-[2.5rem]">
                    <button onClick={onClose} className="flex-1 py-4 rounded-[1.2rem] border border-border/50 bg-elevated text-muted font-black tracking-[0.2em] text-[10px] uppercase hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/50 transition-all active:scale-95 shadow-sm">
                        {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button onClick={handleSubmit} disabled={!form.name || !form.phone || !form.address || !form.zoneId || isSaving} className="flex-1 py-4 rounded-[1.2rem] bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-black tracking-[0.2em] text-[10px] uppercase hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/25 active:scale-95 disabled:active:scale-100">
                        {isSaving ? <RefreshCcw size={16} className="animate-spin" /> : <Save size={16} />} {lang === 'ar' ? 'حفظ وبدء الطلب' : 'Save & Start'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Order Status Badge Component
const OrderStatusBadge: React.FC<{ status: OrderStatus; lang: 'en' | 'ar' }> = ({ status, lang }) => {
    const config: Record<OrderStatus, { bg: string; text: string; border: string; icon: any; label: { en: string; ar: string } }> = {
        [OrderStatus.SCHEDULED]: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-500', icon: Clock, label: { en: 'Scheduled', ar: 'مجدول' } },
        [OrderStatus.PENDING]: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-500', icon: Clock, label: { en: 'Pending', ar: 'معلق' } },
        [OrderStatus.PREPARING]: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-500', icon: ChefHat, label: { en: 'Preparing', ar: 'تحضير' } },
        [OrderStatus.READY]: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-500', icon: Package, label: { en: 'Ready', ar: 'جاهز' } },
        [OrderStatus.COMPLETED]: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-500', icon: CheckCircle, label: { en: 'Completed', ar: 'مكتمل' } },
        [OrderStatus.OUT_FOR_DELIVERY]: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-500', icon: Bike, label: { en: 'On the Way', ar: 'في الطريق' } },
        [OrderStatus.DELIVERED]: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-500', icon: CheckCircle, label: { en: 'Delivered', ar: 'تم التسليم' } },
        [OrderStatus.REFUNDED]: { bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-500', icon: XCircle, label: { en: 'Refunded', ar: 'مسترجع' } },
        [OrderStatus.CANCELLED]: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-500', icon: XCircle, label: { en: 'Cancelled', ar: 'ملغي' } },
    };
    const c = config[status];
    const Icon = c.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[1rem] text-[9px] font-black uppercase tracking-[0.2em] border  ${c.bg} ${c.text} ${c.border} shadow-lg shadow-${c.text.split('-')[1]}-500/10 transition-all hover:scale-105`}>
            <Icon size={12} className={status === OrderStatus.PENDING || status === OrderStatus.PREPARING || status === OrderStatus.OUT_FOR_DELIVERY ? 'animate-pulse' : ''} /> {c.label[lang]}
        </span>
    );
};

const CallCenter: React.FC = () => {
    // --- Global State ---
    const { customers, addCustomer } = useCRMStore();
    const { branches, settings, printers, hasPermission } = useAuthStore(useShallow((state) => ({ branches: state.branches, settings: state.settings, printers: state.printers, hasPermission: state.hasPermission })));
    const { categories, isLoading: isMenuLoading, error: menuError, fetchMenu, platforms: deliveryPlatforms, fetchPlatforms } = useMenuStore(useShallow((state) => ({ categories: state.categories, isLoading: state.isLoading, error: state.error, fetchMenu: state.fetchMenu, platforms: state.platforms, fetchPlatforms: state.fetchPlatforms })));
    const { orders, placeOrder, discount, setDiscount, fetchOrders, updateOrderStatus, updateOrderItems } = useOrderStore(useShallow((state) => ({ orders: state.orders, placeOrder: state.placeOrder, discount: state.discount, setDiscount: state.setDiscount, fetchOrders: state.fetchOrders, updateOrderStatus: state.updateOrderStatus, updateOrderItems: state.updateOrderItems })));
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [approvalCallback, setApprovalCallback] = useState<{ fn: () => void; action: string } | null>(null);

    // Ownership gate: agents edit/cancel their own pending orders; others'
    // orders need OP_VOID_ORDER (manager). Server branch policy is backstop.
    const canModifyCCOrder = (order: any) => {
        if (hasPermission(AppPermission.OP_VOID_ORDER)) return true;
        const mine = String(order.callCenterAgentId || order.call_center_agent_id || '');
        const me = String((settings as any)?.currentUser?.id || '');
        return Boolean(mine) && Boolean(me) && mine === me;
    };

    const requestManagerApproval = useCallback((action: string, fn: () => void | Promise<void>) => {
        setApprovalCallback({
            action,
            fn: async () => {
                try {
                    await fn();
                } catch (error: any) {
                    showToast(getActionableErrorMessage(error, settings.language || 'en'), 'error');
                } finally {
                    setApprovalCallback(null);
                }
            }
        });
        setShowApprovalModal(true);
    }, [settings.language, showToast]);

    const handleExitToDashboard = useCallback(() => {
        if (hasPermission(AppPermission.NAV_DASHBOARD) || hasPermission(AppPermission.NAV_ADMIN_DASHBOARD)) {
            navigate('/');
        } else {
            requestManagerApproval('Exit to Dashboard', () => { navigate('/'); });
        }
    }, [hasPermission, navigate, requestManagerApproval]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
                e.preventDefault();
                handleExitToDashboard();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleExitToDashboard]);

    const lang = (settings.language || 'en') as 'en' | 'ar';
    const t = translations[lang] || translations['en'];
    const currencySymbol = lang === 'ar' ? 'ج.م' : 'EGP';
    const tr = (ar: string, en: string) => lang === 'ar' ? ar : en;

    // --- View State ---
    const [activeView, setActiveView] = useState<'order' | 'tracking'>('order');
    const [menuDensity, setMenuDensity] = useState<'comfortable' | 'compact' | 'ultra' | 'buttons'>('comfortable');

    // --- Order Creation State ---
    const [phoneSearch, setPhoneSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    const [customerSearched, setCustomerSearched] = useState(false);
    const [remoteCustomerSuggestions, setRemoteCustomerSuggestions] = useState<any[]>([]);
    const [isCustomerLookupLoading, setIsCustomerLookupLoading] = useState(false);
    const [customerLookupError, setCustomerLookupError] = useState<string | null>(null);
    const [showRegistrationModal, setShowRegistrationModal] = useState(false);
    const [cart, setCart] = useState<any[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || '');
    // Order channel: DELIVERY (priced from the branch DELIVERY list, needs
    // address + zone + fee) or TAKEAWAY/pickup (branch TAKEAWAY list, no
    // address, no fee). Same channel rule as the server resolver.
    const [orderChannel, setOrderChannel] = useState<'DELIVERY' | 'TAKEAWAY'>('DELIVERY');
    // Unified sales channel: 'CALL' (restaurant / in-house) or a platform id
    // from the menu store (same source of truth as POS: Talabat, Elmenus...).
    // Old held orders may carry names ('TALABAT') — matching normalizes both.
    const [orderSource, setOrderSource] = useState<string>('CALL');
    const [externalRef, setExternalRef] = useState('');
    // Per-order markup override: the agent (manager-approved flow) can adjust
    // the platform % / fixed for THIS order only. null = follow platform config.
    const [markupOverride, setMarkupOverride] = useState<{ pct: number; fixed: number } | null>(null);
    // Payment + scheduling: cash/card/wallet and now vs scheduled datetime.
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'WALLET'>('CASH');
    const [scheduledFor, setScheduledFor] = useState('');
    // Branch auto-pick: zone -> branch. Manual change sets the override flag
    // so the agent sees a warning instead of a silent re-pick.
    const [branchAuto, setBranchAuto] = useState(true);
    const [branchManualOverride, setBranchManualOverride] = useState(false);
    // Map modal: the address pin lives in an overlay (not inline) so the
    // menu + cart keep full height. Auto-opens for a new delivery customer
    // without a pin; closing it never reopens until the next customer.
    const [mapModalOpen, setMapModalOpen] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [deliveryPin, setDeliveryPin] = useState<{ lat?: number; lng?: number; label?: string }>({});
    const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '');
    const [itemSearchQuery, setItemSearchQuery] = useState('');
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [noteInput, setNoteInput] = useState('');
    const [showCustomerProfile, setShowCustomerProfile] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(false);

    // Call Center Specific State
    const [isCallActive, setIsCallActive] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [freeDelivery, setFreeDelivery] = useState(false);
    const [deliveryZones, setDeliveryZones] = useState<any[]>([]);
    const [selectedZoneId, setSelectedZoneId] = useState<string>('');
    const [heldOrders, setHeldOrders] = useState<any[]>(() => {
        try { const saved = localStorage.getItem('cc_held_orders'); return saved ? JSON.parse(saved) : []; } catch { return []; }
    });
    const [orderNotes, setOrderNotes] = useState('');
    const [urgentFlag, setUrgentFlag] = useState(false);
    const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
    // Real saved addresses (customerAddresses table via getById), replacing
    // the old hardcoded Home/Work mock.
    const [profileAddresses, setProfileAddresses] = useState<any[]>([]);
    const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
    // Edit mode: a PENDING call-center order reloaded into the builder.
    // Submit becomes "save edit" (same id, branch follows by consequence).
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    // Cancel flow: reason is mandatory (server policy), collected in-modal.
    const [cancelTarget, setCancelTarget] = useState<any | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const customerLookupRequestRef = React.useRef(0);
    const itemSearchRef = React.useRef<HTMLInputElement | null>(null);

    // Agent speed: the moment a customer is picked, focus lands on item
    // search so selling starts with zero clicks (F2 jumps back anytime).
    useEffect(() => {
        if (selectedCustomer) {
            const t = window.setTimeout(() => itemSearchRef.current?.focus(), 120);
            return () => window.clearTimeout(t);
        }
    }, [selectedCustomer]);

    // Fresh customer record (addresses + loyalty) whenever the profile opens.
    useEffect(() => {
        if (!showCustomerProfile || !selectedCustomer?.id) {
            if (!showCustomerProfile) setProfileAddresses([]);
            return;
        }
        let cancelled = false;
        setIsLoadingAddresses(true);
        customersApi.getById(selectedCustomer.id).then((full: any) => {
            if (cancelled) return;
            setProfileAddresses(Array.isArray(full?.addresses) ? full.addresses : []);
            setSelectedCustomer((prev: any) => prev ? ({
                ...prev,
                visits: full?.visits ?? prev.visits,
                loyaltyTier: full?.loyaltyTier ?? prev.loyaltyTier,
                loyaltyPoints: full?.loyaltyPoints ?? prev.loyaltyPoints,
            }) : prev);
        }).catch(() => { /* keep cached customer */ })
            .finally(() => { if (!cancelled) setIsLoadingAddresses(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showCustomerProfile, selectedCustomer?.id]);

    const applyProfileAddress = (addr: any) => {
        if (!addr) return;
        if (addr.address) setDeliveryAddress(addr.address);
        if (addr.lat && addr.lng) {
            setDeliveryPin({ lat: Number(addr.lat), lng: Number(addr.lng), label: addr.label });
        }
        if (addr.zoneId) {
            setSelectedZoneId(String(addr.zoneId));
            const z = deliveryZones.find(dz => String(dz.id) === String(addr.zoneId));
            if (z?.branchId) {
                setSelectedBranchId(z.branchId);
                setBranchManualOverride(false);
            } else {
                void autoBranchFromZoneId(String(addr.zoneId));
            }
        }
        showToast(lang === 'ar' ? 'تم اختيار العنوان' : 'Address selected', 'success');
    };

    const saveCurrentAsAddress = async () => {
        if (!selectedCustomer?.id) return;
        if (!deliveryAddress.trim()) {
            showToast(tr('اكتب العنوان أولاً ثم احفظه', 'Enter the address first, then save it'), 'warning');
            return;
        }
        try {
            const created = await customersApi.addAddress(selectedCustomer.id, {
                label: deliveryPin.label || `${lang === 'ar' ? 'عنوان' : 'Address'} ${profileAddresses.length + 1}`,
                address: deliveryAddress.trim(),
                lat: deliveryPin.lat,
                lng: deliveryPin.lng,
                zoneId: selectedZoneId ? Number(selectedZoneId) : undefined,
            });
            setProfileAddresses(prev => [...prev, created]);
            showToast(lang === 'ar' ? 'تم حفظ العنوان للعميل' : 'Address saved for customer', 'success');
        } catch (error: any) {
            showToast(getActionableErrorMessage(error, lang), 'error');
        }
    };

    // Sync the current order address into the customer master record
    // (primary address + pin + zone), so next call starts pre-filled.
    const syncCustomerAddress = async () => {
        if (!selectedCustomer?.id) return;
        if (!deliveryAddress.trim()) {
            showToast(tr('اكتب العنوان أولاً', 'Enter the address first'), 'warning');
            return;
        }
        try {
            const updated = await customersApi.update(selectedCustomer.id, {
                address: deliveryAddress.trim(),
                lat: deliveryPin.lat,
                lng: deliveryPin.lng,
                addressLabel: deliveryPin.label,
                zoneId: selectedZoneId ? Number(selectedZoneId) : undefined,
            });
            setSelectedCustomer((prev: any) => prev ? ({ ...prev, ...(updated || {}) }) : prev);
            showToast(lang === 'ar' ? 'تم حفظ العنوان في ملف العميل' : 'Address saved to customer file', 'success');
        } catch (error: any) {
            showToast(getActionableErrorMessage(error, lang), 'error');
        }
    };

    // New delivery order without a pin yet -> open the map modal once so
    // the driver gets an exact point. Never reopens on pin drags/edits.
    useEffect(() => {
        if (selectedCustomer && orderChannel === 'DELIVERY' && !deliveryPin.lat) setMapModalOpen(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCustomer]);

    useEffect(() => {
        if (!selectedBranchId && branches[0]?.id) setSelectedBranchId(branches[0].id);
    }, [branches, selectedBranchId]);

    // The menu is the agent's selling tool: load it eagerly on mount instead
    // of waiting for the background idle load, so items always appear.
    useEffect(() => {
        if (categories.length === 0 && !isMenuLoading) {
            fetchMenu().catch(() => undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist held orders to localStorage
    useEffect(() => {
        try { localStorage.setItem('cc_held_orders', JSON.stringify(heldOrders)); } catch { /* storage full */ }
    }, [heldOrders]);

    // Load delivery zones (branch zones + global zones)
    // Platforms come from the menu store — same source of truth as POS.
    useEffect(() => {
        if ((deliveryPlatforms?.length || 0) === 0) fetchPlatforms().catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Channel change resets any per-order markup override.
    useEffect(() => {
        setMarkupOverride(null);
    }, [orderSource]);

    useEffect(() => {
        let cancelled = false;
        deliveryApi.getZones(selectedBranchId || undefined).then(zones => {
            if (cancelled) return;
            const list = zones || [];
            setDeliveryZones(list);
            setSelectedZoneId(prev => {
                if (prev && list.some((z: any) => String(z.id) === String(prev))) return prev;
                return list.length ? String(list[0].id) : '';
            });
        }).catch(() => { });
        return () => { cancelled = true; };
    }, [selectedBranchId]);

    const handleZonePicked = useCallback((zoneId: string, zone?: any) => {
        setSelectedZoneId(zoneId);
        // Auto-link branch when the zone is tied to a specific branch.
        if (zone?.branchId) {
            setSelectedBranchId(String(zone.branchId));
            setBranchManualOverride(false);
        }
    }, []);

    const handleBranchChange = useCallback((branchId: string, auto = false) => {
        setSelectedBranchId(branchId);
        // Agent manually changed the auto-picked branch -> keep a visible flag.
        setBranchManualOverride(!auto);
    }, []);

    // Customer zone -> auto branch: the saved zone may belong to a branch
    // different from the currently selected one (zones list is per-branch),
    // so resolve it against the global zone list once.
    const autoBranchFromZoneId = useCallback(async (zoneId: string) => {
        if (!zoneId || !branchAuto) return;
        try {
            const all = await deliveryApi.getZones(undefined);
            const match = (all || []).find((z: any) => String(z.id) === String(zoneId));
            if (match?.branchId) {
                setSelectedBranchId(String(match.branchId));
                setBranchManualOverride(false);
            }
        } catch { /* keep current branch */ }
    }, [branchAuto]);

    // --- Order Tracking State ---
    const [trackingFilter, setTrackingFilter] = useState<'all' | OrderStatus>(OrderStatus.PENDING);
    const [trackingBranch, setTrackingBranch] = useState<string>('all');
    const [trackingSearch, setTrackingSearch] = useState('');
    const [trackingView, setTrackingView] = useState<'grid' | 'list'>('grid');
    const [showDriverModal, setShowDriverModal] = useState(false);
    const [selectedTrackingOrder, setSelectedTrackingOrder] = useState<any>(null);

    // --- PBX Integration ---
    const [incomingPBXCall, setIncomingPBXCall] = useState<{ phone: string, name?: string, timer: number } | null>(null);

    const openIncomingCallFromSearch = () => {
        const phone = selectedCustomer?.phone || phoneSearch.trim();
        if (!phone) {
            showToast(lang === 'ar' ? 'اكتب رقم العميل الأول' : 'Enter the customer phone first', 'warning');
            return;
        }
        const matchedCustomer = customers.find(c => c.phone === phone);
        setIncomingPBXCall({
            phone,
            name: matchedCustomer?.name || selectedCustomer?.name || (lang === 'ar' ? 'عميل جديد' : 'New caller'),
            timer: 0
        });
    };

    const answerPBXCall = () => {
        if (!incomingPBXCall) return;
        const found = customers.find(c => c.phone === incomingPBXCall.phone);
        
        setPhoneSearch(incomingPBXCall.phone);
        
        if (found) {
            selectCustomerFromSuggestion(found);
        } else {
            // New user scenario
            setCustomerSearched(true);
            setSelectedCustomer(null);
            setShowRegistrationModal(true);
        }
        
        setIncomingPBXCall(null);
    };

    const declinePBXCall = () => {
        setIncomingPBXCall(null);
    };

    // PBX Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (incomingPBXCall) {
            interval = setInterval(() => {
                setIncomingPBXCall(prev => prev ? { ...prev, timer: prev.timer + 1 } : null);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [incomingPBXCall]);

    // --- Timer for active call ---
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isCallActive) {
            interval = setInterval(() => setCallDuration(d => d + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [isCallActive]);

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getOrderCreatedAt = (order: any) => new Date(order.createdAt || order.created_at || Date.now());
    const getOrderBranchId = (order: any) => order.branchId || order.branch_id || '';
    const getOrderCustomerId = (order: any) => order.customerId || order.customer_id || '';
    const getOrderCustomerName = (order: any) => order.customerName || order.customer_name || tr('عميل', 'Guest');
    const getOrderCustomerPhone = (order: any) => order.customerPhone || order.customer_phone || '-';
    const getOrderDeliveryAddress = (order: any) => order.deliveryAddress || order.delivery_address || '-';
    const isCallCenterOrderRecord = (order: any) => {
        const source = String(order.source || '').toLowerCase();
        return order.isCallCenterOrder === true || order.is_call_center_order === true || source === 'call_center';
    };

    // --- Menu & Items (priced by the TARGET branch price list) ---
    // The fulfilling branch owns revenue/tax/stock, so its branchPricing
    // wins; base price applies when the branch has no entry.
    const allMenuItems = useMemo(() => categories.flatMap(cat => cat.items.map(item => ({ ...item, categoryId: cat.id }))), [categories]);

    useEffect(() => {
        if (!activeCategory && categories.length > 0) setActiveCategory(categories[0].id);
    }, [categories, activeCategory]);

    const filteredItems = useMemo(() => {
        let items = allMenuItems;
        if (activeCategory && activeCategory !== 'All') items = items.filter(i => String(i.categoryId) === String(activeCategory));
        if (itemSearchQuery) items = items.filter(i => i.name.toLowerCase().includes(itemSearchQuery.toLowerCase()));
        return items;
    }, [allMenuItems, activeCategory, itemSearchQuery]);

    // --- Silent platform pricing (Talabat-style, POS parity) ---
    // Declared BEFORE catalog pricing because pricedItems + cart re-pricing
    // consume platformMarkup. Customer-facing price INCLUDES the markup;
    // basePrice keeps the pre-markup branch price for audit. Server recomputes
    // with the exact same formula from deliverySource, so quote and save never
    // drift. Modifiers + open/weighted prices are never marked up.
    const normPlatformKey = (s: unknown) => String(s || '').trim().toLowerCase().replace(/[\s_\-]+/g, '');
    const activeCCPlatform = useMemo(() => {
        const key = normPlatformKey(orderSource);
        if (!key || key === 'call' || key === 'restaurant') return null;
        return (deliveryPlatforms || []).find((p: any) =>
            p && p.isActive !== false && (normPlatformKey(p.id) === key || normPlatformKey(p.name) === key),
        ) || null;
    }, [deliveryPlatforms, orderSource]);
    // Server-recognized delivery source key (POS convention): platform id/name
    // lowercase, or 'restaurant' for in-house call orders.
    const platformDeliveryKey = activeCCPlatform ? String(activeCCPlatform.id).trim().toLowerCase() : 'restaurant';
    const configMarkupPct = Number(activeCCPlatform?.priceMarkupPercentage || 0) || 0;
    const configMarkupFixed = Number(activeCCPlatform?.priceMarkupFixed || 0) || 0;
    const effMarkupPct = markupOverride ? markupOverride.pct : configMarkupPct;
    const effMarkupFixed = markupOverride ? markupOverride.fixed : configMarkupFixed;
    const platformMarkup = useMemo(() => {
        if (!activeCCPlatform || activeCCPlatform.applyFeesToMenuPrice === false) return null;
        if (!(effMarkupPct > 0) && !(effMarkupFixed > 0)) return null;
        return { platformId: String(activeCCPlatform.id), pct: effMarkupPct, fixed: effMarkupFixed };
    }, [activeCCPlatform, effMarkupPct, effMarkupFixed]);

    // Visible lines: branch price first, then silent platform markup baked in
    // (POS parity). basePrice = pre-markup branch price for audit; open/
    // weighted items are never marked up. Zero-price simple items (no sizes/
    // modifiers/open-price) are hidden: a "0 ج.م" card is a pricing gap.
    const pricedItems = useMemo(
        () => filteredItems
            .map((i: any) => {
                // menuBase = catalog price (stable across branch switches);
                // basePrice = target-branch pre-markup price (audit + modal base).
                const menuBase = Number(i?.price || 0);
                const basePrice = resolveBranchPrice(i, selectedBranchId, orderChannel);
                const isOpen = Boolean((i as any)?.isWeighted);
                const price = (!isOpen && platformMarkup)
                    ? applyPlatformMarkup(basePrice, platformMarkup.pct, platformMarkup.fixed)
                    : basePrice;
                return {
                    ...i,
                    menuBase,
                    basePrice,
                    price,
                    platformId: (!isOpen && platformMarkup) ? platformMarkup.platformId : null,
                    platformMarkup: (!isOpen && platformMarkup)
                        ? Math.max(0, Math.round(((price - basePrice) + Number.EPSILON) * 100) / 100)
                        : 0,
                };
            })
            .filter((i: any) => {
                const hasConfig = (Array.isArray(i?.sizes) && i.sizes.length > 0)
                    || (Array.isArray(i?.modifierGroups) && i.modifierGroups.length > 0)
                    || (i as any)?.isWeighted;
                if (hasConfig) return true;
                return Number(i?.basePrice || 0) > 0;
            }),
        [filteredItems, selectedBranchId, orderChannel, platformMarkup],
    );

    // Switching target branch/channel/platform re-prices the open cart
    // (warn-only domain: quantities/notes/driver data untouched). Sized lines
    // carry an absolute size price (server parity) and open-price lines are
    // cashier-entered — both skip re-pricing. Server recomputes authoritatively.
    useEffect(() => {
        if (!selectedBranchId || cart.length === 0) return;
        setCart((prev) => {
            let changed = false;
            const next = prev.map((line: any) => {
                // Sized lines carry an absolute size price (server parity:
                // a selected size wins over the branch list), so only
                // base (unsized) lines follow branch/channel re-pricing.
                if (String(line?.sizeId || line?.size_id || '').trim()) return line;
                if (line?.isOpenPrice) return line;
                const menuBase = Number(line?.menuBase ?? line?.basePrice ?? line?.price ?? 0);
                const branchPrice = resolveBranchPrice({ ...line, price: menuBase }, selectedBranchId, orderChannel);
                const isOpen = Boolean(line?.isWeighted);
                const newPrice = (!isOpen && platformMarkup)
                    ? applyPlatformMarkup(branchPrice, platformMarkup.pct, platformMarkup.fixed)
                    : branchPrice;
                const newMarkup = (!isOpen && platformMarkup)
                    ? Math.max(0, Math.round(((newPrice - branchPrice) + Number.EPSILON) * 100) / 100)
                    : 0;
                if (Number(newPrice) !== Number(line?.price) || Number(newMarkup) !== Number(line?.platformMarkup || 0)) {
                    changed = true;
                    return {
                        ...line,
                        menuBase,
                        basePrice: branchPrice,
                        price: newPrice,
                        platformId: (!isOpen && platformMarkup) ? platformMarkup.platformId : null,
                        platformMarkup: newMarkup,
                    };
                }
                return line;
            });
            return changed ? next : prev;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBranchId, orderChannel, platformMarkup]);

    // --- Recipe availability (WARN ONLY — never blocks the sale) ---
    // Availability is computed against the TARGET branch (selectedBranchId)
    // because deduction happens in that branch's warehouses server-side.
    const availabilityIds = useMemo(() => {
        const cartIds = cart.map((i: any) => String(i?.menuItemId || i?.menu_item_id || i?.id || '').trim()).filter(Boolean);
        const visibleIds = filteredItems.slice(0, 40).map((i: any) => String(i?.id || '').trim()).filter(Boolean);
        return Array.from(new Set([...cartIds, ...visibleIds]));
    }, [cart, filteredItems]);
    const { byItem: availabilityByItem } = useRecipeAvailability(selectedBranchId, availabilityIds);
    const shortCartItems = useMemo(
        () => cart.filter((i: any) => availabilityByItem[String(i?.menuItemId || i?.menu_item_id || i?.id || '')]?.short),
        [cart, availabilityByItem],
    );
    const shortVisibleCount = useMemo(
        () => filteredItems.filter((i: any) => availabilityByItem[String(i?.id || '')]?.short).length,
        [filteredItems, availabilityByItem],
    );

    // Customer's recent orders (last 5)
    const customerOrders = useMemo(() => {
        if (!selectedCustomer) return [];
        return orders
            .filter(o => String(getOrderCustomerId(o)) === String(selectedCustomer.id || '') || getOrderCustomerPhone(o) === selectedCustomer.phone)
            .sort((a, b) => getOrderCreatedAt(b).getTime() - getOrderCreatedAt(a).getTime())
            .slice(0, 5);
    }, [orders, selectedCustomer]);

    const reorderFromHistory = (order: any) => {
        if (!order.items?.length) return;
        // Re-price from the CURRENT target branch+channel+platform list
        // (history prices may be stale); quantities/notes/configuration preserved.
        // Sized lines keep their absolute size price (server parity).
        const newCart = order.items.map((item: any) => {
            const menuItemId = String(item?.menuItemId || item?.menu_item_id || item?.id || '');
            const catalogMatch = allMenuItems.find((m: any) => String(m?.id) === menuItemId);
            const sizeId = String(item?.sizeId || item?.size_id || '').trim();
            const catalogSize = sizeId && Array.isArray((catalogMatch as any)?.sizes)
                ? (catalogMatch as any).sizes.find((s: any) => String(s?.id || '').trim() === sizeId)
                : undefined;
            const branchPricing = (catalogMatch as any)?.branchPricing ?? (item as any)?.branchPricing;
            const menuBase = catalogSize
                ? Number(catalogSize.price || 0)
                : Number((catalogMatch as any)?.price ?? item?.price ?? 0);
            const basePrice = catalogSize
                ? Number(catalogSize.price || 0)
                : resolveBranchPrice({ price: menuBase, branchPricing }, selectedBranchId, orderChannel);
            const isOpen = Boolean((catalogMatch as any)?.isWeighted || (item as any)?.isWeighted);
            const price = (!sizeId && !isOpen && platformMarkup)
                ? applyPlatformMarkup(basePrice, platformMarkup.pct, platformMarkup.fixed)
                : basePrice;
            return {
                ...item,
                menuItemId,
                menuBase,
                sizeId: sizeId || undefined,
                size_id: sizeId || undefined,
                basePrice,
                branchPricing,
                price,
                platformId: (!sizeId && !isOpen && platformMarkup) ? platformMarkup.platformId : null,
                platformMarkup: (!sizeId && !isOpen && platformMarkup)
                    ? Math.max(0, Math.round(((price - basePrice) + Number.EPSILON) * 100) / 100)
                    : 0,
                selectedModifiers: Array.isArray(item?.selectedModifiers) ? item.selectedModifiers : (Array.isArray(item?.modifiers) ? item.modifiers : []),
                quantity: Number(item?.quantity || 1),
                cartId: `reorder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            };
        });
        setCart(prev => [...prev, ...newCart]);
        showToast(lang === 'ar' ? 'تم إضافة الطلب السابق للسلة' : 'Previous order added to cart', 'success');
    };

    const normalizePhone = (value: string) => value.replace(/\D/g, '');

    const mergeCustomerSuggestions = (localResults: any[], remoteResults: any[]) => {
        const seen = new Set<string>();
        return [...localResults, ...remoteResults].filter((customer) => {
            const key = String(customer?.id || customer?.phone || '').trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 6);
    };

    const applySelectedCustomer = (customer: any) => {
        setSelectedCustomer(customer);
        setPhoneSearch(customer.phone || '');
        setDeliveryAddress(customer.address || '');
        setDeliveryPin({ lat: customer.lat ?? customer.latitude, lng: customer.lng ?? customer.longitude, label: customer.addressLabel ?? customer.address_label });
        setCustomerSearched(true);
        setRemoteCustomerSuggestions([]);
        setCustomerLookupError(null);
        setIsCallActive(true);
        setCallDuration(0);
        setShowCustomerProfile(true);
        if (customer.zoneId) {
            setSelectedZoneId(String(customer.zoneId));
            const z = deliveryZones.find(dz => String(dz.id) === String(customer.zoneId));
            if (z?.branchId) {
                setSelectedBranchId(z.branchId);
                setBranchManualOverride(false);
            } else {
                void autoBranchFromZoneId(String(customer.zoneId));
            }
        }
    };

    useEffect(() => {
        const query = phoneSearch.trim();
        if (selectedCustomer || query.length < 3) {
            setRemoteCustomerSuggestions([]);
            setIsCustomerLookupLoading(false);
            setCustomerLookupError(null);
            return;
        }

        const requestId = ++customerLookupRequestRef.current;
        const timeout = window.setTimeout(async () => {
            setIsCustomerLookupLoading(true);
            setCustomerLookupError(null);
            try {
                const results = await customersApi.getAll({ search: query });
                if (requestId !== customerLookupRequestRef.current) return;
                const list = Array.isArray(results) ? results : [];
                setRemoteCustomerSuggestions(list);

                const normalizedQuery = normalizePhone(query);
                const exactMatch = normalizedQuery.length >= 8
                    ? list.find((customer) => normalizePhone(String(customer.phone || '')) === normalizedQuery)
                    : null;
                if (exactMatch) applySelectedCustomer(exactMatch);
            } catch (error: any) {
                if (requestId !== customerLookupRequestRef.current) return;
                setRemoteCustomerSuggestions([]);
                setCustomerLookupError(getActionableErrorMessage(error, lang));
            } finally {
                if (requestId === customerLookupRequestRef.current) setIsCustomerLookupLoading(false);
            }
        }, 250);

        return () => window.clearTimeout(timeout);
    }, [phoneSearch, selectedCustomer, lang, deliveryZones]);

    // Live phone suggestions as user types
    const phoneSuggestions = useMemo(() => {
        if (!phoneSearch || phoneSearch.length < 3 || selectedCustomer) return [];
        const q = phoneSearch.toLowerCase();
        const localMatches = customers.filter(c =>
            c.phone?.includes(q) || c.name?.toLowerCase().includes(q)
        );
        return mergeCustomerSuggestions(localMatches, remoteCustomerSuggestions);
    }, [phoneSearch, customers, remoteCustomerSuggestions, selectedCustomer]);

    const selectCustomerFromSuggestion = (customer: any) => {
        applySelectedCustomer(customer);
    };

    // Auto-select on exact phone match while typing
    const handlePhoneInputChange = (value: string) => {
        setPhoneSearch(value);
        setCustomerSearched(false);
        setCustomerLookupError(null);
        // Check for exact phone match
        if (value.length >= 8) {
            const normalizedValue = normalizePhone(value);
            const exactMatch = customers.find(c => normalizePhone(String(c.phone || '')) === normalizedValue);
            if (exactMatch) {
                selectCustomerFromSuggestion(exactMatch);
            }
        }
    };

    const handlePrintCustomerReport = () => {
        if (!selectedCustomer) return;
        const lastOrder = customerOrders[0];
        const w = window.open('', '_blank', 'width=400,height=600');
        if (!w) return;
        w.document.write(`
            <html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
            <head><title>${lang === 'ar' ? 'تقرير عميل' : 'Customer Report'}</title>
            <style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');body{font-family:'Cairo',system-ui,sans-serif;padding:20px;max-width:360px;margin:0 auto}
            h2{font-family:'Cairo',system-ui,sans-serif;border-bottom:2px solid #333;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:8px}
            td{padding:4px 0;font-size:13px}td:last-child{font-family:'Cairo',system-ui,sans-serif;text-align:right;font-weight:bold}
            .section{margin:16px 0;padding:12px;background:#f5f5f5;border-radius:8px}
            .item{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}</style></head>
            <body>
            <h2>📋 ${lang === 'ar' ? 'تقرير العميل' : 'Customer Report'}</h2>
            <table>
                <tr><td>${lang === 'ar' ? 'الاسم' : 'Name'}</td><td>${selectedCustomer.name}</td></tr>
                <tr><td>${lang === 'ar' ? 'الهاتف' : 'Phone'}</td><td>${selectedCustomer.phone}</td></tr>
                <tr><td>${lang === 'ar' ? 'العنوان' : 'Address'}</td><td>${selectedCustomer.address || deliveryAddress || '-'}</td></tr>
                <tr><td>${lang === 'ar' ? 'الولاء' : 'Loyalty'}</td><td>${selectedCustomer.loyaltyTier || 'Bronze'}</td></tr>
                <tr><td>${lang === 'ar' ? 'عدد الطلبات' : 'Total Orders'}</td><td>${selectedCustomer.visits || customerOrders.length}</td></tr>
                <tr><td>${lang === 'ar' ? 'تاريخ التسجيل' : 'Registered'}</td><td>${selectedCustomer.createdAt ? new Date(selectedCustomer.createdAt).toLocaleDateString() : '-'}</td></tr>
            </table>
            ${lastOrder ? `
                <div class="section">
                    <strong>📦 ${lang === 'ar' ? 'آخر طلب' : 'Last Order'} — ${new Date(lastOrder.createdAt).toLocaleDateString()}</strong>
                    ${(lastOrder.items || []).map((item: any) => `<div class="item"><span>${item.quantity}x ${item.name}</span><span>${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span></div>`).join('')}
                    <hr/><div class="item" style="font-weight:bold"><span>${lang === 'ar' ? 'الإجمالي' : 'Total'}</span><span>${(lastOrder as any).total?.toFixed(2) || '?'} ${currencySymbol}</span></div>
                </div>
            ` : ''}
            <p style="text-align:center;font-size:10px;color:#999;margin-top:20px">${new Date().toLocaleString()}</p>
            </body></html>
        `);
        w.document.close();
        setTimeout(() => { w.print(); }, 300);
    };

    // --- Customer Search Logic ---
    const handleCustomerSearch = async () => {
        if (!phoneSearch.trim()) return;

        const normalizedQuery = normalizePhone(phoneSearch);
        const found = phoneSuggestions.find(c => normalizePhone(String(c.phone || '')) === normalizedQuery)
            || customers.find(c => c.phone.includes(phoneSearch) || c.name?.toLowerCase().includes(phoneSearch.toLowerCase()))
            || phoneSuggestions[0];
        setCustomerSearched(true);

        if (found) {
            applySelectedCustomer(found);
            return;
        }

        try {
            setIsCustomerLookupLoading(true);
            setCustomerLookupError(null);
            const results = await customersApi.getAll({ search: phoneSearch.trim() });
            const list = Array.isArray(results) ? results : [];
            setRemoteCustomerSuggestions(list);
            const exactMatch = list.find(c => normalizePhone(String(c.phone || '')) === normalizedQuery);
            if (exactMatch || list.length === 1) {
                applySelectedCustomer(exactMatch || list[0]);
            } else if (list.length > 1) {
                setCustomerSearched(false);
            } else {
                setSelectedCustomer(null);
                setShowRegistrationModal(true);
            }
        } catch (error: any) {
            setCustomerLookupError(getActionableErrorMessage(error, lang));
            // Customer not found - show registration modal
            setSelectedCustomer(null);
            setShowRegistrationModal(true);
        } finally {
            setIsCustomerLookupLoading(false);
        }
    };

    const handleSaveNewCustomer = async (customer: any) => {
        const createdCustomer = await addCustomer(customer);
        applySelectedCustomer(createdCustomer);
        setShowRegistrationModal(false);
        showToast(lang === 'ar' ? 'تم حفظ العميل في CRM' : 'Customer saved to CRM', 'success');
    };

    // --- Cart Functions (configuration-aware: same item id with a different
    // size/modifier set is a separate line, mirroring the POS cart) ---
    const sameCartConfiguration = (a: any, b: any) => {
        const menuId = (x: any) => String(x?.menuItemId || x?.menu_item_id || x?.id || '');
        if (menuId(a) !== menuId(b)) return false;
        if (String(a?.sizeId || a?.size_id || '') !== String(b?.sizeId || b?.size_id || '')) return false;
        const norm = (mods: any[]) => (Array.isArray(mods) ? mods : [])
            .map((m: any) => String(m?.id || m?.optionId || m?.optionName || ''))
            .sort()
            .join('|');
        return norm(a?.selectedModifiers || a?.modifiers) === norm(b?.selectedModifiers || b?.modifiers);
    };
    const addToCart = (item: any, selectedModifiers: any[] = [], quantity = 1) => {
        const line = {
            ...item,
            menuItemId: item?.menuItemId || item?.menu_item_id || item?.id,
            selectedModifiers,
        };
        const existingItem = cart.find(i => sameCartConfiguration(i, line));
        if (existingItem) {
            updateQuantity(existingItem.cartId, quantity);
        } else {
            const cartId = Math.random().toString(36).substr(2, 9);
            setCart([...cart, { ...line, quantity: Math.max(1, Number(quantity) || 1), cartId, notes: '' }]);
        }
    };

    // Item options (sizes / modifiers / open price): same modal as the POS.
    // Grid items already carry the branch+channel price in `price`/`basePrice`,
    // so the modal derives from the resolved base exactly once.
    const [optionItem, setOptionItem] = useState<any | null>(null);
    const handleGridAdd = (item: any) => {
        if ((item?.sizes && item.sizes.length > 0) ||
            (item?.modifierGroups && item.modifierGroups.length > 0) ||
            item?.price === 0 || (item as any)?.isWeighted) {
            setOptionItem(item);
            return;
        }
        addToCart(item);
    };
    const handleConfirmItemOptions = (item: any, selectedModifiers: any[], qty: number) => {
        addToCart(item, selectedModifiers, qty);
        setOptionItem(null);
    };

    const updateQuantity = (cartId: string, delta: number) => {
        setCart(cart.map(i => i.cartId === cartId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
    };

    const removeFromCart = (cartId: string) => setCart(cart.filter(i => i.cartId !== cartId));
    // Stepper minus on grid cards (mirrors POS handleRemoveOneFromCart):
    // decrement the last matching line, dropping it at zero.
    const handleGridRemoveOne = (menuItemId: string) => {
        const key = String(menuItemId || '');
        const lines = cart.filter(i => String(i?.menuItemId || i?.menu_item_id || i?.id || '') === key);
        if (lines.length === 0) return;
        const last = lines[lines.length - 1];
        if (Number(last.quantity || 0) <= 1) removeFromCart(last.cartId);
        else updateQuantity(last.cartId, -1);
    };
    const updateCartItemNotes = (cartId: string, notes: string) => setCart(cart.map(i => i.cartId === cartId ? { ...i, notes } : i));

    // --- Pricing (mirrors the server: target-branch DELIVERY list + the
    // fulfilling branch's tax rate — never a hardcoded rate, so the quote
    // the call center gives always matches what the branch saves) ---
    // Modifier prices are per-unit on top of the unit price, rounded exactly
    // like the server/POS so the quote never drifts on configured items.
    const money = (value: number) => parseFloat(Number(value || 0).toFixed(2));
    const lineModsPrice = (item: any) => (Array.isArray(item?.selectedModifiers) ? item.selectedModifiers : [])
        .reduce((sum: number, mod: any) => sum + (Number(mod?.price) || 0), 0);
    const subtotal = money(cart.reduce((sum, item) => sum + (((item.price || 0) + lineModsPrice(item)) * (item.quantity || 0)), 0));
    const discountAmount = money(subtotal * (discount / 100));
    const selectedZone = deliveryZones.find(z => String(z.id) === String(selectedZoneId));
    // Takeaway/pickup has no zone and no delivery fee by definition.
    const deliveryFee = orderChannel === 'TAKEAWAY' ? 0 : (freeDelivery ? 0 : Number(selectedZone?.deliveryFee ?? 15));
    const targetBranchTaxRate = Number(branches.find((b: any) => b.id === selectedBranchId)?.taxRate ?? settings.taxRate ?? 14);
    const effectiveTaxRate = Number.isFinite(targetBranchTaxRate) && targetBranchTaxRate >= 0 && targetBranchTaxRate <= 100 ? targetBranchTaxRate : 14;
    const tax = money((subtotal - discountAmount) * (effectiveTaxRate / 100));
    const total = money(subtotal - discountAmount + tax + deliveryFee);
    // Totals-derived platform displays (need cart + total, so they live here).
    const platformFeePct = Number((activeCCPlatform as any)?.feePercentage ?? (activeCCPlatform as any)?.fee_percentage ?? 0) || 0;
    const platformMarkupTotal = money(cart.reduce((sum, line: any) => sum + (Number(line?.platformMarkup || 0) * Number(line?.quantity || 0)), 0));
    const platformFeeAmount = money(total * (platformFeePct / 100));
    // Platform SLA hint: aggregators must be confirmed fast.
    const platformSlaMins = !activeCCPlatform ? 0 : normPlatformKey(activeCCPlatform.id) === 'talabat' || normPlatformKey(activeCCPlatform.name) === 'talabat' ? 5 : 10;
    // --- Hold Order (new orders only — edits must be saved or discarded) ---
    const holdCurrentOrder = () => {
        if (cart.length === 0 || editingOrderId) return;
        setHeldOrders([...heldOrders, {
            id: `HOLD-${Date.now()}`,
            customer: selectedCustomer,
            cart: [...cart],
            items: [...cart],
            channel: orderChannel,
            source: orderSource,
            markupOverride,
            paymentMethod,
            scheduledFor,
            externalRef,
            branchId: selectedBranchId,
            total,
            timestamp: new Date(),
            notes: orderNotes
        }]);
        resetOrder();
    };

    const recallOrder = (holdId: string) => {
        const order = heldOrders.find(o => o.id === holdId);
        if (order) {
            setSelectedCustomer(order.customer);
            setCart(order.cart);
            setOrderNotes(order.notes);
            if (order.channel === 'TAKEAWAY' || order.channel === 'DELIVERY') setOrderChannel(order.channel);
            if (order.source) setOrderSource(order.source);
            if (order.markupOverride !== undefined) setMarkupOverride(order.markupOverride);
            if (order.paymentMethod) setPaymentMethod(order.paymentMethod);
            if (order.scheduledFor !== undefined) setScheduledFor(order.scheduledFor);
            if (order.externalRef !== undefined) setExternalRef(order.externalRef);
            if (order.branchId) setSelectedBranchId(order.branchId);
            setHeldOrders(heldOrders.filter(o => o.id !== holdId));
        }
    };

    const resetOrder = () => {
        setCart([]);
        setSelectedCustomer(null);
        setPhoneSearch('');
        setDeliveryAddress('');
        setDeliveryPin({});
        setOrderNotes('');
        setDiscount(0);
        setFreeDelivery(false);
        setUrgentFlag(false);
        setIsCallActive(false);
        setCallDuration(0);
        setCustomerSearched(false);
        setExternalRef('');
        setScheduledFor('');
        setPaymentMethod('CASH');
        setMarkupOverride(null);
        setEditingOrderId(null);
        setBranchManualOverride(false);
    };

    // --- Edit PENDING order: reload it into the builder (same id kept) ---
    const startEditOrder = (order: any) => {
        const phone = getOrderCustomerPhone(order);
        const found = customers.find((c: any) =>
            (order.customerId && String(c.id) === String(order.customerId)) || (phone && phone !== '-' && c.phone === phone));
        const customer = found || {
            id: order.customerId, name: getOrderCustomerName(order), phone: phone === '-' ? '' : phone,
            address: getOrderDeliveryAddress(order),
        };
        setSelectedCustomer(customer);
        setPhoneSearch(customer.phone || '');
        setDeliveryAddress(order.deliveryAddress || order.delivery_address || '');
        setDeliveryPin({
            lat: order.deliveryLat ?? order.delivery_lat ?? (customer as any).lat ?? (customer as any).latitude,
            lng: order.deliveryLng ?? order.delivery_lng ?? (customer as any).lng ?? (customer as any).longitude,
            label: order.deliveryAddressLabel ?? order.delivery_address_label,
        });
        const branchId = getOrderBranchId(order);
        if (branchId) {
            setSelectedBranchId(branchId);
            setBranchManualOverride(false);
        }
        const orderType = String(order.type || '').toUpperCase();
        setOrderChannel(orderType === 'TAKEAWAY' || orderType === 'PICKUP' ? 'TAKEAWAY' : 'DELIVERY');
        const ds = String(order.deliverySource || order.delivery_source || 'restaurant');
        setOrderSource(ds.toLowerCase() === 'restaurant' ? 'CALL' : ds);
        const pm = String(order.paymentMethod || order.payment_method || 'CASH').toUpperCase();
        setPaymentMethod(pm === 'CARD' || pm === 'WALLET' ? pm as any : 'CASH');
        setExternalRef(String(order.platformOrderId || order.platform_order_id || ''));
        setScheduledFor(String(order.scheduledFor || order.scheduled_for || ''));
        setFreeDelivery(Boolean(order.freeDelivery ?? order.free_delivery));
        setUrgentFlag(Boolean(order.isUrgent ?? order.is_urgent));
        setOrderNotes('');
        setMarkupOverride(null);
        const sub = Number(order.subtotal || 0);
        const disc = Number(order.discount || 0);
        setDiscount(sub > 0 && disc > 0 ? Math.min(100, (disc / sub) * 100) : 0);
        // Re-price lines against the catalog (history prices may be stale),
        // like reorder — server re-prices authoritatively on save anyway.
        const lines = (order.items || []).map((item: any) => {
            const menuItemId = String(item?.menuItemId || item?.menu_item_id || item?.id || '');
            const catalogMatch = allMenuItems.find((m: any) => String(m?.id) === menuItemId);
            const sizeId = String(item?.sizeId || item?.size_id || '').trim();
            const menuBase = Number((catalogMatch as any)?.price ?? item?.price ?? 0);
            const branchPricing = (catalogMatch as any)?.branchPricing;
            const basePrice = sizeId
                ? menuBase
                : resolveBranchPrice({ price: menuBase, branchPricing }, branchId || selectedBranchId, orderType === 'TAKEAWAY' ? 'TAKEAWAY' : 'DELIVERY');
            return {
                ...item,
                menuItemId,
                menuBase,
                sizeId: sizeId || undefined,
                size_id: sizeId || undefined,
                basePrice,
                branchPricing,
                price: Number(item?.price ?? basePrice ?? 0),
                selectedModifiers: Array.isArray(item?.selectedModifiers) ? item.selectedModifiers : (Array.isArray(item?.modifiers) ? item.modifiers : []),
                quantity: Math.max(1, Number(item?.quantity || 1)),
                cartId: `edit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                notes: item?.notes || '',
            };
        });
        setCart(lines);
        setCustomerSearched(true);
        setEditingOrderId(order.id);
        setActiveView('order');
        showToast(lang === 'ar' ? `وضع التعديل للطلب #${order.id} — عدّل ثم احفظ` : `Editing order #${order.id} — adjust then save`, 'info');
    };

    // --- Cancel order with mandatory reason (server policy). Started orders
    // are branch-locked by policy and must be cancelled at the branch. ---
    const printTrackingReceipt = async (order: any) => {
        try {
            const branch = branches.find(b => b.id === getOrderBranchId(order));
            await printOrderReceipt({
                order, printers, settings,
                currencySymbol: settings.currencySymbol, lang, t, branch,
                title: t.order_receipt || (lang === 'ar' ? 'إيصال الطلب' : 'Order Receipt'),
            });
        } catch (error: any) {
            showToast(getActionableErrorMessage(error, lang), 'error');
        }
    };
    const confirmCancelOrder = async () => {
        if (!cancelTarget || isCancelling) return;
        if (!cancelReason.trim()) {
            showToast(tr('اكتب سبب الإلغاء أولاً', 'Enter a cancellation reason first'), 'warning');
            return;
        }
        setIsCancelling(true);
        try {
            await updateOrderStatus(
                cancelTarget.id,
                OrderStatus.CANCELLED,
                (settings as any)?.currentUser?.id,
                `${cancelReason.trim()} (كول سنتر)`,
            );
            showToast(lang === 'ar' ? 'تم إلغاء الطلب وإخطار الفرع والمطبخ' : 'Order cancelled — branch and kitchen notified', 'success');
            setCancelTarget(null);
            setCancelReason('');
            await fetchOrders();
        } catch (error: any) {
            showToast(getActionableErrorMessage(error, lang), 'error');
        } finally {
            setIsCancelling(false);
        }
    };

    // --- Submit Order ---
    const handleSubmitOrder = async () => {
        if (isSubmittingOrder) return;
        if (!selectedCustomer) {
            showToast(tr('اختار أو سجل عميل قبل إرسال الطلب', 'Select or register a customer before sending the order'), 'error');
            return;
        }
        if (!selectedBranchId) {
            showToast(tr('اختار الفرع قبل إرسال الطلب', 'Select a branch before sending the order'), 'error');
            return;
        }
        if (orderChannel === 'DELIVERY' && !deliveryAddress.trim()) {
            showToast(tr('اكتب عنوان التوصيل قبل إرسال الطلب', 'Enter the delivery address before sending the order'), 'error');
            return;
        }
        if (cart.length === 0) {
            showToast(tr('أضف صنف واحد على الأقل قبل إرسال الطلب', 'Add at least one item before sending the order'), 'error');
            return;
        }

        // --- Edit-save: same order id, branch follows by consequence ---
        if (editingOrderId) {
            setIsSubmittingOrder(true);
            try {
                const saved: any = await updateOrderItems(editingOrderId, {
                    items: cart,
                    notes: orderNotes.trim() || undefined,
                    discount: discountAmount,
                    deliveryFee,
                    changedBy: (settings as any)?.currentUser?.id,
                    deliverySource: platformDeliveryKey,
                    paymentMethod,
                    deliveryAddress: orderChannel === 'DELIVERY' ? deliveryAddress.trim() || undefined : undefined,
                    deliveryLat: deliveryPin.lat,
                    deliveryLng: deliveryPin.lng,
                    deliveryAddressLabel: deliveryPin.label,
                    platformOrderId: externalRef.trim() || undefined,
                    scheduledFor: scheduledFor || undefined,
                });
                const invWarnings = Array.isArray(saved?.warnings)
                    ? saved.warnings.filter((w: any) => w?.code === 'INSUFFICIENT_INVENTORY')
                    : [];
                if (invWarnings.length > 0) {
                    showToast(lang === 'ar' ? 'تم حفظ التعديل مع تنبيه مخزون للفرع' : 'Edit saved with a stock warning for the branch', 'warning');
                } else {
                    showToast(lang === 'ar' ? 'تم حفظ التعديل وإخطار المطبخ والفرع' : 'Edit saved — kitchen and branch notified', 'success');
                }
                // Server re-enqueued branch print jobs on edit-dispatch, so no
                // client reprint here (would double-print at the branch).
                resetOrder();
                await fetchOrders();
            } catch (error: any) {
                showToast(getActionableErrorMessage(error, lang), 'error');
            } finally {
                setIsSubmittingOrder(false);
            }
            return;
        }
        // Platform orders need the external platform number (POS parity:
        // platformOrderId) so the branch can reconcile with the aggregator.
        if (activeCCPlatform && !externalRef.trim()) {
            showToast(tr('اكتب رقم طلب المنصة قبل الإرسال', 'Enter the platform order number before sending'), 'error');
            return;
        }
        if (scheduledFor) {
            const when = new Date(scheduledFor).getTime();
            if (!Number.isFinite(when) || when < Date.now() - 60000) {
                showToast(tr('وقت الجدولة لازم يكون في المستقبل', 'Scheduled time must be in the future'), 'error');
                return;
            }
        }

        setIsSubmittingOrder(true);
        try {
            const newOrder: Order = {
                id: `CC-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                type: orderChannel === 'TAKEAWAY' ? OrderType.TAKEAWAY : OrderType.DELIVERY,
                branchId: selectedBranchId,
                customerId: selectedCustomer?.id,
                customerName: selectedCustomer?.name,
                customerPhone: selectedCustomer?.phone,
                deliveryAddress: deliveryAddress.trim(),
                deliveryLat: deliveryPin.lat ?? selectedCustomer?.lat ?? selectedCustomer?.latitude,
                deliveryLng: deliveryPin.lng ?? selectedCustomer?.lng ?? selectedCustomer?.longitude,
                deliveryAddressLabel: deliveryPin.label ?? selectedCustomer?.addressLabel ?? selectedCustomer?.address_label,
                isCallCenterOrder: true,
                // POS convention: origin stays 'call_center', the aggregator key
                // goes in deliverySource so the server applies the platform
                // markup authoritatively + stores the audit columns.
                source: 'call_center',
                deliverySource: platformDeliveryKey,
                platformOrderId: externalRef.trim() || undefined,
                callCenterAgentId: (settings as any)?.currentUser?.id,
                paymentMethod,
                items: cart,
                status: OrderStatus.PENDING,
                subtotal,
                tax,
                deliveryFee,
                total,
                createdAt: new Date(),
                notes: [
                    orderNotes,
                    scheduledFor ? `مجدول: ${new Date(scheduledFor).toLocaleString()}` : '',
                    activeCCPlatform ? `قناة: ${activeCCPlatform.name} (+${effMarkupPct}% +${effMarkupFixed})` : 'قناة: مكالمة',
                    markupOverride ? `تعديل نسبة المنصة يدوي: +${markupOverride.pct}% +${markupOverride.fixed}` : '',
                    externalRef.trim() ? `رقم المنصة: ${externalRef.trim()}` : '',
                    `دفع: ${paymentMethod}`,
                    platformMarkupTotal > 0 ? `هامش المنصة المضمن: ${platformMarkupTotal.toFixed(2)}` : '',
                    platformFeePct ? `عمولة المنصة ${platformFeePct}% (≈${platformFeeAmount.toFixed(2)})` : '',
                ].filter(Boolean).join(' | '),
                freeDelivery: freeDelivery,
                isUrgent: urgentFlag,
                // Wire contract: order.discount is money (discountAmount),
                // never the percent — the server applies the payload type.
                discount: discountAmount,
                scheduledFor: scheduledFor || undefined,
            };

            const savedOrder = await placeOrder(newOrder);
            const activeBranch = branches.find(b => b.id === selectedBranchId);
            // No client-side kitchen print: the server enqueues branch kitchen
            // print jobs on dispatch (same as any order), so printing here too
            // would double-print at the branch. Receipt stays: the operator
            // needs a paper slip per order; failures stay non-blocking.
            try {
                await printOrderReceipt({
                    order: savedOrder,
                    printers,
                    settings,
                    currencySymbol: settings.currencySymbol,
                    lang,
                    t,
                    branch: activeBranch,
                    title: t.order_receipt || (lang === 'ar' ? 'إيصال الطلب' : 'Order Receipt')
                });
            } catch {
                showToast(lang === 'ar' ? 'تم حفظ الطلب، لكن تعذرت طباعة الإيصال' : 'Order saved, but receipt print failed', 'warning');
            }
            // Warn-only inventory feedback: the sale is NEVER blocked, but the
            // operator sees which items had insufficient recipe stock so the
            // branch can be notified. Deduction already ran against the target
            // branch's warehouses server-side.
            const invWarnings = Array.isArray((savedOrder as any)?.warnings)
                ? (savedOrder as any).warnings.filter((w: any) => w?.code === 'INSUFFICIENT_INVENTORY')
                : [];
            const driftWarning = Array.isArray((savedOrder as any)?.warnings)
                ? (savedOrder as any).warnings.find((w: any) => w?.code === 'PRICE_QUOTE_DRIFT')
                : undefined;
            const invNames = invWarnings.slice(0, 3).map((w: any) => {
                const found = cart.find((i: any) => String(i?.id) === String(w?.menuItemId));
                return found?.name || String(w?.menuItemId || '').slice(0, 12);
            }).join('، ');
            resetOrder();
            showToast(lang === 'ar' ? 'تم إرسال الطلب بنجاح' : 'Order sent successfully', 'success');
            if (invWarnings.length > 0) {
                showToast(
                    lang === 'ar'
                        ? `تنبيه مخزون (${activeBranch?.name || ''}): ${invNames} — تم إرسال الطلب للفرع وسيتم تنبيهه بالنواقص`
                        : `Stock warning (${activeBranch?.name || ''}): ${invNames} — order sent, branch will be notified`,
                    'warning',
                );
            }
            // Quote integrity: the menu price moved between quote and save —
            // the order is saved with server prices, both sides see the drift.
            if (driftWarning) {
                showToast(
                    lang === 'ar'
                        ? `تنبيه سعر: السعر اتحدث أثناء الطلب (${Number(driftWarning.clientTotal || 0).toFixed(2)} ← ${Number(driftWarning.serverTotal || 0).toFixed(2)}) — تم الحفظ بالسعر الجديد`
                        : `Price notice: menu price moved during quoting (${Number(driftWarning.clientTotal || 0).toFixed(2)} → ${Number(driftWarning.serverTotal || 0).toFixed(2)}) — saved at new price`,
                    'warning',
                );
            }
        } catch (error: any) {
            showToast(getActionableErrorMessage(error, lang), 'error');
        } finally {
            setIsSubmittingOrder(false);
        }
    };

    // Markup override needs a manager unless the agent holds OP_VOID_ORDER.
    const applyMarkupOverride = (patch: { pct?: number; fixed?: number }) => {
        const next = {
            pct: patch.pct !== undefined ? Math.max(0, Number(patch.pct) || 0) : (markupOverride ? markupOverride.pct : configMarkupPct),
            fixed: patch.fixed !== undefined ? Math.max(0, Number(patch.fixed) || 0) : (markupOverride ? markupOverride.fixed : configMarkupFixed),
        };
        if (hasPermission(AppPermission.OP_VOID_ORDER)) {
            setMarkupOverride(next);
            return;
        }
        requestManagerApproval('PLATFORM_MARKUP_OVERRIDE', () => setMarkupOverride(next));
    };

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (e.key === 'F1') { e.preventDefault(); document.getElementById('customer-search')?.focus(); }
            if (e.key === 'F2') { e.preventDefault(); document.getElementById('item-search')?.focus(); }
            if (e.key === 'F3') { e.preventDefault(); handleSubmitOrder(); }
            if (e.key === 'F4') { e.preventDefault(); holdCurrentOrder(); }
            if (e.key === 'F5') { e.preventDefault(); if (selectedCustomer || cart.length > 0) setConfirmingReset(true); else resetOrder(); }
            // Esc never wipes silently: confirm when a live order exists.
            if (e.key === 'Escape') {
                if (selectedCustomer || cart.length > 0) setConfirmingReset(true);
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [cart, selectedBranchId, selectedCustomer]);

    // --- Order Tracking Data ---
    const callCenterOrders = useMemo(() => {
        return orders.filter(isCallCenterOrderRecord);
    }, [orders]);

    const filteredTrackingOrders = useMemo(() => {
        let filtered = callCenterOrders;
        if (trackingFilter !== 'all') {
            filtered = filtered.filter(o => o.status === trackingFilter);
        }
        if (trackingBranch !== 'all') {
            filtered = filtered.filter(o => getOrderBranchId(o) === trackingBranch);
        }
        const q = trackingSearch.trim().toLowerCase();
        if (q) {
            filtered = filtered.filter(o =>
                String(o.id || '').toLowerCase().includes(q)
                || getOrderCustomerName(o).toLowerCase().includes(q)
                || getOrderCustomerPhone(o).toLowerCase().includes(q)
                || String((o as any).platformOrderId || (o as any).platform_order_id || '').toLowerCase().includes(q)
                || getOrderDeliveryAddress(o).toLowerCase().includes(q),
            );
        }
        return filtered.sort((a, b) => getOrderCreatedAt(b).getTime() - getOrderCreatedAt(a).getTime());
    }, [callCenterOrders, trackingFilter, trackingBranch, trackingSearch]);

    // Custody guard (mirrors server orderStatusPolicy): in-house delivery
    // cannot close without an accountable driver; aggregators exempt.
    const orderNeedsDriver = (order: any) => {
        if (String(order.type || '').toUpperCase() !== 'DELIVERY') return false;
        const source = String(order.deliverySource || order.delivery_source || '').trim().toLowerCase();
        const origin = String(order.source || '').trim().toLowerCase();
        const aggregator = (source && source !== 'restaurant') || origin.startsWith('platform:');
        if (aggregator) return false;
        return !String(order.driverId || order.driver_id || '').trim();
    };

    // --- Stats ---
    const todayOrders = callCenterOrders.filter(o => getOrderCreatedAt(o).toDateString() === new Date().toDateString());
    const pendingCount = callCenterOrders.filter(o => o.status === OrderStatus.PENDING).length;
    const preparingCount = callCenterOrders.filter(o => o.status === OrderStatus.PREPARING).length;
    const outForDeliveryCount = callCenterOrders.filter(o => o.status === OrderStatus.OUT_FOR_DELIVERY).length;
    const deliveredTodayCount = todayOrders.filter(o => o.status === OrderStatus.DELIVERED).length;

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div className="ops-fast flex flex-col h-full w-full app-viewport overflow-hidden bg-app relative">

            {/* PBX INCOMING CALL NOTIFICATION (Absolute Overlay) */}
            {incomingPBXCall && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md animate-in slide-in-from-top-10 fade-in zoom-in-95 duration-150">
                    <div className="relative bg-card/95  border border-indigo-500/50 rounded-3xl p-6 shadow-2xl overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-indigo-500/10 before:to-transparent before:pointer-events-none">
                        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/20">
                            <div className="h-full bg-indigo-500 animate-[pulse_2s_ease-in-out_infinite]" style={{ width: '100%' }} />
                        </div>
                        
                        <div className="flex items-start gap-4 relative z-10">
                            {/* Bouncing Phone Icon */}
                            <div className="relative shrink-0">
                                <div className="absolute -inset-2 bg-indigo-500 rounded-full blur-lg opacity-40 animate-pulse" />
                                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-full flex items-center justify-center text-white shadow-inner relative z-10 animate-bounce">
                                    <PhoneCall size={24} />
                                </div>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 text-[9px] font-black uppercase tracking-widest mb-1">
                                    {lang === 'ar' ? 'مكالمة واردة' : 'Incoming Call'} • 00:{incomingPBXCall.timer.toString().padStart(2, '0')}
                                </span>
                                <h3 className="text-lg font-black text-main truncate pr-4">{incomingPBXCall.name || 'Unknown'}</h3>
                                <p className="text-lg text-indigo-500 font-black tracking-wider drop-shadow-sm">{incomingPBXCall.phone}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-6 relative z-10">
                            <button onClick={declinePBXCall} className="py-3 px-4 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all">
                                {lang === 'ar' ? 'رفض' : 'Decline'}
                            </button>
                            <button onClick={answerPBXCall} className="py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/30 hover:opacity-90 active:scale-95">
                                {lang === 'ar' ? 'رد' : 'Answer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== TOP HEADER ==================== */}
            <div className="bg-card/80  border-b border-border/50 px-3 py-2 shrink-0 shadow-sm z-30 relative">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-cyan-500/5 pointer-events-none" />
                <div className="max-w-[1800px] mx-auto flex items-center gap-2 md:gap-3 relative z-10 overflow-x-auto no-scrollbar">
                    
                    <button
                        onClick={handleExitToDashboard}
                        title={lang === 'ar' ? 'الخروج للوحة التحكم (Alt+Q)' : 'Exit to Dashboard (Alt+Q)'}
                        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-elevated border border-border/50 text-muted hover:text-rose-500 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all active:scale-95 shadow-sm"
                    >
                        <LayoutGrid size={16} />
                    </button>

                    {/* View Switcher */}
                    <div className="flex bg-card/50  rounded-xl p-1 border border-border/50 shadow-sm shrink-0">
                        <button
                            onClick={() => setActiveView('order')}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all duration-150 ${activeView === 'order' ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md' : 'text-muted hover:text-main'}`}
                        >
                            <Headset size={14} /> {lang === 'ar' ? '\u0637\u0644\u0628' : 'Order'}
                        </button>
                        <button
                            onClick={() => setActiveView('tracking')}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all duration-150 ${activeView === 'tracking' ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md' : 'text-muted hover:text-main'}`}
                        >
                            <Activity size={14} /> {lang === 'ar' ? '\u0645\u062a\u0627\u0628\u0639\u0629' : 'Track'}
                            {pendingCount > 0 && (
                                <span className="bg-white text-indigo-500 text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">{pendingCount}</span>
                            )}
                        </button>
                    </div>

                    {/* Dynamic Tabs For Active Held Sessions */}
                    {heldOrders.length > 0 && activeView === 'order' && (
                        <div className="hidden sm:flex items-center gap-1.5 ml-2 mr-auto overflow-x-auto no-scrollbar pl-3 border-l border-border/50">
                            {heldOrders.map((ho: any) => (
                                <div key={ho.id} className="group flex items-center relative gap-0.5">
                                    <button
                                        onClick={() => recallOrder(ho.id)}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500 hover:to-orange-500 hover:text-white text-amber-500 border border-amber-500/20 rounded-l-xl text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                            {(ho.customer?.name || ho.phone || '?').charAt(0)}
                                        </div>
                                        <span className="truncate max-w-[100px]">{ho.customer?.name || ho.phone}</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick Stats */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-card/50  border border-border/50 rounded-xl shadow-sm shrink-0 ml-auto">
                        <div className="text-center px-2 border-r border-border/50">
                            <p className="text-sm font-black text-amber-500 leading-none">{pendingCount}</p>
                            <p className="text-[8px] font-black uppercase tracking-wider text-muted">{lang === 'ar' ? 'جديد' : 'New'}</p>
                        </div>
                        <div className="text-center px-2 border-r border-border/50">
                            <p className="text-sm font-black text-cyan-500 leading-none">{preparingCount}</p>
                            <p className="text-[8px] font-black uppercase tracking-wider text-muted">{lang === 'ar' ? 'تحضير' : 'Prep'}</p>
                        </div>
                        <div className="text-center px-2 border-r border-border/50">
                            <p className="text-sm font-black text-indigo-500 leading-none">{outForDeliveryCount}</p>
                            <p className="text-[8px] font-black uppercase tracking-wider text-muted">{lang === 'ar' ? 'توصيل' : 'OFD'}</p>
                        </div>
                        <div className="text-center px-2">
                            <p className="text-sm font-black text-emerald-500 leading-none">{deliveredTodayCount}</p>
                            <p className="text-[8px] font-black uppercase tracking-wider text-muted">{lang === 'ar' ? 'تم' : 'Done'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ==================== ORDER VIEW ==================== */}
            {activeView === 'order' && (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/5 via-app to-app">
                    
                    {/* IDLE STATE: Massive Centered Search */}
                    {/* IDLE STATE: Dashboard Layout */}
                    {!selectedCustomer && !showRegistrationModal && (
                        <div className="flex-1 flex flex-col items-center justify-start p-6 lg:p-8 animate-in zoom-in-95 duration-150 overflow-y-auto custom-scrollbar">
                            <div className="w-full max-w-5xl relative z-10 flex flex-col">
                                
                                {/* Top Dashboard Header */}
                                <div className="w-full flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="relative group cursor-pointer" onClick={() => setIsCallActive(!isCallActive)}>
                                            <div className={`absolute -inset-2 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full blur-lg opacity-20 group-hover:opacity-40 transition-opacity duration-150 ${isCallActive ? 'animate-pulse opacity-50' : ''}`} />
                                            <div className={`relative w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-2xl border transition-all duration-150 ${isCallActive ? 'bg-gradient-to-br from-indigo-500 to-cyan-500 border-indigo-400 text-white' : 'bg-card/90  border-border/50 text-indigo-500 group-hover:scale-105 group-hover:-rotate-3'}`}>
                                                <PhoneCall size={28} className={isCallActive ? 'animate-bounce' : ''} />
                                            </div>
                                            {isCallActive && (
                                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-indigo-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest shadow-lg">
                                                    {formatDuration(callDuration)}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h2 className="text-2xl lg:text-3xl font-black text-main uppercase tracking-tight">
                                                {lang === 'ar' ? 'مركز الإتصال' : 'Call Center'}
                                            </h2>
                                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-0.5 hidden sm:block">
                                                {lang === 'ar' ? 'جاهز لاستقبال وتقييد الطلبات' : 'Ready to accept incoming calls'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="hidden md:flex gap-3">
                                        <button className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border/50 rounded-xl text-[10px] font-black uppercase tracking-wider text-main shadow-sm hover:border-amber-500/30 hover:text-amber-500 transition-all group">
                                            <Ticket size={14} className="text-amber-500 group-hover:scale-110 transition-transform" /> {lang === 'ar' ? 'تذاكر الدعم' : 'Support Tickets'}
                                        </button>
                                        <button onClick={openIncomingCallFromSearch} className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border/50 rounded-xl text-[10px] font-black uppercase tracking-wider text-main shadow-sm hover:border-emerald-500/30 hover:text-emerald-500 transition-all group">
                                            <MonitorPlay size={14} className="text-emerald-500 group-hover:scale-110 transition-transform" /> {lang === 'ar' ? 'استقبال اتصال' : 'Receive Call'}
                                        </button>
                                    </div>
                                </div>

                                {/* Main Search Bar Layer */}
                                <div className="w-full relative group mb-8">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-[2rem] blur opacity-20 group-focus-within:opacity-50 transition-opacity duration-150" />
                                    <div className="relative flex items-center bg-card/90  border-2 border-border/50 group-focus-within:border-indigo-500/50 rounded-[2rem] shadow-2xl p-2 transition-colors">
                                        <div className={`w-14 h-14 flex items-center justify-center shrink-0 ${lang === 'ar' ? 'order-last' : 'order-first'}`}>
                                            <Search size={24} className="text-muted group-focus-within:text-indigo-500 transition-colors" />
                                        </div>
                                        <input
                                            id="customer-search-giant"
                                            type="text"
                                            autoFocus
                                            placeholder={lang === 'ar' ? 'رقم الهاتف أو اسم العميل (F1)...' : 'Phone number or customer name (F1)...'}
                                            className={`flex-1 bg-transparent border-none outline-none text-xl lg:text-2xl font-black text-main placeholder-muted/30 px-2 ${lang === 'ar' ? 'text-right' : 'text-left'}`}
                                            value={phoneSearch}
                                            onChange={(e) => handlePhoneInputChange(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && handleCustomerSearch()}
                                            autoComplete="off"
                                        />
                                        <button onClick={handleCustomerSearch} disabled={isCustomerLookupLoading} className={`h-14 px-8 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest hover:opacity-90 transition-all shadow-lg shadow-indigo-500/25 active:scale-95 shrink-0 disabled:opacity-60 disabled:cursor-wait flex items-center gap-2 ${lang === 'ar' ? 'order-first' : 'order-last'}`}>
                                            {isCustomerLookupLoading && <RefreshCcw size={14} className="animate-spin" />}
                                            {lang === 'ar' ? 'بحث' : 'Search'}
                                        </button>
                                    </div>

                                    {/* Live Suggestions Dropdown */}
                                    {(phoneSuggestions.length > 0 || isCustomerLookupLoading || customerLookupError) && (
                                        <div className="absolute top-full left-4 right-4 mt-4 bg-card/95  border border-border/50 rounded-[2rem] shadow-2xl overflow-hidden z-50 animate-in slide-in-from-top-4 duration-150">
                                            <div className="px-6 py-4 border-b border-border/30 bg-elevated/30">
                                                <span className="text-xs font-black uppercase tracking-widest text-muted">
                                                    {isCustomerLookupLoading
                                                        ? (lang === 'ar' ? 'جاري البحث في العملاء...' : 'Searching customers...')
                                                        : customerLookupError
                                                            ? (lang === 'ar' ? 'تعذر البحث' : 'Lookup failed')
                                                            : (lang === 'ar' ? `${phoneSuggestions.length} عملاء مطابقين` : `${phoneSuggestions.length} matching customers`)}
                                                </span>
                                            </div>
                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                {customerLookupError && (
                                                    <div className="px-6 py-4 text-sm font-bold text-rose-500 bg-rose-500/10">
                                                        {customerLookupError}
                                                    </div>
                                                )}
                                                {isCustomerLookupLoading && phoneSuggestions.length === 0 && !customerLookupError && (
                                                    <div className="px-6 py-5 flex items-center gap-3 text-sm font-bold text-muted">
                                                        <RefreshCcw size={16} className="animate-spin text-indigo-500" />
                                                        {lang === 'ar' ? 'بنراجع بيانات العميل من قاعدة البيانات' : 'Checking the customer database'}
                                                    </div>
                                                )}
                                                {phoneSuggestions.map(customer => (
                                                    <button
                                                        key={customer.id}
                                                        onClick={() => selectCustomerFromSuggestion(customer)}
                                                        className="w-full flex items-center gap-5 px-6 py-4 hover:bg-indigo-500/10 transition-colors border-b border-border/20 last:border-b-0 group/item"
                                                    >
                                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 flex items-center justify-center text-indigo-500 font-black text-lg border border-indigo-500/20 shrink-0 group-hover/item:scale-110 transition-transform shadow-inner">
                                                            {customer.name?.charAt(0) || '?'}
                                                        </div>
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <p className="text-lg font-black text-main group-hover/item:text-indigo-500 transition-colors truncate">{customer.name}</p>
                                                            <p className="text-sm font-bold text-muted tracking-wider">{customer.phone}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            {customer.address && (
                                                                <p className="text-xs text-muted truncate max-w-[200px] flex items-center justify-end gap-1.5 mb-1.5">
                                                                    <MapPin size={12} className="text-indigo-400" /> {customer.address}
                                                                </p>
                                                            )}
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                                                                <Star size={10} /> {customer.visits || 0} {lang === 'ar' ? 'طلب' : 'orders'}
                                                            </span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {customerSearched && phoneSuggestions.length === 0 && !isCustomerLookupLoading && !customerLookupError && (
                                     <div className="mb-8 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] p-8 w-full animate-in fade-in zoom-in-95 text-center">
                                         <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
                                             <AlertCircle size={32} className="text-amber-500" />
                                         </div>
                                         <h3 className="text-xl font-black text-main uppercase tracking-tight mb-2">{lang === 'ar' ? 'العميل غير موجود' : 'Customer Not Found'}</h3>
                                         <p className="text-sm font-bold text-muted mb-6">{lang === 'ar' ? 'لا يوجد عميل مسجل بهذا الرقم. هل تود إضافته؟' : 'No customer registered with this number. Would you like to add them?'}</p>
                                         <button onClick={() => setShowRegistrationModal(true)} className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-[1.5rem] font-black tracking-[0.2em] text-[11px] uppercase hover:opacity-90 transition-all shadow-xl shadow-amber-500/25 active:scale-95">
                                            <UserPlus size={18} /> {lang === 'ar' ? 'تسجيل عميل جديد' : 'Register New Customer'}
                                        </button>
                                     </div>
                                )}

                                {/* Bottom Dashboard Layout */}
                                <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-8 duration-700 fill-mode-both delay-100">
                                    {/* Active Held Sessions */}
                                    <div className="bg-card/80  rounded-[2rem] p-6 border border-border/50 shadow-lg flex flex-col hover:border-indigo-500/30 transition-colors duration-150">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20 shrink-0"><Pause size={18} /></div>
                                                <div>
                                                    <h3 className="text-sm font-black text-main uppercase tracking-widest">{lang === 'ar' ? 'مكالمات معلقة' : 'Held Sessions'}</h3>
                                                    <p className="text-[10px] text-muted font-bold tracking-widest mt-0.5 hidden sm:block">{lang === 'ar' ? 'محفوظة مؤقتاً للعودة' : 'Temporarily held for recall'}</p>
                                                </div>
                                            </div>
                                            <span className="bg-elevated px-3 py-1.5 rounded-xl text-xs font-black border border-border/50 shadow-inner">{heldOrders.length}</span>
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            {heldOrders.length === 0 ? (
                                                <div className="h-32 flex flex-col items-center justify-center opacity-50 border-2 border-dashed border-border/50 rounded-2xl">
                                                    <Pause size={24} className="text-muted mb-2" />
                                                    <p className="text-xs text-muted font-black uppercase tracking-widest">{lang === 'ar' ? 'لا توجد طلبات معلقة' : 'No held sessions'}</p>
                                                </div>
                                            ) : (
                                                heldOrders.slice(0, 3).map((ho: any) => (
                                                    <div key={ho.id} className="group relative flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 p-4 rounded-[1.5rem] bg-elevated border border-border/50 hover:border-indigo-500/50 hover:shadow-lg transition-all">
                                                        <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                                                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20 shrink-0 font-black text-xs uppercase shadow-inner">
                                                                {(ho.customer?.name || ho.phone || '?').charAt(0)}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-black text-main truncate w-[150px]">{ho.customer?.name || ho.phone}</p>
                                                                <p className="text-[9px] uppercase font-bold text-muted tracking-widest mt-1 truncate">{ho.items?.length || 0} {lang === 'ar' ? 'عناصر' : 'items'} • {(ho.total || 0).toFixed(2)} {currencySymbol}</p>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => recallOrder(ho.id)} className="w-full sm:w-auto px-5 py-2.5 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 shrink-0">
                                                            {lang === 'ar' ? 'استعادة (F4)' : 'Resume'}
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Recent Callers Mock */}
                                    <div className="bg-card/80  rounded-[2rem] p-6 border border-border/50 shadow-lg flex flex-col hover:border-cyan-500/30 transition-colors duration-150 z-0">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center border border-cyan-500/20 shrink-0"><History size={18} /></div>
                                                <div>
                                                    <h3 className="text-sm font-black text-main uppercase tracking-widest">{lang === 'ar' ? 'أحدث المتصلين' : 'Recent Callers'}</h3>
                                                    <p className="text-[10px] text-muted font-bold tracking-widest mt-0.5 hidden sm:block">{lang === 'ar' ? 'سجل المكالمات الواردة السابقة' : 'Previous incoming call logs'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            {customers.length === 0 ? (
                                              <div className="h-32 flex flex-col items-center justify-center opacity-50 border-2 border-dashed border-border/50 rounded-2xl">
                                                <History size={24} className="text-muted mb-2" />
                                                <p className="text-xs text-muted font-black uppercase tracking-widest">{lang === 'ar' ? 'لا يوجد متصلين' : 'No recent calls'}</p>
                                              </div>
                                            ) : (
                                                customers.slice(0, 3).map((rc, idx) => (
                                                    <button key={idx} onClick={() => selectCustomerFromSuggestion(rc)} className="w-full flex items-center justify-between gap-4 p-4 rounded-[1.5rem] bg-elevated border border-border/50 hover:bg-card hover:border-cyan-500/50 hover:shadow-lg transition-all text-left">
                                                        <div className="flex items-center gap-3 w-full overflow-hidden">
                                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center text-cyan-500 font-black text-[10px] uppercase shrink-0 shadow-inner group-hover:scale-110 transition-transform">
                                                                {rc.name?.charAt(0) || '?'}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-black text-main truncate pr-2">{rc.name}</p>
                                                                <p className="text-[10px] uppercase font-bold text-muted tracking-widest mt-1">{rc.phone}</p>
                                                            </div>
                                                            <div className="ml-auto flex flex-col items-end gap-1.5 shrink-0">
                                                                <div className="flex items-center gap-1 bg-cyan-500/10 text-cyan-500 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-cyan-500/20">
                                                                    <Phone size={8} /> {idx === 0 ? (lang === 'ar' ? 'الآن' : 'Just now') : `${idx + 2}m`}
                                                                </div>
                                                                <span className="text-[8px] font-black text-muted uppercase tracking-widest">{rc.visits || 0} {lang === 'ar' ? 'طلب' : 'Ord'}</span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {selectedCustomer && (
                        <div className="bg-card/95  border-b border-border/50 animate-in slide-in-from-top-2 duration-150 relative z-40 shrink-0">
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-cyan-500/5 to-indigo-500/5 pointer-events-none" />

                            {/* ROW 1: Customer Identity + Quick Settings (compact single row) */}
                            <div className="max-w-[1800px] mx-auto px-4 md:px-6 pt-2 pb-1.5 flex flex-wrap lg:flex-nowrap items-center gap-2 relative z-10">

                                {/* Avatar + Name + Phone */}
                                <div className="flex items-center gap-2.5 shrink-0 w-full lg:w-auto justify-between lg:justify-start">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center font-black text-sm shadow-md">
                                            {selectedCustomer.name?.charAt(0) || 'C'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-main uppercase tracking-tight leading-none">{selectedCustomer.name}</p>
                                            <div className="text-[10px] text-muted font-bold tracking-wider flex items-center gap-2 mt-1">
                                                {selectedCustomer.phone}
                                                <span className="flex items-center gap-1 bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[8px] uppercase">
                                                    <Star size={8} /> {selectedCustomer.loyaltyTier || 'Bronze'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Action Buttons on Mobile */}
                                    <div className="flex lg:hidden items-center gap-1.5 shrink-0">
                                        <button onClick={() => setShowCustomerProfile(!showCustomerProfile)} className={`p-2 rounded-xl border transition-all ${showCustomerProfile ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-elevated text-muted hover:text-indigo-500 border-border/50'}`}>
                                            <Eye size={16} />
                                        </button>
                                        <button onClick={() => { setSelectedCustomer(null); setDeliveryAddress(''); setDeliveryPin({}); setIsCallActive(false); setCustomerSearched(false); setShowCustomerProfile(false); }} className="p-2 rounded-xl bg-elevated hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-all border border-border/50">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Address (slim) — delivery only; takeaway is branch pickup.
                                    Pinning lives in a modal so the menu keeps full height. */}
                                {orderChannel === 'DELIVERY' && (
                                <div className="flex-1 min-w-[180px]">
                                    <div className="flex items-center gap-2 bg-elevated/50 px-3 py-2 rounded-xl border border-border/50 focus-within:border-indigo-500/50 transition-colors">
                                        <MapPinned size={14} className="text-indigo-500 shrink-0" />
                                        <input
                                            id="cc-address-input"
                                            type="text"
                                            value={deliveryAddress}
                                            onChange={(e) => setDeliveryAddress(e.target.value)}
                                            className="flex-1 min-w-0 bg-transparent text-xs font-bold outline-none text-main placeholder-muted"
                                            placeholder={lang === 'ar' ? 'ادخل العنوان...' : 'Delivery address...'}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setMapModalOpen(true)}
                                            title={lang === 'ar' ? 'تثبيت النقطة على الخريطة' : 'Pin on map'}
                                            className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${deliveryPin.lat ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-amber-500/15 text-amber-600 border-amber-500/40 hover:bg-amber-500/25 animate-pulse'}`}
                                        >
                                            <Navigation size={12} />
                                            {deliveryPin.lat ? (lang === 'ar' ? 'مثبتة' : 'Pinned') : (lang === 'ar' ? 'ثبت Pin' : 'Pin')}
                                        </button>
                                    </div>
                                </div>
                                )}

                                {/* Branch & Zone Settings */}
                                <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1 lg:pb-0">
                                    {/* Channel: delivery vs takeaway — drives the branch price list */}
                                    <div className="flex items-center bg-elevated/80 rounded-xl p-1 shrink-0 border border-border/50 shadow-sm">
                                        <button
                                            onClick={() => setOrderChannel('DELIVERY')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${orderChannel === 'DELIVERY' ? 'bg-indigo-500 text-white shadow' : 'text-muted hover:text-main'}`}
                                        >
                                            <Bike size={13} /> {lang === 'ar' ? 'دليفري' : 'Delivery'}
                                        </button>
                                        <button
                                            onClick={() => setOrderChannel('TAKEAWAY')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${orderChannel === 'TAKEAWAY' ? 'bg-emerald-500 text-white shadow' : 'text-muted hover:text-main'}`}
                                        >
                                            <ShoppingBag size={13} /> {lang === 'ar' ? 'تيك أواي' : 'Takeaway'}
                                        </button>
                                    </div>
                                    {orderChannel === 'DELIVERY' && deliveryZones.length > 0 && (
                                        <div className="relative min-w-[200px] shrink-0 flex-1 lg:flex-none">
                                            <DeliveryZonePicker
                                                zones={deliveryZones}
                                                value={selectedZoneId}
                                                branchId={selectedBranchId}
                                                branches={branches}
                                                lang={lang}
                                                compact
                                                onZonesChange={setDeliveryZones}
                                                onChange={handleZonePicked}
                                                placeholder={lang === 'ar' ? 'المنطقة...' : 'Zone...'}
                                            />
                                        </div>
                                    )}
                                    <div className="relative min-w-[140px] shrink-0 flex-1 lg:flex-none group/select">
                                        <select value={selectedBranchId} onChange={(e) => handleBranchChange(e.target.value)} className="w-full bg-elevated/80 dark:bg-gray-800  rounded-xl py-2 pl-3 pr-8 text-xs font-black outline-none border border-border/50 focus:border-indigo-500/50 hover:border-indigo-500/30 text-main transition-all text-ellipsis appearance-none shadow-sm cursor-pointer">
                                            {branches.map(b => <option key={b.id} value={b.id} className="bg-card text-main font-bold py-2">{b.name}</option>)}
                                        </select>
                                        <ChevronDown size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted pointer-events-none group-hover/select:text-indigo-500 transition-colors" />
                                        {branchManualOverride && (
                                            <span className="absolute -top-2 right-2 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[8px] font-black uppercase tracking-widest shadow">
                                                {lang === 'ar' ? 'يدوي' : 'Manual'}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons on Desktop */}
                                <div className="hidden lg:flex items-center gap-1.5 shrink-0 pl-2 lg:border-l border-border/50">
                                    <button
                                        onClick={() => setShowCustomerProfile(!showCustomerProfile)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 border ${showCustomerProfile
                                            ? 'bg-indigo-500 text-white border-indigo-400 shadow-md shadow-indigo-500/20'
                                            : 'bg-elevated text-muted hover:text-indigo-500 border-border/50 hover:border-indigo-500/30'
                                            }`}
                                    >
                                        <Eye size={14} />
                                        {lang === 'ar' ? 'الملف' : 'Profile'}
                                    </button>
                                    <button onClick={() => { setSelectedCustomer(null); setDeliveryAddress(''); setDeliveryPin({}); setIsCallActive(false); setCustomerSearched(false); setShowCustomerProfile(false); }} className="p-2 rounded-xl bg-elevated hover:bg-rose-500/10 hover:border-rose-500/30 text-muted hover:text-rose-500 transition-all border border-border/50 active:scale-95">
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* ROW 2 (slim): sales channel + platform extras. One select
                                instead of 7 chips; override + external ref inline. */}
                            <div className="max-w-[1800px] mx-auto px-4 md:px-6 pb-2.5 flex flex-wrap items-center gap-2 relative z-10">
                                <div className="relative shrink-0">
                                    <select
                                        value={activeCCPlatform ? String(activeCCPlatform.id) : 'CALL'}
                                        onChange={(e) => setOrderSource(e.target.value)}
                                        className="bg-elevated/80 rounded-xl py-1.5 pl-3 pr-8 text-[11px] font-black outline-none border border-border/50 focus:border-indigo-500/50 text-main transition-all appearance-none shadow-sm cursor-pointer"
                                    >
                                        <option value="CALL" className="bg-card text-main font-bold">{lang === 'ar' ? 'مكالمة' : 'Call'}</option>
                                        {(deliveryPlatforms || []).filter((p: any) => p?.isActive !== false).map((p: any) => (
                                            <option key={p.id} value={String(p.id)} className="bg-card text-main font-bold">
                                                {p.name} • +{Number(p.priceMarkupPercentage || 0)}%
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={13} className="absolute top-1/2 -translate-y-1/2 right-2.5 text-muted pointer-events-none" />
                                </div>
                                {activeCCPlatform && (
                                    <>
                                        <input
                                            value={externalRef}
                                            onChange={(e) => setExternalRef(e.target.value)}
                                            placeholder={lang === 'ar' ? 'رقم طلب المنصة *' : 'Platform order # *'}
                                            className="w-36 bg-elevated border border-border/50 rounded-xl py-1.5 px-3 text-[11px] font-bold outline-none focus:border-indigo-500/50 text-main placeholder-muted"
                                        />
                                        <div className="flex items-center gap-1 text-[10px] font-black text-muted">
                                            <span className="hidden sm:inline">+% / +{lang === 'ar' ? 'ثابت' : 'fix'}</span>
                                            <input
                                                type="number" min={0} max={100} step={0.5}
                                                title={lang === 'ar' ? 'نسبة الهامش لهذا الطلب' : 'This order markup %'}
                                                value={markupOverride ? markupOverride.pct : configMarkupPct}
                                                        onChange={(e) => applyMarkupOverride({ pct: Number(e.target.value) })}
                                                className="w-14 bg-elevated border border-border/50 rounded-lg py-1 px-1.5 text-[11px] font-black outline-none focus:border-indigo-500/50 text-main"
                                            />
                                            <input
                                                type="number" min={0} step={0.5}
                                                title={lang === 'ar' ? 'هامش ثابت لهذا الطلب' : 'This order fixed markup'}
                                                value={markupOverride ? markupOverride.fixed : configMarkupFixed}
                                                        onChange={(e) => applyMarkupOverride({ fixed: Number(e.target.value) })}
                                                className="w-14 bg-elevated border border-border/50 rounded-lg py-1 px-1.5 text-[11px] font-black outline-none focus:border-indigo-500/50 text-main"
                                            />
                                            {markupOverride && (
                                                <button onClick={() => setMarkupOverride(null)} className="text-[9px] font-black text-muted hover:text-indigo-500 underline">
                                                    {lang === 'ar' ? 'أسعار المنصة' : 'Platform rates'}
                                                </button>
                                            )}
                                        </div>
                                        {platformSlaMins > 0 && (
                                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600">
                                                <Timer size={11} />{lang === 'ar' ? `${platformSlaMins} دقائق` : `${platformSlaMins} min`}
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* End Row 1 Details */}
                        </div>
                    )}


                    {/* Main Content - Only show if customer selected */}
                    {selectedCustomer && (
                        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 animate-in fade-in duration-150">
                            {/* Menu Area */}
                            <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
                                <div className="bg-card/60 dark:bg-gray-900/60  border-b border-border/50 flex flex-col gap-0 relative z-10 shrink-0">
                                    {/* Subheader: Search & Density filters */}
                                    <div className="w-full px-4 md:px-6 py-2 border-b border-border/30 flex items-center justify-between gap-3 bg-elevated/30">
                                        <div className="relative flex-1 md:w-[320px]">
                                            <Search className={`absolute top-1/2 -translate-y-1/2 text-muted group-focus-within:text-indigo-500 transition-colors z-10 ${lang === 'ar' ? 'right-4' : 'left-4'}`} size={16} />
                                            <input id="item-search" ref={itemSearchRef} type="text" placeholder={lang === 'ar' ? 'بحث عن صنف...' : 'Search Item...'} className={`w-full bg-white dark:bg-gray-800 border border-border/50 rounded-xl py-2 ${lang === 'ar' ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} text-sm font-bold outline-none focus:border-indigo-500/50 transition-all text-main placeholder-muted shadow-sm`} value={itemSearchQuery} onChange={(e) => setItemSearchQuery(e.target.value)} />
                                        </div>
                                        {/* Price context: which list is currently applied */}
                                        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest text-indigo-500 shrink-0">
                                            <DollarSign size={12} />
                                            {orderChannel === 'TAKEAWAY' ? (lang === 'ar' ? 'أسعار تيك أواي' : 'Takeaway prices') : (lang === 'ar' ? 'أسعار دليفري' : 'Delivery prices')}
                                            <span className="opacity-60">•</span>
                                            <span className="max-w-[140px] truncate">{branches.find((b: any) => b.id === selectedBranchId)?.name || ''}</span>
                                        </div>
                                        <div className="flex items-center bg-white dark:bg-gray-800 rounded-xl p-1 shrink-0 border border-border/50 shadow-sm">
                                            <button onClick={() => setMenuDensity('comfortable')} className={`p-1.5 rounded-lg transition-all ${menuDensity === 'comfortable' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 shadow-sm border border-indigo-500/20' : 'text-muted hover:text-main hover:bg-elevated'}`} title={lang === 'ar' ? 'ملصق' : 'Poster'}><LayoutGrid size={15} /></button>
                                            <button onClick={() => setMenuDensity('compact')} className={`p-1.5 rounded-lg transition-all ${menuDensity === 'compact' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 shadow-sm border border-indigo-500/20' : 'text-muted hover:text-main hover:bg-elevated'}`} title={lang === 'ar' ? 'دفتر' : 'Ledger'}><Rows3 size={15} /></button>
                                            <button onClick={() => setMenuDensity('ultra')} className={`p-1.5 rounded-lg transition-all ${menuDensity === 'ultra' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 shadow-sm border border-indigo-500/20' : 'text-muted hover:text-main hover:bg-elevated'}`} title={lang === 'ar' ? 'زجاجي' : 'Glass'}><Sparkles size={15} /></button>
                                            <button onClick={() => setMenuDensity('buttons')} className={`p-1.5 rounded-lg transition-all ${menuDensity === 'buttons' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 shadow-sm border border-indigo-500/20' : 'text-muted hover:text-main hover:bg-elevated'}`} title={lang === 'ar' ? 'سبليت' : 'Split'}><Ticket size={15} /></button>
                                        </div>
                                    </div>
                                    {/* Category Scrolling Row */}
                                    <div className="w-full overflow-x-auto no-scrollbar px-4 md:px-6 py-2.5">
                                        <CategoryTabs categories={categories} activeCategory={activeCategory} onSetCategory={setActiveCategory} isTouchMode={false} lang={lang} t={t} />
                                    </div>
                                </div>

                                {/* Same shell as POSItemsPanel (including the
                                    pos-items-panel scope class that carries the
                                    whole fixed-frame card tuning: equal 300px
                                    frames, clamped titles, single-line descs,
                                    hidden duplicate plus) — single bounded
                                    scroll owner (ItemGrid), no nested scroll. */}
                                <div className="pos-items-panel flex-1 min-h-0 overflow-hidden bg-transparent flex flex-col">
                                    <div className="shrink-0 px-4 pt-4">
                                        <MenuShortNotice count={shortVisibleCount} lang={lang} />
                                    </div>
                                    {isMenuLoading && categories.length === 0 ? (
                                        <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
                                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                                                {Array.from({ length: 8 }).map((_, i) => (
                                                    <div key={i} className="h-28 rounded-2xl bg-elevated/60 border border-border/30 animate-pulse" />
                                                ))}
                                            </div>
                                        </div>
                                    ) : menuError && categories.length === 0 ? (
                                        <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
                                            <div className="flex flex-col items-center justify-center text-center p-10 bg-card/20 border-2 border-dashed border-border/20 rounded-[2rem]">
                                                <AlertCircle size={36} className="text-rose-500/60 mb-4" />
                                                <h3 className="text-sm font-black text-main uppercase tracking-widest mb-2">
                                                    {lang === 'ar' ? 'تعذر تحميل المنيو' : 'Menu failed to load'}
                                                </h3>
                                                <p className="text-xs font-bold text-muted/70 max-w-[260px] mb-6">
                                                    {lang === 'ar' ? 'تحقق من الاتصال ثم أعد المحاولة' : 'Check connection and retry'}
                                                </p>
                                                <button
                                                    onClick={() => fetchMenu().catch(() => undefined)}
                                                    className="h-12 px-8 bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 active:scale-95 shadow-xl flex items-center gap-2"
                                                >
                                                    <RefreshCcw size={15} />
                                                    {lang === 'ar' ? 'إعادة التحميل' : 'Retry'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : pricedItems.length === 0 ? (
                                        <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
                                            <div className="flex flex-col items-center justify-center text-center p-10 text-muted min-h-full">
                                                <ShoppingBag size={40} className="mb-4 opacity-30" />
                                                <p className="text-sm font-black uppercase tracking-widest">
                                                    {itemSearchQuery
                                                        ? (lang === 'ar' ? `لا نتائج لـ "${itemSearchQuery}"` : `No matches for "${itemSearchQuery}"`)
                                                        : (lang === 'ar' ? 'لا توجد أصناف في المنيو' : 'No items in menu')}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 min-h-0 overflow-hidden">
                                            <ItemGrid items={pricedItems} onAddItem={handleGridAdd} onRemoveItem={handleGridRemoveOne} cartItems={cart} currencySymbol={currencySymbol} isTouchMode={Boolean((settings as any)?.isTouchMode)} density={menuDensity === 'buttons' ? 'buttons' : menuDensity === 'ultra' ? 'ultra' : menuDensity === 'compact' ? 'compact' : 'comfortable'} lang={lang} />
                                        </div>
                                    )}
                                </div>

                                {heldOrders.length > 0 && (
                                    <div className="bg-amber-500/10 border-t border-amber-500/20 px-6 py-3 shrink-0">
                                        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
                                            <div className="flex items-center gap-2 text-amber-600 shrink-0">
                                                <Pause size={16} />
                                                <span className="text-xs font-black uppercase">{lang === 'ar' ? 'معلق' : 'Held'} ({heldOrders.length})</span>
                                            </div>
                                            {heldOrders.map(order => (
                                                <button key={order.id} onClick={() => recallOrder(order.id)} className="shrink-0 flex items-center gap-2 px-4 py-2 card-primary rounded-xl border border-amber-300 dark:border-amber-800 hover:bg-amber-50 transition-all shadow-sm">
                                                    <Play size={12} className="text-amber-600" />
                                                    <span className="text-xs font-bold text-slate-700 dark:text-white">{order.customer?.name || 'Guest'}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right Panel: Cart */}
                            <div className="w-full h-[50vh] lg:h-auto lg:w-[360px] xl:w-[420px] shrink-0 bg-card/95  lg:border-l border-t lg:border-t-0 border-border flex flex-col shadow-2xl relative z-20">
                                <div className="px-5 py-4 border-b border-border/50 flex justify-between items-center shrink-0 bg-gradient-to-r from-card to-elevated">
                                    <h3 className="text-base font-black text-main uppercase tracking-widest flex items-center gap-2.5">
                                        <ShoppingBag size={18} className="text-indigo-500" /> {editingOrderId ? (lang === 'ar' ? `تعديل #${editingOrderId}` : `Editing #${editingOrderId}`) : (lang === 'ar' ? 'الطلب' : 'Current Order')}
                                    </h3>
                                    <span className="bg-indigo-500/10 text-indigo-500 px-3 py-1 rounded-full text-[10px] font-black tracking-widest border border-indigo-500/20">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
                                </div>

                                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 custom-scrollbar">
                                    <CartShortWarning items={shortCartItems} lang={lang} />
                                    {cart.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-muted/50 p-6 text-center">
                                            <ShoppingBag size={48} className="mb-4 opacity-50 text-indigo-500/20" />
                                            <p className="text-sm font-black uppercase tracking-widest text-muted">{t.empty_cart}</p>
                                            <p className="text-[10px] mt-2 font-bold opacity-60 max-w-[200px]">{lang === 'ar' ? 'حدد أصناف من القائمة لبدء الطلب للإرسال إلى المطبخ.' : 'Add items from the menu to start building the order.'}</p>
                                        </div>
                                    ) : cart.map(item => (
                                        <CartItem key={item.cartId} item={item} currencySymbol={currencySymbol} isTouchMode={false} lang={lang} onEditNote={(id, note) => { setEditingItemId(id); setNoteInput(note); }} onEditSeat={() => { }} onRemove={removeFromCart} onUpdateQuantity={updateQuantity} />
                                    ))}
                                </div>

                                {/* Checkout extras (compact): payment + schedule + flags + notes.
                                    Channel lives in the header (drives pricing). */}
                                <div className="px-4 py-2.5 border-t border-border/50 space-y-2 bg-app/50 shrink-0">
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex flex-1 items-center bg-elevated rounded-lg p-0.5 border border-border/50">
                                            {(['CASH', 'CARD', 'WALLET'] as const).map(pm => (
                                                <button key={pm} onClick={() => setPaymentMethod(pm)} className={`flex-1 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${paymentMethod === pm ? 'bg-emerald-500 text-white shadow' : 'text-muted hover:text-main'}`}>
                                                    {pm === 'CASH' ? (lang === 'ar' ? 'كاش' : 'Cash') : pm === 'CARD' ? (lang === 'ar' ? 'شبكة' : 'Card') : (lang === 'ar' ? 'محفظة' : 'Wallet')}
                                                </button>
                                            ))}
                                        </div>
                                        {orderChannel === 'DELIVERY' && (
                                            <button onClick={() => setFreeDelivery(!freeDelivery)} title={lang === 'ar' ? 'توصيل مجاني' : 'Free delivery'} className={`p-2 rounded-lg border transition-all ${freeDelivery ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-elevated text-muted border-border/50 hover:text-emerald-500'}`}>
                                                <Bike size={14} />
                                            </button>
                                        )}
                                        <button onClick={() => setUrgentFlag(!urgentFlag)} title={lang === 'ar' ? 'فوري' : 'Urgent'} className={`p-2 rounded-lg border transition-all ${urgentFlag ? 'bg-rose-500 text-white border-rose-500' : 'bg-elevated text-muted border-border/50 hover:text-rose-500'}`}>
                                            <Zap size={14} className={urgentFlag ? 'animate-pulse' : ''} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={13} className="text-muted shrink-0" />
                                        <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} title={lang === 'ar' ? 'جدولة الطلب' : 'Schedule order'} className="flex-1 min-w-0 bg-elevated border border-border/50 rounded-lg py-1.5 px-2 text-[11px] font-bold outline-none focus:border-indigo-500/50 text-main" />
                                        {scheduledFor && <button onClick={() => setScheduledFor('')} className="p-1.5 rounded-lg bg-elevated border border-border/50 text-muted hover:text-rose-500"><X size={12} /></button>}
                                        <input type="text" placeholder={lang === 'ar' ? 'ملاحظات...' : 'Notes...'} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="flex-1 min-w-0 bg-elevated border border-border/50 rounded-lg py-1.5 px-2 text-[11px] font-bold outline-none focus:border-indigo-500/50 text-main placeholder-muted" />
                                    </div>
                                </div>

                                {/* Pricing & Submit (single CTA) */}
                                <div className="px-5 py-4 bg-card/90 border-t border-border/50 relative z-20">
                                    <div className="space-y-1 mb-3">
                                        <div className="flex justify-between text-[11px] font-black tracking-widest uppercase text-muted"><span>{lang === 'ar' ? 'الإجمالي الفرعي' : 'Subtotal'}</span><span className="text-main">{subtotal.toFixed(2)}</span></div>
                                        <div className="flex justify-between items-center text-[11px] font-black tracking-widest uppercase text-muted">
                                            <span>{lang === 'ar' ? 'خصم %' : 'Discount %'}</span>
                                            <input
                                                type="number" min={0} max={100} step={0.5}
                                                value={discount}
                                                onChange={(e) => {
                                                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                                    if (v > 0 && !hasPermission(AppPermission.OP_APPLY_DISCOUNT)) {
                                                        requestManagerApproval('APPLY_DISCOUNT', () => setDiscount(v));
                                                        return;
                                                    }
                                                    setDiscount(v);
                                                }}
                                                className="w-16 bg-elevated border border-border/50 rounded-lg py-0.5 px-1.5 text-[11px] font-black outline-none focus:border-emerald-500/50 text-main text-right"
                                            />
                                        </div>
                                        {discount > 0 && <div className="flex justify-between text-[11px] font-black tracking-widest uppercase text-emerald-500"><span>{lang === 'ar' ? 'خصم' : 'Discount'} ({discount}%)</span><span>-{discountAmount.toFixed(2)}</span></div>}
                                        <div className="flex justify-between text-[11px] font-black tracking-widest uppercase text-muted"><span>{lang === 'ar' ? 'ضريبة' : 'Tax'} ({effectiveTaxRate}%)</span><span className="text-main">{tax.toFixed(2)}</span></div>
                                        <div className="flex justify-between text-[11px] font-black tracking-widest uppercase text-muted"><span>{orderChannel === 'TAKEAWAY' ? (lang === 'ar' ? 'استلام من الفرع' : 'Branch pickup') : (lang === 'ar' ? 'الدليفري' : 'Delivery')}</span><span className={freeDelivery ? 'text-emerald-500' : 'text-main'}>{freeDelivery ? (lang === 'ar' ? 'مجاني' : 'FREE') : deliveryFee.toFixed(2)}</span></div>
                                        {platformMarkupTotal > 0 && <div className="flex justify-between text-[10px] font-bold text-indigo-500"><span>{lang === 'ar' ? `شامل هامش ${activeCCPlatform?.name}` : `Incl. ${activeCCPlatform?.name} markup`}</span><span>{platformMarkupTotal.toFixed(2)}</span></div>}
                                        <div className="flex justify-between text-2xl font-black text-indigo-500 pt-2 border-t border-border/50 mt-1"><span>{lang === 'ar' ? 'الإجمالي' : 'Total'}</span><span>{total.toFixed(2)} <span className="text-sm font-bold opacity-50">{currencySymbol}</span></span></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                            <button onClick={holdCurrentOrder} disabled={cart.length === 0 || isSubmittingOrder} className="h-14 rounded-[1.2rem] font-black uppercase tracking-[0.2em] text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/30 disabled:opacity-30 disabled:pointer-events-none hover:bg-amber-500/20 transition-all flex items-center justify-center gap-2">
                                             <Pause size={16} /> {tr('تعليق (F4)', 'Hold (F4)')}
                                         </button>
                                         <button onClick={handleSubmitOrder} disabled={cart.length === 0 || isSubmittingOrder} className={`h-14 rounded-[1.2rem] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-2 transition-all ${cart.length === 0 || isSubmittingOrder ? 'bg-elevated text-muted cursor-not-allowed' : 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-xl shadow-indigo-500/25 hover:opacity-90 active:scale-95'}`}>
                                              {isSubmittingOrder ? <RefreshCcw size={16} className="animate-spin" /> : (editingOrderId ? tr('حفظ التعديل', 'Save edit') : tr('إرسال (F3)', 'Send (F3)'))} <ArrowRight size={16} />
                                         </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ROW 2: Customer Profile - Side Drawer Overlay MUST BE RENDERED OUTSIDE ANY TRANSFORM SO FIXED POSITION WORK */}
                    {showCustomerProfile && selectedCustomer && (
                        <div className="fixed inset-0 z-[100] flex justify-end animate-in fade-in duration-200">
                            <div className="absolute inset-0 bg-black/40 " onClick={() => setShowCustomerProfile(false)} />
                            <div className="relative w-full max-w-[480px] h-full bg-white dark:bg-gray-900 border-l border-border flex flex-col animate-in slide-in-from-right duration-150 shadow-2xl">
                                <div className="px-6 py-5 border-b border-border/50 flex items-center justify-between shrink-0 bg-gray-50 dark:bg-gray-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center font-black text-xl shadow-lg">
                                            {selectedCustomer.name?.charAt(0) || 'C'}
                                        </div>
                                        <div>
                                            <p className="text-base font-black text-main uppercase">{selectedCustomer.name}</p>
                                            <p className="text-xs text-muted font-bold tracking-wider">{selectedCustomer.phone}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowCustomerProfile(false)} className="p-2.5 rounded-xl bg-elevated hover:bg-rose-500/10 hover:border-rose-500/30 text-muted hover:text-rose-500 transition-all border border-border/50">
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                                    <div className="bg-elevated/50 rounded-2xl border border-border/50 p-4 space-y-2.5">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted flex items-center gap-2 mb-3">
                                            <User size={13} /> {lang === 'ar' ? 'بيانات العميل' : 'Customer Details'}
                                        </h4>
                                        {[
                                            { label: lang === 'ar' ? 'الهاتف' : 'Phone', value: selectedCustomer.phone },
                                            { label: lang === 'ar' ? 'الإيميل' : 'Email', value: selectedCustomer.email || '-' },
                                            { label: lang === 'ar' ? 'ملاحظات' : 'Notes', value: selectedCustomer.notes || '-' },
                                            { label: lang === 'ar' ? 'عدد الطلبات' : 'Total Orders', value: String(selectedCustomer.visits || customerOrders.length) },
                                        ].map(row => (
                                            <div key={row.label} className="flex justify-between items-start gap-3 text-xs">
                                                <span className="text-muted font-bold shrink-0">{row.label}</span>
                                                <span className="font-black text-main text-right truncate max-w-[200px]">{row.value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Saved delivery addresses (real, from customerAddresses) */}
                                    <div className="bg-elevated/50 rounded-2xl border border-border/50 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500 flex items-center gap-2">
                                                <MapPin size={13} /> {lang === 'ar' ? 'عناوين التوصيل' : 'Delivery Addresses'}
                                                {isLoadingAddresses && <RefreshCcw size={11} className="animate-spin" />}
                                            </h4>
                                            <button onClick={() => { void saveCurrentAsAddress(); }} className="text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 transition-colors">
                                                {lang === 'ar' ? '+ حفظ الحالي' : '+ Save current'}
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {profileAddresses.length === 0 && !isLoadingAddresses && (
                                                <p className="text-[10px] font-bold text-muted text-center py-2">
                                                    {lang === 'ar' ? 'لا عناوين محفوظة — احفظ العنوان الحالي بزر + حفظ الحالي' : 'No saved addresses — save the current one with + Save current'}
                                                </p>
                                            )}
                                            {profileAddresses.map((addr: any) => {
                                                const key = String(addr.id ?? addr.address);
                                                const active = deliveryAddress && addr.address && deliveryAddress.trim() === String(addr.address).trim();
                                                const label = String(addr.label || '');
                                                const icon = /work|عمل/i.test(label) ? <Briefcase size={14} /> : /home|منزل|house/i.test(label) ? <Home size={14} /> : <MapPin size={14} />;
                                                return (
                                                    <button
                                                        key={key}
                                                        onClick={() => applyProfileAddress(addr)}
                                                        className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left ${active ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm' : 'bg-card border-border/50 hover:border-cyan-500/20'}`}
                                                    >
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${active ? 'bg-cyan-500 text-white shadow-sm' : 'bg-elevated text-muted'}`}>
                                                            {icon}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-black text-main">{addr.label || (lang === 'ar' ? 'عنوان' : 'Address')}</p>
                                                            <p className="text-[10px] text-muted font-bold truncate mt-0.5">{addr.address}</p>
                                                        </div>
                                                        {active && <div className="w-2 h-2 rounded-full bg-cyan-500 shrink-0 mt-3 shadow-sm" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="bg-elevated/50 rounded-2xl border border-border/50 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 flex items-center gap-2">
                                                <ShoppingBag size={13} /> {lang === 'ar' ? 'آخر طلب' : 'Last Order'}
                                            </h4>
                                             {customerOrders[0] && (
                                                 <span className="text-[9px] font-bold text-muted">{getOrderCreatedAt(customerOrders[0]).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                        {customerOrders[0] ? (
                                            <div className="space-y-2">
                                                <div className="space-y-1.5 max-h-[200px] overflow-y-auto no-scrollbar">
                                                    {(customerOrders[0].items || []).map((item: any, idx: number) => (
                                                        <div key={idx} className="flex items-center justify-between px-3 py-2 bg-card/80 rounded-xl border border-border/30">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[10px] font-black ${(item.quantity || 1) > 1 ? 'bg-indigo-500/20 text-indigo-500' : 'bg-slate-500/10 text-muted'}`}>{item.quantity || 1}</span>
                                                                <span className="text-xs font-bold text-main truncate">{item.name}</span>
                                                            </div>
                                                            <span className="text-xs font-black text-muted tabular-nums shrink-0">{((item.price || 0) * (item.quantity || 1)).toFixed(0)} {currencySymbol}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
                                                    <span className="text-base font-black text-indigo-500 tabular-nums">{(customerOrders[0] as any).total?.toFixed(2) || '?'} {currencySymbol}</span>
                                                </div>
                                                <button onClick={() => { reorderFromHistory(customerOrders[0]); setShowCustomerProfile(false); }} className="w-full py-2.5 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2">
                                                    <RefreshCcw size={13} /> {lang === 'ar' ? 'إعادة نفس الطلب' : 'Re-order Same Items'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="py-6 text-center text-muted">
                                                <ShoppingBag size={28} className="mx-auto mb-2 opacity-30" />
                                                <p className="text-xs font-bold">{lang === 'ar' ? 'لا يوجد طلبات سابقة' : 'No previous orders'}</p>
                                            </div>
                                        )}
                                    </div>
                                    {customerOrders.length > 1 && (
                                        <div className="bg-elevated/50 rounded-2xl border border-border/50 p-4">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
                                                <History size={12} /> {lang === 'ar' ? 'سجل الطلبات' : 'Order History'}
                                            </h4>
                                            <div className="space-y-1.5">
                                                {customerOrders.slice(1).map(order => (
                                                    <button key={order.id} onClick={() => { reorderFromHistory(order); setShowCustomerProfile(false); }} className="w-full flex items-center justify-between px-3 py-2.5 bg-card/80 rounded-xl border border-border/30 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all active:scale-95 group">
                                                        <div className="text-left">
                                                            <p className="text-[10px] font-black text-main">{(order.items?.length || 0)} {lang === 'ar' ? 'صنف' : 'items'} · {(order as any).total?.toFixed(0) || '?'} {currencySymbol}</p>
                                                             <p className="text-[8px] font-bold text-muted">{getOrderCreatedAt(order).toLocaleDateString()}</p>
                                                        </div>
                                                        <RefreshCcw size={12} className="text-muted group-hover:text-indigo-500 transition-colors" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="px-5 py-4 border-t border-border/50 space-y-2 shrink-0 bg-card/95">
                                    <button onClick={() => setShowCustomerProfile(false)} className="w-full py-3 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:opacity-90 transition-all active:scale-95 flex items-center justify-center gap-2">
                                        <ShoppingBag size={14} /> {lang === 'ar' ? 'بدء طلب' : 'Start New Order'}
                                    </button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => { void syncCustomerAddress(); }} className="py-2.5 bg-elevated border border-border/50 text-muted hover:text-indigo-500 hover:border-indigo-500/30 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                            <Edit3 size={12} /> {lang === 'ar' ? 'حفظ العنوان' : 'Save address'}
                                        </button>
                                        <button onClick={() => { handlePrintCustomerReport(); setShowCustomerProfile(false); }} className="py-2.5 bg-elevated border border-border/50 text-muted hover:text-emerald-500 hover:border-emerald-500/30 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                            <Printer size={12} /> {lang === 'ar' ? 'طباعة' : 'Print'}
                                        </button>
                                        <button onClick={() => { showToast(lang === 'ar' ? 'تم فتح تذكرة دعم' : 'Ticket opened successfully', 'success'); setShowCustomerProfile(false); }} className="col-span-2 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-600 hover:bg-amber-500 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-sm">
                                            <Ticket size={12} /> {lang === 'ar' ? 'فتح تذكرة دعم (CRM)' : 'Open CRM Ticket'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ==================== TRACKING VIEW ==================== */}
            {activeView === 'tracking' && (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative z-10">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 pointer-events-none" />

                    {/* Filters Bar */}
                    <div className="bg-card/80  px-8 py-5 border-b border-border/50 flex flex-wrap items-center gap-4 relative z-20 shadow-sm shrink-0">
                        <div className="flex bg-elevated rounded-[1.5rem] p-1.5 border border-border/50 shadow-inner">
                            {[
                                { value: 'all', label: lang === 'ar' ? 'الكل' : 'All', count: callCenterOrders.length },
                                { value: OrderStatus.SCHEDULED, label: lang === 'ar' ? 'مجدول' : 'Sched', count: callCenterOrders.filter(o => o.status === OrderStatus.SCHEDULED).length },
                                { value: OrderStatus.PENDING, label: lang === 'ar' ? 'جديد' : 'New', count: pendingCount },
                                { value: OrderStatus.PREPARING, label: lang === 'ar' ? 'تحضير' : 'Prep', count: preparingCount },
                                { value: OrderStatus.READY, label: lang === 'ar' ? 'جاهز' : 'Ready', count: callCenterOrders.filter(o => o.status === OrderStatus.READY).length },
                                { value: OrderStatus.OUT_FOR_DELIVERY, label: lang === 'ar' ? 'توصيل' : 'OFD', count: outForDeliveryCount },
                                { value: OrderStatus.DELIVERED, label: lang === 'ar' ? 'تم' : 'Done', count: callCenterOrders.filter(o => o.status === OrderStatus.DELIVERED).length },
                            ].map(f => (
                                <button key={f.value} onClick={() => setTrackingFilter(f.value as any)} className={`px-5 py-2.5 rounded-[1.2rem] text-[10px] md:text-xs font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 ${trackingFilter === f.value ? 'bg-indigo-500 text-white shadow-md' : 'text-muted hover:text-main'}`}>
                                    {f.label}
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest ${trackingFilter === f.value ? 'bg-elevated/70 text-white' : 'bg-card text-muted'}`}>{f.count}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex-1" />

                        <div className="relative">
                            <Search size={15} className={`absolute top-1/2 -translate-y-1/2 text-muted ${lang === 'ar' ? 'right-3' : 'left-3'}`} />
                            <input
                                value={trackingSearch}
                                onChange={(e) => setTrackingSearch(e.target.value)}
                                placeholder={lang === 'ar' ? 'بحث برقم/هاتف/منصة...' : 'Search id/phone/platform...'}
                                className={`bg-elevated rounded-[1.2rem] py-3 px-4 text-xs font-bold outline-none border border-border/50 focus:border-indigo-500/50 text-main placeholder-muted shadow-sm w-48 ${lang === 'ar' ? 'pr-9' : 'pl-9'}`}
                            />
                        </div>

                        <select value={trackingBranch} onChange={(e) => setTrackingBranch(e.target.value)} className="bg-elevated rounded-[1.2rem] py-3.5 px-5 text-sm font-bold outline-none border border-border/50 focus:border-indigo-500/50 text-main transition-colors shadow-sm">
                            <option value="all">{lang === 'ar' ? 'كل الفروع' : 'All Branches'}</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>

                        <div className="flex bg-elevated rounded-[1.5rem] p-1.5 border border-border/50 shadow-inner">
                            <button onClick={() => setTrackingView('grid')} className={`p-3 rounded-[1.2rem] transition-all ${trackingView === 'grid' ? 'bg-card shadow-sm text-indigo-500 scale-105' : 'text-muted hover:text-main hover:bg-card/50'}`}><LayoutGrid size={18} /></button>
                            <button onClick={() => setTrackingView('list')} className={`p-3 rounded-[1.2rem] transition-all ${trackingView === 'list' ? 'bg-card shadow-sm text-indigo-500 scale-105' : 'text-muted hover:text-main hover:bg-card/50'}`}><List size={18} /></button>
                        </div>
                    </div>

                    {/* Orders Grid/List */}
                    <div className="flex-1 overflow-y-auto p-6 no-scrollbar relative z-20">
                        {filteredTrackingOrders.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted">
                                <Package size={64} className="mb-6 opacity-20" />
                                <p className="text-xl font-black uppercase tracking-widest">{lang === 'ar' ? 'لا توجد طلبات' : 'No orders found'}</p>
                            </div>
                        ) : trackingView === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                                {filteredTrackingOrders.map(order => (
                                    <div key={order.id} className={`bg-card/50  rounded-[2.5rem] border p-6 hover:-translate-y-1 hover:shadow-2xl transition-all duration-150 relative overflow-hidden group ${order.isUrgent ? 'border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/20' : 'border-border/50 shadow-sm hover:border-indigo-500/30'}`}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none rounded-[2.5rem]" />

                                        {/* Status Glow Overlay */}
                                        <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none ${order.status === OrderStatus.READY ? 'bg-indigo-500' : order.status === OrderStatus.PENDING ? 'bg-amber-500' : 'bg-transparent'}`} />
                                        <div className="flex justify-between items-start mb-4 relative z-10">
                                            <div>
                                                <p className="text-sm font-black text-indigo-500">#{order.id}</p>
                                                 <p className="text-[10px] font-bold text-muted mt-1 uppercase tracking-widest">{getOrderCreatedAt(order).toLocaleTimeString()}</p>
                                            </div>
                                            <OrderStatusBadge status={order.status} lang={lang} />
                                        </div>

                                        <div className="space-y-3 mb-5 relative z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shrink-0"><User size={14} className="text-indigo-500" /></div>
                                             <span className="text-sm font-black text-main">{getOrderCustomerName(order)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shrink-0"><Phone size={14} className="text-cyan-500" /></div>
                                                 <span className="text-xs font-bold text-muted">{getOrderCustomerPhone(order)}</span>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0 mt-0.5"><MapPin size={14} className="text-emerald-500" /></div>
                                                 <span className="text-xs font-bold text-muted line-clamp-2 pt-1.5">{getOrderDeliveryAddress(order)}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-4 border-t border-border/50 relative z-10">
                                            <div className="flex items-center gap-2 bg-elevated px-3 py-1.5 rounded-xl border border-border/50">
                                                <Building2 size={12} className="text-muted" />
                                                 <span className="text-[10px] font-black uppercase tracking-widest text-muted">{branches.find(b => b.id === getOrderBranchId(order))?.name || '-'}</span>
                                             </div>
                                             <button
                                                onClick={() => { void printTrackingReceipt(order); }}
                                                title={lang === 'ar' ? 'طباعة الإيصال' : 'Print receipt'}
                                                className="p-2 rounded-xl bg-elevated border border-border/50 text-muted hover:text-emerald-500 hover:border-emerald-500/30 transition-all active:scale-95"
                                            >
                                                <Printer size={14} />
                                            </button>
                                             <span className="text-xl font-black text-main">{Number(order.total || 0).toFixed(2)} <span className="text-[10px] tracking-widest opacity-50">{currencySymbol}</span></span>
                                        </div>

                                        {order.isUrgent && (
                                            <div className="mt-4 flex items-center justify-center gap-2 text-rose-500 bg-rose-500/10 py-2 rounded-xl border border-rose-500/20 relative z-10">
                                                <Zap size={14} className="animate-pulse" />
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{lang === 'ar' ? 'عاجل' : 'Urgent'}</span>
                                            </div>
                                        )}
                                        {/* Action Buttons — branch follows by consequence:
                                            dispatch/deliver advance, edit reloads PENDING
                                            into the builder, cancel voids + notifies. */}
                                        <div className="mt-4 flex gap-2 relative z-10">
                                            {order.status === OrderStatus.READY && (
                                                <button
                                                    onClick={() => { setSelectedTrackingOrder(order); setShowDriverModal(true); }}
                                                    className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 active:scale-95 transition-all shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2"
                                                >
                                                    <Truck size={14} /> {lang === 'ar' ? 'تعيين مندوب' : 'Dispatch'}
                                                </button>
                                            )}
                                            {order.status === OrderStatus.OUT_FOR_DELIVERY && (
                                                <button
                                                    onClick={async () => {
                                                        if (orderNeedsDriver(order)) {
                                                            showToast(lang === 'ar' ? 'عين طيار أولاً — ممنوع إغلاق توصيل داخلي بدون طيار مسؤول' : 'Assign a driver first — in-house delivery cannot close without a driver', 'warning');
                                                            return;
                                                        }
                                                        try {
                                                            await updateOrderStatus(order.id, OrderStatus.DELIVERED);
                                                            showToast(lang === 'ar' ? 'تم تأكيد التوصيل' : 'Delivery confirmed', 'success');
                                                            await fetchOrders();
                                                        } catch (e) {
                                                            showToast(getActionableErrorMessage(e, lang), 'error');
                                                        }
                                                    }}
                                                    className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 active:scale-95 transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle size={14} /> {lang === 'ar' ? 'تم التوصيل' : 'Delivered'}
                                                </button>
                                            )}
                                            {order.status === OrderStatus.OUT_FOR_DELIVERY && (
                                                <button
                                                    onClick={() => { setSelectedTrackingOrder(order); setShowDriverModal(true); }}
                                                    title={lang === 'ar' ? 'إعادة تعيين طيار' : 'Reassign driver'}
                                                    className="flex-1 py-3 bg-cyan-500/10 text-cyan-600 border border-cyan-500/30 rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-cyan-500 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Truck size={14} /> {lang === 'ar' ? 'طيار' : 'Driver'}
                                                </button>
                                            )}
                                            {[OrderStatus.PENDING, OrderStatus.SCHEDULED].includes(order.status) && isCallCenterOrderRecord(order) && (
                                                <button
                                                    onClick={() => { if (!canModifyCCOrder(order)) { showToast(lang === 'ar' ? 'الطلب يخص موظف آخر \u2014 التعديل للمشرف' : 'Order belongs to another agent \u2014 managers only', 'warning'); return; } startEditOrder(order); }}
                                                    title={lang === 'ar' ? 'تعديل الأصناف قبل بدء التحضير' : 'Edit items before preparation starts'}
                                                    className="flex-1 py-3 bg-indigo-500/10 text-indigo-500 border border-indigo-500/30 rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-500 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Edit3 size={14} /> {lang === 'ar' ? 'تعديل' : 'Edit'}
                                                </button>
                                            )}
                                            {![OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status) && (
                                                <button
                                                    onClick={() => { if (!canModifyCCOrder(order)) { showToast(lang === 'ar' ? 'الطلب يخص موظف آخر — الإلغاء للمشرف' : 'Order belongs to another agent — managers only', 'warning'); return; } setCancelTarget(order); setCancelReason(''); }}
                                                    title={lang === 'ar' ? 'إلغاء الطلب (يلغي في المطبخ والفرع)' : 'Cancel order (cancels in kitchen and branch)'}
                                                    className="flex-1 py-3 bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-rose-500 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Ban size={14} /> {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-3 relative z-10">
                                {filteredTrackingOrders.map(order => (
                                    <div key={order.id} className={`bg-card/50  rounded-[2rem] border p-5 flex items-center gap-6 hover:-translate-y-1 hover:shadow-2xl transition-all duration-150 overflow-hidden relative group ${order.isUrgent ? 'border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/20' : 'border-border/50 shadow-sm hover:border-indigo-500/30'}`}>
                                        <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent pointer-events-none rounded-[2rem]" />
                                        <div className="w-24 relative z-10">
                                            <p className="text-sm font-black text-indigo-500">#{order.id}</p>
                                                 <p className="text-[10px] font-bold text-muted mt-0.5 uppercase tracking-widest">{getOrderCreatedAt(order).toLocaleTimeString()}</p>
                                        </div>
                                        <div className="flex-1 relative z-10">
                                             <p className="text-sm font-black text-main">{getOrderCustomerName(order)}</p>
                                             <p className="text-xs font-bold text-muted truncate">{getOrderDeliveryAddress(order)}</p>
                                        </div>
                                        <div className="text-center relative z-10">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">{lang === 'ar' ? 'الفرع' : 'Branch'}</p>
                                             <p className="text-xs font-bold text-main">{branches.find(b => b.id === getOrderBranchId(order))?.name || '-'}</p>
                                        </div>
                                        <div className="relative z-10">
                                            <OrderStatusBadge status={order.status} lang={lang} />
                                        </div>
                                        {order.status === OrderStatus.READY && (
                                            <button
                                                onClick={() => { setSelectedTrackingOrder(order); setShowDriverModal(true); }}
                                                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 active:scale-95 transition-all shadow-xl shadow-indigo-500/25 relative z-10"
                                            >
                                                 {tr('تعيين مندوب', 'Dispatch')}
                                            </button>
                                        )}
                                        {order.status === OrderStatus.OUT_FOR_DELIVERY && (
                                            <button
                                                onClick={async () => {
                                                    if (orderNeedsDriver(order)) {
                                                        showToast(lang === 'ar' ? 'عين طيار أولاً — ممنوع إغلاق توصيل داخلي بدون طيار مسؤول' : 'Assign a driver first — in-house delivery cannot close without a driver', 'warning');
                                                        return;
                                                    }
                                                    try {
                                                        await updateOrderStatus(order.id, OrderStatus.DELIVERED);
                                                        showToast(lang === 'ar' ? 'تم تأكيد التوصيل' : 'Delivery confirmed', 'success');
                                                        await fetchOrders();
                                                    } catch (e: any) {
                                                        showToast(getActionableErrorMessage(e, lang), 'error');
                                                    }
                                                }}
                                                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 active:scale-95 transition-all shadow-xl shadow-emerald-500/25 relative z-10 flex items-center gap-2"
                                            >
                                                <CheckCircle size={12} /> {lang === 'ar' ? 'تم التوصيل' : 'Delivered'}
                                            </button>
                                        )}
                                        {[OrderStatus.PENDING, OrderStatus.SCHEDULED].includes(order.status) && isCallCenterOrderRecord(order) && (
                                            <button
                                                onClick={() => { if (!canModifyCCOrder(order)) { showToast(lang === 'ar' ? 'الطلب يخص موظف آخر — التعديل للمشرف' : 'Order belongs to another agent — managers only', 'warning'); return; } startEditOrder(order); }}
                                                title={lang === 'ar' ? 'تعديل الأصناف قبل بدء التحضير' : 'Edit items before preparation starts'}
                                                className="px-5 py-3 bg-indigo-500/10 text-indigo-500 border border-indigo-500/30 rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-500 hover:text-white active:scale-95 transition-all relative z-10 flex items-center gap-2"
                                            >
                                                <Edit3 size={12} /> {lang === 'ar' ? 'تعديل' : 'Edit'}
                                            </button>
                                        )}
                                        {![OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status) && (
                                            <button
                                                onClick={() => { if (!canModifyCCOrder(order)) { showToast(lang === 'ar' ? 'الطلب يخص موظف آخر — الإلغاء للمشرف' : 'Order belongs to another agent — managers only', 'warning'); return; } setCancelTarget(order); setCancelReason(''); }}
                                                title={lang === 'ar' ? 'إلغاء الطلب (يلغي في المطبخ والفرع)' : 'Cancel order (cancels in kitchen and branch)'}
                                                className="px-5 py-3 bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-rose-500 hover:text-white active:scale-95 transition-all relative z-10 flex items-center gap-2"
                                            >
                                                <Ban size={12} /> {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                            </button>
                                        )}
                                        <p className="text-2xl font-black text-main w-36 text-right relative z-10">
                                             {Number(order.total || 0).toFixed(2)} <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{currencySymbol}</span>
                                        </p>
                                        <button
                                            onClick={() => { void printTrackingReceipt(order); }}
                                            title={lang === 'ar' ? 'طباعة الإيصال' : 'Print receipt'}
                                            className="p-2.5 rounded-xl bg-elevated border border-border/50 text-muted hover:text-emerald-500 hover:border-emerald-500/30 transition-all active:scale-95 relative z-10"
                                        >
                                            <Printer size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modals */}
            <InlineCustomerRegistration
                isOpen={showRegistrationModal}
                onClose={() => setShowRegistrationModal(false)}
                initialPhone={phoneSearch}
                onSave={handleSaveNewCustomer}
                lang={lang}
                zones={deliveryZones || []}
                branchId={selectedBranchId}
                branches={branches}
                onZonesChange={setDeliveryZones}
            />

            {/* Map modal: full-size pinning (search + coords/Maps URL/Plus Code).
                Auto-opens for a new delivery customer without a pin. */}
            {mapModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setMapModalOpen(false)} />
                    <div className="relative w-full max-w-3xl max-h-[90dvh] overflow-y-auto custom-scrollbar bg-card rounded-[1.5rem] border border-border/50 shadow-2xl animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/50 sticky top-0 bg-card z-10">
                            <div>
                                <h3 className="text-sm font-black text-main uppercase tracking-widest">
                                    {lang === 'ar' ? 'تثبيت عنوان التوصيل' : 'Pin delivery address'}
                                </h3>
                                <p className="text-[10px] font-bold text-muted mt-0.5">
                                    {deliveryAddress || (lang === 'ar' ? 'ابحث أو الصق إحداثيات / رابط خرائط' : 'Search or paste coordinates / maps link')}
                                </p>
                            </div>
                            <span className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${deliveryPin.lat ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}`}>
                                {deliveryPin.lat ? (lang === 'ar' ? 'مثبتة' : 'Pinned') : (lang === 'ar' ? 'بدون Pin' : 'No pin')}
                            </span>
                        </div>
                        <div className="p-4">
                            <AddressMapPicker
                                lang={lang}
                                mapHeightClass="min-h-[340px]"
                                value={{ address: deliveryAddress, lat: deliveryPin.lat, lng: deliveryPin.lng, label: deliveryPin.label }}
                                onChange={(pin) => {
                                    setDeliveryAddress(pin.address);
                                    setDeliveryPin({ lat: pin.lat, lng: pin.lng, label: pin.label });
                                }}
                            />
                        </div>
                        <div className="px-5 pb-5 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setMapModalOpen(false)}
                                className="flex-1 py-3 rounded-xl border border-border/50 bg-elevated text-muted font-black tracking-[0.15em] text-[10px] uppercase hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/50 transition-all active:scale-95"
                            >
                                {deliveryPin.lat ? (lang === 'ar' ? 'تم' : 'Done') : (lang === 'ar' ? 'تخطي — عنوان نصي' : 'Skip — text only')}
                            </button>
                            {deliveryPin.lat && (
                                <button
                                    type="button"
                                    onClick={() => { setMapModalOpen(false); document.getElementById('item-search')?.focus(); }}
                                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-black tracking-[0.15em] text-[10px] uppercase hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-indigo-500/25"
                                >
                                    {lang === 'ar' ? 'متابعة للأصناف' : 'Continue to items'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel modal: reason is mandatory (server policy) and travels
                to the branch + kitchen + customer WhatsApp by consequence. */}
            {cancelTarget && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-black/60" onClick={() => !isCancelling && setCancelTarget(null)} />
                    <div className="relative w-full max-w-md bg-card rounded-[1.5rem] border border-border/50 shadow-2xl p-6 animate-in zoom-in-95 duration-150">
                        <h3 className="text-base font-black text-main uppercase tracking-widest flex items-center gap-2">
                            <Ban size={18} className="text-rose-500" />
                            {lang === 'ar' ? `إلغاء الطلب #${cancelTarget.id}` : `Cancel order #${cancelTarget.id}`}
                        </h3>
                        <p className="text-[11px] font-bold text-muted mt-1.5 leading-5">
                            {lang === 'ar'
                                ? 'الإلغاء يسمع في المطبخ والفرع والطيار والعميل تلقائياً. الطلبات التي بدأ الفرع تحضيرها تُلغى من شاشة الفرع.'
                                : 'Cancellation propagates to kitchen, branch, driver and customer automatically. Orders the branch started must be cancelled at the branch.'}
                        </p>
                        <textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            rows={3}
                            autoFocus
                            placeholder={lang === 'ar' ? 'سبب الإلغاء * (يظهر للفرع)...' : 'Cancellation reason * (visible to branch)...'}
                            className="mt-4 w-full bg-elevated border border-border/50 rounded-xl p-3 text-sm font-bold outline-none focus:border-rose-500/50 text-main placeholder-muted resize-none"
                        />
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button
                                onClick={() => !isCancelling && setCancelTarget(null)}
                                disabled={isCancelling}
                                className="py-3 rounded-xl border border-border/50 bg-elevated text-muted font-black tracking-[0.15em] text-[10px] uppercase hover:bg-rose-500/10 hover:text-rose-500 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {lang === 'ar' ? 'تراجع' : 'Back'}
                            </button>
                            <button
                                onClick={() => { void confirmCancelOrder(); }}
                                disabled={isCancelling || !cancelReason.trim()}
                                className="py-3 rounded-xl bg-rose-500 text-white font-black tracking-[0.15em] text-[10px] uppercase hover:bg-rose-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isCancelling ? <RefreshCcw size={14} className="animate-spin" /> : <Ban size={14} />}
                                {lang === 'ar' ? 'تأكيد الإلغاء' : 'Confirm cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset confirm: Esc/F5 never wipe a live order silently. */}
            {confirmingReset && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmingReset(false)} />
                    <div className="relative w-full max-w-sm bg-card rounded-[1.5rem] border border-border/50 shadow-2xl p-6 animate-in zoom-in-95 duration-150">
                        <h3 className="text-base font-black text-main uppercase tracking-widest">
                            {lang === 'ar' ? 'مسح الطلب الحالي؟' : 'Discard current order?'}
                        </h3>
                        <p className="text-[11px] font-bold text-muted mt-1.5">
                            {lang === 'ar' ? 'سيتم مسح العميل والسلة. استخدم تعليق (F4) للاحتفاظ به.' : 'Customer and cart will be cleared. Use Hold (F4) to keep it.'}
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button onClick={() => setConfirmingReset(false)} className="py-3 rounded-xl border border-border/50 bg-elevated text-main font-black tracking-[0.15em] text-[10px] uppercase hover:border-indigo-500/40 transition-all active:scale-95">
                                {lang === 'ar' ? 'تراجع' : 'Back'}
                            </button>
                            <button onClick={() => { setConfirmingReset(false); resetOrder(); }} className="py-3 rounded-xl bg-rose-500 text-white font-black tracking-[0.15em] text-[10px] uppercase hover:bg-rose-600 transition-all active:scale-95">
                                {lang === 'ar' ? 'مسح' : 'Discard'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DriverAssignmentModal
                isOpen={showDriverModal}
                onClose={() => setShowDriverModal(false)}
                onAssign={async (driverId, driverName) => {
                    if (!selectedTrackingOrder?.id) return;
                    await deliveryApi.assign({ orderId: selectedTrackingOrder.id, driverId });
                    await fetchOrders();
                    // Driver ticket (شيك الطيار) — non-blocking, assignment succeeded.
                    try {
                        const ticketBranchId = getOrderBranchId(selectedTrackingOrder);
                        await printDriverTicket({
                            order: selectedTrackingOrder,
                            driverName: driverName || (lang === 'ar' ? 'طيار' : 'Driver'),
                            printers,
                            branchId: ticketBranchId,
                            settings,
                            currencySymbol: settings.currencySymbol,
                            lang,
                            branch: branches.find(b => b.id === ticketBranchId),
                        });
                    } catch {
                        showToast(lang === 'ar' ? 'تم التعيين لكن تعذرت طباعة شيك الطيار' : 'Assigned, but the driver ticket failed to print', 'warning');
                    }
                }}
                branchId={selectedTrackingOrder ? getOrderBranchId(selectedTrackingOrder) : ''}
                orderId={selectedTrackingOrder?.id}
                lang={lang}
            />

            <NoteModal
                isOpen={!!editingItemId}
                onClose={() => setEditingItemId(null)}
                note={noteInput}
                onNoteChange={setNoteInput}
                onSave={() => { if (editingItemId) updateCartItemNotes(editingItemId, noteInput); setEditingItemId(null); }}
                lang={lang}
                t={t}
            />

            <ManagerApprovalModal
                isOpen={showApprovalModal}
                onClose={() => { setShowApprovalModal(false); setApprovalCallback(null); }}
                onApproved={() => approvalCallback?.fn()}
                actionName={approvalCallback?.action || 'Operation Authorization'}
            />

            {/* Sizes / modifiers / open price — same modal as the POS cashier,
                with the same silent platform markup (open/weighted exempt). */}
            <ItemOptionsModal
                isOpen={!!optionItem}
                item={optionItem}
                onClose={() => setOptionItem(null)}
                onConfirm={handleConfirmItemOptions}
                currencySymbol={currencySymbol}
                lang={lang}
                platformMarkup={platformMarkup}
            />
        </div>
    );
};

export default CallCenter;

