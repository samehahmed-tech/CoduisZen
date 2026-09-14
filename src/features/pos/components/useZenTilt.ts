import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface ZenTiltOptions {
    /** Max rotateX in degrees (default 6). */
    maxRX?: number;
    /** Max rotateY in degrees (default 8). */
    maxRY?: number;
}

const isCoarsePointer = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * useZenTilt — premium pointer tilt + parallax + press for Zen menu cards.
 *
 * Drives CSS vars on the card element (no re-renders):
 *   --rx / --ry  card rotation
 *   --px / --py  unitless -0.5‥0.5 cursor offset (parallax layers)
 *   --mx / --my  glare + press-flash position
 *
 * Tilt auto-disables on touch pointers, coarse devices, reduced-motion,
 * or when `disabled` is true. POS intentionally keeps its short feedback
 * motion enabled because card response is part of cashier task confirmation.
 * Press (.is-pressed) still works on touch so terminals get tactile feedback.
 * rAF-throttled; resets with spring on leave.
 */
export function useZenTilt<T extends HTMLElement>(options: ZenTiltOptions = {}, disabled = false) {
    const { maxRX = 6, maxRY = 8 } = options;
    const ref = useRef<T>(null);
    const raf = useRef<number>(0);
    const off = useRef(false);

    useEffect(() => {
        off.current = disabled || isCoarsePointer();
        return () => cancelAnimationFrame(raf.current);
    }, [disabled]);

    const apply = useCallback((nx: number, ny: number) => {
        const el = ref.current;
        if (!el) return;
        el.style.setProperty('--rx', `${((0.5 - ny) * maxRX).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((nx - 0.5) * maxRY).toFixed(2)}deg`);
        el.style.setProperty('--px', (nx - 0.5).toFixed(3));
        el.style.setProperty('--py', (ny - 0.5).toFixed(3));
        el.style.setProperty('--mx', `${(nx * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(ny * 100).toFixed(1)}%`);
    }, [maxRX, maxRY]);

    const reset = useCallback(() => {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
        const el = ref.current;
        if (!el) return;
        el.classList.remove('is-pressed');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--px', '0');
        el.style.setProperty('--py', '0');
        el.style.setProperty('--mx', '50%');
        el.style.setProperty('--my', '50%');
    }, []);

    const onPointerMove = useCallback((e: ReactPointerEvent<T>) => {
        if (off.current || e.pointerType === 'touch') return;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const nx = clamp01((e.clientX - r.left) / r.width);
        const ny = clamp01((e.clientY - r.top) / r.height);
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(() => apply(nx, ny));
    }, [apply]);

    /** Press down: tightens tilt vars to cursor + sets .is-pressed (works on touch). */
    const onPointerDown = useCallback((e: ReactPointerEvent<T>) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
            const nx = clamp01((e.clientX - r.left) / r.width);
            const ny = clamp01((e.clientY - r.top) / r.height);
            el.style.setProperty('--mx', `${(nx * 100).toFixed(1)}%`);
            el.style.setProperty('--my', `${(ny * 100).toFixed(1)}%`);
        }
        el.classList.add('is-pressed');
    }, []);

    const onPointerUp = useCallback(() => {
        ref.current?.classList.remove('is-pressed');
    }, []);

    return {
        ref,
        onPointerMove,
        onPointerLeave: reset,
        onPointerCancel: reset,
        onPointerDown,
        onPointerUp,
    };
}
