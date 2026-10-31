import { useState, useMemo, useCallback } from 'react';

type SortDirection = 'asc' | 'desc';

interface SortConfig<T> {
    key: keyof T | null;
    direction: SortDirection;
}

interface UseSortReturn<T> {
    sortedData: T[];
    sortConfig: SortConfig<T>;
    requestSort: (key: keyof T) => void;
    getSortIcon: (key: keyof T) => '↑' | '↓' | '↕';
}

/**
 * Hook for sortable tables. Handles sorting logic and direction toggling.
 *
 * Usage:
 *   const { sortedData, requestSort, getSortIcon } = useSort(orders);
 *   <th onClick={() => requestSort('total')}>Total {getSortIcon('total')}</th>
 */
export function useSort<T extends Record<string, any>>(data: T[]): UseSortReturn<T> {
    const [sortConfig, setSortConfig] = useState<SortConfig<T>>({ key: null, direction: 'asc' });

    const requestSort = useCallback((key: keyof T) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    }, []);

    const sortedData = useMemo(() => {
        if (!sortConfig.key) return data;
        const sorted = [...data].sort((a, b) => {
            const aVal = a[sortConfig.key!];
            const bVal = b[sortConfig.key!];
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            if (typeof aVal === 'string') return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            return sortConfig.direction === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
        });
        return sorted;
    }, [data, sortConfig]);

    const getSortIcon = useCallback((key: keyof T): '↑' | '↓' | '↕' => {
        if (sortConfig.key !== key) return '↕';
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    }, [sortConfig]);

    return { sortedData, sortConfig, requestSort, getSortIcon };
}

export default useSort;
