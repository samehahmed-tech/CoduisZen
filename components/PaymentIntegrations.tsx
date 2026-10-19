import React, { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { paymobApi } from '../services/api/platforms';
import { branchesApi } from '../services/api/branches';
import { useAuthStore } from '../stores/useAuthStore';
import { useToast } from './common/ToastProvider';

/**
 * Online payments (Paymob cards + InstaPay through Paymob).
 * InstaPay has no standalone merchant API — it runs on the Paymob
 * account's InstaPay integration id. Both are toggled here per need.
 */
const PaymentIntegrations: React.FC = () => {
    const { settings } = useAuthStore();
    const lang = settings.language || 'en';
    const isAr = lang === 'ar';
    const { success, error: showError } = useToast();
    const t = (en: string, ar: string) => (isAr ? ar : en);

    const [cfg, setCfg] = useState<any>(null);
    const [form, setForm] = useState<any>({ enabled: false, apiKey: '', cardIntegrationId: '', instapayIntegrationId: '', iframeId: '', hmacSecret: '', branchIds: [] });
    const [branches, setBranches] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const c = await paymobApi.getConfig();
            setCfg(c);
            setForm({
                enabled: Boolean(c.enabled),
                apiKey: '',
                cardIntegrationId: c.cardIntegrationId || '',
                instapayIntegrationId: c.instapayIntegrationId || '',
                iframeId: c.iframeId || '',
                hmacSecret: '',
                branchIds: c.branchIds || [],
            });
        } catch (err: any) {
            showError(err?.message || t('Failed to load', 'تعذر التحميل'));
        }
        try {
            setBranches(await branchesApi.getAll());
        } catch { /* optional */ }
    };

    useEffect(() => { load(); }, []);

    const toggleBranch = (id: string) => {
        const list: string[] = form.branchIds || [];
        setForm({ ...form, branchIds: list.includes(id) ? list.filter((b) => b !== id) : [...list, id] });
    };

    const save = async () => {
        setSaving(true);
        try {
            const payload: any = { ...form };
            if (!payload.apiKey) delete payload.apiKey;
            if (!payload.hmacSecret) delete payload.hmacSecret;
            await paymobApi.saveConfig(payload);
            await load();
            success(t('Payment config saved', 'تم حفظ إعدادات الدفع'));
        } catch (err: any) {
            showError(err?.message || t('Save failed', 'فشل الحفظ'));
        } finally {
            setSaving(false);
        }
    };

    const instapayReady = Boolean(cfg?.enabled && cfg?.instapayIntegrationId);

    return (
        <div className="card-primary border border-emerald-500/30 rounded-2xl p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        <CreditCard size={24} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-main">{isAr ? 'الدفع أونلاين (Paymob)' : 'Online payments (Paymob)'}</h4>
                        <p className="text-[9px] font-bold text-muted uppercase" dir="ltr">/api/payments/paymob/webhook</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setForm({ ...form, enabled: !form.enabled })}
                    className={`w-12 h-6 rounded-full transition-all flex items-center ${form.enabled ? 'bg-emerald-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'}`}
                >
                    <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
                </button>
            </div>
            <p className="text-[10px] font-bold text-muted mb-3">
                {isAr
                    ? 'بطاقات عبر iframe المستضاف. InstaPay يعمل عبر نفس حساب Paymob (ضع integration id الخاص به). الكول باك متحقق HMAC ويسجل في المدفوعات.'
                    : 'Cards via hosted iframe. InstaPay runs on the same Paymob account (set its integration id). Callbacks are HMAC-verified and ledgered.'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">API Key {cfg?.apiKeySet && <span className="text-emerald-500">(محفوظ)</span>}</label>
                    <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={isAr ? 'فارغ = الاحتفاظ' : 'Blank keeps saved'} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-emerald-500 text-main" />
                </div>
                <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">HMAC Secret {cfg?.hmacSecretSet && <span className="text-emerald-500">(محفوظ)</span>}</label>
                    <input type="password" value={form.hmacSecret} onChange={(e) => setForm({ ...form, hmacSecret: e.target.value })} placeholder={isAr ? 'فارغ = الاحتفاظ' : 'Blank keeps saved'} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-emerald-500 text-main" />
                </div>
                <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">Card Integration ID</label>
                    <input value={form.cardIntegrationId} onChange={(e) => setForm({ ...form, cardIntegrationId: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-emerald-500 text-main" dir="ltr" />
                </div>
                <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">Iframe ID</label>
                    <input value={form.iframeId} onChange={(e) => setForm({ ...form, iframeId: e.target.value })} className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-emerald-500 text-main" dir="ltr" />
                </div>
                <div className="md:col-span-2 rounded-xl border border-border bg-app/60 p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-black text-main">InstaPay {instapayReady && <span className="text-emerald-500 text-[9px]">● {isAr ? 'جاهز' : 'ready'}</span>}</p>
                            <p className="text-[10px] font-bold text-muted">{isAr ? 'عبر Paymob — ضع integration id الخاص بـ InstaPay' : 'Via Paymob — set the InstaPay integration id'}</p>
                        </div>
                    </div>
                    <input value={form.instapayIntegrationId} onChange={(e) => setForm({ ...form, instapayIntegrationId: e.target.value })} placeholder="InstaPay Integration ID" className="mt-2 w-full px-4 py-3 bg-card border border-border rounded-xl text-xs font-bold outline-none focus:border-emerald-500 text-main" dir="ltr" />
                </div>
            </div>

            <div className="mb-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-2">{isAr ? 'الفروع المسموحة (فارغ = الكل)' : 'Allowed branches (empty = all)'}</p>
                <div className="flex flex-wrap gap-2">
                    {branches.map((b: any) => (
                        <button
                            key={b.id}
                            onClick={() => toggleBranch(b.id)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black border transition-all ${(form.branchIds || []).includes(b.id) ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'border-border text-muted'}`}
                        >
                            {b.name || b.id}
                        </button>
                    ))}
                </div>
            </div>

            <button onClick={save} disabled={saving} className="w-full py-3 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors disabled:opacity-60">
                {saving ? t('Saving...', 'جار الحفظ...') : t('Save payments', 'حفظ الدفع')}
            </button>
        </div>
    );
};

export default PaymentIntegrations;
