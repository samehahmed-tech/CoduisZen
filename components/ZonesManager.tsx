import React, { useEffect, useMemo, useState } from 'react';
import {
    Building2,
    CheckCircle2,
    CircleDollarSign,
    Edit2,
    MapPin,
    Plus,
    Route,
    Save,
    Search,
    Timer,
    Trash2,
    X,
    XCircle,
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { useModal } from './Modal';
import { deliveryApi } from '../services/api/delivery';
import { useToast } from './common/ToastProvider';

const emptyForm = (branchId = '') => ({
    id: undefined as number | string | undefined,
    name: '',
    nameAr: '',
    branchId,
    deliveryFee: 0,
    minOrderAmount: 0,
    estimatedTime: 45,
    isActive: true,
});

const money = (value: number | string | undefined) => Number(value || 0).toLocaleString();

const ZonesManager: React.FC = () => {
    const settings = useAuthStore(s => s.settings);
    const branches = useAuthStore(s => s.branches);
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const isRtl = lang === 'ar';
    const { showModal } = useModal();
    const { success, error: showError } = useToast();

    const [zones, setZones] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [branchFilter, setBranchFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState(emptyForm(branches[0]?.id || ''));

    const fetchZones = async () => {
        try {
            setIsLoading(true);
            const data = await deliveryApi.getZones();
            setZones(data || []);
        } catch {
            showError(lang === 'ar' ? 'تعذر تحميل مناطق التوصيل' : 'Failed to load delivery zones');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchZones();
    }, []);

    const filteredZones = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return zones.filter(zone => {
            const matchesSearch = !q || [zone.name, zone.nameAr].some(value => String(value || '').toLowerCase().includes(q));
            const matchesBranch = branchFilter === 'all' || !zone.branchId || zone.branchId === branchFilter;
            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'active' ? zone.isActive !== false : zone.isActive === false);
            return matchesSearch && matchesBranch && matchesStatus;
        });
    }, [zones, searchQuery, branchFilter, statusFilter]);

    const stats = useMemo(() => {
        const activeZones = zones.filter(zone => zone.isActive !== false);
        const fees = activeZones.map(zone => Number(zone.deliveryFee || 0));
        const eta = activeZones.map(zone => Number(zone.estimatedTime || 0)).filter(Boolean);
        const uniqueBranches = new Set(zones.map(zone => zone.branchId).filter(Boolean));

        return {
            total: zones.length,
            active: activeZones.length,
            branches: uniqueBranches.size,
            averageFee: fees.length ? fees.reduce((sum, value) => sum + value, 0) / fees.length : 0,
            averageEta: eta.length ? Math.round(eta.reduce((sum, value) => sum + value, 0) / eta.length) : 0,
        };
    }, [zones]);

    const resetForm = () => {
        setForm(emptyForm(branches[0]?.id || ''));
        setIsEditing(false);
    };

    const startCreate = () => {
        setForm(emptyForm(branches[0]?.id || ''));
        setIsEditing(true);
    };

    const startEdit = (zone: any) => {
        setForm({
            id: zone.id,
            name: zone.name || '',
            nameAr: zone.nameAr || '',
            branchId: zone.branchId || '',
            deliveryFee: Number(zone.deliveryFee || 0),
            minOrderAmount: Number(zone.minOrderAmount || 0),
            estimatedTime: Number(zone.estimatedTime || 45),
            isActive: zone.isActive !== false,
        });
        setIsEditing(true);
    };

    const handleSubmit = async () => {
        if (isSaving) return;
        if (!form.name.trim()) {
            showError(lang === 'ar' ? 'اكتب اسم المنطقة' : 'Zone name is required');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                ...form,
                name: form.name.trim(),
                nameAr: form.nameAr.trim() || null,
                branchId: form.branchId.trim() || null,
                deliveryFee: Math.max(0, Number(form.deliveryFee || 0)),
                minOrderAmount: Math.max(0, Number(form.minOrderAmount || 0)),
                estimatedTime: Math.max(1, Number(form.estimatedTime || 45)),
            };
            if (form.id) {
                await deliveryApi.updateZone(form.id, payload);
            } else {
                await deliveryApi.createZone(payload);
            }
            await fetchZones();
            resetForm();
            success(lang === 'ar' ? 'تم حفظ منطقة التوصيل' : 'Delivery zone saved');
        } catch (err: any) {
            showError(err?.message || (lang === 'ar' ? 'تعذر حفظ منطقة التوصيل' : 'Error saving zone'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (id: number | string) => {
        showModal({
            title: lang === 'ar' ? 'حذف المنطقة' : 'Delete Zone',
            message: lang === 'ar' ? 'هل أنت متأكد من حذف هذه المنطقة؟' : 'Are you sure you want to delete this zone?',
            type: 'danger',
            confirmText: lang === 'ar' ? 'نعم، احذف' : 'Yes, Delete',
            onConfirm: async () => {
                await deliveryApi.deleteZone(id);
                await fetchZones();
                success(lang === 'ar' ? 'تم حذف المنطقة' : 'Zone deleted');
            }
        });
    };

    return (
        <div
            className="min-h-screen bg-app p-4 sm:p-6 lg:p-8 animate-fade-in"
            dir={isRtl ? 'rtl' : 'ltr'}
            style={{ fontFamily: isRtl ? 'var(--font-arabic)' : 'var(--font-body)' }}
        >
            <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
                <header className="flex flex-col gap-4 border-b border-border/50 pb-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Route size={23} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-black uppercase tracking-widest text-muted">
                                    {lang === 'ar' ? 'إعدادات التوصيل' : 'Delivery setup'}
                                </p>
                                <h1 className="text-2xl font-black tracking-tight text-main sm:text-3xl">
                                    {lang === 'ar' ? 'المناطق والرسوم' : 'Delivery Zones & Fees'}
                                </h1>
                            </div>
                        </div>
                        <p className="mt-3 max-w-2xl text-sm font-bold text-muted">
                            {lang === 'ar'
                                ? 'راجع تغطية الفروع ورسوم التوصيل والحد الأدنى ووقت الوصول من شاشة واحدة.'
                                : 'Review branch coverage, delivery fees, minimum order values, and ETA rules in one operating view.'}
                        </p>
                    </div>

                    <button
                        onClick={startCreate}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white shadow-lg shadow-primary/15 transition-transform active:scale-95"
                    >
                        <Plus size={18} />
                        {lang === 'ar' ? 'منطقة جديدة' : 'New Zone'}
                    </button>
                </header>

                <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                    {[
                        { label: lang === 'ar' ? 'إجمالي المناطق' : 'Total zones', value: stats.total, icon: MapPin },
                        { label: lang === 'ar' ? 'مناطق فعالة' : 'Active zones', value: stats.active, icon: CheckCircle2 },
                        { label: lang === 'ar' ? 'فروع تغطي' : 'Covered branches', value: stats.branches, icon: Building2 },
                        { label: lang === 'ar' ? 'متوسط الرسوم' : 'Avg. fee', value: money(stats.averageFee), icon: CircleDollarSign },
                        { label: lang === 'ar' ? 'متوسط الوقت' : 'Avg. ETA', value: `${stats.averageEta || 0}m`, icon: Timer },
                    ].map(item => {
                        const Icon = item.icon;
                        return (
                            <div key={item.label} className="rounded-2xl border border-border/50 bg-card/70 p-4">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">{item.label}</p>
                                    <Icon size={16} className="text-primary" />
                                </div>
                                <p className="text-2xl font-black text-main">{item.value}</p>
                            </div>
                        );
                    })}
                </section>

                <main className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
                    <section className="min-w-0 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                        <div className="flex flex-col gap-3 border-b border-border/70 p-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="relative min-w-0 flex-1 lg:max-w-md">
                                <Search className={`absolute top-1/2 -translate-y-1/2 text-muted ${isRtl ? 'right-3' : 'left-3'}`} size={18} />
                                <input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={lang === 'ar' ? 'ابحث باسم المنطقة...' : 'Search by zone name...'}
                                    className={`h-11 w-full rounded-xl border border-border bg-elevated text-sm font-bold text-main outline-none transition-colors focus:border-primary/60 ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
                                />
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                                <select
                                    value={branchFilter}
                                    onChange={e => setBranchFilter(e.target.value)}
                                    className="h-11 rounded-xl border border-border bg-elevated px-3 text-sm font-black text-main outline-none focus:border-primary/60"
                                >
                                    <option value="all">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
                                    {branches.map(branch => (
                                        <option key={branch.id} value={branch.id}>{branch.nameAr || branch.name}</option>
                                    ))}
                                </select>
                                <div className="flex h-11 rounded-xl border border-border bg-elevated p-1">
                                    {[
                                        { id: 'all', label: lang === 'ar' ? 'الكل' : 'All' },
                                        { id: 'active', label: lang === 'ar' ? 'فعال' : 'Active' },
                                        { id: 'inactive', label: lang === 'ar' ? 'متوقف' : 'Off' },
                                    ].map(option => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setStatusFilter(option.id as typeof statusFilter)}
                                            className={`rounded-lg px-3 text-xs font-black transition-colors ${statusFilter === option.id ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-main'}`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="overflow-auto custom-scrollbar">
                            <div className="min-w-[820px]">
                                <div className="grid grid-cols-[1.5fr_1.15fr_.8fr_.8fr_.75fr_.7fr] gap-3 border-b border-border/60 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted">
                                    <span>{lang === 'ar' ? 'المنطقة' : 'Zone'}</span>
                                    <span>{lang === 'ar' ? 'الفرع' : 'Branch'}</span>
                                    <span>{lang === 'ar' ? 'الرسوم' : 'Fee'}</span>
                                    <span>{lang === 'ar' ? 'حد أدنى' : 'Min order'}</span>
                                    <span>{lang === 'ar' ? 'الوقت' : 'ETA'}</span>
                                    <span className={isRtl ? 'text-left' : 'text-right'}>{lang === 'ar' ? 'إجراءات' : 'Actions'}</span>
                                </div>

                                {isLoading ? (
                                    <div className="flex h-72 items-center justify-center text-sm font-black text-muted">
                                        {lang === 'ar' ? 'جاري تحميل المناطق...' : 'Loading zones...'}
                                    </div>
                                ) : filteredZones.length === 0 ? (
                                    <div className="flex h-72 flex-col items-center justify-center px-6 text-center text-muted">
                                        <MapPin size={42} className="mb-3 opacity-50" />
                                        <p className="font-black">{lang === 'ar' ? 'لا توجد مناطق مطابقة' : 'No matching zones'}</p>
                                        <p className="mt-1 text-xs font-bold">{lang === 'ar' ? 'غيّر البحث أو أضف منطقة جديدة.' : 'Adjust filters or add a new zone.'}</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border/50">
                                        {filteredZones.map(zone => {
                                            const branch = branches.find(b => b.id === zone.branchId);
                                            const active = zone.isActive !== false;
                                            return (
                                                <div key={zone.id} className="grid grid-cols-[1.5fr_1.15fr_.8fr_.8fr_.75fr_.7fr] items-center gap-3 px-5 py-4 transition-colors hover:bg-elevated/70">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            {active ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" /> : <XCircle size={16} className="shrink-0 text-muted" />}
                                                            <p className="truncate font-black text-main">{zone.nameAr || zone.name}</p>
                                                        </div>
                                                        <p className="mt-1 truncate text-xs font-bold text-muted">{zone.name}</p>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-black text-main">{branch?.nameAr || branch?.name || (lang === 'ar' ? 'كل الفروع' : 'All branches')}</p>
                                                        <p className="mt-1 text-[11px] font-bold text-muted">{active ? (lang === 'ar' ? 'يظهر في الطلبات' : 'Available for orders') : (lang === 'ar' ? 'متوقف مؤقتا' : 'Temporarily off')}</p>
                                                    </div>
                                                    <p className="text-sm font-black text-emerald-600">{money(zone.deliveryFee)}</p>
                                                    <p className="text-sm font-black text-main">{money(zone.minOrderAmount)}</p>
                                                    <p className="text-sm font-black text-indigo-500">{zone.estimatedTime || 0}m</p>
                                                    <div className={`flex items-center gap-1 ${isRtl ? 'justify-start' : 'justify-end'}`}>
                                                        <button onClick={() => startEdit(zone)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary/10 hover:text-primary" title={lang === 'ar' ? 'تعديل' : 'Edit'}>
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button onClick={() => handleDelete(zone.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500" title={lang === 'ar' ? 'حذف' : 'Delete'}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <aside className="rounded-3xl border border-border bg-card p-5 shadow-sm xl:sticky xl:top-6 xl:self-start">
                        <div className="mb-5 flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted">
                                    {lang === 'ar' ? 'تفاصيل المنطقة' : 'Zone details'}
                                </p>
                                <h2 className="mt-1 text-xl font-black text-main">
                                    {isEditing
                                        ? form.id
                                            ? (lang === 'ar' ? 'تعديل منطقة' : 'Edit zone')
                                            : (lang === 'ar' ? 'منطقة جديدة' : 'New zone')
                                        : (lang === 'ar' ? 'اختر أو أضف منطقة' : 'Select or add a zone')}
                                </h2>
                            </div>
                            {isEditing && (
                                <button onClick={resetForm} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-main">
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        {!isEditing ? (
                            <div className="rounded-2xl border border-dashed border-border bg-elevated/40 p-5">
                                <MapPin size={28} className="mb-4 text-primary" />
                                <p className="text-sm font-black text-main">
                                    {lang === 'ar' ? 'اضغط على تعديل بجوار أي منطقة أو أضف منطقة جديدة.' : 'Edit an existing row or create a new delivery zone.'}
                                </p>
                                <p className="mt-2 text-xs font-bold leading-5 text-muted">
                                    {lang === 'ar'
                                        ? 'البيانات هنا تؤثر على اختيار المنطقة في الكول سنتر ورسوم التوصيل.'
                                        : 'These rules drive call-center zone selection and delivery fee calculation.'}
                                </p>
                                <button onClick={startCreate} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white">
                                    <Plus size={16} />
                                    {lang === 'ar' ? 'إضافة منطقة' : 'Add zone'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-4">
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'الاسم بالإنجليزية *' : 'Name (EN) *'}</span>
                                        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-primary/60" placeholder="Maadi" />
                                    </label>

                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'الاسم بالعربية' : 'Name (AR)'}</span>
                                        <input value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value })} className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-primary/60" placeholder={lang === 'ar' ? 'المعادي' : 'Arabic name'} />
                                    </label>

                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'فرع التوصيل (اختياري)' : 'Dispatch branch (optional)'}</span>
                                        <select value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })} className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-primary/60">
                                            <option value="">{lang === 'ar' ? 'كل الفروع (عام)' : 'All branches (global)'}</option>
                                            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.nameAr || branch.name}</option>)}
                                        </select>
                                    </label>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'رسوم التوصيل' : 'Delivery fee'}</span>
                                        <input type="number" value={form.deliveryFee} onChange={e => setForm({ ...form, deliveryFee: Number(e.target.value) })} className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-primary/60" />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'الحد الأدنى' : 'Min order'}</span>
                                        <input type="number" value={form.minOrderAmount} onChange={e => setForm({ ...form, minOrderAmount: Number(e.target.value) })} className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-primary/60" />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'وقت التوصيل' : 'ETA minutes'}</span>
                                        <input type="number" value={form.estimatedTime} onChange={e => setForm({ ...form, estimatedTime: Number(e.target.value) })} className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-primary/60" />
                                    </label>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, isActive: !form.isActive })}
                                    className={`flex w-full items-center justify-between rounded-2xl border p-3 text-sm font-black transition-colors ${form.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-elevated text-muted'}`}
                                >
                                    <span>{lang === 'ar' ? 'متاحة للطلبات' : 'Available for orders'}</span>
                                    {form.isActive ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                                </button>

                                <div className="flex gap-3 border-t border-border pt-4">
                                    <button onClick={resetForm} className="h-11 flex-1 rounded-xl border border-border bg-elevated text-sm font-black text-muted hover:text-main">
                                        {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                    </button>
                                    <button onClick={handleSubmit} disabled={isSaving} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-white shadow-lg shadow-primary/15 disabled:opacity-50">
                                        <Save size={17} />
                                        {isSaving ? (lang === 'ar' ? 'جاري الحفظ' : 'Saving') : (lang === 'ar' ? 'حفظ' : 'Save')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </aside>
                </main>
            </div>
        </div>
    );
};

export default ZonesManager;
