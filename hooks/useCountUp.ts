import { useState, useEffect, useRef } from 'react';

/**
 * Animate a number counting up from 0 to target.
 *
 * Usage:
 *   const count = useCountUp(1250, 800);
 *   <span>{count}</span>
 */
export function useCountUp(target: number, duration = 600): number {
    const [value, setValue] = useState(0);
    const startRef = useRef(0);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        startRef.current = Date.now();
        const animate = () => {
            const elapsed = Date.now() - startRef.current;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(target * eased));
            if (progress < 1) rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [target, duration]);

    return value;
}

export default useCountUp;
