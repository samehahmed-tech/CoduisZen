// ═══════════════════════════════════════════════════════════════════
//  useMotion — Hook to build consistent motion styles from
//  the current theme's animation tokens
// ═══════════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTheme } from '../theme/useTheme';
import type { MotionTokens } from '../theme/tokens';

export interface MotionHelpers {
    /** Current motion tokens */
    tokens: MotionTokens;
    /** Get a CSS transition string for given properties */
    getTransition: (...properties: string[]) => string;
    /** Get a slow CSS transition string for given properties */
    getTransitionSlow: (...properties: string[]) => string;
    /** Inline style object for duration + easing (useful for JS animations) */
    style: { transitionDuration: string; transitionTimingFunction: string };
    /** Whether the current theme prefers instant/no animation */
    prefersReduced: boolean;
}

export function useMotion(): MotionHelpers {
    const { config } = useTheme();
    const { motion } = config;

    return useMemo<MotionHelpers>(() => {
        const getTransition = (...properties: string[]) =>
            properties.map((p) => `${p} ${motion.duration} ${motion.easing}`).join(', ');

        const getTransitionSlow = (...properties: string[]) =>
            properties.map((p) => `${p} ${motion.durationSlow} ${motion.easing}`).join(', ');

        return {
            tokens: motion,
            getTransition,
            getTransitionSlow,
            style: {
                transitionDuration: motion.duration,
                transitionTimingFunction: motion.easing,
            },
            prefersReduced: motion.style === 'instant',
        };
    }, [motion]);
}
