import React, { useState, useEffect } from 'react';
import {
    FileText,
    ShieldCheck,
    Download,
    Printer,
    TrendingUp,
    Calendar,
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    Info,
    Clock,
    Landmark,
    Calculator
} from 'lucide-react';
import { fiscalApi } from '../services/api/fiscal';
import { reportsApi } from '../services/api/reports';
import { useAuthStore } from '../stores/useAuthStore';
import { translations } from '../services/translations';

const FiscalHub: React.FC = () => {
    const { settings } = useAuthStore();
    const lang = settings.language || 'en';
    const t = translations[lang];
    const tr = (key: string, fallback: string) => (t as any)[key] || fallback;

    const [fiscalData, setFiscalData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [fiscalLogs, setFiscalLogs] = useState<any[]>([]);
    const [etaConfig, setEtaConfig] = useState<{ ok: boolean; missing: string[] } | null>(null);
    const [etaReadiness, setEtaReadiness] = useState<{
        ok: boolean;
        metrics24h: { submitted: number; pending: number; failed: number; total: number; successRate: number };
        deadLetter: { pendingCount: number; oldestPendingAgeMinutes: number };
        alerts: { configMissing: boolean; lowSuccessRate: boolean; hasPendingDlq: boolean; stalePendingDlq: boolean };
    } | null>(null);
    const [etaLastRefresh, setEtaLastRefresh] = useState<Date | null>(null);
    const [manualOrderId, setManualOrderId] = useState('');
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(1)).toISOString().split('T')[0], // 1st of current month
        end: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        loadFiscalData();
    }, [dateRange]);

    useEffect(() => {
        let active = true;
        const loadConfig = async () => {
            try {
                const config = await fiscalApi.getConfig();
                const readiness = await fiscalApi.getReadiness(settings.activeBranchId || undefined);
                if (!active) return;
                setEtaConfig(config);
                setEtaReadiness(readiness);
                setEtaLastRefresh(new Date());
            } catch {
                if (!active) return;
                setEtaConfig({ ok: false, missing: ['ETA config unreachable'] });
                setEtaReadiness(null);
            }
        };

        loadConfig();
        const intervalId = window.setInterval(loadConfig, 60_000);
        return () => {
            active = false;
            window.clearInterval(intervalId);
        };
    }, [settings.activeBranchId]);

    const loadFiscalData = async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const [data, logs] = await Promise.all([
                reportsApi.getFiscal({
                    startDate: dateRange.start,
                    endDate: dateRange.end
                }),
                fiscalApi.getLogs({ branchId: settings.activeBranchId || undefined, limit: 50 }),
            ]);
            setFiscalData(data);
            setFiscalLogs(logs);
        } catch {
            setFiscalData(null);
            setFiscalLogs([]);
            setLoadError(tr('fiscal_load_failed', 'Failed to load fiscal data. Please try again.'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmitETA = async (force = false) => {
        setIsSubmitting(true);
        setSubmitResult(null);
        try {
            const latestOrderId = fiscalData?.data?.latestOrderId;
            const targetOrderId = manualOrderId.trim() || latestOrderId;
            if (!targetOrderId) {
                setSubmitResult(tr('no_order_for_submission', 'No order available for submission'));
                return;
            }
            const result = await fiscalApi.submit(targetOrderId, force ? { force: true } : undefined);
            if (result?.skipped) {
                setSubmitResult(tr('already_submitted', 'Already submitted (skipped)'));
                return;
            }
            setSubmitResult(tr('submitted_success', 'Submitted successfully'));
        } catch (error: any) {
            setSubmitResult(error.message || tr('submission_failed', 'Submission failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-4 md:p-8 lg:p-12 bg-app min-h-screen pb-24">
            {/* Header Area */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 mb-12">
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-16 h-16 rounded-[2rem] bg-indigo-700 text-white flex items-center justify-center shadow-2xl shadow-indigo-700/30">
                            <Landmark size={32} />
                        </div>
                        <h2 className="text-4xl font-black text-main uppercase tracking-tighter">
                            {t.fiscal_hub_title}
                        </h2>
                    </div>
                    <p className="text-muted font-bold text-sm uppercase tracking-widest opacity-60 flex items-center gap-2">
                        {t.fiscal_hub_subtitle}
                        <CheckCircle2 size={14} className="text-success" />
                    </p>
                </div>

                <div className="flex items-center gap-4 bg-card p-4 rounded-3xl border border-border shadow-sm">
                    <div className="flex items-center gap-3 pr-6 border-r border-border">
                        <Calendar size={18} className="text-muted" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-muted uppercase">{t.period_selection}</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="bg-transparent text-sm font-black text-main outline-none"
                                />
                                <span className="text-muted opacity-40">-</span>
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="bg-transparent text-sm font-black text-main outline-none"
                                />
                            </div>
                        </div>
                    </div>
                    <button onClick={loadFiscalData} disabled={isLoading} className="p-3 bg-app hover:bg-elevated border border-border rounded-xl transition-all disabled:opacity-50" title={tr('refresh', 'Refresh')}>
                        <Download size={18} className={`text-muted ${isLoading ? 'animate-pulse' : ''}`} />
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="mb-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-sm font-bold text-rose-600">
                    {loadError}
                </div>
            )}

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
                {/* VAT Summary Card */}
                <div className="xl:col-span-2 bg-card border border-border rounded-[2.5rem] p-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                        <Calculator size={120} />
                    </div>

                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
                            <FileText size={20} />
                        </div>
                        <h3 className="text-xl font-black text-main uppercase tracking-tight">{t.vat_declaration}</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div>
                            <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">{t.taxable_base}</p>
                            <h4 className="text-3xl font-black text-main">
                                {fiscalData?.data?.netSales?.toLocaleString() || '0'} <span className="text-sm">{t.currency}</span>
                            </h4>
                            <p className="text-[10px] font-bold text-muted mt-2">{tr('non_taxable', 'Exclude non-taxable items')}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">{t.vat_payable}</p>
                            <h4 className="text-3xl font-black text-rose-500">
                                {fiscalData?.data?.vatAmount?.toLocaleString() || '0'} <span className="text-sm">{t.currency}</span>
                            </h4>
                            <div className="flex items-center gap-1.5 mt-2">
                                <TrendingUp size={10} className="text-rose-500" />
                                <span className="text-[10px] font-bold text-muted">{tr('from_last_month', '+4.2% from last month')}</span>
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">{t.total_fiscal_sales}</p>
                            <h4 className="text-3xl font-black text-main">
                                {fiscalData?.data?.totalSales?.toLocaleString() || '0'} <span className="text-sm">{t.currency}</span>
                            </h4>
                            <p className="text-[10px] font-bold text-muted mt-2">{fiscalData?.data?.orderCount || 0} {t.valid_orders}</p>
                        </div>
                    </div>

                    <div className="mt-12 flex items-center gap-4 p-4 bg-app rounded-2xl border border-border/50">
                        <Info size={16} className="text-primary shrink-0" />
                        <p className="text-xs font-bold text-muted">
                            {t.fiscal_data_note}
                        </p>
                    </div>
                </div>

                {/* ETA Readiness Card */}
                <div className="bg-indigo-700 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-indigo-700/30 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-6">
                            <div className="p-4 bg-elevated/60 rounded-2xl">
                                <ShieldCheck size={28} />
                            </div>
                            <span className="text-[10px] font-black bg-elevated/70 px-3 py-1 rounded-full">
                                {etaReadiness?.ok ? t.eta_ready : (etaConfig?.ok ? t.eta_monitor : t.eta_setup)}
                            </span>
                        </div>
                        <h4 className="text-2xl font-black uppercase tracking-tighter mb-4">{t.eta_readiness}</h4>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase opacity-70 italic">{t.gs1_mapping}</span>
                                <CheckCircle2 size={16} className="text-emerald-400" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase opacity-70 italic">{t.digital_signature}</span>
                                {etaConfig?.missing?.includes('ETA_PRIVATE_KEY') ? (
                                    <AlertTriangle size={16} className="text-amber-400" />
                                ) : (
                                    <CheckCircle2 size={16} className="text-emerald-400" />
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase opacity-70 italic">{t.eta_api_bridge}</span>
                                {etaConfig?.ok ? (
                                    <CheckCircle2 size={16} className="text-emerald-400" />
                                ) : (
                                    <AlertTriangle size={16} className="text-amber-400" />
                                )}
                            </div>
                            {etaConfig && !etaConfig.ok && (
                                <div className="text-[9px] font-black uppercase tracking-widest bg-elevated/60 p-3 rounded-xl">
                                    {tr('missing', 'Missing')}: {etaConfig.missing.join(', ')}
                                </div>
                            )}
                            {etaReadiness && (
                                <div className="bg-elevated/60 rounded-xl p-3 space-y-2">
                                    {etaLastRefresh && (
                                        <p className="text-[9px] font-bold opacity-80">
                                            {tr('last_refresh', 'Last refresh')}: {etaLastRefresh.toLocaleTimeString()}
                                        </p>
                                    )}
                                    <p className="text-[10px] font-black uppercase tracking-widest">
                                        24H {t.success_rate}: {(etaReadiness.metrics24h.successRate * 100).toFixed(2)}%
                                    </p>
                                    <p className="text-[10px] font-bold">
                                        {t.submitted}: {etaReadiness.metrics24h.submitted} | {t.failed}: {etaReadiness.metrics24h.failed}
                                    </p>
                                    <p className="text-[10px] font-bold">
                                        {tr('dlq_monitor', 'DLQ')} {t.dlq_pending}: {etaReadiness.deadLetter.pendingCount}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 bg-elevated/60 p-3 rounded-2xl">
                        <p className="text-[9px] font-black uppercase tracking-widest mb-2 opacity-80">{t.manual_submission}</p>
                        <input
                            value={manualOrderId}
                            onChange={(e) => setManualOrderId(e.target.value)}
                            placeholder={t.order_id_placeholder}
                            className="w-full bg-elevated/60 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest outline-none placeholder:text-white/50"
                        />
                    </div>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button
                            onClick={() => handleSubmitETA(false)}
                            disabled={isSubmitting}
                            className="flex items-center justify-center gap-3 bg-white text-indigo-700 px-6 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-60"
                        >
                            {isSubmitting ? tr('submitting', 'Submitting...') : t.submit_btn}
                            <ExternalLink size={16} />
                        </button>
                        <button
                            onClick={() => handleSubmitETA(true)}
                            disabled={isSubmitting}
                            className="flex items-center justify-center gap-3 bg-elevated/60 text-white px-6 py-4 rounded-2xl font-black uppercase text-xs tracking-widest border border-border/40 hover:bg-elevated/70 transition-all disabled:opacity-60"
                        >
                            {t.force_submit}
                            <ExternalLink size={16} />
                        </button>
                    </div>
                    {submitResult && (
                        <div className="mt-4 text-[10px] font-black uppercase tracking-widest bg-elevated/60 p-3 rounded-xl">
                            {submitResult}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Z-Report History */}
                <div className="space-y-6">
                    <h3 className="text-xl font-black text-main uppercase tracking-tight flex items-center gap-3 px-2">
                        <Clock className="text-primary" />
                        {tr('eta_submission_registry', 'ETA Submission Registry')}
                    </h3>
                    <div className="bg-card border border-border rounded-[2.5rem] overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-elevated/50 text-[10px] font-black uppercase text-muted tracking-widest border-b border-border">
                                <tr>
                                    <th className="px-8 py-5">{tr('order_id', 'Order ID')}</th>
                                    <th className="px-6 py-5">{tr('status', 'Status')}</th>
                                    <th className="px-6 py-5">{tr('attempts', 'Attempts')}</th>
                                    <th className="px-8 py-5 text-right">{tr('updated', 'Updated')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {fiscalLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-16 text-center text-xs font-black uppercase tracking-widest text-muted">
                                            {tr('no_fiscal_logs', 'No fiscal submissions in this branch yet')}
                                        </td>
                                    </tr>
                                ) : fiscalLogs.slice(0, 10).map((report) => (
                                    <tr key={report.id} className="hover:bg-app/50 transition-all">
                                        <td className="px-8 py-6">
                                            <p className="text-sm font-black text-main">{report.orderId || '-'}</p>
                                            {report.lastError && <p className="text-[10px] font-bold text-rose-500 uppercase">{report.lastError}</p>}
                                        </td>
                                        <td className="px-6 py-6">
                                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                                report.status === 'SUBMITTED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                report.status === 'FAILED' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                                'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                            }`}>
                                                {report.status || '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-6 font-mono text-xs font-black">{Number(report.attempt || 0)}</td>
                                        <td className="px-8 py-6 text-right text-xs font-black text-muted">
                                            {report.updatedAt || report.createdAt ? new Date(report.updatedAt || report.createdAt).toLocaleString() : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Audit & Compliance Log */}
                <div className="space-y-6">
                    <h3 className="text-xl font-black text-main uppercase tracking-tight flex items-center gap-3 px-2">
                        <ShieldCheck className="text-primary" />
                        {tr('compliance_audit', 'Compliance Audit Trail')}
                    </h3>
                    <div className="bg-card border border-border rounded-[2.5rem] p-8 space-y-6">
                        {fiscalLogs.length === 0 ? (
                            <div className="p-8 text-center text-xs font-black uppercase tracking-widest text-muted bg-app rounded-2xl border border-border/50">
                                {tr('no_compliance_events', 'No compliance events available')}
                            </div>
                        ) : fiscalLogs.slice(0, 4).map((log) => (
                            <div key={log.id} className="flex justify-between items-center p-4 bg-app rounded-2xl border border-border/50">
                                <div className="flex items-center gap-4">
                                    <div className="w-2 h-8 rounded-full bg-border/20" />
                                    <div>
                                        <p className="text-xs font-black text-main uppercase">{tr('eta_submission', 'ETA submission')} #{log.orderId || log.id}</p>
                                        <p className="text-[10px] font-bold text-muted">{log.updatedAt || log.createdAt ? new Date(log.updatedAt || log.createdAt).toLocaleString() : '-'}</p>
                                    </div>
                                </div>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${log.status === 'FAILED' ? 'text-rose-500' : log.status === 'PENDING' ? 'text-amber-500' : 'text-emerald-500'}`}>{log.status}</span>
                            </div>
                        ))}

                        <button className="w-full mt-6 flex items-center justify-center gap-2 text-muted hover:text-primary transition-all text-xs font-bold uppercase tracking-widest">
                            <FileText size={16} />
                            {tr('view_full_fiscal_logs', 'View Full Fiscal Logs')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FiscalHub;
