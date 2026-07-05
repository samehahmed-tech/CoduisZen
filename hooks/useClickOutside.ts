import { useEffect, useRef } from 'react';

/**
 * Detect clicks outside a referenced element.
 * Usage:
 *   const ref = useClickOutside(() => setOpen(false));
 *   <div ref={ref}>...</div>
 */
export function useClickOutside<T extends HTMLElement = HTMLDivElement>(
    callback: () => void
): React.RefObject<T | null> {
    const ref = useRef<T | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                callback();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [callback]);

    return ref;
}

export default useClickOutside;
