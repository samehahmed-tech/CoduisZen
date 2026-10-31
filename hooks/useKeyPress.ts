import { useEffect, useCallback } from 'react';

/**
 * Listen for a specific key press.
 * Usage:
 *   useKeyPress('Escape', () => setOpen(false));
 *   useKeyPress('Enter', handleSubmit, { ctrl: true });
 */
export function useKeyPress(
    key: string,
    callback: () => void,
    modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean }
) {
    const handler = useCallback((e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if (e.key !== key) return;
        if (modifiers?.ctrl && !e.ctrlKey && !e.metaKey) return;
        if (modifiers?.shift && !e.shiftKey) return;
        if (modifiers?.alt && !e.altKey) return;
        e.preventDefault();
        callback();
    }, [key, callback, modifiers?.ctrl, modifiers?.shift, modifiers?.alt]);

    useEffect(() => {
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [handler]);
}

export default useKeyPress;
