import React from 'react';
import AdminDashboard from './AdminDashboard';
import { useAuthStore } from '../stores/useAuthStore';
import { analyticsApi } from '../services/api/analytics';
import { socketService } from '../services/socketService';

const AdminDashboardPage: React.FC = () => {
    const { settings, token } = useAuthStore();
    const activeBranchId = settings.activeBranchId;
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const [rows, setRows] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [isLive, setIsLive] = React.useState(false);
    const [lastUpdated, setLastUpdated] = React.useState<Date>(new Date());

    const period = React.useMemo(() => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 29);
        return {
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
            label: lang === 'ar'
                ? `${start.toLocaleDateString('ar-EG')} - ${end.toLocaleDateString('ar-EG')}`
                : `${start.toLocaleDateString('en-US')} - ${end.toLocaleDateString('en-US')}`,
        };
    }, [lang]);

    const loadData = React.useCallback(async (mounted = true) => {
        try {
            const data = await analyticsApi.getBranchPerformance({
                startDate: period.startDate,
                endDate: period.endDate,
            });
            if (!mounted) return;
            setRows(Array.isArray(data) ? data : []);
            setLastUpdated(new Date());
            setError(null);
        } catch (e: any) {
            if (!mounted) return;
            setError(e?.message || (lang === 'ar' ? 'تعذر تحميل بيانات الفروع' : 'Failed to load branch analytics'));
            setRows([]);
        } finally {
            if (mounted) setIsLoading(false);
        }
    }, [period.startDate, period.endDate, lang]);

    React.useEffect(() => {
        let mounted = true;
        setIsLoading(true);
        loadData(mounted);

        if (token) {
            socketService.init(token);
            if (activeBranchId) socketService.joinBranch(activeBranchId);
            setIsLive(true);
        }

        const handleBranchUpdate = (data: any) => {
            if (!mounted || !data?.branchId) return;
            setRows((prev) => prev.map((row) => row.branchId === data.branchId ? { ...row, ...data } : row));
            setLastUpdated(new Date());
        };
        const refresh = () => mounted && loadData(mounted);

        socketService.on('branch:performance', handleBranchUpdate);
        socketService.on('analytics:refresh', refresh);
        socketService.onReconnect(refresh);
        const interval = setInterval(refresh, 60000);

        return () => {
            mounted = false;
            socketService.off('branch:performance', handleBranchUpdate);
            socketService.off('analytics:refresh', refresh);
            clearInterval(interval);
        };
    }, [token, activeBranchId, loadData]);

    return (
        <>
            <div className="flex items-center justify-between px-4 pb-0 pt-3 md:px-6 lg:px-8">
                <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${isLive && socketService.isConnected() ? 'animate-pulse bg-emerald-500' : 'bg-rose-400'}`} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted">
                        {isLive && socketService.isConnected() ? (lang === 'ar' ? 'بيانات حية' : 'Live') : (lang === 'ar' ? 'غير متصل' : 'Offline')}
                    </span>
                    <span className="text-[8px] text-muted">
                        {lang === 'ar' ? 'آخر تحديث' : 'Updated'}: {lastUpdated.toLocaleTimeString()}
                    </span>
                </div>
                <button onClick={() => { setIsLoading(true); loadData(true); }}
                    className="text-[9px] font-black uppercase tracking-widest text-primary transition-colors hover:text-primary/80">
                    {lang === 'ar' ? 'تحديث' : 'Refresh'}
                </button>
            </div>
            <AdminDashboard lang={lang} rows={rows} isLoading={isLoading} error={error} periodLabel={period.label} />
        </>
    );
};

export default AdminDashboardPage;
