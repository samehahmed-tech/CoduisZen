import { useRef, useCallback } from 'react';

/**
 * Throttle a callback to run at most once per interval.
 *
 * Usage:
 *   const throttledScroll = useThrottle((e) => handleScroll(e), 200);
 *   window.addEventListener('scroll', throttledScroll);
 */
export function useThrottle<T extends (...args: any[]) => void>(callback: T, delay: number): T {
    const lastRan = useRef(0);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    return useCallback((...args: any[]) => {
        const now = Date.now();
        const remaining = delay - (now - lastRan.current);

        if (remaining <= 0) {
            lastRan.current = now;
            callback(...args);
        } else if (!timeoutRef.current) {
            timeoutRef.current = setTimeout(() => {
                lastRan.current = Date.now();
                timeoutRef.current = null;
                callback(...args);
            }, remaining);
        }
    }, [callback, delay]) as T;
}

export default useThrottle;
