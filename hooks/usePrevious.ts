import { useRef, useEffect } from 'react';

/**
 * Track the previous value of a variable.
 *
 * Usage:
 *   const prevCount = usePrevious(count);
 *   if (prevCount !== count) onCountChanged();
 */
export function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined);

    useEffect(() => {
        ref.current = value;
    }, [value]);

    return ref.current;
}

export default usePrevious;
