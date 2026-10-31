import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, RefreshCw } from 'lucide-react';
import { healthApi } from '../services/api/platforms';
import { useAuthStore } from '../stores/useAuthStore';

type ProviderHealth = {
    provider: string;
    status: string;
    configured: boolean;
    connectivity: 'HEALTHY' | 'UNVERIFIED' | 'ERROR';
    latencyMs?: number;
    probeReason?: string;
};

const IntegrationHealthPanel: React.FC = () => {
    const { settings } = useAuthStore();
    const isAr = (settings.language || 'en') === 'ar';
    const [health, setHealth] = useState<{ status: string; mode: string; payments: ProviderHealth[]; aggregators: ProviderHealth[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            setHealth(await healthApi.integrations());
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const providers = useMemo(() => [...(health?.payments || []), ...(health?.aggregators || [])], [health]);
    const connectivityLabel = (value: ProviderHealth['connectivity']) => {
        if (value === 'HEALTHY') return isAr ? 'متصل' : 'Connected';
        if (value === 'ERROR') return isAr ? 'خطأ اتصال' : 'Connection error';
        return isAr ? 'غير مُتحقق' : 'Unverified';
    };
    const Icon = (value: ProviderHealth['connectivity']) => value === 'HEALTHY' ? CheckCircle2 : value === 'ERROR' ? AlertTriangle : CircleHelp;

    return (
        <section className="card-primary border border-border rounded-2xl p-4 mb-4" aria-labelledby="integration-health-title">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h5 id="integration-health-title" className="text-xs font-black text-main">
                        {isAr ? 'حالة الاتصال بالتكاملات' : 'Integration connectivity'}
                    </h5>
                    <p className="text-[10px] text-muted font-bold mt-1">
                        {health?.mode === 'LIVE_PROBE'
                            ? (isAr ? 'قياس مباشر اختياري؛ غير المتحقق لا يعني فشل الإعداد.' : 'Optional live probe; unverified does not mean misconfigured.')
                            : (isAr ? 'الإعداد منفصل عن اختبار الاتصال.' : 'Configuration is separate from connectivity.')}
                    </p>
                </div>
                <button type="button" onClick={() => void load()} disabled={loading} aria-label={isAr ? 'تحديث حالة التكاملات' : 'Refresh integration health'} className="p-2 rounded-lg text-muted hover:text-main disabled:opacity-50">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {loading && <div role="status" className="text-[10px] font-bold text-muted mt-3">{isAr ? 'جارٍ فحص الحالة...' : 'Checking status...'}</div>}
            {!loading && failed && <div role="alert" className="text-[10px] font-bold text-rose-500 mt-3">{isAr ? 'تعذر قراءة حالة التكاملات.' : 'Integration health is unavailable.'}</div>}
            {!loading && !failed && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                    {providers.map((provider) => {
                        const ProviderIcon = Icon(provider.connectivity);
                        return (
                            <div key={provider.provider} className="border border-border rounded-xl px-3 py-2 bg-app/50 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black text-main truncate">{provider.provider}</p>
                                    <p className="text-[9px] font-bold text-muted">{provider.configured ? (isAr ? 'مُعد' : 'Configured') : (isAr ? 'غير مفعل' : 'Disabled')}</p>
                                </div>
                                <span className="flex items-center gap-1 text-[9px] font-black whitespace-nowrap" title={provider.probeReason || undefined}>
                                    <ProviderIcon size={12} aria-hidden="true" className={provider.connectivity === 'HEALTHY' ? 'text-emerald-500' : provider.connectivity === 'ERROR' ? 'text-rose-500' : 'text-amber-500'} />
                                    {connectivityLabel(provider.connectivity)}
                                    {provider.latencyMs !== undefined && <span className="text-muted">{provider.latencyMs}ms</span>}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

export default IntegrationHealthPanel;
