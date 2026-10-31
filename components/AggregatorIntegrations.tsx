import React, { useEffect, useState } from 'react';
import { FlaskConical, Store } from 'lucide-react';
import { aggregatorsApi } from '../services/api/platforms';
import { branchesApi } from '../services/api/branches';
import { useAuthStore } from '../stores/useAuthStore';
import { useToast } from './common/ToastProvider';
import IntegrationHealthPanel from './IntegrationHealthPanel';

/**
 * Other aggregators (Elmenus / Mrsool / Fast / Generic).
 * Each provider: enable + shared secret + store→branch map + branch allowlist.
 * Webhook each provider registers with the platform:
 *   POST /api/integrations/{provider}/webhook
 */
const AggregatorIntegrations: React.FC = () => {
    const { settings } = useAuthStore();
    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const { success, error: showError } = useToast();
    const t = (en: string, ar: string) => (isAr ? ar : en);

    const [providers, setProviders] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);
    const [form, setForm] = useState<any>({});
    const [mapStore, setMapStore] = useState('');
    const [mapBranch, setMapBranch] = useState('');
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            setProviders(await aggregatorsApi.providers());
        } catch (err: any) {
            showError(err?.message || t('Failed to load', 'تعذر التحميل'));
        }
        try {
            setBranches(await branchesApi.getAll());
        } catch { /* optional */ }
    };

    useEffect(() => { load(); }, []);

    const open = (p: any) => {
        setOpenId(p.id);
        setForm({
            enabled: Boolean(p.config?.enabled),
            webhookSecret: '',
            defaultBranchId: p.config?.defaultBranchId || '',
            storeBranchMap: p.config?.storeBranchMap || {},
            branchIds: p.config?.branchIds || [],
        });
        setMapStore('');
        setMapBranch('');
    };

    const toggleBranch = (id: string) => {
        const list: string[] = form.branchIds || [];
        setForm({ ...form, branchIds: list.includes(id) ? list.filter((b) => b !== id) : [...list, id] });
    };

    const save = async (id: string) => {
        setSaving(true);
        try {
            const payload: any = { ...form };
            if (!payload.webhookSecret) delete payload.webhookSecret;
            await aggregatorsApi.update(id, payload);
            await load();
            setOpenId(null);
            success(t('Saved', 'تم الحفظ'));
        } catch (err: any) {
            showError(err?.message || t('Save failed', 'فشل الحفظ'));
        } finally {
            setSaving(false);
        }
    };

    const test = async (id: string) => {
        try {
            const r = await aggregatorsApi.testOrder(id, {});
            success(t(`Test order ${r.orderId}`, `طلب تجريبي ${r.orderId}`));
        } catch (err: any) {
            showError(err?.message || t('Test failed', 'فشل الاختبار'));
        }
    };

    return (
        <div className="card-primary border border-border rounded-2xl p-6 shadow-sm mb-6">
            <h4 className="text-sm font-black text-main mb-1">{isAr ? 'منصات أخرى (مرسول / المنيوز / فاست)' : 'Other aggregators (Mrsool / Elmenus / Fast)'}</h4>
            <p className="text-[10px] font-bold text-muted mb-4">
                {isAr
                    ? 'فعّل فقط ما تحتاجه. كل منصة لها secret وربط متاجر خاص. أي spec رسمي يصل لاحقا يتربط دون تغيير الواجهة.'
                    : 'Enable only what you need. Each provider has its own secret and store mapping.'}
            </p>
            <IntegrationHealthPanel />
            <div className="space-y-3">
                {providers.map((p) => (
                    <div key={p.id} className="rounded-xl border border-border bg-app/60 p-4">
                        <div className="flex items-center justify-between">
                            <button className="flex items-center gap-3 text-left" onClick={() => (openId === p.id ? setOpenId(null) : open(p))}>
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                    <Store size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-main">{isAr ? p.nameAr : p.name}</p>
                                    <p className="text-[9px] font-bold text-muted uppercase" dir="ltr">/api/integrations/{p.id}/webhook</p>
                                </div>
                            </button>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${p.config?.enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                                    {p.config?.enabled ? (isAr ? 'مفعل' : 'On') : (isAr ? 'مغلق' : 'Off')}
                                </span>
                                <button onClick={() => test(p.id)} title={isAr ? 'طلب تجريبي' : 'Test order'} className="p-2 text-muted hover:text-main">
                                    <FlaskConical size={14} />
                                </button>
                            </div>
                        </div>

                        {openId === p.id && (
                            <div className="mt-3 space-y-3 border-t border-border pt-3">
                                <label className="flex items-center justify-between gap-4">
                                    <span className="text-[10px] font-bold text-muted">{isAr ? 'تفعيل الاستقبال' : 'Enable receiving'}</span>
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, enabled: !form.enabled })}
                                        className={`w-12 h-6 rounded-full transition-all flex items-center ${form.enabled ? 'bg-indigo-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'}`}
                                    >
                                        <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
                                    </button>
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">
                                            webhook secret {p.config?.webhookSecretSet && <span className="text-emerald-500">(محفوظ)</span>}
                                        </label>
                                        <input type="password" value={form.webhookSecret} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} placeholder={isAr ? 'فارغ = الاحتفاظ' : 'Blank keeps saved'} className="w-full px-4 py-3 bg-card border border-border rounded-xl text-xs font-bold outline-none focus:border-indigo-500 text-main" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{isAr ? 'الفرع الافتراضي' : 'Default branch'}</label>
                                        <select value={form.defaultBranchId} onChange={(e) => setForm({ ...form, defaultBranchId: e.target.value })} className="w-full px-4 py-3 bg-card border border-border rounded-xl text-xs font-bold outline-none focus:border-indigo-500 text-main">
                                            <option value="">{isAr ? 'اختر' : 'Select'}</option>
                                            {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-2">{isAr ? 'ربط المتاجر بالفروع' : 'Store → branch map'}</p>
                                    {Object.entries(form.storeBranchMap || {}).map(([s, b]) => (
                                        <div key={s} className="flex items-center gap-2 mb-1 text-xs">
                                            <code className="px-2 py-1 bg-card border border-border rounded-lg font-bold" dir="ltr">{s}</code>
                                            <span className="text-muted">→</span>
                                            <span className="font-bold">{branches.find((x: any) => x.id === b)?.name || (b as string)}</span>
                                            <button className="text-rose-500 font-black px-2" onClick={() => { const m = { ...form.storeBranchMap }; delete m[s]; setForm({ ...form, storeBranchMap: m }); }}>×</button>
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
                                            onClick={() => { if (!mapStore.trim() || !mapBranch) return; setForm({ ...form, storeBranchMap: { ...(form.storeBranchMap || {}), [mapStore.trim()]: mapBranch } }); setMapStore(''); setMapBranch(''); }}
                                        >+</button>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-2">{isAr ? 'الفروع المسموحة (فارغ = الكل)' : 'Allowed branches (empty = all)'}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {branches.map((b: any) => (
                                            <button
                                                key={b.id}
                                                onClick={() => toggleBranch(b.id)}
                                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black border transition-all ${(form.branchIds || []).includes(b.id) ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500' : 'border-border text-muted'}`}
                                            >
                                                {b.name || b.id}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => save(p.id)} disabled={saving} className="w-full py-3 bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-colors disabled:opacity-60">
                                    {saving ? t('Saving...', 'جار الحفظ...') : t('Save', 'حفظ')}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AggregatorIntegrations;
