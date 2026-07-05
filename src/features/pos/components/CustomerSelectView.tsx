import React, { useState, useEffect } from 'react';
import { Users, Truck, Search, Plus, MapPin, Phone, ArrowRight, Loader2, Save, Store, Globe2 } from 'lucide-react';
import { Customer, DeliveryPlatform } from '@/types';
import { useCRMStore } from '@/stores/useCRMStore';
import AddressMapPicker from '@/components/common/AddressMapPicker';
import { useToast } from '@/components/common/ToastProvider';

interface CustomerSelectViewProps {
    customers: Customer[];
    onSelectCustomer: (customer: Customer) => void;
    onCreateCustomer: () => void;
    deliveryPlatforms?: DeliveryPlatform[];
    deliverySource: string;
    onDeliverySourceChange: (source: string) => void;
    externalOrderNumber: string;
    onExternalOrderNumberChange: (value: string) => void;
    platformDeliveryDraft: {
        customerName: string;
        customerPhone: string;
        address: string;
        notes: string;
        paymentStatus: string;
    };
    onPlatformDeliveryDraftChange: (draft: CustomerSelectViewProps['platformDeliveryDraft']) => void;
    onUsePlatformDelivery: () => void;
    lang: 'en' | 'ar';
    t: any;
}

const CustomerSelectView: React.FC<CustomerSelectViewProps> = ({
    customers,
    onSelectCustomer,
    onCreateCustomer,
    deliveryPlatforms = [],
    deliverySource,
    onDeliverySourceChange,
    externalOrderNumber,
    onExternalOrderNumberChange,
    platformDeliveryDraft,
    onPlatformDeliveryDraftChange,
    onUsePlatformDelivery,
    lang,
    t,
}) => {
    const isRTL = lang === 'ar';
    const { error: showError } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [apiResults, setApiResults] = useState<Customer[]>([]);
    const searchCustomers = useCRMStore(state => state.searchCustomers);
    const addCustomer = useCRMStore(state => state.addCustomer);
    const activePlatforms = deliveryPlatforms.filter((platform: any) => platform.isActive !== false);
    const sourceOptions = [
        {
            id: 'restaurant',
            label: isRTL ? 'دليفري المطعم' : 'Restaurant Delivery',
            hint: isRTL ? 'عميل كامل + عنوان + طيار المطعم' : 'Full customer record and in-house driver',
            icon: Store,
        },
        {
            id: 'talabat',
            label: 'Talabat',
            hint: isRTL ? 'رقم أوردر طلبات وبيانات مختصرة' : 'Talabat order number and platform details',
            icon: Globe2,
        },
        ...activePlatforms
            .filter((platform: any) => String(platform.id).toLowerCase() !== 'talabat' && String(platform.name || '').toLowerCase() !== 'talabat')
            .map((platform: any) => ({
                id: String(platform.id),
                label: platform.name,
                hint: isRTL ? 'منصة خارجية' : 'External platform',
                icon: Globe2,
            })),
    ];
    const isPlatformDelivery = deliverySource !== 'restaurant';

    const patchPlatformDraft = (patch: Partial<typeof platformDeliveryDraft>) => {
        onPlatformDeliveryDraftChange({ ...platformDeliveryDraft, ...patch });
    };

    // Inline Registration State
    const [isRegistering, setIsRegistering] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newCustName, setNewCustName] = useState('');
    const [newCustPhone, setNewCustPhone] = useState('');
    const [newCustArea, setNewCustArea] = useState('');
    const [newCustAddress, setNewCustAddress] = useState('');
    const [newCustBuilding, setNewCustBuilding] = useState('');
    const [newCustFloor, setNewCustFloor] = useState('');
    const [newCustApartment, setNewCustApartment] = useState('');
    const [newCustLandmark, setNewCustLandmark] = useState('');
    const [newCustLat, setNewCustLat] = useState<number | undefined>(undefined);
    const [newCustLng, setNewCustLng] = useState<number | undefined>(undefined);
    const [newCustAddressLabel, setNewCustAddressLabel] = useState<string | undefined>(undefined);

    useEffect(() => {
        const handler = setTimeout(async () => {
            if (searchQuery.trim().length > 2) {
                setIsSearching(true);
                const results = await searchCustomers(searchQuery);
                setApiResults(results);
                setIsSearching(false);
            } else {
                setApiResults([]);
            }
        }, 500);
        return () => clearTimeout(handler);
    }, [searchQuery, searchCustomers]);

    const activeCustomers = searchQuery.trim().length > 2 ? apiResults : customers.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        c.phone.includes(searchQuery)
    );

    const handleOpenInlineRegistration = () => {
        const isNumeric = /^\d+$/.test(searchQuery);
        setNewCustPhone(isNumeric ? searchQuery : '');
        setNewCustName(!isNumeric ? searchQuery : '');
        setNewCustArea('');
        setNewCustAddress('');
        setNewCustBuilding('');
        setNewCustFloor('');
        setNewCustApartment('');
        setNewCustLandmark('');
        setNewCustLat(undefined);
        setNewCustLng(undefined);
        setNewCustAddressLabel(undefined);
        setIsRegistering(true);
    };

    const handleSaveInline = async () => {
        if (!newCustName.trim() || !newCustPhone.trim()) return;
        setIsSaving(true);
        try {
            const added = await addCustomer({
                name: newCustName,
                phone: newCustPhone,
                area: newCustArea,
                address: newCustAddress, // Typically Street
                lat: newCustLat,
                lng: newCustLng,
                addressLabel: newCustAddressLabel,
                building: newCustBuilding,
                floor: newCustFloor,
                apartment: newCustApartment,
                landmark: newCustLandmark
            });
            onSelectCustomer(added); // Select immediately
        } catch (err: any) {
            showError(err?.message || (isRTL ? 'تعذر حفظ العميل' : 'Failed to save customer'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex-1 flex min-h-0 flex-col items-center justify-center bg-app p-3 md:p-4 xl:p-8 animate-in fade-in duration-150 overflow-hidden">
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/5 blur-[120px] rounded-full" />
            </div>

            <div className="max-w-2xl w-full flex min-h-0 flex-col h-full max-h-[850px] bg-card/50 backdrop-blur-sm border border-border/20 rounded-[2rem] xl:rounded-[2.5rem] shadow-[0_32px_80px_rgba(0,0,0,0.08)] overflow-hidden relative z-10 transition-all">
                
                {/* Header */}
                <div className="p-4 xl:p-8 border-b border-border/10 bg-card/40">
                    <div className="flex items-center justify-between gap-3 mb-4 xl:mb-8">
                        <div className="flex min-w-0 items-center gap-3 xl:gap-5">
                            <div className="w-11 h-11 xl:w-14 xl:h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex shrink-0 items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                                <Truck size={24} />
                            </div>
                            <div className="min-w-0">
                                <h1 className="truncate text-xl xl:text-2xl font-black text-main uppercase tracking-tight leading-none mb-1">
                                    {isPlatformDelivery
                                        ? (isRTL ? 'بيانات أوردر المنصة' : 'Platform Order')
                                        : (isRegistering ? (isRTL ? 'تسجيل عميل جديد' : 'Register Guest') : t.select_customer)}
                                </h1>
                                <p className="truncate text-[10px] xl:text-xs font-bold text-muted uppercase tracking-[0.2em] opacity-60">
                                    {isRegistering ? (isRTL ? 'إضافة سريعة' : 'Quick Create Mode') : (isRTL ? 'اختيار مصدر الدليفري أولًا' : 'Choose delivery source first')}
                                </p>
                                <h1 className="hidden">
                                    {isRegistering ? (isRTL ? 'تسجيل عميل جديد' : 'Register Guest') : t.select_customer}
                                </h1>
                                <p className="hidden">
                                    {isRegistering ? (isRTL ? 'إضافة سريعة' : 'Quick Create Mode') : (isRTL ? 'تخصيص طلب التوصيل' : 'Delivery Identity Node')}
                                </p>
                            </div>
                        </div>

                        {!isRegistering && !isPlatformDelivery && (
                            <button 
                                onClick={handleOpenInlineRegistration}
                                className="h-11 shrink-0 px-4 xl:h-12 xl:px-6 bg-main text-app rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] transition-all active:scale-95 flex items-center gap-2 shadow-xl hover:bg-opacity-90"
                            >
                                <Plus size={14} strokeWidth={3} />
                                <span>{isRTL ? 'عميل جديد' : 'New Guest'}</span>
                            </button>
                        )}
                    </div>

                    {!isRegistering && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 xl:gap-3 mb-4 xl:mb-6">
                            {sourceOptions.map((option) => {
                                const Icon = option.icon;
                                const active = deliverySource === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => onDeliverySourceChange(option.id)}
                                        className={`min-h-[70px] xl:min-h-[86px] rounded-2xl border p-3 xl:p-4 text-start transition-all active:scale-[0.98] ${active ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 shadow-lg shadow-indigo-500/10' : 'border-border/20 bg-card/40 text-main hover:border-indigo-500/30'}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`h-9 w-9 xl:h-10 xl:w-10 rounded-xl flex shrink-0 items-center justify-center ${active ? 'bg-indigo-600 text-white' : 'bg-elevated text-muted'}`}>
                                                <Icon size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black uppercase tracking-wide truncate">{option.label}</p>
                                                <p className="mt-1 text-[10px] font-bold text-muted leading-4">{option.hint}</p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Search Field (Hidden during inline registration/platform mode) */}
                    {!isRegistering && !isPlatformDelivery && (
                        <div className="relative group">
                            <Search className={`absolute top-1/2 -translate-y-1/2 ${isSearching ? 'text-indigo-500 animate-pulse' : 'text-muted/40'} group-focus-within:text-indigo-500 transition-colors ${isRTL ? 'right-5' : 'left-5'}`} size={20} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={isRTL ? 'البحث بالاسم أو رقم الهاتف المتصل...' : 'Type phone number or name...'}
                                autoFocus
                                className={`w-full h-12 xl:h-16 bg-card/60 border-2 border-border/10 rounded-2xl text-main font-black text-base xl:text-lg outline-none focus:border-indigo-500/50 transition-all shadow-inner ${isRTL ? 'pr-14 pl-6' : 'pl-14 pr-6'}`}
                            />
                            {isSearching && (
                                <Loader2 className={`absolute top-1/2 -translate-y-1/2 text-indigo-500 animate-spin ${isRTL ? 'left-5' : 'right-5'}`} size={18} />
                            )}
                        </div>
                    )}
                </div>

                {/* Main Content Area */}
                <div className="flex-1 min-h-0 overflow-y-auto pos-scroll flex flex-col relative">
                    
                    {isPlatformDelivery ? (
                        <div className="flex-1 p-4 xl:p-8 animate-in slide-in-from-right-4 fade-in duration-150">
                            <div className="space-y-4 xl:space-y-5">
                                <div className="rounded-3xl border border-orange-500/20 bg-orange-500/10 p-5">
                                    <p className="text-xs font-black text-orange-600 uppercase tracking-widest">
                                        {isRTL ? 'أوردر منصة خارجية' : 'External platform order'}
                                    </p>
                                    <p className="mt-2 text-[11px] font-bold text-muted leading-5">
                                        {isRTL
                                            ? 'اكتب رقم أوردر طلبات أو المنصة، وبعدها بيانات العميل المتاحة من شاشة المنصة. لا يتم إنشاء عميل دائم إلا في دليفري المطعم.'
                                            : 'Enter the Talabat/platform order number and the available customer details. A permanent CRM customer is only created for restaurant delivery.'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'رقم أوردر المنصة *' : 'Platform order no. *'}
                                        </label>
                                        <input
                                            value={externalOrderNumber}
                                            onChange={(event) => onExternalOrderNumberChange(event.target.value)}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-lg font-black tracking-wider outline-none focus:border-orange-500"
                                            placeholder={deliverySource === 'talabat' ? 'Talabat #123456' : 'Platform order #'}
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'حالة الدفع' : 'Payment status'}
                                        </label>
                                        <select
                                            value={platformDeliveryDraft.paymentStatus}
                                            onChange={(event) => patchPlatformDraft({ paymentStatus: event.target.value })}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-sm font-black outline-none focus:border-orange-500"
                                        >
                                            <option value="UNKNOWN">{isRTL ? 'غير محدد' : 'Unknown'}</option>
                                            <option value="PAID_ON_PLATFORM">{isRTL ? 'مدفوع على المنصة' : 'Paid on platform'}</option>
                                            <option value="CASH_ON_DELIVERY">{isRTL ? 'كاش عند الاستلام' : 'Cash on delivery'}</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'اسم العميل من المنصة' : 'Platform customer name'}
                                        </label>
                                        <input
                                            value={platformDeliveryDraft.customerName}
                                            onChange={(event) => patchPlatformDraft({ customerName: event.target.value })}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-sm font-bold outline-none focus:border-orange-500"
                                            placeholder={isRTL ? 'اختياري' : 'Optional'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'هاتف العميل' : 'Customer phone'}
                                        </label>
                                        <input
                                            value={platformDeliveryDraft.customerPhone}
                                            onChange={(event) => patchPlatformDraft({ customerPhone: event.target.value })}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-sm font-bold outline-none focus:border-orange-500"
                                            placeholder={isRTL ? 'لو ظاهر في طلبات' : 'If visible in platform'}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                        {isRTL ? 'عنوان التسليم / ملاحظات العنوان' : 'Delivery address / address notes'}
                                    </label>
                                    <textarea
                                        value={platformDeliveryDraft.address}
                                        onChange={(event) => patchPlatformDraft({ address: event.target.value })}
                                        className="w-full bg-card border border-border/20 rounded-xl p-4 text-sm font-bold outline-none focus:border-orange-500 resize-none h-24"
                                        placeholder={isRTL ? 'انسخ العنوان المتاح من طلبات أو المنصة' : 'Copy the available address from Talabat/platform'}
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                        {isRTL ? 'ملاحظات المنصة' : 'Platform notes'}
                                    </label>
                                    <textarea
                                        value={platformDeliveryDraft.notes}
                                        onChange={(event) => patchPlatformDraft({ notes: event.target.value })}
                                        className="w-full bg-card border border-border/20 rounded-xl p-4 text-sm font-bold outline-none focus:border-orange-500 resize-none h-20"
                                        placeholder={isRTL ? 'مثال: طلبات برو، ممنوع الاتصال، مدفوع...' : 'Example: Talabat Pro, no call, already paid...'}
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={onUsePlatformDelivery}
                                    disabled={!externalOrderNumber.trim()}
                                    className="w-full h-14 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-lg shadow-orange-600/20 active:scale-95"
                                >
                                    {isRTL ? 'متابعة أوردر المنصة' : 'Continue Platform Order'}
                                </button>
                            </div>
                        </div>
                    ) : isRegistering ? (
                        // INLINE REGISTRATION FORM
                        <div className="flex-1 p-4 xl:p-8 animate-in slide-in-from-right-4 fade-in duration-150">
                            <div className="space-y-4 xl:space-y-6">
                                <div className="grid grid-cols-2 gap-3 xl:gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'الهاتف' : 'Phone Number'}
                                        </label>
                                        <input
                                            type="tel"
                                            value={newCustPhone}
                                            onChange={(e) => setNewCustPhone(e.target.value)}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-lg font-bold tracking-wider outline-none focus:border-indigo-500"
                                            placeholder="01xxxxxxxxx"
                                            autoFocus={!newCustPhone}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'الاسم' : 'Full Name'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newCustName}
                                            onChange={(e) => setNewCustName(e.target.value)}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-lg font-bold outline-none focus:border-indigo-500"
                                            placeholder={isRTL ? 'اسم العميل' : 'Jane Doe'}
                                            autoFocus={!!newCustPhone && !newCustName}
                                        />
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 xl:gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'المنطقة' : 'Area/Region'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newCustArea}
                                            onChange={(e) => setNewCustArea(e.target.value)}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-sm font-bold outline-none focus:border-indigo-500"
                                            placeholder={isRTL ? 'المنطقة أو الحي...' : 'City/Area'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'الشارع' : 'Street'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newCustAddress}
                                            onChange={(e) => setNewCustAddress(e.target.value)}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-sm font-bold outline-none focus:border-indigo-500"
                                            placeholder={isRTL ? 'اسم الشارع...' : 'Street Name'}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3 xl:gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'عمارة/مبنى' : 'Building'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newCustBuilding}
                                            onChange={(e) => setNewCustBuilding(e.target.value)}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-sm font-bold outline-none focus:border-indigo-500"
                                            placeholder="12A"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'الدور' : 'Floor'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newCustFloor}
                                            onChange={(e) => setNewCustFloor(e.target.value)}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-sm font-bold outline-none focus:border-indigo-500"
                                            placeholder="3"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                            {isRTL ? 'شقة' : 'Apt'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newCustApartment}
                                            onChange={(e) => setNewCustApartment(e.target.value)}
                                            className="w-full h-14 bg-card border border-border/20 rounded-xl px-5 text-sm font-bold outline-none focus:border-indigo-500"
                                            placeholder="14"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black tracking-widest text-muted uppercase mb-2">
                                        {isRTL ? 'علامة مميزة / ملاحظات' : 'Landmark / Notes'}
                                    </label>
                                    <textarea
                                        value={newCustLandmark}
                                        onChange={(e) => setNewCustLandmark(e.target.value)}
                                        className="w-full bg-card border border-border/20 rounded-xl p-4 text-sm font-bold outline-none focus:border-indigo-500 resize-none h-20"
                                        placeholder={isRTL ? 'بجوار صيدلية...' : 'Next to...'}
                                    />
                                </div>

                                <AddressMapPicker
                                    lang={lang}
                                    compact
                                    value={{ address: newCustAddress, lat: newCustLat, lng: newCustLng, label: newCustAddressLabel }}
                                    onChange={(pin) => {
                                        setNewCustAddress(pin.address);
                                        setNewCustLat(pin.lat);
                                        setNewCustLng(pin.lng);
                                        setNewCustAddressLabel(pin.label);
                                    }}
                                />

                                <div className="pt-3 xl:pt-6 flex gap-3">
                                    <button 
                                        onClick={() => setIsRegistering(false)}
                                        className="flex-1 h-14 bg-elevated border border-border/10 rounded-xl font-black uppercase text-xs tracking-wider text-muted hover:text-main transition-colors"
                                    >
                                        {isRTL ? 'إلغاء' : 'Cancel'}
                                    </button>
                                    <button 
                                        onClick={handleSaveInline}
                                        disabled={!newCustName || !newCustPhone || isSaving}
                                        className="flex-[2] h-14 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-lg shadow-indigo-600/20 active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                        {isRTL ? 'حفظ واختيار' : 'Save & Select'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // CUSTOMER LISTING
                        <div className="p-4 xl:p-8 space-y-3">
                            {activeCustomers.length > 0 ? (
                                activeCustomers.map((c, idx) => (
                                    <button 
                                        key={c.id} 
                                        onClick={() => onSelectCustomer(c)} 
                                        className={`w-full p-4 xl:p-6 rounded-3xl border ${searchQuery && idx === 0 ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800' : 'bg-card/30 border-border/5 hover:border-indigo-500/30'} flex items-center justify-between group transition-all duration-150 animate-in slide-in-from-bottom-2 fade-in fill-mode-both`}
                                        style={{ animationDelay: `${idx * 30}ms` }}
                                    >
                                        <div className="flex min-w-0 items-center gap-3 xl:gap-5">
                                            <div className="w-11 h-11 xl:w-14 xl:h-14 rounded-2xl bg-indigo-500/10 flex shrink-0 items-center justify-center text-indigo-500 font-black text-xl group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-inner">
                                                {c.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 text-left">
                                                <h3 className="font-black text-main text-base uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{c.name}</h3>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <span className="flex items-center gap-1.5 text-xs font-bold text-muted">
                                                        <Phone size={12} className="opacity-40" />
                                                        {c.phone}
                                                    </span>
                                                    {c.address && (
                                                        <span className="flex items-center gap-1.5 text-xs font-bold text-muted truncate max-w-[200px]">
                                                            <MapPin size={12} className="opacity-40" />
                                                            {c.area || c.address}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {searchQuery && idx === 0 && (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-500/10 px-3 py-1 rounded-full hidden sm:block">
                                                    {isRTL ? 'تطابق تام' : 'Best Match'}
                                                </span>
                                            )}
                                            <div className={`w-12 h-12 rounded-full border border-border/10 flex items-center justify-center transition-all ${searchQuery && idx === 0 ? 'bg-indigo-500 text-white shadow-xl shadow-indigo-500/30' : 'text-muted/20 group-hover:bg-indigo-50 group-hover:text-indigo-600'}`}>
                                                <ArrowRight size={20} />
                                            </div>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="mt-4 xl:mt-8 flex flex-col items-center justify-center text-center p-6 xl:p-10 bg-card/20 border-2 border-dashed border-border/20 rounded-[2.5rem]">
                                    <div className="w-20 h-20 rounded-full bg-elevated/40 flex items-center justify-center text-muted/30 mb-5">
                                        <Users size={36} />
                                    </div>
                                    <h3 className="text-base font-black text-main uppercase tracking-widest mb-2">
                                        {searchQuery ? (isRTL ? `لا يوجد حساب لـ "${searchQuery}"` : `NO MATCH FOR "${searchQuery}"`) : (isRTL ? 'قاعدة بيانات التوصيل' : 'DELIVERY DATABASE')}
                                    </h3>
                                    <p className="text-xs font-bold text-muted/60 uppercase tracking-tight max-w-[250px] mb-8">
                                        {searchQuery ? (isRTL ? 'يمكنك تسجيل العميل الجديد فوراً والمتابعة للطلب مباشرة' : 'QUICKLY REGISTER THIS NUMBER TO PROCEED.') : (isRTL ? 'قم بالبحث برقم الهاتف لاختيار أو إنشاء عميل' : 'START TYPING A PHONE NUMBER TO LOCATE OR CREATE A GUEST.')}
                                    </p>
                                    
                                    {searchQuery && (
                                        <button 
                                            onClick={handleOpenInlineRegistration}
                                            className="h-14 px-8 bg-main text-app rounded-2xl text-xs font-black uppercase tracking-[0.1em] transition-all hover:bg-opacity-90 hover:scale-105 active:scale-95 shadow-xl flex items-center gap-3"
                                        >
                                            <Plus size={16} />
                                            {isRTL ? 'إضافة العميل سريعاً' : 'Quick Register Guest'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomerSelectView;

