import { useState, useCallback, useRef } from 'react';

interface UseUndoableReturn<T> {
    value: T;
    setValue: (next: T) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    history: T[];
    pointer: number;
}

/**
 * State with undo/redo history.
 *
 * Usage:
 *   const { value, setValue, undo, redo, canUndo } = useUndoable(initialItems);
 *   <button disabled={!canUndo} onClick={undo}>Undo</button>
 */
export function useUndoable<T>(initialValue: T, maxHistory = 30): UseUndoableReturn<T> {
    const [history, setHistory] = useState<T[]>([initialValue]);
    const [pointer, setPointer] = useState(0);

    const setValue = useCallback((next: T) => {
        setHistory(prev => {
            const newHistory = [...prev.slice(0, pointer + 1), next].slice(-maxHistory);
            setPointer(newHistory.length - 1);
            return newHistory;
        });
    }, [pointer, maxHistory]);

    const undo = useCallback(() => {
        setPointer(p => Math.max(0, p - 1));
    }, []);

    const redo = useCallback(() => {
        setPointer(p => Math.min(history.length - 1, p + 1));
    }, [history.length]);

    return {
        value: history[pointer],
        setValue,
        undo,
        redo,
        canUndo: pointer > 0,
        canRedo: pointer < history.length - 1,
        history,
        pointer,
    };
}

export default useUndoable;
