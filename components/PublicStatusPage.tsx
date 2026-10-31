import React from 'react';
import { CheckCircle2, Clock3, RefreshCw, ServerCrash, ShieldCheck, Wifi } from 'lucide-react';

type ComponentState = 'operational' | 'degraded' | 'outage';
type StatusSnapshot = { status: ComponentState; timestamp: string; uptimeSeconds?: number; components?: Record<string, ComponentState> };
const labels: Record<string, string> = { database: 'قاعدة البيانات', messaging: 'المراسلة', printing: 'الطباعة', integrations: 'التكاملات' };
const stateText: Record<ComponentState, string> = { operational: 'يعمل بشكل طبيعي', degraded: 'أداء محدود', outage: 'متوقف مؤقتاً' };
const stateClasses: Record<ComponentState, string> = {
    operational: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    degraded: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    outage: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
};
const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days ? `${days} يوم و${hours} ساعة` : `${hours} ساعة و${minutes} دقيقة`;
};

const PublicStatusPage: React.FC = () => {
    const [snapshot, setSnapshot] = React.useState<StatusSnapshot | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(false);
    const [lastChecked, setLastChecked] = React.useState<Date | null>(null);
    const load = React.useCallback(async () => {
        try {
            const response = await fetch('/api/status', { headers: { Accept: 'application/json' } });
            const data = await response.json() as StatusSnapshot;
            if (!data || !['operational', 'degraded', 'outage'].includes(data.status)) throw new Error('INVALID_STATUS');
            setSnapshot(data); setError(false); setLastChecked(new Date());
        } catch { setError(true); } finally { setLoading(false); }
    }, []);
    React.useEffect(() => { void load(); const timer = window.setInterval(() => { void load(); }, 30_000); return () => window.clearInterval(timer); }, [load]);
    const status = snapshot?.status || (error ? 'outage' : 'degraded');
    const componentEntries = Object.entries(snapshot?.components || {});
    return (
        <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6" dir="rtl">
            <div className="mx-auto max-w-4xl">
                <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <div><p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-300">RestoFlow</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">حالة النظام</h1><p className="mt-3 text-sm font-semibold text-slate-400">تحديث عام وشفاف لحالة خدمات RestoFlow.</p></div>
                    <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-400"><ShieldCheck size={16} className="text-emerald-400" /> بدون بيانات حساسة</div>
                </header>
                <section className={`rounded-[2rem] border p-6 shadow-2xl sm:p-8 ${stateClasses[status]}`} aria-live="polite">
                    <div className="flex flex-wrap items-center justify-between gap-5"><div className="flex items-center gap-4">{status === 'operational' ? <CheckCircle2 size={42} /> : <ServerCrash size={42} />}<div><p className="text-xs font-black uppercase tracking-widest opacity-75">الحالة الحالية</p><h2 className="mt-1 text-2xl font-black">{stateText[status]}</h2></div></div><button type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-current/30 px-4 py-2 text-xs font-black transition hover:bg-white/10 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> تحديث الآن</button></div>
                    {error && <p className="mt-5 text-sm font-bold">تعذر الوصول إلى خدمة الحالة. سنحاول مرة أخرى تلقائياً.</p>}
                </section>
                <section className="mt-6 grid gap-4 sm:grid-cols-2" aria-label="حالة المكونات">{componentEntries.map(([key, value]) => <article key={key} className={`rounded-2xl border p-5 ${stateClasses[value] || stateClasses.degraded}`}><div className="flex items-center justify-between gap-3"><h3 className="font-black">{labels[key] || 'الخدمة'}</h3><Wifi size={18} /></div><p className="mt-3 text-sm font-bold opacity-80">{stateText[value] || stateText.degraded}</p></article>)}</section>
                <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-500"><span className="inline-flex items-center gap-2"><Clock3 size={14} /> آخر فحص: {lastChecked ? lastChecked.toLocaleTimeString('ar-EG') : 'جاري الفحص'}</span>{snapshot?.uptimeSeconds !== undefined && <span>مدة التشغيل: {formatUptime(Math.max(0, snapshot.uptimeSeconds))}</span>}</footer>
            </div>
        </main>
    );
};
export default PublicStatusPage;
