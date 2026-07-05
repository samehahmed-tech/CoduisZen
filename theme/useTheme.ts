// ═══════════════════════════════════════════════════════════════════
//  useTheme — Hook to access the current theme context
// ═══════════════════════════════════════════════════════════════════

import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './ThemeProvider';

/**
 * Returns the current theme configuration and controls.
 *
 * @example
 * const { config, isDark, setTheme, toggleDark } = useTheme();
 * // config.components.button.variant → 'glass' | 'solid' | 'tile' | …
 * // config.motion.easing → CSS cubic-bezier string
 */
export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error('useTheme must be used within <ThemeProvider>');
    }
    return ctx;
}
