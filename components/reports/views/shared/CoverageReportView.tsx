import React, { useMemo } from 'react';
import ReportDataTable, { fmtMoney, fmtNum } from './ReportDataTable';
import { getReportDisplayLabel } from '../../reportConstants';

interface Props {
   reportName: string;
   rows: any[];
   meta?: any;
   lang?: 'ar' | 'en';
   currency?: string;
}

const pickColumns = (rows: any[]) => {
   if (!rows.length) return [];
   const keys = Object.keys(rows[0]).slice(0, 7);
   return keys.map((k, i) => {
      const sample = rows.find((r) => r[k] != null)?.[k];
      const numeric = typeof sample === 'number' || (!Number.isNaN(Number(sample)) && sample !== '' && sample != null && /^[-\d.,\s]+$/.test(String(sample)));
      const isMoney = /amount|total|revenue|balance|cost|price|value|net|gross|fee|commission|salary|pay/i.test(k);
      const isPct = /percent|pct|rate|ratio/i.test(k);
      return {
         key: k,
         label: k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
         align: (i === 0 ? 'left' : 'right') as const,
         sum: numeric && !isPct && i > 0,
         format: (v: any) => {
            if (v == null || v === '') return '—';
            if (typeof v === 'boolean') return v ? '✓' : '—';
            if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
            if (isPct && !Number.isNaN(Number(v))) return `${Number(v)}%`;
            if (isMoney && !Number.isNaN(Number(v))) return fmtMoney(v);
            if (numeric && !Number.isNaN(Number(v))) return fmtNum(v);
            const s = String(v);
            return s.length > 60 ? `${s.slice(0, 60)}…` : s;
         },
      };
   });
};

/**
 * Generic renderer for coverage reports (one per ERP feature).
 * Auto-columns + totals + full print/PDF/Excel via ReportDataTable.
 */
export const CoverageReportView: React.FC<Props> = ({ reportName, rows, meta, lang = 'ar', currency = '' }) => {
   const isAr = lang === 'ar';
   const data = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
   const columns = useMemo(() => pickColumns(data), [data]);
   const title = isAr ? getReportDisplayLabel(reportName) : reportName;

   const kpis = useMemo(() => {
      const cards: { label: string; value: string }[] = [];
      cards.push({ label: isAr ? 'عدد السجلات' : 'Records', value: fmtNum(data.length) });
      if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
         Object.entries(meta).slice(0, 3).forEach(([k, v]) => {
            const moneyLike = /amount|total|revenue|balance|cost|price|value|net|gross|fee|commission|salary|pay|spent|cash/i.test(k);
            if (typeof v === 'number') cards.push({ label: k, value: moneyLike ? fmtMoney(v, currency) : fmtNum(v) });
            else if (typeof v === 'string' && v.length < 40) cards.push({ label: k, value: v });
         });
      }
      // No-show rate for reservations, pending rate for approvals — computed live.
      if (reportName === 'Reservations & No-Show' && data.length) {
         const no = data.filter((r: any) => String(r.status || '').toUpperCase().includes('NO')).length;
         cards.push({ label: isAr ? 'نسبة عدم الحضور' : 'No-show %', value: `${((no / data.length) * 100).toFixed(1)}%` });
      }
      if (reportName === 'Approval SLA' && data.length) {
         const pend = data.filter((r: any) => /pend|request|open/i.test(String(r.status || ''))).length;
         cards.push({ label: isAr ? 'معلق' : 'Pending', value: fmtNum(pend) });
      }
      return cards.slice(0, 4);
   }, [data, meta, reportName, isAr, currency]);

   return (
      <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
         {kpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {kpis.map((c, i) => (
                  <div key={i} className="card-primary rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg">
                     <p className="text-[10px] font-black uppercase tracking-widest text-muted">{c.label}</p>
                     <p className="text-2xl font-black mt-1 text-main">{c.value}</p>
                  </div>
               ))}
            </div>
         )}
         <ReportDataTable
            title={title}
            subtitle={isAr ? 'تقرير تغطية — كل السجلات قابلة للفرز والطباعة والتصدير' : 'Coverage report — sortable, printable, exportable'}
            data={data}
            columns={columns as any}
            exportFilename={reportName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
            lang={isAr ? 'ar' : 'en'}
         />
      </div>
   );
};

export default CoverageReportView;
