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
 * useZenTilt — buttery 3D tilt + parallax + press for Zen menu cards.
 *
 * Drives CSS vars on the card element (no re-renders):
 *   --rx / --ry  card rotation (lerp-smoothed follow, rests at 0)
 *   --px / --py  unitless -0.5‥0.5 cursor offset (parallax layers)
 *   --mx / --my  glare + press-flash position
 *
 * Tilt auto-disables on touch pointers, coarse devices, or when `disabled`
 * is true. Press (.is-pressed) + release (.zen-just-released) still work on
 * touch so terminals get tactile feedback. rAF-throttled with critically-
 * damped lerp; glides home with ease on leave.
 */
export function useZenTilt<T extends HTMLElement>(options: ZenTiltOptions = {}, disabled = false) {
    const { maxRX = 6, maxRY = 8 } = options;
    const ref = useRef<T>(null);
    const raf = useRef<number>(0);
    const off = useRef(false);
    const target = useRef({ x: 0.5, y: 0.5 });
    const current = useRef({ x: 0.5, y: 0.5 });
    const releaseTimer = useRef<number>(0);

    useEffect(() => {
        off.current = disabled || isCoarsePointer();
        return () => {
            cancelAnimationFrame(raf.current);
            window.clearTimeout(releaseTimer.current);
        };
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

    /** Buttery follow: critically-damped lerp toward the pointer target. */
    const tick = useCallback(() => {
        const el = ref.current;
        if (!el) { raf.current = 0; return; }
        const cx = current.current.x + (target.current.x - current.current.x) * 0.2;
        const cy = current.current.y + (target.current.y - current.current.y) * 0.2;
        current.current = { x: cx, y: cy };
        apply(cx, cy);
        const dx = Math.abs(target.current.x - cx);
        const dy = Math.abs(target.current.y - cy);
        if (dx > 0.0008 || dy > 0.0008) {
            raf.current = requestAnimationFrame(tick);
        } else {
            raf.current = 0;
            apply(target.current.x, target.current.y);
        }
    }, [apply]);

    const kick = useCallback(() => {
        if (raf.current) return;
        raf.current = requestAnimationFrame(tick);
    }, [tick]);

    const reset = useCallback(() => {
        target.current = { x: 0.5, y: 0.5 };
        if (off.current) {
            cancelAnimationFrame(raf.current);
            raf.current = 0;
            current.current = { x: 0.5, y: 0.5 };
            const el = ref.current;
            if (!el) return;
            el.classList.remove('is-pressed');
            el.style.setProperty('--rx', '0deg');
            el.style.setProperty('--ry', '0deg');
            el.style.setProperty('--px', '0');
            el.style.setProperty('--py', '0');
            el.style.setProperty('--mx', '50%');
            el.style.setProperty('--my', '50%');
            return;
        }
        // glide home instead of snapping — keeps the leave buttery
        kick();
        ref.current?.classList.remove('is-pressed');
    }, [kick]);

    const onPointerMove = useCallback((e: ReactPointerEvent<T>) => {
        if (off.current || e.pointerType === 'touch') return;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        target.current = {
            x: clamp01((e.clientX - r.left) / r.width),
            y: clamp01((e.clientY - r.top) / r.height),
        };
        kick();
    }, [kick]);

    /** Press down: anchors light at cursor + sets .is-pressed (works on touch). */
    const onPointerDown = useCallback((e: ReactPointerEvent<T>) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
            const nx = clamp01((e.clientX - r.left) / r.width);
            const ny = clamp01((e.clientY - r.top) / r.height);
            el.style.setProperty('--mx', `${(nx * 100).toFixed(1)}%`);
            el.style.setProperty('--my', `${(ny * 100).toFixed(1)}%`);
            if (!off.current) {
                target.current = { x: nx, y: ny };
                current.current = { x: nx, y: ny };
                apply(nx, ny);
            }
        }
        window.clearTimeout(releaseTimer.current);
        el.classList.remove('zen-just-released');
        el.classList.add('is-pressed');
    }, [apply]);

    const onPointerUp = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        if (!el.classList.contains('is-pressed')) return;
        el.classList.remove('is-pressed');
        // quick springy release bloom (CSS .zen-just-released → zen-release)
        el.classList.remove('zen-just-released');
        void (el as HTMLElement).offsetWidth; // restart animation
        el.classList.add('zen-just-released');
        window.clearTimeout(releaseTimer.current);
        releaseTimer.current = window.setTimeout(() => el.classList.remove('zen-just-released'), 320);
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
