import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { aiApi } from '../../services/api/ai';
import { useAuthStore } from '../../stores/useAuthStore';
import { BrainCircuit, TrendingUp, Sparkles, Loader2, Info } from 'lucide-react';
import { motion } from 'framer-motion';

const RevenueForecastWidget: React.FC = () => {
    const { settings } = useAuthStore();
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const isAr = lang === 'ar';

    const { data, isLoading, error } = useQuery({
        queryKey: ['revenue-forecast', settings.activeBranchId],
        queryFn: () => aiApi.getForecast(settings.activeBranchId),
        staleTime: 60 * 60 * 1000, // 1 hour
    });

    if (isLoading) {
        return (
            <div className="h-[400px] flex flex-col items-center justify-center glass-1 border border-border/10 rounded-[2rem]">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                <p className="text-xs font-black uppercase tracking-widest text-muted">
                    {isAr ? 'جارٍ تحليل البيانات والتدقيق الذكي...' : 'Analyzing patterns & calculating projections...'}
                </p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="h-[400px] flex flex-col items-center justify-center glass-1 border border-border/10 rounded-[2rem] p-8 text-center">
                <Info className="w-10 h-10 text-muted/30 mb-4" />
                <p className="text-sm font-bold text-muted">
                    {isAr ? 'لا توجد بيانات كافية حالياً للتنبؤ بالمستقبل.' : 'Insufficient data to generate a reliable forecast yet.'}
                </p>
            </div>
        );
    }

    const combinedData = [
        ...data.historical.map(d => ({ ...d, historicalRevenue: d.revenue, forecastRevenue: null })),
        ...data.forecast.map((d, index) => ({
            ...d,
            historicalRevenue: null,
            forecastRevenue: d.revenue,
            ...(index === 0 && data.historical.length > 0
                ? { historicalRevenue: data.historical[data.historical.length - 1].revenue }
                : {}),
        }))
    ];

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card/60 border border-border/30 rounded-[2rem] p-6 lg:p-8 flex flex-col shadow-xl overflow-hidden relative"
        >
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] pointer-events-none" />

            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 relative z-10">
                <div>
                    <h3 className="text-xl font-black text-main tracking-tight flex items-center gap-3">
                        <BrainCircuit className="text-primary" />
                        {isAr ? 'التنبؤ المالي الذكي' : 'Predictive Revenue Engine'}
                    </h3>
                    <p className="text-xs text-muted font-bold mt-1">
                        {isAr ? 'توقعات المبيعات للأيام الـ 7 القادمة بناءً على سلوك الماضي' : '7-day revenue projections based on historical trajectory'}
                    </p>
                </div>
                <div className="flex items-center gap-4 bg-elevated/40 p-2 rounded-xl border border-border/10">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-primary" />
                        <span className="text-[10px] font-black uppercase text-muted">{isAr ? 'تاريخي' : 'Historical'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-accent border-2 border-dashed border-white/20" />
                        <span className="text-[10px] font-black uppercase text-muted">{isAr ? 'متوقع' : 'Projected'}</span>
                    </div>
                </div>
            </div>

            <div className="w-full h-[300px] relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={combinedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="rgb(var(--primary))" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="rgb(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--color-border), 0.1)" />
                        <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 9, fill: 'var(--color-muted)', fontWeight: 800 }} 
                            dy={15}
                            tickFormatter={(str) => {
                                const date = new Date(str);
                                return date.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', day: 'numeric' });
                            }}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: 'var(--color-muted)', fontWeight: 800 }} 
                            tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: 'rgba(var(--color-card), 0.95)', backdropFilter: 'blur(10px)', border: '1px solid rgba(var(--color-border), 0.1)', borderRadius: '16px', padding: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
                            labelStyle={{ fontSize: '10px', fontWeight: 900, marginBottom: '4px', color: 'rgb(var(--text-muted))' }}
                            itemStyle={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}
                            formatter={(value: number) => [`${value.toLocaleString()} ${settings.currencySymbol}`, isAr ? 'الإيراد' : 'Revenue']}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="historicalRevenue" 
                            stroke="rgb(var(--primary))" 
                            strokeWidth={3} 
                            fill="url(#forecastGradient)" 
                            animationDuration={1500} 
                        />
                        <Area
                            type="monotone"
                            dataKey="forecastRevenue"
                            stroke="rgb(var(--primary))"
                            strokeWidth={3}
                            strokeDasharray="5 5"
                            fill="url(#forecastGradient)"
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* AI Insight Box */}
            <div className="mt-8 bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 rounded-2xl p-4 flex items-start gap-4 animate-pulse-soft">
                <div className="p-2 bg-primary/20 rounded-lg">
                    <Sparkles className="text-primary w-5 h-5" />
                </div>
                <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                        {isAr ? 'توصية الذكاء الاصطناعي' : 'AI Strategic Insight'}
                    </h4>
                    <p className="text-sm font-bold text-main leading-relaxed">
                        {data.insight}
                    </p>
                </div>
            </div>
        </motion.div>
    );
};

export default RevenueForecastWidget;
