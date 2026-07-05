import React, { useEffect, useState } from 'react';
import { CheckCircle2, DollarSign, Edit, Globe, Layers, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { platformsApi } from '../services/api/platforms';
import { useAuthStore } from '../stores/useAuthStore';
import ExportButton from './common/ExportButton';
import { useToast } from './common/ToastProvider';
import { useConfirm } from './common/ConfirmProvider';
import type { DeliveryPlatform } from '../types';

type PlatformForm = {
    name: string;
    integrationType: string;
    apiKey: string;
    feePercentage: string;
    applyFeesToMenuPrice: boolean;
    priceMarkupPercentage: string;
    priceMarkupFixed: string;
};

const PLATFORM_PRESETS = [
    { name: 'Talabat', integrationType: 'DELIVERY' },
    { name: 'Elmenus', integrationType: 'DELIVERY' },
    { name: 'Uber Eats', integrationType: 'DELIVERY' },
    { name: 'Noon Food', integrationType: 'DELIVERY' },
    { name: 'Careem Food', integrationType: 'DELIVERY' },
    { name: 'Custom', integrationType: 'OTHER' },
];

const createEmptyForm = (): PlatformForm => ({
    name: '',
    integrationType: 'MANUAL',
    apiKey: '',
    feePercentage: '15',
    applyFeesToMenuPrice: true,
    priceMarkupPercentage: '15',
    priceMarkupFixed: '0',
});

const PlatformAggregator: React.FC = () => {
    const { settings } = useAuthStore();
    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const { success, error: showError } = useToast();
    const { confirm } = useConfirm();

    const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingPlatformId, setDeletingPlatformId] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editingPlatform, setEditingPlatform] = useState<DeliveryPlatform | null>(null);
    const [form, setForm] = useState<PlatformForm>(createEmptyForm);
    const currency = settings.currency || 'EGP';

    const t = (en: string, ar: string) => (isAr ? ar : en);
    const toNonNegativeNumber = (value: string) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };

    const load = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            setPlatforms(await platformsApi.getAll());
        } catch (err: any) {
            showError(err?.message || t('Failed to load platforms', 'تعذر تحميل المنصات'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openCreate = () => {
        setEditingPlatform(null);
        setForm(createEmptyForm());
        setShowModal(true);
    };

    const openEdit = (platform: DeliveryPlatform) => {
        setEditingPlatform(platform);
        setForm({
            name: platform.name,
            integrationType: platform.integrationType || 'MANUAL',
            apiKey: '',
            feePercentage: String(platform.feePercentage ?? 15),
            applyFeesToMenuPrice: platform.applyFeesToMenuPrice ?? true,
            priceMarkupPercentage: String(platform.priceMarkupPercentage ?? platform.feePercentage ?? 15),
            priceMarkupFixed: String(platform.priceMarkupFixed ?? 0),
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (isSaving) return;
        if (!form.name.trim()) {
            showError(t('Enter platform name', 'اكتب اسم المنصة'));
            return;
        }
        const normalizedName = form.name.trim().toLowerCase();
        const duplicate = platforms.some(platform => platform.name.trim().toLowerCase() === normalizedName && platform.id !== editingPlatform?.id);
        if (duplicate) {
            showError(t('Platform already exists', 'المنصة موجودة بالفعل'));
            return;
        }

        const payload = {
            name: form.name.trim(),
            integrationType: form.integrationType,
            apiKey: form.apiKey || undefined,
            feePercentage: toNonNegativeNumber(form.feePercentage),
            applyFeesToMenuPrice: form.applyFeesToMenuPrice,
            priceMarkupPercentage: toNonNegativeNumber(form.priceMarkupPercentage),
            priceMarkupFixed: toNonNegativeNumber(form.priceMarkupFixed),
        };

        setIsSaving(true);
        try {
            if (editingPlatform) await platformsApi.update(editingPlatform.id, payload);
            else await platformsApi.create(payload);
            setShowModal(false);
            setEditingPlatform(null);
            await load();
            success(editingPlatform ? t('Platform updated', 'تم تحديث المنصة') : t('Platform added', 'تمت إضافة المنصة'));
        } catch (err: any) {
            showError(err?.message || t('Failed to save platform', 'تعذر حفظ المنصة'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (deletingPlatformId) return;
        const ok = await confirm({
            title: t('Delete Platform', 'حذف المنصة'),
            message: t('This will permanently remove this platform connection. Continue?', 'سيتم حذف إعدادات المنصة نهائيا. هل تريد المتابعة؟'),
            confirmText: t('Delete', 'حذف'),
            variant: 'danger',
        });
        if (!ok) return;
        setDeletingPlatformId(id);
        try {
            await platformsApi.delete(id);
            await load();
            success(t('Platform deleted', 'تم حذف المنصة'));
        } catch (err: any) {
            showError(err?.message || t('Failed to delete platform', 'تعذر حذف المنصة'));
        } finally {
            setDeletingPlatformId(null);
        }
    };

    const avgCommission = platforms.length
        ? (platforms.reduce((sum, p) => sum + (p.feePercentage || 0), 0) / platforms.length).toFixed(1)
        : '0';
    const pricedPlatforms = platforms.filter((p) => p.applyFeesToMenuPrice).length;

    return (
        <div className="p-4 md:p-8 lg:p-10 bg-app min-h-screen pb-24" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-xl shadow-purple-600/20">
                            <Globe size={28} />
                        </div>
                        <h2 className="text-3xl font-black text-main tracking-tight">{isAr ? 'منصات التوصيل' : 'Platforms'}</h2>
                    </div>
                    <p className="text-muted font-bold text-xs uppercase tracking-widest opacity-70">
                        {isAr ? 'إدارة عمولات وأسعار منصات التوصيل' : 'Manage delivery platform commissions and menu pricing'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <ExportButton
                        data={platforms}
                        columns={[
                            { key: 'name', label: t('Platform', 'المنصة') },
                            { key: 'integrationType', label: t('Type', 'النوع') },
                            { key: 'feePercentage', label: t('Commission %', 'نسبة العمولة'), format: (v: any) => `${v || 0}%` },
                            { key: 'applyFeesToMenuPrice', label: t('Price includes fee', 'السعر شامل العمولة'), format: (v: any) => v ? t('Yes', 'نعم') : t('No', 'لا') },
                        ]}
                        filename="platforms"
                        title={t('Platforms Report', 'تقرير المنصات')}
                    />
                    <button onClick={openCreate} className="bg-purple-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:bg-purple-700 transition-colors">
                        <Plus size={14} /> {isAr ? 'إضافة منصة' : 'Add Platform'}
                    </button>
                    <button type="button" aria-label={isAr ? 'تحديث المنصات' : 'Refresh platforms'} onClick={load} disabled={isLoading} className="bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 disabled:opacity-60">
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                {[
                    { label: isAr ? 'المنصات' : 'Connected Platforms', value: platforms.length, icon: Globe, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                    { label: isAr ? 'متوسط العمولة' : 'Avg Commission', value: `${avgCommission}%`, icon: DollarSign, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { label: isAr ? 'أسعار منصة' : 'Priced Platforms', value: pricedPlatforms, icon: Layers, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                ].map((stat) => (
                    <div key={stat.label} className="card-primary border border-border p-5 rounded-2xl shadow-sm">
                        <div className={`w-9 h-9 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center mb-3`}><stat.icon size={16} /></div>
                        <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-0.5">{stat.label}</p>
                        <h4 className="text-xl font-black text-main">{stat.value}</h4>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {isLoading && <p className="text-muted col-span-full text-center py-12">{isAr ? 'جار التحميل...' : 'Loading...'}</p>}
                {!isLoading && platforms.length === 0 && <p className="text-muted col-span-full text-center py-12">{isAr ? 'لا توجد منصات بعد.' : 'No platforms connected yet.'}</p>}
                {platforms.map((platform) => (
                    <div key={platform.id} className="card-primary border border-border rounded-2xl p-6 shadow-sm hover:border-purple-500/40 transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                                    <Globe size={24} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-main">{platform.name}</h4>
                                    <p className="text-[9px] font-bold text-muted uppercase">{platform.integrationType || 'MANUAL'}</p>
                                </div>
                            </div>
                            <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${platform.isActive !== false ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                                {platform.isActive !== false ? (isAr ? 'نشط' : 'Active') : (isAr ? 'متوقف' : 'Inactive')}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="p-3 bg-app rounded-xl border border-border">
                                <p className="text-[8px] font-black text-muted uppercase tracking-widest">{isAr ? 'العمولة' : 'Commission'}</p>
                                <p className="text-lg font-black text-main">{platform.feePercentage || 0}%</p>
                            </div>
                            <div className="p-3 bg-app rounded-xl border border-border">
                                <p className="text-[8px] font-black text-muted uppercase tracking-widest">{isAr ? 'سعر المنيو' : 'Menu price'}</p>
                                <p className="text-xs font-bold text-muted truncate">
                                    {platform.applyFeesToMenuPrice
                                        ? `+${platform.priceMarkupPercentage || 0}% +${platform.priceMarkupFixed || 0} ${currency}`
                                        : (isAr ? 'السعر الأساسي' : 'Base menu')}
                                </p>
                            </div>
                        </div>

                        {platform.applyFeesToMenuPrice && (
                            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-600">
                                <CheckCircle2 size={13} />
                                {isAr ? 'العمولة مضافة فوق سعر الصنف للمنصة' : 'Platform fee is added over item prices'}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button onClick={() => openEdit(platform)} className="flex-1 py-2.5 bg-app border border-border rounded-xl text-[10px] font-black text-muted uppercase tracking-widest hover:text-main hover:border-purple-500/40 transition-colors flex items-center justify-center gap-1">
                                <Edit size={12} /> {isAr ? 'تعديل' : 'Edit'}
                            </button>
                            <button type="button" aria-label={isAr ? `حذف ${platform.name}` : `Delete ${platform.name}`} onClick={() => handleDelete(platform.id)} disabled={deletingPlatformId === platform.id} className="px-4 py-2.5 bg-app border border-border rounded-xl text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors disabled:opacity-60">
                                <Trash2 size={14} className={deletingPlatformId === platform.id ? 'animate-pulse' : ''} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="p-6 border-b border-border flex items-center justify-between">
                            <h3 className="text-lg font-black text-main">{editingPlatform ? (isAr ? 'تعديل منصة' : 'Edit Platform') : (isAr ? 'إضافة منصة' : 'Add Platform')}</h3>
                            <button onClick={() => setShowModal(false)} className="p-2 text-muted hover:text-main"><X size={18} /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            {!editingPlatform && (
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-2 block">{isAr ? 'اختيار سريع' : 'Quick Select'}</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PLATFORM_PRESETS.map((preset) => (
                                            <button
                                                key={preset.name}
                                                onClick={() => setForm({ ...form, name: preset.name, integrationType: preset.integrationType })}
                                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${form.name === preset.name ? 'bg-purple-500/10 border-purple-500/30 text-purple-500' : 'border-border text-muted hover:text-main'}`}
                                            >
                                                {preset.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'اسم المنصة' : 'Platform Name'}</label>
                                <input type="text" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-main" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'النوع' : 'Type'}</label>
                                    <select value={form.integrationType} onChange={(event) => setForm({ ...form, integrationType: event.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-main">
                                        <option value="MANUAL">{t('Manual', 'يدوي')}</option>
                                        <option value="DELIVERY">{t('Delivery', 'توصيل')}</option>
                                        <option value="AGGREGATOR">{t('Aggregator', 'مجمّع')}</option>
                                        <option value="OTHER">{t('Other', 'أخرى')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'عمولة المنصة %' : 'Commission %'}</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.feePercentage}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            setForm({ ...form, feePercentage: value, priceMarkupPercentage: form.priceMarkupPercentage || value });
                                        }}
                                        className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-main"
                                    />
                                </div>
                            </div>

                            <div className="rounded-2xl border border-border bg-app/60 p-4 space-y-3">
                                <label className="flex items-center justify-between gap-4">
                                    <span>
                                        <span className="block text-[9px] font-black uppercase tracking-widest text-muted">{isAr ? 'إضافة العمولة على سعر الصنف' : 'Add fee over item price'}</span>
                                        <span className="block text-[10px] font-bold text-muted/70 mt-1">{isAr ? 'العميل يرى سعر نهائي واحد في الأوردر.' : 'Customer sees one final platform price.'}</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, applyFeesToMenuPrice: !form.applyFeesToMenuPrice })}
                                        className={`w-12 h-6 rounded-full transition-all flex items-center ${form.applyFeesToMenuPrice ? 'bg-purple-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'}`}
                                    >
                                        <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
                                    </button>
                                </label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'نسبة زيادة %' : 'Markup %'}</label>
                                        <input type="number" min="0" step="0.01" value={form.priceMarkupPercentage} onChange={(event) => setForm({ ...form, priceMarkupPercentage: event.target.value })} disabled={!form.applyFeesToMenuPrice} className="w-full px-4 py-3 bg-card border border-border rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-main disabled:opacity-50" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? `قيمة ثابتة ${currency}` : `Fixed ${currency}`}</label>
                                        <input type="number" min="0" step="0.01" value={form.priceMarkupFixed} onChange={(event) => setForm({ ...form, priceMarkupFixed: event.target.value })} disabled={!form.applyFeesToMenuPrice} className="w-full px-4 py-3 bg-card border border-border rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-main disabled:opacity-50" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'API Key اختياري' : 'API Key optional'}</label>
                                <input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={t('Enter API key...', 'اكتب مفتاح الربط...')} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-main" />
                            </div>
                        </div>

                        <div className="p-6 border-t border-border flex gap-3">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-3 bg-app border border-border rounded-xl text-xs font-black text-muted uppercase tracking-widest">{isAr ? 'إلغاء' : 'Cancel'}</button>
                            <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 bg-purple-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-purple-700 transition-colors disabled:opacity-60">
                                {isSaving ? t('Saving...', 'جار الحفظ...') : editingPlatform ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة' : 'Add')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlatformAggregator;
