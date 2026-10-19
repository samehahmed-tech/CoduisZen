import React, { useEffect, useState } from 'react';
import { CheckCircle2, DollarSign, Edit, Globe, Layers, Plus, RefreshCw, Trash2, X, Link2, FlaskConical } from 'lucide-react';
import { platformsApi, talabatApi } from '../services/api/platforms';
import { branchesApi } from '../services/api/branches';
import AggregatorIntegrations from './AggregatorIntegrations';
import PaymentIntegrations from './PaymentIntegrations';
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

    // ── Talabat direct integration (Partner API v2) ──
    const [talabat, setTalabat] = useState<any>(null);
    const [talabatForm, setTalabatForm] = useState<any>({ enabled: false, chainId: '', clientId: '', clientSecret: '', webhookSecret: '', transport: 'LOGISTICS_DELIVERY', autoAccept: true, defaultBranchId: '', storeBranchMap: {}, sandbox: false });
    const [talabatSaving, setTalabatSaving] = useState(false);
    const [talabatTesting, setTalabatTesting] = useState(false);
    const [branches, setBranches] = useState<any[]>([]);
    const [mapStore, setMapStore] = useState('');
    const [mapBranch, setMapBranch] = useState('');

    // ── Talabat catalog sync ──
    const [catalogVendor, setCatalogVendor] = useState('');
    const [catalogInfo, setCatalogInfo] = useState<any>(null);
    const [catalogBusy, setCatalogBusy] = useState(false);

    const previewCatalog = async () => {
        setCatalogBusy(true);
        try {
            setCatalogInfo(await talabatApi.catalogPreview());
        } catch (err: any) {
            showError(err?.message || t('Preview failed', 'فشلت المعاينة'));
        } finally {
            setCatalogBusy(false);
        }
    };

    const pushCatalog = async () => {
        if (!catalogVendor.trim()) {
            showError(t('Enter vendor id', 'اكتب vendor id'));
            return;
        }
        setCatalogBusy(true);
        try {
            const job = await talabatApi.catalogPush(catalogVendor.trim());
            setCatalogInfo(job);
            success(t(`Push queued ${job.job_id}`, `أُرسل ${job.job_id}`));
        } catch (err: any) {
            showError(err?.message || t('Push failed', 'فشل الإرسال'));
        } finally {
            setCatalogBusy(false);
        }
    };

    const checkCatalogJob = async () => {
        const jobId = String(catalogInfo?.job_id || '').trim();
        if (!jobId) return;
        setCatalogBusy(true);
        try {
            setCatalogInfo(await talabatApi.catalogJob(jobId));
        } catch (err: any) {
            showError(err?.message || t('Job check failed', 'تعذر فحص المهمة'));
        } finally {
            setCatalogBusy(false);
        }
    };

    // ── Talabat outlet status ──
    const [outletVendor, setOutletVendor] = useState('');
    const [outletInfo, setOutletInfo] = useState<any>(null);
    const [outletBusy, setOutletBusy] = useState(false);
    const [busyMinutes, setBusyMinutes] = useState('30');

    const loadOutlet = async () => {
        if (!outletVendor.trim()) {
            showError(t('Enter vendor id', 'اكتب vendor id'));
            return;
        }
        setOutletBusy(true);
        try {
            setOutletInfo(await talabatApi.outletStatus(outletVendor.trim()));
        } catch (err: any) {
            showError(err?.message || t('Status check failed', 'تعذر فحص الحالة'));
        } finally {
            setOutletBusy(false);
        }
    };

    const setOutlet = async (data: any) => {
        if (!outletVendor.trim()) {
            showError(t('Enter vendor id', 'اكتب vendor id'));
            return;
        }
        setOutletBusy(true);
        try {
            setOutletInfo(await talabatApi.outletUpdate(outletVendor.trim(), data));
            success(t('Outlet updated', 'تم تحديث الفرع'));
        } catch (err: any) {
            showError(err?.message || t('Update failed', 'فشل التحديث'));
        } finally {
            setOutletBusy(false);
        }
    };

    // ── Talabat promotions ──
    const [promo, setPromo] = useState<any>({ vendors: '', name: '', skus: '', discountValue: '10', startTime: '', endTime: '', reason: 'COMPETITIVENESS' });
    const [promoInfo, setPromoInfo] = useState<any>(null);
    const [promoBusy, setPromoBusy] = useState(false);

    const pushPromo = async () => {
        setPromoBusy(true);
        try {
            const job = await talabatApi.promoPush(promo);
            setPromoInfo(job);
            success(t(`Promo queued ${job.job_id}`, `أُرسل العرض ${job.job_id}`));
        } catch (err: any) {
            showError(err?.message || t('Promo failed', 'فشل العرض'));
        } finally {
            setPromoBusy(false);
        }
    };

    const checkPromoJob = async () => {
        const jobId = String(promoInfo?.job_id || '').trim();
        if (!jobId) return;
        setPromoBusy(true);
        try {
            setPromoInfo(await talabatApi.promoJob(jobId));
        } catch (err: any) {
            showError(err?.message || t('Job check failed', 'تعذر فحص المهمة'));
        } finally {
            setPromoBusy(false);
        }
    };

    const loadTalabat = async () => {
        try {
            const cfg = await talabatApi.getConfig();
            setTalabat(cfg);
            setTalabatForm({
                enabled: Boolean(cfg.enabled),
                chainId: cfg.chainId || '',
                clientId: cfg.clientId || '',
                clientSecret: '',
                webhookSecret: '',
                transport: cfg.transport || 'LOGISTICS_DELIVERY',
                autoAccept: cfg.autoAccept !== false,
                defaultBranchId: cfg.defaultBranchId || '',
                storeBranchMap: cfg.storeBranchMap || {},
                sandbox: Boolean(cfg.sandbox),
            });
        } catch { /* optional feature */ }
        try {
            setBranches(await branchesApi.getAll());
        } catch { /* optional */ }
    };

    const saveTalabat = async () => {
        setTalabatSaving(true);
        try {
            const payload: any = { ...talabatForm };
            if (!payload.clientSecret) delete payload.clientSecret;
            if (!payload.webhookSecret) delete payload.webhookSecret;
            await talabatApi.saveConfig(payload);
            await loadTalabat();
            success(t('Talabat config saved', 'تم حفظ إعدادات طلبات'));
        } catch (err: any) {
            showError(err?.message || t('Failed to save', 'تعذر الحفظ'));
        } finally {
            setTalabatSaving(false);
        }
    };

    const sendTalabatTest = async () => {
        setTalabatTesting(true);
        try {
            const r = await talabatApi.testOrder({});
            success(t(`Test order ${r.orderId}`, `طلب تجريبي ${r.orderId}`));
        } catch (err: any) {
            showError(err?.message || t('Test failed', 'فشل الاختبار'));
        } finally {
            setTalabatTesting(false);
        }
    };

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

    useEffect(() => { loadTalabat(); }, []);

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

    // Delete = deactivate (server soft-deletes to preserve order/menu
    // history). A separate toggle restores it — nothing is ever destroyed.
    const handleDelete = async (id: string) => {
        if (deletingPlatformId) return;
        const ok = await confirm({
            title: t('Pause Platform', 'إيقاف المنصة'),
            message: t('This pauses the platform (history is kept). You can re-activate it anytime. Continue?', 'سيتم إيقاف المنصة مؤقتاً (السجل محفوظ) ويمكن إعادة تفعيلها. متابعة؟'),
            confirmText: t('Pause', 'إيقاف'),
            variant: 'danger',
        });
        if (!ok) return;
        setDeletingPlatformId(id);
        try {
            await platformsApi.delete(id);
            await load();
            success(t('Platform paused', 'تم إيقاف المنصة'));
        } catch (err: any) {
            showError(err?.message || t('Failed to pause platform', 'تعذر إيقاف المنصة'));
        } finally {
            setDeletingPlatformId(null);
        }
    };

    const handleToggleActive = async (platform: DeliveryPlatform) => {
        try {
            await platformsApi.update(platform.id, { isActive: !(platform.isActive !== false) });
            await load();
            success(!(platform.isActive !== false)
                ? t('Platform activated', 'تم تفعيل المنصة')
                : t('Platform paused', 'تم إيقاف المنصة'));
        } catch (err: any) {
            showError(err?.message || t('Failed to update platform', 'تعذر تحديث المنصة'));
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

            {/* ── Talabat direct integration ── */}
            <div className="card-primary border border-orange-500/30 rounded-2xl p-6 shadow-sm mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                            <Link2 size={24} />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-main">{isAr ? 'ربط طلبات المباشر' : 'Talabat Direct'}</h4>
                            <p className="text-[9px] font-bold text-muted uppercase">Partner API v2 · webhook: <span dir="ltr">/api/integrations/talabat/webhook</span></p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setTalabatForm({ ...talabatForm, enabled: !talabatForm.enabled })}
                        className={`w-12 h-6 rounded-full transition-all flex items-center ${talabatForm.enabled ? 'bg-orange-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'}`}
                    >
                        <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">chainId</label>
                        <input value={talabatForm.chainId} onChange={(e) => setTalabatForm({ ...talabatForm, chainId: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" placeholder="xxxxxxxx-xxxx-..." />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">client_id</label>
                        <input value={talabatForm.clientId} onChange={(e) => setTalabatForm({ ...talabatForm, clientId: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">client_secret {talabat?.clientSecretSet && <span className="text-emerald-500">(محفوظ)</span>}</label>
                        <input type="password" value={talabatForm.clientSecret} onChange={(e) => setTalabatForm({ ...talabatForm, clientSecret: e.target.value })} placeholder={isAr ? 'فارغ = الاحتفاظ' : 'Blank keeps saved'} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">webhook secret {talabat?.webhookSecretSet && <span className="text-emerald-500">(محفوظ)</span>}</label>
                        <input type="password" value={talabatForm.webhookSecret} onChange={(e) => setTalabatForm({ ...talabatForm, webhookSecret: e.target.value })} placeholder={isAr ? 'إجباري من Partner Portal' : 'Required'} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'نوع التوصيل' : 'Transport'}</label>
                        <select value={talabatForm.transport} onChange={(e) => setTalabatForm({ ...talabatForm, transport: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main">
                            <option value="LOGISTICS_DELIVERY">{isAr ? 'طيار طلبات (READY_FOR_PICKUP)' : 'Talabat rider'}</option>
                            <option value="VENDOR_DELIVERY">{isAr ? 'توصيل المطعم (DISPATCHED)' : 'Own delivery'}</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'الفرع الافتراضي' : 'Default branch'}</label>
                        <select value={talabatForm.defaultBranchId} onChange={(e) => setTalabatForm({ ...talabatForm, defaultBranchId: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main">
                            <option value="">{isAr ? 'اختر' : 'Select'}</option>
                            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
                        </select>
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-app/60 p-3 mb-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-2">{isAr ? 'ربط المتاجر بالفروع (store_id → فرع)' : 'Store → branch map'}</p>
                    {Object.entries(talabatForm.storeBranchMap || {}).map(([s, b]) => (
                        <div key={s} className="flex items-center gap-2 mb-1 text-xs">
                            <code className="px-2 py-1 bg-card border border-border rounded-lg font-bold" dir="ltr">{s}</code>
                            <span className="text-muted">→</span>
                            <span className="font-bold">{branches.find((x: any) => x.id === b)?.name || b}</span>
                            <button className="text-rose-500 font-black px-2" onClick={() => { const m = { ...talabatForm.storeBranchMap }; delete m[s]; setTalabatForm({ ...talabatForm, storeBranchMap: m }); }}>×</button>
                        </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                        <input value={mapStore} onChange={(e) => setMapStore(e.target.value)} placeholder="store_id" className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-xs font-bold text-main" dir="ltr" />
                        <select value={mapBranch} onChange={(e) => setMapBranch(e.target.value)} className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-xs font-bold text-main">
                            <option value="">{isAr ? 'فرع' : 'Branch'}</option>
                            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
                        </select>
                        <button
                            className="px-4 py-2 bg-app border border-border rounded-lg text-xs font-black"
                            onClick={() => { if (!mapStore.trim() || !mapBranch) return; setTalabatForm({ ...talabatForm, storeBranchMap: { ...(talabatForm.storeBranchMap || {}), [mapStore.trim()]: mapBranch } }); setMapStore(''); setMapBranch(''); }}
                        >+</button>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button onClick={saveTalabat} disabled={talabatSaving} className="flex-1 py-3 bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-600 transition-colors disabled:opacity-60">
                        {talabatSaving ? t('Saving...', 'جار الحفظ...') : t('Save Talabat', 'حفظ طلبات')}
                    </button>
                    <button onClick={sendTalabatTest} disabled={talabatTesting} className="px-4 py-3 bg-app border border-border rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-60">
                        <FlaskConical size={14} /> {isAr ? 'طلب تجريبي' : 'Test'}
                    </button>
                </div>

                <label className="flex items-center justify-between gap-4 mt-3 rounded-xl border border-border bg-app/60 px-3 py-2">
                    <span className="text-[10px] font-bold text-muted">{isAr ? 'وضع Sandbox (كتالوج وأوردرات فقط)' : 'Sandbox mode (catalog + orders only)'}</span>
                    <button
                        type="button"
                        onClick={() => setTalabatForm({ ...talabatForm, sandbox: !talabatForm.sandbox })}
                        className={`w-12 h-6 rounded-full transition-all flex items-center ${talabatForm.sandbox ? 'bg-orange-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'}`}
                    >
                        <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
                    </button>
                </label>
            </div>

            {/* ── Talabat catalog sync ── */}
            <div className="card-primary border border-orange-500/30 rounded-2xl p-6 shadow-sm mb-6">
                <h4 className="text-sm font-black text-main mb-1">{isAr ? 'مزامنة أسعار وإتاحة المنيو' : 'Menu price & availability sync'}</h4>
                <p className="text-[10px] font-bold text-muted mb-3">{isAr ? 'تعديل السعر أو الإتاحة في المنيو يُدفع تلقائيا لكل الفروع المربوطة. PUT غير متزامن (202 + متابعة المهمة).' : 'Menu price/availability edits auto-push to all mapped vendors. Async PUT (202 + job tracking).'}</p>
                <div className="flex gap-2 mb-3">
                    <input value={catalogVendor} onChange={(e) => setCatalogVendor(e.target.value)} placeholder="vendor_id" className="flex-1 px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" dir="ltr" />
                    <button onClick={previewCatalog} disabled={catalogBusy} className="px-4 py-3 bg-app border border-border rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-60">{isAr ? 'معاينة' : 'Preview'}</button>
                    <button onClick={pushCatalog} disabled={catalogBusy} className="px-4 py-3 bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-600 transition-colors disabled:opacity-60">{isAr ? 'دفع الكل' : 'Push all'}</button>
                    {catalogInfo?.job_id && <button onClick={checkCatalogJob} disabled={catalogBusy} className="px-4 py-3 bg-app border border-border rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-60">{isAr ? 'حالة المهمة' : 'Job status'}</button>}
                </div>
                {catalogInfo && (
                    <pre className="max-h-48 overflow-auto rounded-xl border border-border bg-app p-3 text-[10px] font-mono text-muted" dir="ltr">{JSON.stringify(catalogInfo, null, 2).slice(0, 2000)}</pre>
                )}
            </div>

            {/* ── Talabat outlet status ── */}
            <div className="card-primary border border-orange-500/30 rounded-2xl p-6 shadow-sm mb-6">
                <h4 className="text-sm font-black text-main mb-1">{isAr ? 'حالة الفرع على طلبات' : 'Outlet status on Talabat'}</h4>
                <p className="text-[10px] font-bold text-muted mb-3">{isAr ? 'مشغول = إغلاق مؤقت بسبب المطبخ. الإنتاج فقط.' : 'Busy = temporary kitchen closure. Production only.'}</p>
                <div className="flex gap-2 mb-3">
                    <input value={outletVendor} onChange={(e) => setOutletVendor(e.target.value)} placeholder="vendor_id" className="flex-1 px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" dir="ltr" />
                    <button onClick={loadOutlet} disabled={outletBusy} className="px-4 py-3 bg-app border border-border rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-60">{isAr ? 'الحالة' : 'Status'}</button>
                    <button onClick={() => setOutlet({ status: 'OPEN' })} disabled={outletBusy} className="px-4 py-3 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors disabled:opacity-60">{isAr ? 'فتح' : 'Open'}</button>
                </div>
                <div className="flex gap-2">
                    <input type="number" min="5" step="5" value={busyMinutes} onChange={(e) => setBusyMinutes(e.target.value)} className="w-24 px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" dir="ltr" />
                    <button onClick={() => setOutlet({ busyMinutes: Number(busyMinutes) || 30 })} disabled={outletBusy} className="flex-1 py-3 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-600 transition-colors disabled:opacity-60">{isAr ? 'مشغول (دقائق)' : 'Set busy (mins)'}</button>
                    <button onClick={() => setOutlet({ status: 'CLOSED_TODAY', closed_reason: 'CLOSED' })} disabled={outletBusy} className="px-4 py-3 bg-app border border-rose-500/40 rounded-xl text-xs font-black uppercase tracking-widest text-rose-500 disabled:opacity-60">{isAr ? 'غلق اليوم' : 'Close day'}</button>
                </div>
                {outletInfo && (
                    <pre className="max-h-32 overflow-auto rounded-xl border border-border bg-app p-3 text-[10px] font-mono text-muted mt-3" dir="ltr">{JSON.stringify(outletInfo, null, 2).slice(0, 1000)}</pre>
                )}
            </div>

            {/* ── Talabat promotions ── */}
            <div className="card-primary border border-orange-500/30 rounded-2xl p-6 shadow-sm mb-6">
                <h4 className="text-sm font-black text-main mb-1">{isAr ? 'عرض سعر على طلبات' : 'Talabat strikethrough promo'}</h4>
                <p className="text-[10px] font-bold text-muted mb-3">{isAr ? 'الهوية = الاسم + الفروع + التواريخ. نفس البيانات تحدث العرض. الإنتاج فقط.' : 'Identity = name + vendors + dates. Same values update the promo. Production only.'}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'الاسم' : 'Name'}</label>
                        <input value={promo.name} onChange={(e) => setPromo({ ...promo, name: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">vendors (* = الكل)</label>
                        <input value={promo.vendors} onChange={(e) => setPromo({ ...promo, vendors: e.target.value })} placeholder="urd8, ..." className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" dir="ltr" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">SKUs (فاصلة)</label>
                        <textarea value={promo.skus} onChange={(e) => setPromo({ ...promo, skus: e.target.value })} rows={2} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" dir="ltr" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'خصم %' : 'Discount %'}</label>
                        <input type="number" min="1" max="100" value={promo.discountValue} onChange={(e) => setPromo({ ...promo, discountValue: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" dir="ltr" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'السبب' : 'Reason'}</label>
                        <select value={promo.reason} onChange={(e) => setPromo({ ...promo, reason: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main">
                            {['COMPETITIVENESS', 'OVERSTOCK', 'EXPIRING_SOON', 'TRADING', 'DELISTING', 'NMR'].map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'من' : 'From'}</label>
                        <input type="datetime-local" value={promo.startTime} onChange={(e) => setPromo({ ...promo, startTime: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" dir="ltr" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'إلى' : 'To'}</label>
                        <input type="datetime-local" value={promo.endTime} onChange={(e) => setPromo({ ...promo, endTime: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-main" dir="ltr" />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={pushPromo} disabled={promoBusy} className="flex-1 py-3 bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-600 transition-colors disabled:opacity-60">{isAr ? 'إرسال العرض' : 'Push promo'}</button>
                    {promoInfo?.job_id && <button onClick={checkPromoJob} disabled={promoBusy} className="px-4 py-3 bg-app border border-border rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-60">{isAr ? 'حالة المهمة' : 'Job status'}</button>}
                </div>
                {promoInfo && (
                    <pre className="max-h-32 overflow-auto rounded-xl border border-border bg-app p-3 text-[10px] font-mono text-muted mt-3" dir="ltr">{JSON.stringify(promoInfo, null, 2).slice(0, 1000)}</pre>
                )}
            </div>

            <AggregatorIntegrations />
            <PaymentIntegrations />

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
                            {platform.isActive !== false ? (
                                <button type="button" aria-label={isAr ? `إيقاف ${platform.name}` : `Pause ${platform.name}`} title={isAr ? 'إيقاف مؤقت (يحفظ السجل)' : 'Pause (keeps history)'} onClick={() => handleDelete(platform.id)} disabled={deletingPlatformId === platform.id} className="px-4 py-2.5 bg-app border border-border rounded-xl text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors disabled:opacity-60">
                                    <Trash2 size={14} className={deletingPlatformId === platform.id ? 'animate-pulse' : ''} />
                                </button>
                            ) : (
                                <button type="button" aria-label={isAr ? `تفعيل ${platform.name}` : `Activate ${platform.name}`} title={isAr ? 'إعادة تفعيل' : 'Re-activate'} onClick={() => handleToggleActive(platform)} className="px-4 py-2.5 bg-app border border-emerald-500/40 rounded-xl text-emerald-500 hover:bg-emerald-500/10 transition-colors">
                                    <CheckCircle2 size={14} />
                                </button>
                            )}
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
                                <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">
                                    {isAr ? 'API Key اختياري' : 'API Key optional'}
                                    {editingPlatform && (editingPlatform as any).apiKeySet && (
                                        <span className="ms-2 rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-500">{isAr ? 'محفوظ' : 'saved'}</span>
                                    )}
                                </label>
                                <input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={editingPlatform ? t('Blank keeps the saved key', 'فارغ = الاحتفاظ بالمفتاح') : t('Enter API key...', 'اكتب مفتاح الربط...')} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-purple-500 text-main" />
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
