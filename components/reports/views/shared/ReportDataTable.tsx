import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Table2 } from 'lucide-react';
import Pagination from '../../../common/Pagination';
import ExportButton from '../../../common/ExportButton';
import { useAuthStore } from '../../../../stores/useAuthStore';

export interface ReportColumn {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    /** Render a cell (receives raw value + full row). */
    format?: (value: any, row: any, index: number) => React.ReactNode;
    /** Include in totals footer (sums Number(value)). */
    sum?: boolean;
    /** Raw value used for CSV export (defaults to String(value)). */
    exportFormat?: (value: any, row: any) => string;
    sortable?: boolean;
}

interface ReportDataTableProps {
    title: string;
    subtitle?: string;
    data: any[];
    columns: ReportColumn[];
    rowKey?: (row: any, index: number) => string;
    pageSize?: number;
    exportFilename?: string;
    exportTitle?: string;
    emptyText?: string;
    lang?: 'en' | 'ar';
    footerNote?: string;
}

/** Uniform money formatting: 2 decimals + symbol (accounting-grade). */
export const fmtMoney = (n: any, symbol = '') => {
    const v = Number(n || 0);
    const s = v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return symbol ? `${s} ${symbol}` : s;
};

export const fmtNum = (n: any) => Number(n || 0).toLocaleString();

/**
 * Shared accounting-grade data table for ALL reports.
 * Sorting + totals footer + pagination + CSV/Print export + empty state.
 * Rendered FIRST (above the visual) per the approved reports plan.
 */
const ReportDataTable: React.FC<ReportDataTableProps> = ({
    title,
    subtitle,
    data,
    columns,
    rowKey,
    pageSize = 15,
    exportFilename = 'report',
    exportTitle,
    emptyText,
    lang = 'en',
    footerNote,
}) => {
    const isAr = lang === 'ar';
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<1 | -1>(-1);
    const [page, setPage] = useState(1);
    const settings = useAuthStore((s) => s.settings);
    const branches = useAuthStore((s) => s.branches);
    const brandCurrency = settings.currencySymbol || '';
    const brandBranch = settings.activeBranchId
        ? branches.find((b: any) => b.id === settings.activeBranchId)?.name || ''
        : '';

    const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

    const sorted = useMemo(() => {
        if (!sortKey) return rows;
        const col = columns.find((c) => c.key === sortKey);
        const numeric = col && (col.sum || rows.every((r) => r[sortKey] == null || !Number.isNaN(Number(r[sortKey]))));
        return [...rows].sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (numeric) return (Number(av || 0) - Number(bv || 0)) * sortDir;
            return String(av ?? '').localeCompare(String(bv ?? '')) * sortDir;
        });
    }, [rows, sortKey, sortDir, columns]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageRows = useMemo(
        () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
        [sorted, safePage, pageSize]
    );

    const totals = useMemo(() => {
        const t: Record<string, number> = {};
        columns.forEach((c) => {
            if (c.sum) t[c.key] = rows.reduce((s, r) => s + Number(r[c.key] || 0), 0);
        });
        return t;
    }, [rows, columns]);

    const hasTotals = Object.keys(totals).length > 0;

    const toggleSort = (key: string) => {
        const col = columns.find((c) => c.key === key);
        if (col && col.sortable === false) return;
        if (sortKey === key) {
            setSortDir((d) => (d === 1 ? -1 : 1));
        } else {
            setSortKey(key);
            setSortDir(-1);
        }
        setPage(1);
    };

    const exportColumns = columns.map((c) => ({
        key: c.key,
        label: c.label,
        format: (v: any) => {
            if (c.exportFormat) {
                const found = rows.find((x) => x[c.key] === v);
                return c.exportFormat(v, found ?? ({} as any));
            }
            if (c.format) {
                try {
                    const out = c.format(v, {} as any, 0);
                    return typeof out === 'string' ? out : String(out ?? '');
                } catch {
                    return v == null ? '' : String(v);
                }
            }
            return v == null ? '' : String(v);
        },
    }));

    const exportTotals: (string | number)[] | undefined = hasTotals
        ? columns.map((c, ci) =>
              ci === 0 ? (isAr ? 'الإجمالي' : 'TOTAL') : c.sum ? fmtMoney(totals[c.key], brandCurrency) : ''
          )
        : undefined;

    const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

    return (
        <div className="card-primary rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="p-6 md:p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                        <Table2 size={18} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-main">{title}</h3>
                        {subtitle && <p className="text-[11px] font-bold text-muted mt-0.5">{subtitle}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                        {rows.length} {isAr ? 'صف' : 'rows'}
                    </span>
                    {rows.length > 0 && (
                        <ExportButton
                            data={rows}
                            columns={exportColumns}
                            filename={exportFilename}
                            title={exportTitle || title}
                            subtitle={[brandBranch, subtitle].filter(Boolean).join(' · ')}
                            totals={exportTotals}
                        />
                    )}
                </div>
            </div>
            {rows.length === 0 ? (
                <p className="text-center text-muted py-12 text-xs font-bold">
                    {emptyText || (isAr ? 'لا توجد بيانات' : 'No data')}
                </p>
            ) : (
                <>
                    <div className="responsive-table overflow-x-auto">
                        <table className="w-full text-xs min-w-[640px]">
                            <thead>
                                <tr className="bg-elevated/20 text-muted text-[10px] uppercase font-black tracking-[0.15em]">
                                    {columns.map((c) => (
                                        <th
                                            key={c.key}
                                            aria-sort={sortKey === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : undefined}
                                            className={`px-5 py-4 whitespace-nowrap ${alignClass(c.align)} ${c.sortable === false ? '' : 'cursor-pointer select-none hover:text-main'}`}
                                            onClick={() => toggleSort(c.key)}
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {c.label}
                                                {sortKey === c.key ? (
                                                    sortDir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                                                ) : (
                                                    c.sortable !== false && <ArrowUpDown size={11} className="opacity-30" />
                                                )}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {pageRows.map((row, i) => (
                                    <tr key={rowKey ? rowKey(row, i) : i} className="hover:bg-elevated/40 transition-colors">
                                        {columns.map((c) => (
                                            <td key={c.key} className={`px-5 py-3.5 ${alignClass(c.align)} ${c.sum ? 'font-mono font-bold tabular-nums' : ''}`}>
                                                {c.format ? c.format(row[c.key], row, i) : String(row[c.key] ?? '-')}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            {hasTotals && (
                                <tfoot>
                                    <tr className="bg-primary/5 border-t-2 border-primary/20 font-black">
                                        {columns.map((c, ci) => (
                                            <td key={c.key} className={`px-5 py-4 tabular-nums ${alignClass(c.align)}`}>
                                                {ci === 0 ? (isAr ? 'الإجمالي' : 'TOTAL') : c.sum ? fmtMoney(totals[c.key]) : ''}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-border/20">
                        <span className="text-[10px] font-bold text-muted">
                            {footerNote || (totalPages > 1 ? `${isAr ? 'صفحة' : 'Page'} ${safePage} / ${totalPages}` : `${rows.length} ${isAr ? 'صف' : 'rows'}`)}
                        </span>
                        <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} size="sm" />
                    </div>
                </>
            )}
        </div>
    );
};

export default ReportDataTable;
