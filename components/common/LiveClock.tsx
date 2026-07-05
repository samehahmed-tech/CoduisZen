import React, { useState, useEffect } from 'react';
import { Clock, Timer } from 'lucide-react';
import { useFinanceStore } from '../../stores/useFinanceStore';
import { useAuthStore } from '../../stores/useAuthStore';

const LiveClock: React.FC = () => {
    const [now, setNow] = useState(new Date());
    const activeShift = useFinanceStore(state => state.activeShift);
    const lang = useAuthStore(state => state.settings.language) || 'en';

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const systemDate = now.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const seconds = now.getSeconds();

    // Shift elapsed time
    let shiftElapsed = '';
    if (activeShift?.openingTime) {
        const start = new Date(activeShift.openingTime).getTime();
        const diff = Math.max(0, now.getTime() - start);
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        shiftElapsed = `${hrs}h ${mins}m`;
    }

    return (
        <div className="flex items-center gap-3 bg-card/60 rounded-2xl px-4 py-2.5 border border-border/20 shadow-sm">
            <div className="flex items-center gap-2">
                <Clock size={14} className="text-primary" />
                <div className="leading-tight">
                    <span className="block text-sm font-black text-main tracking-tight tabular-nums">{timeStr}</span>
                    <span className="block text-[10px] font-black text-muted uppercase tracking-widest tabular-nums">
                        {lang === 'ar' ? 'تاريخ السيستم: ' : 'System date: '}{systemDate}
                    </span>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full transition-opacity duration-150 ${seconds % 2 === 0 ? 'bg-primary opacity-100' : 'bg-primary opacity-20'}`} />
            </div>
            {shiftElapsed && (
                <>
                    <div className="w-[1px] h-4 bg-border/50 rounded-full" />
                    <div className="flex items-center gap-1.5">
                        <Timer size={12} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest tabular-nums">{shiftElapsed}</span>
                    </div>
                </>
            )}
        </div>
    );
};

export default LiveClock;
