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

    const btnSize = size === 'sm' ? 'w-7 h-7 text-[9px]' : 'w-8 h-8 text-[10px]';
    const iconSize = size === 'sm' ? 12 : 14;

    // Show up to 5 page buttons
    const getPages = (): number[] => {
        const pages: number[] = [];
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + 4);
        if (end - start < 4) start = Math.max(1, end - 4);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    };

    const btn = (onClick: () => void, disabled: boolean, children: React.ReactNode, active = false) => (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`${btnSize} rounded-xl font-black flex items-center justify-center transition-all ${active ? 'bg-primary text-white shadow-sm' : 'bg-elevated/30 text-muted hover:text-primary hover:bg-elevated border border-border/30'} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
        >
            {children}
        </button>
    );

    return (
        <div className="flex items-center gap-1">
            {btn(() => onPageChange(1), currentPage === 1, <ChevronsLeft size={iconSize} />)}
            {btn(() => onPageChange(currentPage - 1), currentPage === 1, <ChevronLeft size={iconSize} />)}
            {getPages().map(p => btn(() => onPageChange(p), false, p, p === currentPage))}
            {btn(() => onPageChange(currentPage + 1), currentPage === totalPages, <ChevronRight size={iconSize} />)}
            {btn(() => onPageChange(totalPages), currentPage === totalPages, <ChevronsRight size={iconSize} />)}
        </div>
    );
};

export default Pagination;
