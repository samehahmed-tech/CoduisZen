import React from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

const moneyUnit = (lang: 'en' | 'ar') => (lang === 'ar' ? 'ج.م' : 'EGP');
const fmt = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
const money = (value: number, lang: 'en' | 'ar') => `${fmt(value)} ${moneyUnit(lang)}`;

export interface BranchBarDatum {
    name: string;
    revenue: number;
    orders: number;
    health: number;
}

export interface RiskDatum {
    name: string;
    value: number;
    color: string;
}

// Lazy boundary for the recharts runtime (~116KB): header, KPIs, watchlist
// and table paint first from the light parent chunk — charts stream in after
// with identical visuals inside the same fixed-height containers.
export const BranchComparisonChart: React.FC<{
    data: BranchBarDatum[];
    lang: 'en' | 'ar';
    isAr: boolean;
    rowsCount: number;
}> = ({ data, lang, isAr, rowsCount }) => (
    <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: isAr ? 10 : -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.18)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 800, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} interval={0} angle={rowsCount > 4 ? -20 : 0} textAnchor={rowsCount > 4 ? 'end' : 'middle'} height={60} />
            <YAxis yAxisId="money" tick={{ fontSize: 10, fontWeight: 800, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} tickFormatter={(v) => Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v)} />
            <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 10, fontWeight: 800, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} />
            <Tooltip
                formatter={(value: any, key: any) => key === 'revenue'
                    ? [money(Number(value || 0), lang), isAr ? 'الإيراد' : 'Revenue']
                    : [fmt(Number(value || 0)), isAr ? 'الطلبات' : 'Orders']}
                contentStyle={{ background: 'rgb(var(--color-card))', border: '1px solid rgb(var(--color-border))', borderRadius: 8, fontWeight: 800 }}
            />
            <Bar yAxisId="money" dataKey="revenue" fill="#2563eb" radius={[6, 6, 0, 0]} />
            <Bar yAxisId="count" dataKey="orders" fill="#10b981" radius={[6, 6, 0, 0]} />
        </BarChart>
    </ResponsiveContainer>
);

export const RiskDonutChart: React.FC<{ data: RiskDatum[] }> = ({ data }) => (
    <ResponsiveContainer width="100%" height="100%">
        <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={4}>
                {data.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Pie>
            <Tooltip formatter={(value: any) => fmt(Number(value || 0))} />
        </PieChart>
    </ResponsiveContainer>
);
