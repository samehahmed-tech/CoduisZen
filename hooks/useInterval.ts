import { useEffect, useRef } from 'react';

/**
 * setInterval as a hook. Automatically cleans up on unmount.
 * Pass null as delay to pause.
 *
 * Usage:
 *   useInterval(() => fetchData(), 5000);
 *   useInterval(() => tick(), isPaused ? null : 1000);
 */
export function useInterval(callback: () => void, delay: number | null) {
    const savedCallback = useRef(callback);

    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    useEffect(() => {
        if (delay === null) return;
        const id = setInterval(() => savedCallback.current(), delay);
        return () => clearInterval(id);
    }, [delay]);
}

export default useInterval;
