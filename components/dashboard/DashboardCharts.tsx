import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9'];

const tooltipStyle = {
  backgroundColor: 'rgba(var(--color-card), 0.9)',
  border: '1px solid rgba(var(--color-border), 0.1)',
  borderRadius: '16px',
} as const;

const axisTick = { fontSize: 10, fill: 'var(--color-muted)', fontWeight: 800 } as const;

/**
 * Dashboard chart sections, isolated from Dashboard.tsx.
 *
 * Dashboard.tsx must NEVER import 'recharts' at the top level: the library
 * (~116KB, ~44% unused on first paint) would otherwise join the dashboard
 * chunk and block LCP. Each export below is loaded via React.lazy so charts
 * stream in after the KPI/header shell is already interactive.
 */

export const RevenueTrendChart: React.FC<{
  data: Array<{ name: string; revenue: number; prevRevenue?: number }>;
  comparisonLabel: string;
  currentLabel: string;
}> = React.memo(({ data, comparisonLabel, currentLabel }) => (
  <div className="w-full h-[400px] mt-4 relative">
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="rgb(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="rgb(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorPrev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} />
            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--color-border), 0.1)" />
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} dy={15} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={axisTick}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
        />
        <Tooltip
          contentStyle={{
            ...tooltipStyle,
            backdropFilter: 'blur(10px)',
            padding: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          }}
          itemStyle={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}
        />
        <Area type="monotone" dataKey="prevRevenue" name={comparisonLabel} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="url(#colorPrev)" />
        <Area type="monotone" dataKey="revenue" name={currentLabel} stroke="rgb(var(--primary))" strokeWidth={4} fill="url(#colorCurrent)" animationDuration={2000} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
));

export const DaypartChart: React.FC<{
  data: Array<{ name: string; orderCount: number; revenue: number; avgTicket: number; percentage: number }>;
  revenueLabel: string;
}> = React.memo(({ data, revenueLabel }) => (
  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
    <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--color-border), 0.1)" />
      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={axisTick}
        tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
      />
      <Tooltip contentStyle={tooltipStyle} />
      <Bar dataKey="revenue" name={revenueLabel} radius={[8, 8, 0, 0]}>
        {data.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
));

export const HourlyChart: React.FC<{
  data: Array<{ hour: string; revenue: number; orderCount: number }>;
  revenueLabel: string;
}> = React.memo(({ data, revenueLabel }) => (
  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--color-border), 0.1)" />
      <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: 'var(--color-muted)', fontWeight: 800 }} interval={2} />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={axisTick}
        tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
      />
      <Tooltip contentStyle={tooltipStyle} />
      <Area type="monotone" dataKey="revenue" name={revenueLabel} stroke="rgb(var(--primary))" strokeWidth={3} fill="rgb(var(--primary))" fillOpacity={0.15} />
    </AreaChart>
  </ResponsiveContainer>
));

export const OrderSourceChart: React.FC<{
  data: Array<{ name: string; value: number }>;
}> = React.memo(({ data }) => (
  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
    <PieChart>
      <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
        {data.map((entry, index) => (
          <Cell key={`cell-${entry.name || index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip />
    </PieChart>
  </ResponsiveContainer>
));
