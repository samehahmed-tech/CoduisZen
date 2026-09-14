import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Database, Wifi, Cpu, RefreshCw } from 'lucide-react';
import { socketService } from '../../services/socketService';
import { apiRequest } from '../../services/api/core';

interface HealthCheck {
    api: 'ok' | 'slow' | 'down';
    db: 'ok' | 'slow' | 'down';
    ws: 'connected' | 'disconnected';
    latency: number;
}

const STATUS_COLORS = {
    ok: 'bg-emerald-500',
    slow: 'bg-amber-500',
    down: 'bg-rose-500',
    connected: 'bg-emerald-500',
    disconnected: 'bg-rose-500',
} as const;

const STATUS_LABELS = {
    ok: 'Healthy',
    slow: 'Degraded',
    down: 'Offline',
    connected: 'Live',
    disconnected: 'Down',
} as const;

const SystemHealth: React.FC = () => {
    const [health, setHealth] = useState<HealthCheck>({
        api: 'ok', db: 'ok', ws: socketService.isConnected() ? 'connected' : 'disconnected', latency: 0,
    });
    const [checking, setChecking] = useState(false);

    const checkHealth = useCallback(async () => {
        setChecking(true);
        const start = performance.now();
        try {
            await apiRequest('/health', { signal: AbortSignal.timeout(5000) });
            const latency = Math.round(performance.now() - start);
            setHealth(prev => ({
                ...prev,
                api: latency > 2000 ? 'slow' : 'ok',
                db: 'ok',
                latency,
                ws: socketService.isConnected() ? 'connected' : 'disconnected',
            }));
        } catch {
            setHealth(prev => ({
                ...prev,
                api: 'down',
                db: 'down',
                latency: 0,
                ws: socketService.isConnected() ? 'connected' : 'disconnected',
            }));
        }
        setChecking(false);
    }, []);

    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 30000);
        return () => clearInterval(interval);
    }, [checkHealth]);

    const metrics = [
        { label: 'API', status: health.api, icon: Activity, sub: health.latency > 0 ? `${health.latency}ms` : '—' },
        { label: 'Database', status: health.db, icon: Database, sub: STATUS_LABELS[health.db] },
        { label: 'WebSocket', status: health.ws, icon: Wifi, sub: STATUS_LABELS[health.ws] },
    ] as const;

    return (
        <div className="relative overflow-hidden bg-card/60  rounded-[1.8rem] border border-border/20 shadow-xl group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            <div className="p-5 border-b border-border/30 flex items-center justify-between relative z-10">
                <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                    <Cpu size={14} className="text-primary" />
                    System Health
                </h3>
                <button
                    onClick={checkHealth}
                    disabled={checking}
                    className="p-1.5 rounded-lg hover:bg-elevated/50 transition-colors"
                >
                    <RefreshCw size={12} className={`text-muted ${checking ? 'animate-spin' : ''}`} />
                </button>
            </div>
            <div className="divide-y divide-border/20 relative z-10">
                {metrics.map(m => (
                    <div key={m.label} className="flex items-center justify-between px-5 py-3.5 hover:bg-elevated/20 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-elevated/40 flex items-center justify-center shrink-0">
                                <m.icon size={14} className="text-muted" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-main">{m.label}</p>
                                <p className="text-[9px] text-muted font-bold">{m.sub}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black uppercase tracking-wider text-muted/50">
                                {STATUS_LABELS[m.status]}
                            </span>
                            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[m.status]} shadow-sm`} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SystemHealth;
