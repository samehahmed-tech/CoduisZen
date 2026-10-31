import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Clipboard, Loader2, Plus, RefreshCw, Send, Webhook } from 'lucide-react';
import { webhooksApi, WebhookEndpointMetadata } from '../services/api/webhooks';

type BranchOption = { id: string; name?: string };

const EVENTS = [
    'order.created', 'order.status_changed', 'order.completed', 'order.cancelled', 'order.refunded',
    'inventory.low_stock', 'inventory.stock_updated', 'inventory.batch_expired',
    'shift.opened', 'shift.closed', 'day.closed', 'driver.assigned', 'driver.location_updated',
    'payment.received', 'customer.created', 'customer.updated', 'fiscal.submitted', 'fiscal.failed',
    'approval.requested', 'approval.resolved',
] as const;

interface Props {
    branches: BranchOption[];
    canManage: boolean;
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    tn: (en: string, ar: string) => string;
}

const WebhookManager: React.FC<Props> = ({ branches, canManage, showToast, tn }) => {
    const [endpoints, setEndpoints] = useState<WebhookEndpointMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [branchId, setBranchId] = useState('');
    const [events, setEvents] = useState<string[]>(['order.created']);
    const [newSecret, setNewSecret] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const activeEndpoints = useMemo(() => endpoints.filter(endpoint => endpoint.isActive), [endpoints]);

    const load = async () => {
        if (!canManage) { setLoading(false); return; }
        setLoading(true);
        try {
            setEndpoints(await webhooksApi.list());
        } catch (error: any) {
            showToast(error?.message || tn('Unable to load Webhooks', 'تعذر تحميل الـWebhooks'), 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, [canManage]);

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const result = await webhooksApi.create({ name, url, branchId: branchId || null, events });
            setName(''); setUrl(''); setBranchId(''); setEvents(['order.created']);
            setNewSecret(result.secret || null);
            await load();
            showToast(tn('Webhook created. Store the signing secret now.', 'تم إنشاء الـWebhook. احفظ سر التوقيع الآن.'), 'success');
        } catch (error: any) {
            showToast(error?.message || tn('Unable to create Webhook', 'تعذر إنشاء الـWebhook'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (endpoint: WebhookEndpointMetadata) => {
        if (!window.confirm(tn(`Disable ${endpoint.name}?`, `إلغاء ${endpoint.name}؟`))) return;
        try {
            await webhooksApi.remove(endpoint.id);
            await load();
            showToast(tn('Webhook disabled', 'تم إلغاء الـWebhook'), 'success');
        } catch (error: any) {
            showToast(error?.message || tn('Unable to disable Webhook', 'تعذر إلغاء الـWebhook'), 'error');
        }
    };

    const copySecret = async () => {
        if (!newSecret) return;
        try {
            await navigator.clipboard.writeText(newSecret);
            setCopied(true);
            showToast(tn('Signing secret copied', 'تم نسخ سر التوقيع'), 'success');
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            showToast(tn('Copy failed; select the secret manually.', 'تعذر النسخ؛ حدد السر يدويًا.'), 'error');
        }
    };

    if (!canManage) {
        return <div className="p-5 rounded-2xl border border-border/20 bg-elevated/10 text-sm font-bold text-muted">{tn('Webhook management is restricted to owners and authorized administrators.', 'إدارة الـWebhooks متاحة للمالكين والمديرين المصرح لهم فقط.')}</div>;
    }

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center"><Webhook size={20} /></div><div><h3 className="text-sm font-black text-main uppercase tracking-tight">{tn('Webhook subscriptions', 'اشتراكات الـWebhooks')}</h3><p className="text-[10px] text-muted font-bold mt-1">{tn('Send signed operational events to approved partner endpoints.', 'أرسل أحداث التشغيل الموقعة إلى endpoints الشركاء المعتمدة.')}</p></div></div>
                <button type="button" onClick={() => void load()} disabled={loading} aria-label={tn('Refresh Webhooks', 'تحديث الـWebhooks')} className="p-3 rounded-xl bg-elevated/40 text-muted hover:text-main disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
            </div>

            {newSecret && <div role="alert" className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-3"><p className="text-xs font-black text-amber-600 dark:text-amber-300">{tn('Store this signing secret now. It will not be shown again.', 'احفظ سر التوقيع الآن. لن يظهر مرة أخرى.')}</p><div className="flex items-center gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-app px-3 py-3 text-xs font-mono text-main" dir="ltr">{newSecret}</code><button type="button" onClick={() => void copySecret()} className="shrink-0 px-3 py-3 rounded-xl bg-amber-600 text-white text-xs font-black flex items-center gap-2">{copied ? <Check size={14} /> : <Clipboard size={14} />}{tn('Copy', 'نسخ')}</button></div><button type="button" onClick={() => setNewSecret(null)} className="text-[10px] font-black text-muted underline">{tn('Dismiss secret', 'إخفاء السر')}</button></div>}

            <form onSubmit={create} className="p-5 rounded-3xl border border-border/20 bg-elevated/10 space-y-4">
                <div className="flex items-center gap-2 text-main"><Plus size={16} className="text-primary" /><span className="text-xs font-black uppercase tracking-widest">{tn('Create subscription', 'إنشاء اشتراك')}</span></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label className="text-[10px] font-black text-muted uppercase tracking-widest">{tn('Name', 'الاسم')}<input required value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-border/30 bg-app px-3 py-3 text-sm font-bold text-main outline-none focus:border-primary" placeholder="Partner integration" /></label><label className="text-[10px] font-black text-muted uppercase tracking-widest">{tn('Endpoint URL', 'رابط الـEndpoint')}<input required type="url" value={url} onChange={event => setUrl(event.target.value)} className="mt-2 w-full rounded-xl border border-border/30 bg-app px-3 py-3 text-sm font-bold text-main outline-none focus:border-primary" placeholder="https://partner.example/hooks" dir="ltr" /></label></div>
                <label className="block text-[10px] font-black text-muted uppercase tracking-widest">{tn('Branch', 'الفرع')}<select value={branchId} onChange={event => setBranchId(event.target.value)} className="mt-2 w-full rounded-xl border border-border/30 bg-app px-3 py-3 text-sm font-bold text-main outline-none focus:border-primary"><option value="">{tn('All branches', 'كل الفروع')}</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name || branch.id}</option>)}</select></label>
                <fieldset><legend className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">{tn('Events', 'الأحداث')}</legend><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{EVENTS.map(eventName => <label key={eventName} className="flex items-center gap-2 rounded-xl border border-border/30 bg-app px-3 py-2 text-xs font-bold text-main"><input type="checkbox" checked={events.includes(eventName)} onChange={change => setEvents(current => change.target.checked ? [...new Set([...current, eventName])] : current.filter(item => item !== eventName))} />{eventName}</label>)}</div></fieldset>
                <button type="submit" disabled={saving || !events.length} className="px-5 py-3 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-2 disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}{tn('Create signed Webhook', 'إنشاء Webhook موقّع')}</button>
            </form>

            <div className="space-y-3" aria-busy={loading}>{loading ? <div className="p-8 text-center text-sm font-bold text-muted">{tn('Loading Webhooks…', 'جار تحميل الـWebhooks…')}</div> : activeEndpoints.length === 0 ? <div className="p-8 text-center rounded-2xl border border-dashed border-border/30 text-sm font-bold text-muted">{tn('No active Webhooks yet.', 'لا توجد Webhooks نشطة بعد.')}</div> : activeEndpoints.map(endpoint => <div key={endpoint.id} className="p-4 rounded-2xl border border-border/20 bg-elevated/10 flex flex-col lg:flex-row lg:items-center gap-4"><div className="flex-1 min-w-0"><p className="text-sm font-black text-main">{endpoint.name}</p><code className="block truncate text-[11px] text-muted font-mono" dir="ltr">{endpoint.url}</code><p className="text-[10px] text-muted mt-1">{endpoint.events.join(', ')} · {endpoint.branchId || tn('all branches', 'كل الفروع')} · {endpoint.secretConfigured ? tn('signed', 'موقّع') : tn('unsigned', 'بدون توقيع')}</p></div><button type="button" onClick={() => void remove(endpoint)} className="px-4 py-2 rounded-xl border border-red-500/20 text-red-500 text-xs font-black flex items-center gap-2 self-start lg:self-auto"><Ban size={14} />{tn('Disable', 'إلغاء')}</button></div>)}</div>
        </div>
    );
};

export default WebhookManager;
