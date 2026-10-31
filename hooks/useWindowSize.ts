import { useState, useEffect } from 'react';

interface WindowSize {
    width: number;
    height: number;
}

/**
 * Get current window dimensions, updates on resize.
 *
 * Usage:
 *   const { width, height } = useWindowSize();
 *   const isMobile = width < 768;
 */
export function useWindowSize(): WindowSize {
    const [size, setSize] = useState<WindowSize>({
        width: typeof window !== 'undefined' ? window.innerWidth : 1024,
        height: typeof window !== 'undefined' ? window.innerHeight : 768,
    });

    useEffect(() => {
        let rafId: number;
        const handler = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                setSize({ width: window.innerWidth, height: window.innerHeight });
            });
        };
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('resize', handler);
            cancelAnimationFrame(rafId);
        };
    }, []);

    return size;
}

export default useWindowSize;
