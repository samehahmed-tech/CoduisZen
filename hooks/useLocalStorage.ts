import { useState, useCallback } from 'react';

/**
 * Persist state to localStorage with automatic JSON serialization.
 *
 * Usage:
 *   const [filters, setFilters] = useLocalStorage('report-filters', { dateRange: 'weekly' });
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch {
            return initialValue;
        }
    });

    const setValue = useCallback((value: T | ((prev: T) => T)) => {
        setStoredValue(prev => {
            const newValue = value instanceof Function ? value(prev) : value;
            try {
                window.localStorage.setItem(key, JSON.stringify(newValue));
            } catch { /* quota exceeded — silently fail */ }
            return newValue;
        });
    }, [key]);

    return [storedValue, setValue];
}

export default useLocalStorage;
