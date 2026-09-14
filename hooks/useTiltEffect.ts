import { useCallback, useEffect, useRef } from 'react';

/**
 * useTiltEffect — Parallax Depth Cards interaction (CodePen XNMWvQ language).
 *
 * - Mouse-only tracking, throttled with requestAnimationFrame.
 * - Writes ONLY CSS custom properties on the element (no React re-render):
 *   --rx/--ry (clamped ±MAX_DEG), --gx/--gy (spotlight %), --px/--py (parallax -0.5..0.5).
 * - `.is-in` while the pointer is down on the card → tight follow;
 *   removing it lets the base (slower, softer) transition glide home.
 * - Disabled for touch pointers and prefers-reduced-motion.
 */
const MAX_DEG = 6;

const isReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useTiltEffect<T extends HTMLElement>() {
    const ref = useRef<T | null>(null);
    const rafId = useRef(0);
    const pending = useRef<{ x: number; y: number } | null>(null);

    const cancelRaf = () => {
        if (rafId.current) {
            cancelAnimationFrame(rafId.current);
            rafId.current = 0;
        }
    };

    // Safety: never leave a scheduled frame hanging after unmount.
    useEffect(() => cancelRaf, []);

    const applyPending = useCallback(() => {
        rafId.current = 0;
        const el = ref.current;
        const p = pending.current;
        pending.current = null;
        if (!el || !p) return;
        el.style.setProperty('--ry', `${(p.x * MAX_DEG * 2).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${(-p.y * MAX_DEG * 2).toFixed(2)}deg`);
        el.style.setProperty('--gx', `${((p.x + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty('--gy', `${((p.y + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty('--px', p.x.toFixed(3));
        el.style.setProperty('--py', p.y.toFixed(3));
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
        if (e.pointerType !== 'mouse' || isReducedMotion()) return;
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        pending.current = {
            x: Math.max(-0.5, Math.min(0.5, (e.clientX - rect.left) / rect.width - 0.5)),
            y: Math.max(-0.5, Math.min(0.5, (e.clientY - rect.top) / rect.height - 0.5)),
        };
        if (!rafId.current) rafId.current = requestAnimationFrame(applyPending);
    }, [applyPending]);

    const onPointerEnter = useCallback((e: React.PointerEvent<T>) => {
        if (e.pointerType !== 'mouse' || isReducedMotion()) return;
        e.currentTarget.classList.add('is-in');
    }, []);

    const onPointerLeave = useCallback((e: React.PointerEvent<T>) => {
        const el = e.currentTarget;
        el.classList.remove('is-in');
        cancelRaf();
        pending.current = null;
        // Glide home — the base (slower/softer) transition animates these back.
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--gx', '50%');
        el.style.setProperty('--gy', '50%');
        el.style.setProperty('--px', '0');
        el.style.setProperty('--py', '0');
    }, []);

    return { tiltRef: ref, onPointerMove, onPointerEnter, onPointerLeave };
}

export default useTiltEffect;
