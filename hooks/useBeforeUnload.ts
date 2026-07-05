import { useEffect, useCallback } from 'react';

/**
 * Warns users before leaving the page with unsaved changes.
 *
 * Usage:
 *   useBeforeUnload(isDirty, 'You have unsaved changes. Are you sure you want to leave?');
 */
export function useBeforeUnload(shouldWarn: boolean, message = 'You have unsaved changes.') {
    const handler = useCallback((e: BeforeUnloadEvent) => {
        if (!shouldWarn) return;
        e.preventDefault();
        e.returnValue = message;
        return message;
    }, [shouldWarn, message]);

    useEffect(() => {
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [handler]);
}

export default useBeforeUnload;
