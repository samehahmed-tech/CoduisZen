import { useState, useCallback } from 'react';

/**
 * Simple boolean toggle hook.
 *
 * Usage:
 *   const [isOpen, toggle, setIsOpen] = useToggle(false);
 *   <button onClick={toggle}>Toggle</button>
 *   <button onClick={() => setIsOpen(true)}>Open</button>
 */
export function useToggle(initial = false): [boolean, () => void, (value: boolean) => void] {
    const [value, setValue] = useState(initial);
    const toggle = useCallback(() => setValue(v => !v), []);
    return [value, toggle, setValue];
}

export default useToggle;
