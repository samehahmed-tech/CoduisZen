import React from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface MetricSparklineProps {
  values: number[];
  color: string;
  gradientId: string;
}

/**
 * KPI card sparkline. Split out of Dashboard.tsx so the recharts runtime
 * (~116KB) is NOT part of the dashboard chunk — it streams in after the
 * KPI numbers have already painted (LCP), via React.lazy + Suspense.
 */
const MetricSparkline: React.FC<MetricSparklineProps> = ({ values, color, gradientId }) => {
  if (!values || values.length === 0) return null;
  // Decorative only: inert keeps the focusable recharts svg out of the tab
  // order and accessibility tree (avoids aria-hidden-focus violations).
  return (
    <div className="absolute bottom-0 left-0 right-0 h-16 opacity-30 pointer-events-none" aria-hidden="true" inert>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={values.map((val, idx) => ({ val, idx }))}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.8} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="val" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default React.memo(MetricSparkline);
