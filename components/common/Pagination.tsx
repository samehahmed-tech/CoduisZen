import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    size?: 'sm' | 'md';
}

/**
 * Pagination with first/prev/pages/next/last navigation.
 *
 * Usage:
 *   <Pagination currentPage={page} totalPages={Math.ceil(total/perPage)} onPageChange={setPage} />
 */
const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange, size = 'md' }) => {
    if (totalPages <= 1) return null;

    const btnSize = size === 'sm' ? 'min-w-[36px] h-9 px-2 text-xs' : 'min-w-[40px] h-10 px-2.5 text-[13px]';
    const iconSize = size === 'sm' ? 14 : 16;

    // Show up to 5 page buttons
    const getPages = (): number[] => {
        const pages: number[] = [];
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + 4);
        if (end - start < 4) start = Math.max(1, end - 4);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    };

    const btn = (onClick: () => void, disabled: boolean, children: React.ReactNode, active = false, label?: string) => (
        <button
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            data-interaction="press"
            className={`${btnSize} rounded-xl font-bold flex items-center justify-center transition-all duration-150 ${active ? 'bg-primary text-white shadow-sm' : 'bg-elevated/30 text-muted hover:text-primary hover:bg-elevated border border-border/30'} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
        >
            {children}
        </button>
    );

    return (
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
            {btn(() => onPageChange(1), currentPage === 1, <ChevronsLeft size={iconSize} />, false, 'First page')}
            {btn(() => onPageChange(currentPage - 1), currentPage === 1, <ChevronLeft size={iconSize} />, false, 'Previous page')}
            {getPages().map(p => btn(() => onPageChange(p), false, p, p === currentPage, `Page ${p}`))}
            {btn(() => onPageChange(currentPage + 1), currentPage === totalPages, <ChevronRight size={iconSize} />, false, 'Next page')}
            {btn(() => onPageChange(totalPages), currentPage === totalPages, <ChevronsRight size={iconSize} />, false, 'Last page')}
        </nav>
    );
};

export default Pagination;
