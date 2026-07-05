import { useState, useEffect, useRef } from 'react';

/**
 * Detect when an element enters the viewport (lazy loading, animations).
 *
 * Usage:
 *   const { ref, isVisible } = useOnScreen({ threshold: 0.1 });
 *   <div ref={ref}>{isVisible && <HeavyComponent />}</div>
 */
export function useOnScreen(options?: IntersectionObserverInit) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true);
                observer.unobserve(el); // Only trigger once
            }
        }, { threshold: 0.1, ...options });

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return { ref, isVisible };
}

export default useOnScreen;
