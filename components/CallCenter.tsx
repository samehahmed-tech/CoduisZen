
import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
    ChevronUp,
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
    List,
    Activity,
    Printer,
    FileText,
    CreditCard,
    Grip,
    Rows,
    Ticket,
    MonitorPlay,
    Briefcase
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
import { hasCashierPrinterConfigured, printKitchenTicketsByRouting, printOrderReceipt } from '../services/posPrintOrchestrator';
import { getActionableErrorMessage } from '../services/api/core';
import { deliveryApi } from '../services/api/delivery';
import { customersApi } from '../services/api/customers';
import { useToast } from './Toast';

// POS Components
import ItemGrid from '../src/features/pos/components/ItemGrid';
import CategoryTabs from '../src/features/pos/components/CategoryTabs';
import CartItem from '../src/features/pos/components/CartItem';
import NoteModal from '../src/features/pos/components/NoteModal';
import { ManagerApprovalModal } from '../src/features/pos/components/ManagerApprovalModal';
import AddressMapPicker from './common/AddressMapPicker';

// ============================================================================
// ?? INTELLIGENT CALL CENTER MODULE v2.0
// Enterprise-grade call center for restaurant operations
// Features: Customer Registration, Real-time Order Tracking, Multi-branch View
// ============================================================================

const DriverAssignmentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAssign: (driverId: string) => Promise<void> | void;
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
                                        await onAssign(driver.id);
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
}> = ({ isOpen, onClose, initialPhone, onSave, lang, zones }) => {
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
        setIsSaving(true);
        setErrorMessage(null);
        try {
            await onSave({
                id: `CUS-${Date.now()}`,
                ...form,
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
                                <label className="text-[9px] font-black uppercase text-muted tracking-[0.2em] mb-1.5 block group-focus-within:text-cyan-500 transition-colors">{lang === 'ar' ? 'المنطقة (تحديد الفرع والرسوم) *' : 'Delivery Zone (Auto Branch & Fee) *'}</label>
                                <div className="relative group/select">
                                    <select value={form.zoneId || ''} onChange={e => {
                                        const selectedZone = zones.find(z => String(z.id) === String(e.target.value));
                                        setForm({ ...form, zoneId: e.target.value, area: selectedZone ? selectedZone.name : '' });
                                    }} className="w-full bg-elevated dark:bg-gray-800 rounded-xl py-3.5 pl-5 pr-10 text-sm font-bold outline-none border border-border/50 focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10 transition-all text-main cursor-pointer appearance-none">
                                        <option value="" disabled>{lang === 'ar' ? 'اختر المنطقة...' : 'Select delivery zone...'}</option>
                                        {(zones || []).map((z: any) => (
                                            <option key={z.id} value={z.id} className="bg-card text-main font-bold py-2">{z.nameAr || z.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={18} className="absolute top-1/2 -translate-y-1/2 right-4 text-muted pointer-events-none group-hover/select:text-cyan-500 transition-colors" />
                                </div>
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
                    <button onClick={handleSubmit} disabled={!form.name || !form.phone || !form.address || isSaving} className="flex-1 py-4 rounded-[1.2rem] bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-black tracking-[0.2em] text-[10px] uppercase hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/25 active:scale-95 disabled:active:scale-100">
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
    const { branches, settings, printers, hasPermission } = useAuthStore();
    const { categories } = useMenuStore();
    const { orders, placeOrder, discount, setDiscount, fetchOrders, updateOrderStatus } = useOrderStore();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [approvalCallback, setApprovalCallback] = useState<{ fn: () => void; action: string } | null>(null);

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
    const customerLookupRequestRef = React.useRef(0);

    useEffect(() => {
        if (!selectedBranchId && branches[0]?.id) setSelectedBranchId(branches[0].id);
    }, [branches, selectedBranchId]);

    // Persist held orders to localStorage
    useEffect(() => {
        try { localStorage.setItem('cc_held_orders', JSON.stringify(heldOrders)); } catch { /* storage full */ }
    }, [heldOrders]);

    // Load delivery zones
    useEffect(() => {
        deliveryApi.getZones().then(zones => {
            setDeliveryZones(zones || []);
            if (zones?.length) setSelectedZoneId(zones[0].id);
        }).catch(() => { });
    }, []);

    // --- Order Tracking State ---
    const [trackingFilter, setTrackingFilter] = useState<'all' | OrderStatus>(OrderStatus.PENDING);
    const [trackingBranch, setTrackingBranch] = useState<string>('all');
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

    // --- Menu & Items ---
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
        const newCart = order.items.map((item: any) => ({
            ...item,
            cartId: `reorder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        }));
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
            if (z?.branchId) setSelectedBranchId(z.branchId);
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

    // --- Cart Functions ---
    const addToCart = (item: any) => {
        const existingItem = cart.find(i => i.id === item.id);
        if (existingItem) {
            updateQuantity(existingItem.cartId, 1);
        } else {
            const cartId = Math.random().toString(36).substr(2, 9);
            setCart([...cart, { ...item, quantity: 1, cartId, notes: '' }]);
        }
    };

    const updateQuantity = (cartId: string, delta: number) => {
        setCart(cart.map(i => i.cartId === cartId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
    };

    const removeFromCart = (cartId: string) => setCart(cart.filter(i => i.cartId !== cartId));
    const updateCartItemNotes = (cartId: string, notes: string) => setCart(cart.map(i => i.cartId === cartId ? { ...i, notes } : i));

    // --- Pricing ---
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountAmount = subtotal * (discount / 100);
    const selectedZone = deliveryZones.find(z => z.id === selectedZoneId);
    const deliveryFee = freeDelivery ? 0 : (selectedZone?.deliveryFee || 15);
    const tax = (subtotal - discountAmount) * 0.14;
    const total = subtotal - discountAmount + tax + deliveryFee;

    // --- Hold Order ---
    const holdCurrentOrder = () => {
        if (cart.length === 0) return;
        setHeldOrders([...heldOrders, {
            id: `HOLD-${Date.now()}`,
            customer: selectedCustomer,
            cart: [...cart],
            items: [...cart],
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
        if (!deliveryAddress.trim()) {
            showToast(tr('اكتب عنوان التوصيل قبل إرسال الطلب', 'Enter the delivery address before sending the order'), 'error');
            return;
        }
        if (cart.length === 0) {
            showToast(tr('أضف صنف واحد على الأقل قبل إرسال الطلب', 'Add at least one item before sending the order'), 'error');
            return;
        }

        setIsSubmittingOrder(true);
        try {
            const newOrder: Order = {
                id: `CC-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                type: OrderType.DELIVERY,
                branchId: selectedBranchId,
                customerId: selectedCustomer?.id,
                customerName: selectedCustomer?.name,
                customerPhone: selectedCustomer?.phone,
                deliveryAddress: deliveryAddress.trim(),
                deliveryLat: deliveryPin.lat ?? selectedCustomer?.lat ?? selectedCustomer?.latitude,
                deliveryLng: deliveryPin.lng ?? selectedCustomer?.lng ?? selectedCustomer?.longitude,
                deliveryAddressLabel: deliveryPin.label ?? selectedCustomer?.addressLabel ?? selectedCustomer?.address_label,
                isCallCenterOrder: true,
                items: cart,
                status: OrderStatus.PENDING,
                subtotal,
                tax,
                total,
                createdAt: new Date(),
                notes: orderNotes,
                freeDelivery: freeDelivery,
                isUrgent: urgentFlag,
                discount: discount
            };

            const savedOrder = await placeOrder(newOrder);
            const activeBranch = branches.find(b => b.id === selectedBranchId);
            try {
                await printKitchenTicketsByRouting({
                    order: savedOrder,
                    categories,
                    printers,
                    branchId: selectedBranchId,
                    maxKitchenPrinters: settings.maxKitchenPrinters,
                    settings,
                    currencySymbol: settings.currencySymbol,
                    lang,
                    t,
                    branch: activeBranch
                });
            } catch {
                showToast(lang === 'ar' ? 'تم حفظ الطلب، لكن تعذرت طباعة تذكرة المطبخ' : 'Order saved, but kitchen ticket print failed', 'warning');
            }
            const shouldPrintOnSubmit = (settings.autoPrintReceiptOnSubmit ?? settings.autoPrintReceipt ?? false) === true
                || hasCashierPrinterConfigured(printers, savedOrder.branchId, settings);
            if (shouldPrintOnSubmit) {
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
            }
            resetOrder();
            showToast(lang === 'ar' ? 'تم إرسال الطلب بنجاح' : 'Order sent successfully', 'success');
        } catch (error: any) {
            showToast(getActionableErrorMessage(error, lang), 'error');
        } finally {
            setIsSubmittingOrder(false);
        }
    };

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (e.key === 'F1') { e.preventDefault(); document.getElementById('customer-search')?.focus(); }
            if (e.key === 'F2') { e.preventDefault(); document.getElementById('item-search')?.focus(); }
            if (e.key === 'F3') { e.preventDefault(); handleSubmitOrder(); }
            if (e.key === 'F4') { e.preventDefault(); holdCurrentOrder(); }
            if (e.key === 'F5') { e.preventDefault(); resetOrder(); }
            if (e.key === 'Escape') { resetOrder(); }
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
        return filtered.sort((a, b) => getOrderCreatedAt(b).getTime() - getOrderCreatedAt(a).getTime());
    }, [callCenterOrders, trackingFilter, trackingBranch]);

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
        <div className="flex flex-col h-full w-full app-viewport overflow-hidden bg-app relative">

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

                            {/* ROW 1: Customer Identity + Quick Settings */}
                            <div className="max-w-[1800px] mx-auto px-4 md:px-6 py-3 lg:py-4 flex flex-wrap lg:flex-nowrap items-center gap-3 relative z-10">

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

                                {/* Address (Editable) */}
                                <div className="flex-1 min-w-[200px] w-full lg:w-auto group">
                                    <div className="flex items-center gap-2 bg-elevated/50 px-3 py-2 rounded-xl border border-border/50 group-focus-within:border-indigo-500/50 transition-colors">
                                        <MapPinned size={14} className="text-indigo-500 shrink-0" />
                                        <input
                                            type="text"
                                            value={deliveryAddress}
                                            onChange={(e) => setDeliveryAddress(e.target.value)}
                                            className="flex-1 bg-transparent text-xs font-bold outline-none text-main placeholder-muted"
                                            placeholder={lang === 'ar' ? 'ادخل العنوان...' : 'Delivery address...'}
                                        />
                                    </div>
                                </div>

                                <div className="w-full">
                                    <AddressMapPicker
                                        lang={lang}
                                        compact
                                        value={{ address: deliveryAddress, lat: deliveryPin.lat, lng: deliveryPin.lng, label: deliveryPin.label }}
                                        onChange={(pin) => {
                                            setDeliveryAddress(pin.address);
                                            setDeliveryPin({ lat: pin.lat, lng: pin.lng, label: pin.label });
                                        }}
                                    />
                                </div>

                                {/* Branch & Zone Settings */}
                                <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar pb-1 lg:pb-0">
                                    {deliveryZones.length > 0 && (
                                        <div className="relative min-w-[140px] shrink-0 flex-1 lg:flex-none group/select">
                                            <select value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)} className="w-full bg-elevated/80 dark:bg-gray-800  rounded-xl py-2 pl-3 pr-8 text-xs font-black outline-none border border-border/50 focus:border-indigo-500/50 hover:border-indigo-500/30 text-main transition-all text-ellipsis appearance-none shadow-sm cursor-pointer">
                                                <option value="" disabled>{lang === 'ar' ? 'المنطقة...' : 'Zone...'}</option>
                                                {deliveryZones.map(z => <option key={z.id} value={z.id} className="bg-card text-main font-bold py-2">{z.nameAr || z.name}</option>)}
                                            </select>
                                            <ChevronDown size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted pointer-events-none group-hover/select:text-indigo-500 transition-colors" />
                                        </div>
                                    )}
                                    <div className="relative min-w-[140px] shrink-0 flex-1 lg:flex-none group/select">
                                        <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} className="w-full bg-elevated/80 dark:bg-gray-800  rounded-xl py-2 pl-3 pr-8 text-xs font-black outline-none border border-border/50 focus:border-indigo-500/50 hover:border-indigo-500/30 text-main transition-all text-ellipsis appearance-none shadow-sm cursor-pointer">
                                            {branches.map(b => <option key={b.id} value={b.id} className="bg-card text-main font-bold py-2">{b.name}</option>)}
                                        </select>
                                        <ChevronDown size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted pointer-events-none group-hover/select:text-indigo-500 transition-colors" />
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
                                            <input id="item-search" type="text" placeholder={lang === 'ar' ? 'بحث عن صنف...' : 'Search Item...'} className={`w-full bg-white dark:bg-gray-800 border border-border/50 rounded-xl py-2 ${lang === 'ar' ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} text-sm font-bold outline-none focus:border-indigo-500/50 transition-all text-main placeholder-muted shadow-sm`} value={itemSearchQuery} onChange={(e) => setItemSearchQuery(e.target.value)} />
                                        </div>
                                        <div className="flex items-center bg-white dark:bg-gray-800 rounded-xl p-1 shrink-0 border border-border/50 shadow-sm">
                                            <button onClick={() => setMenuDensity('comfortable')} className={`p-1.5 rounded-lg transition-all ${menuDensity === 'comfortable' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 shadow-sm border border-indigo-500/20' : 'text-muted hover:text-main hover:bg-elevated'}`} title="Comfortable"><LayoutGrid size={15} /></button>
                                            <button onClick={() => setMenuDensity('compact')} className={`p-1.5 rounded-lg transition-all ${menuDensity === 'compact' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 shadow-sm border border-indigo-500/20' : 'text-muted hover:text-main hover:bg-elevated'}`} title="Compact"><Rows size={15} /></button>
                                            <button onClick={() => setMenuDensity('buttons')} className={`p-1.5 rounded-lg transition-all ${menuDensity === 'buttons' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 shadow-sm border border-indigo-500/20' : 'text-muted hover:text-main hover:bg-elevated'}`} title="Compact List"><List size={15} /></button>
                                            <button onClick={() => setMenuDensity('ultra')} className={`p-1.5 rounded-lg transition-all ${menuDensity === 'ultra' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 shadow-sm border border-indigo-500/20' : 'text-muted hover:text-main hover:bg-elevated'}`} title="Ultra Dense"><Grip size={15} /></button>
                                        </div>
                                    </div>
                                    {/* Category Scrolling Row */}
                                    <div className="w-full overflow-x-auto no-scrollbar px-4 md:px-6 py-2.5">
                                        <CategoryTabs categories={categories} activeCategory={activeCategory} onSetCategory={setActiveCategory} isTouchMode={false} lang={lang} t={t} />
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar bg-app/20">
                                    <ItemGrid items={filteredItems} onAddItem={addToCart} currencySymbol={currencySymbol} isTouchMode={false} density={menuDensity} />
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
                                        <ShoppingBag size={18} className="text-indigo-500" /> {lang === 'ar' ? 'الطلب' : 'Current Order'}
                                    </h3>
                                    <span className="bg-indigo-500/10 text-indigo-500 px-3 py-1 rounded-full text-[10px] font-black tracking-widest border border-indigo-500/20">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
                                </div>

                                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 custom-scrollbar">
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

                                {/* Order Add-ons (Notes, Discount, Priority) */}
                                <div className="px-5 py-4 border-t border-border/50 space-y-4 bg-app/50 shrink-0">
                                    <div className="grid grid-cols-2 gap-3">
                                        <button onClick={() => setFreeDelivery(!freeDelivery)} className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${freeDelivery ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'bg-elevated text-muted border border-border/50 hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/30'}`}>
                                            <Bike size={14} /> {lang === 'ar' ? 'توصيل مجاني' : 'Free Delivery'}
                                        </button>
                                        <button onClick={() => setUrgentFlag(!urgentFlag)} className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${urgentFlag ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25' : 'bg-elevated text-muted border border-border/50 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/30'}`}>
                                            <Zap size={14} className={urgentFlag ? "animate-pulse" : ""} /> {lang === 'ar' ? 'فورى' : 'Urgent'}
                                        </button>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-muted px-1">{lang === 'ar' ? 'ملاحظات المطبخ والسائق' : 'Kitchen & Driver Notes'}</label>
                                        <input type="text" placeholder={lang === 'ar' ? 'ملاحظات إضافية...' : 'Add notes...'} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="w-full bg-elevated border-b-2 border-border/50 focus:border-indigo-500 bg-transparent py-2 px-2 text-sm font-bold text-main outline-none transition-colors placeholder-muted/50 rounded-t-lg" />
                                    </div>
                                </div>

                                {/* Pricing & Submit */}
                                <div className="px-6 py-5 bg-card/90 border-t border-border/50 relative z-20">
                                    <div className="space-y-1.5 mb-5">
                                        <div className="flex justify-between text-[11px] font-black tracking-widest uppercase text-muted"><span>{lang === 'ar' ? 'الإجمالي الفرعي' : 'Subtotal'}</span><span className="text-main">{subtotal.toFixed(2)}</span></div>
                                        {discount > 0 && <div className="flex justify-between text-[11px] font-black tracking-widest uppercase text-emerald-500"><span>{lang === 'ar' ? 'خصم' : 'Discount'} ({discount}%)</span><span>-{discountAmount.toFixed(2)}</span></div>}
                                        <div className="flex justify-between text-[11px] font-black tracking-widest uppercase text-muted"><span>{lang === 'ar' ? 'ضريبة' : 'Tax'} (14%)</span><span className="text-main">{tax.toFixed(2)}</span></div>
                                        <div className="flex justify-between text-[11px] font-black tracking-widest uppercase text-muted"><span>{lang === 'ar' ? 'الدليفري' : 'Delivery'}</span><span className={freeDelivery ? 'text-emerald-500' : 'text-main'}>{freeDelivery ? (lang === 'ar' ? 'مجاني' : 'FREE') : deliveryFee.toFixed(2)}</span></div>
                                        <div className="flex justify-between text-2xl font-black text-indigo-500 pt-3 border-t border-border/50 mt-2"><span>{lang === 'ar' ? 'الإجمالي' : 'Total'}</span><span>{total.toFixed(2)} <span className="text-sm font-bold opacity-50">{currencySymbol}</span></span></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                            <button onClick={holdCurrentOrder} disabled={cart.length === 0 || isSubmittingOrder} className="h-14 rounded-[1.2rem] font-black uppercase tracking-[0.2em] text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/30 disabled:opacity-30 disabled:pointer-events-none hover:bg-amber-500/20 transition-all flex items-center justify-center gap-2">
                                             <Pause size={16} /> {tr('تعليق (F4)', 'Hold (F4)')}
                                         </button>
                                         <button onClick={handleSubmitOrder} disabled={cart.length === 0 || isSubmittingOrder} className={`h-14 rounded-[1.2rem] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-2 transition-all ${cart.length === 0 || isSubmittingOrder ? 'bg-elevated text-muted cursor-not-allowed' : 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-xl shadow-indigo-500/25 hover:opacity-90 active:scale-95'}`}>
                                             {isSubmittingOrder ? <RefreshCcw size={16} className="animate-spin" /> : tr('إرسال (F3)', 'Send (F3)')} <ArrowRight size={16} />
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

                                    {/* Multiple Addresses Selector (Mock) */}
                                    <div className="bg-elevated/50 rounded-2xl border border-border/50 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500 flex items-center gap-2">
                                                <MapPin size={13} /> {lang === 'ar' ? 'عناوين التوصيل' : 'Delivery Addresses'}
                                            </h4>
                                            <button className="text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 transition-colors">
                                                {lang === 'ar' ? '+ إضافة' : '+ Add'}
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {[
                                                { id: 1, type: lang === 'ar' ? 'المنزل' : 'Home', icon: <Home size={14} />, address: selectedCustomer.address || '123 Main St, Appt 4B' },
                                                { id: 2, type: lang === 'ar' ? 'العمل' : 'Work', icon: <Briefcase size={14} />, address: 'Tech Park, Office 201' }
                                            ].map(addr => (
                                                <button 
                                                    key={addr.id} 
                                                    onClick={() => setDeliveryAddress(addr.address)} 
                                                    className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left ${deliveryAddress === addr.address ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm' : 'bg-card border-border/50 hover:border-cyan-500/20'}`}
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${deliveryAddress === addr.address ? 'bg-cyan-500 text-white shadow-sm' : 'bg-elevated text-muted'}`}>
                                                        {addr.icon}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-black text-main">{addr.type}</p>
                                                        <p className="text-[10px] text-muted font-bold truncate mt-0.5">{addr.address}</p>
                                                    </div>
                                                    {deliveryAddress === addr.address && <div className="w-2 h-2 rounded-full bg-cyan-500 shrink-0 mt-3 shadow-sm" />}
                                                </button>
                                            ))}
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
                                        <button onClick={() => { setShowRegistrationModal(true); setShowCustomerProfile(false); }} className="py-2.5 bg-elevated border border-border/50 text-muted hover:text-indigo-500 hover:border-indigo-500/30 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                            <Edit3 size={12} /> {lang === 'ar' ? 'تعديل' : 'Edit'}
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
                                { value: OrderStatus.PENDING, label: lang === 'ar' ? 'جديد' : 'New', count: pendingCount },
                                { value: OrderStatus.PREPARING, label: lang === 'ar' ? 'تحضير' : 'Prep', count: preparingCount },
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
                                             <span className="text-xl font-black text-main">{Number(order.total || 0).toFixed(2)} <span className="text-[10px] tracking-widest opacity-50">{currencySymbol}</span></span>
                                        </div>

                                        {order.isUrgent && (
                                            <div className="mt-4 flex items-center justify-center gap-2 text-rose-500 bg-rose-500/10 py-2 rounded-xl border border-rose-500/20 relative z-10">
                                                <Zap size={14} className="animate-pulse" />
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{lang === 'ar' ? 'عاجل' : 'Urgent'}</span>
                                            </div>
                                        )}
                                        {/* Action Buttons */}
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
                                        <p className="text-2xl font-black text-main w-36 text-right relative z-10">
                                             {Number(order.total || 0).toFixed(2)} <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{currencySymbol}</span>
                                        </p>
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
            />

            <DriverAssignmentModal
                isOpen={showDriverModal}
                onClose={() => setShowDriverModal(false)}
                onAssign={async (driverId) => {
                    if (!selectedTrackingOrder?.id) return;
                    await deliveryApi.assign({ orderId: selectedTrackingOrder.id, driverId });
                    await fetchOrders();
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
        </div>
    );
};

export default CallCenter;

