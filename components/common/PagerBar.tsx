import React from 'react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

interface PagerBarProps {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    lang?: 'en' | 'ar';
    isLoading?: boolean;
    onPage: (page: number) => void;
    onPageSize: (size: number) => void;
}

/**
 * Shared Phase-6 pager bar. Design-system native (rounded-xl, border,
 * bg-elevated) so every table session looks identical. Page sizes are
 * fixed to 10/25/50/100; the backend enforces the same ceiling.
 */
export const PagerBar: React.FC<PagerBarProps> = ({
    page,
    totalPages,
    total,
    pageSize,
    lang = 'ar',
    isLoading = false,
    onPage,
    onPageSize,
}) => {
    const isAr = lang === 'ar';
    const safePages = Math.max(1, totalPages);
    const safePage = Math.min(Math.max(1, page), safePages);
    const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const end = Math.min(safePage * pageSize, total);
    return (
        <div className="flex flex-wrap items-center gap-2" role="navigation" aria-label={isAr ? 'ترقيم الصفحات' : 'Pagination'}>
            <div className="flex h-9 items-center gap-1 rounded-xl border border-border bg-elevated px-2">
                <button
                    type="button"
                    onClick={() => onPage(Math.max(1, safePage - 1))}
                    disabled={safePage <= 1 || isLoading}
                    aria-label={isAr ? 'الصفحة السابقة' : 'Previous page'}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:text-main disabled:opacity-40"
                >
                    {isAr ? '›' : '‹'}
                </button>
                <span className="min-w-[120px] text-center text-[11px] font-black text-main tabular-nums" aria-live="polite">
                    {total === 0 ? (isAr ? 'لا نتائج' : 'No results') : `${start}–${end} / ${total}`}
                </span>
                <button
                    type="button"
                    onClick={() => onPage(Math.min(safePages, safePage + 1))}
                    disabled={safePage >= safePages || isLoading}
                    aria-label={isAr ? 'الصفحة التالية' : 'Next page'}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:text-main disabled:opacity-40"
                >
                    {isAr ? '‹' : '›'}
                </button>
            </div>
            <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-elevated px-2.5">
                <span className="text-[10px] font-black text-muted">{isAr ? 'لكل صفحة' : 'Per page'}</span>
                <select
                    value={pageSize}
                    onChange={(e) => onPageSize(Number(e.target.value))}
                    aria-label={isAr ? 'عدد السجلات لكل صفحة' : 'Records per page'}
                    className="bg-transparent text-[11px] font-black text-main outline-none"
                >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                </select>
            </div>
            {safePages > 1 && (
                <span className="text-[11px] font-black text-muted tabular-nums">
                    {isAr ? `صفحة ${safePage} من ${safePages}` : `Page ${safePage} of ${safePages}`}
                </span>
            )}
        </div>
    );
};

export default PagerBar;
