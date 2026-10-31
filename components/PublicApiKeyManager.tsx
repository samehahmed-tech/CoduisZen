import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Clipboard, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { publicApiKeysApi, PublicApiKeyMetadata } from '../services/api/publicApiKeys';

type BranchOption = { id: string; name?: string };

interface Props {
    branches: BranchOption[];
    lang: string;
    canManage: boolean;
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    tn: (en: string, ar: string) => string;
}

const dateLabel = (value: string | null, lang: string) => value
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium' }).format(new Date(value))
    : '—';

const PublicApiKeyManager: React.FC<Props> = ({ branches, lang, canManage, showToast, tn }) => {
    const [keys, setKeys] = useState<PublicApiKeyMetadata[]>([]);
    const [scopes, setScopes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [selectedScopes, setSelectedScopes] = useState<string[]>(['orders:read']);
    const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
    const [expiresAt, setExpiresAt] = useState('');
    const [newSecret, setNewSecret] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const activeKeys = useMemo(() => keys.filter(key => !key.revokedAt), [keys]);

    if (!canManage) {
        return <div className="p-5 rounded-2xl border border-border/20 bg-elevated/10 text-sm font-bold text-muted">{tn('Public API key management is restricted to owners and authorized administrators.', 'إدارة مفاتيح الـPublic API متاحة للمالكين والمديرين المصرح لهم فقط.')}</div>;
    }

    const load = async () => {
        setLoading(true);
        try {
            const response = await publicApiKeysApi.list();
            setKeys(response.data || []);
            setScopes(response.scopes || []);
        } catch (error: any) {
            showToast(error?.message || tn('Unable to load API keys', 'تعذر تحميل مفاتيح الـAPI'), 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const result = await publicApiKeysApi.create({
                name,
                scopes: selectedScopes,
                branchIds: selectedBranches,
                ...(expiresAt ? { expiresAt: new Date(`${expiresAt}T23:59:59.000Z`).toISOString() } : {}),
            });
            setNewSecret(result.secret);
            setName('');
            setExpiresAt('');
            setSelectedBranches([]);
            await load();
            showToast(tn('Key created. Copy the secret now; it will not be shown again.', 'تم إنشاء المفتاح. انسخ السر الآن؛ لن يظهر مرة أخرى.'), 'success');
        } catch (error: any) {
            showToast(error?.message || tn('Unable to create API key', 'تعذر إنشاء مفتاح الـAPI'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const revoke = async (key: PublicApiKeyMetadata) => {
        if (!window.confirm(tn(`Revoke ${key.name}? Existing requests will stop immediately.`, `إلغاء مفتاح ${key.name}؟ الطلبات الحالية ستتوقف فورًا.`))) return;
        try {
            await publicApiKeysApi.revoke(key.id);
            await load();
            showToast(tn('API key revoked', 'تم إلغاء مفتاح الـAPI'), 'success');
        } catch (error: any) {
            showToast(error?.message || tn('Unable to revoke API key', 'تعذر إلغاء مفتاح الـAPI'), 'error');
        }
    };

    const rotate = async (key: PublicApiKeyMetadata) => {
        if (!window.confirm(tn(`Rotate ${key.name}? The current secret will stop working immediately.`, `تدوير ${key.name}؟ السر الحالي سيتوقف فورًا.`))) return;
        try {
            const result = await publicApiKeysApi.rotate(key.id);
            setNewSecret(result.secret);
            await load();
            showToast(tn('Key rotated. Copy the new secret now.', 'تم تدوير المفتاح. انسخ السر الجديد الآن.'), 'success');
        } catch (error: any) {
            showToast(error?.message || tn('Unable to rotate API key', 'تعذر تدوير مفتاح الـAPI'), 'error');
        }
    };

    const copySecret = async () => {
        if (!newSecret) return;
        await navigator.clipboard.writeText(newSecret);
        setCopied(true);
        showToast(tn('Secret copied', 'تم نسخ السر'), 'success');
        window.setTimeout(() => setCopied(false), 1800);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><KeyRound size={20} /></div>
                    <div>
                        <h3 className="text-sm font-black text-main uppercase tracking-tight">{tn('Public API keys', 'مفاتيح الـPublic API')}</h3>
                        <p className="text-[10px] text-muted font-bold mt-1">{tn('Create least-privilege partner access without exposing secrets.', 'أنشئ وصولًا محدود الصلاحيات للشركاء بدون كشف الأسرار.')}</p>
                    </div>
                </div>
                <button type="button" onClick={() => void load()} disabled={loading} aria-label={tn('Refresh keys', 'تحديث المفاتيح')} className="p-3 rounded-xl bg-elevated/40 text-muted hover:text-main disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
            </div>

            {newSecret && (
                <div role="alert" className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-3">
                    <p className="text-xs font-black text-amber-600 dark:text-amber-300">{tn('Copy this secret now. It cannot be recovered.', 'انسخ السر الآن. لا يمكن استرجاعه لاحقًا.')}</p>
                    <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-app px-3 py-3 text-xs font-mono text-main" dir="ltr">{newSecret}</code>
                        <button type="button" onClick={() => void copySecret()} className="shrink-0 px-3 py-3 rounded-xl bg-amber-600 text-white text-xs font-black flex items-center gap-2">{copied ? <Check size={14} /> : <Clipboard size={14} />}{tn('Copy', 'نسخ')}</button>
                    </div>
                    <button type="button" onClick={() => setNewSecret(null)} className="text-[10px] font-black text-muted underline">{tn('Dismiss secret', 'إخفاء السر')}</button>
                </div>
            )}

            <form onSubmit={create} className="p-5 rounded-3xl border border-border/20 bg-elevated/10 space-y-4">
                <div className="flex items-center gap-2 text-main"><Plus size={16} className="text-primary" /><span className="text-xs font-black uppercase tracking-widest">{tn('Create key', 'إنشاء مفتاح')}</span></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest">{tn('Name', 'الاسم')}<input required value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-border/30 bg-app px-3 py-3 text-sm font-bold text-main outline-none focus:border-primary" placeholder="Delivery partner" /></label>
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest">{tn('Expiry (optional)', 'الانتهاء (اختياري)')}<input type="date" min={new Date().toISOString().slice(0, 10)} value={expiresAt} onChange={event => setExpiresAt(event.target.value)} className="mt-2 w-full rounded-xl border border-border/30 bg-app px-3 py-3 text-sm font-bold text-main outline-none focus:border-primary" /></label>
                </div>
                <fieldset>
                    <legend className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">{tn('Scopes', 'الصلاحيات')}</legend>
                    <div className="flex flex-wrap gap-2">{scopes.map(scope => <label key={scope} className="flex items-center gap-2 rounded-xl border border-border/30 bg-app px-3 py-2 text-xs font-bold text-main"><input type="checkbox" checked={selectedScopes.includes(scope)} onChange={event => setSelectedScopes(current => event.target.checked ? [...new Set([...current, scope])] : current.filter(item => item !== scope))} />{scope}</label>)}</div>
                </fieldset>
                <fieldset>
                    <legend className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">{tn('Allowed branches', 'الفروع المسموحة')}</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        <label className="flex items-center gap-2 rounded-xl border border-border/30 bg-app px-3 py-2 text-xs font-bold text-main"><input type="checkbox" checked={selectedBranches.includes('*')} onChange={event => setSelectedBranches(event.target.checked ? ['*'] : [])} />{tn('All branches', 'كل الفروع')}</label>
                        {branches.map(branch => <label key={branch.id} className="flex items-center gap-2 rounded-xl border border-border/30 bg-app px-3 py-2 text-xs font-bold text-main"><input type="checkbox" disabled={selectedBranches.includes('*')} checked={selectedBranches.includes(branch.id)} onChange={event => setSelectedBranches(current => event.target.checked ? [...new Set([...current, branch.id])] : current.filter(item => item !== branch.id))} />{branch.name || branch.id}</label>)}
                    </div>
                </fieldset>
                <button type="submit" disabled={saving || !selectedScopes.length || !selectedBranches.length} className="px-5 py-3 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-2 disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}{tn('Create secure key', 'إنشاء مفتاح آمن')}</button>
            </form>

            <div className="space-y-3" aria-busy={loading}>
                {loading ? <div className="p-8 text-center text-sm font-bold text-muted">{tn('Loading keys…', 'جار تحميل المفاتيح…')}</div> : activeKeys.length === 0 ? <div className="p-8 text-center rounded-2xl border border-dashed border-border/30 text-sm font-bold text-muted">{tn('No managed keys yet.', 'لا توجد مفاتيح مُدارة بعد.')}</div> : activeKeys.map(key => <div key={key.id} className="p-4 rounded-2xl border border-border/20 bg-elevated/10 flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1 min-w-0"><p className="text-sm font-black text-main">{key.name}</p><code className="text-[11px] text-muted font-mono" dir="ltr">{key.keyPrefix}••••</code><p className="text-[10px] text-muted mt-1">{key.scopes.join(', ')} · {key.branchIds.join(', ')} · {tn('expires', 'ينتهي')} {dateLabel(key.expiresAt, lang)} · {tn('last used', 'آخر استخدام')} {dateLabel(key.lastUsedAt, lang)}</p></div>
                    <div className="flex items-center gap-2 self-start lg:self-auto">
                        <button type="button" onClick={() => void rotate(key)} className="px-4 py-2 rounded-xl border border-primary/20 text-primary text-xs font-black flex items-center gap-2"><RefreshCw size={14} />{tn('Rotate', 'تدوير')}</button>
                        <button type="button" onClick={() => void revoke(key)} className="px-4 py-2 rounded-xl border border-red-500/20 text-red-500 text-xs font-black flex items-center gap-2"><Ban size={14} />{tn('Revoke', 'إلغاء')}</button>
                    </div>
                </div>)}
            </div>
        </div>
    );
};

export default PublicApiKeyManager;
