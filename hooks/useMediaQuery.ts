import { useState, useEffect } from 'react';

/**
 * Check if a CSS media query matches.
 *
 * Usage:
 *   const isMobile = useMediaQuery('(max-width: 768px)');
 *   const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        const mq = window.matchMedia(query);
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
        mq.addEventListener('change', handler);
        setMatches(mq.matches);
        return () => mq.removeEventListener('change', handler);
    }, [query]);

    return matches;
}

export default useMediaQuery;
