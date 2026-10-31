// THEME ENGINE 2.0 — motion engine: per-theme profiles + interaction utilities.
// Techniques reimplemented originally (Delgado direction-aware hover; clamped
// tilt; exact-final counters). No animation libraries. GPU-only transforms.

import { useEffect, useRef, useState } from 'react';

export type MotionSignature =
    | 'precise' | 'rapid' | 'reveal' | 'editorial' | 'snappy'
    | 'spring' | 'glow' | 'modular' | 'soft' | 'tactile';

export interface MotionProfile {
    fast: string;
    normal: string;
    slow: string;
    easing: string;
    signature: MotionSignature;
    /** pointer tilt allowed (degrees, 0 = off). */
    tiltMax: number;
    /** direction-aware enter/exit reveals. */
    directionAware: boolean;
    /** conic beam / glow pulse on hover. */
    beam: boolean;
}

export const MOTION_PROFILES: Record<string, MotionProfile> = {
    'aero': { fast: '160ms', normal: '240ms', slow: '520ms', easing: 'cubic-bezier(0.22, 1, 0.36, 1)', signature: 'reveal', tiltMax: 4, directionAware: true, beam: true },
    'citrus': { fast: '120ms', normal: '220ms', slow: '460ms', easing: 'cubic-bezier(0.22, 1, 0.36, 1)', signature: 'spring', tiltMax: 3, directionAware: true, beam: false },
    'porcelain': { fast: '160ms', normal: '260ms', slow: '560ms', easing: 'cubic-bezier(0.22, 1, 0.36, 1)', signature: 'editorial', tiltMax: 0, directionAware: false, beam: false },
    'blueprint': { fast: '90ms', normal: '120ms', slow: '260ms', easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', signature: 'rapid', tiltMax: 0, directionAware: false, beam: false },
    'clay': { fast: '140ms', normal: '220ms', slow: '460ms', easing: 'cubic-bezier(0.22, 1, 0.36, 1)', signature: 'tactile', tiltMax: 0, directionAware: false, beam: false },
    'nocturne': { fast: '160ms', normal: '240ms', slow: '520ms', easing: 'cubic-bezier(0.22, 1, 0.36, 1)', signature: 'editorial', tiltMax: 0, directionAware: false, beam: false },
    'foundry': { fast: '90ms', normal: '130ms', slow: '300ms', easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', signature: 'precise', tiltMax: 0, directionAware: false, beam: false },
    'neon': { fast: '120ms', normal: '200ms', slow: '440ms', easing: 'cubic-bezier(0.22, 1, 0.36, 1)', signature: 'glow', tiltMax: 5, directionAware: true, beam: true },
    'slate': { fast: '90ms', normal: '110ms', slow: '240ms', easing: 'cubic-bezier(0, 0, 0.2, 1)', signature: 'precise', tiltMax: 0, directionAware: false, beam: false },
    'cinema': { fast: '160ms', normal: '280ms', slow: '600ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', signature: 'soft', tiltMax: 4, directionAware: true, beam: false },
};

export const DEFAULT_MOTION_PROFILE: MotionProfile = MOTION_PROFILES['aero'];

const motionAllowed = (): boolean => {
    if (typeof document === 'undefined') return false;
    if (document.documentElement.dataset.motion === 'off') return false;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return false;
    return true;
};

const DIRECTIONS = ['top', 'right', 'bottom', 'left'] as const;

const directionKey = (ev: { clientX: number; clientY: number }, rect: DOMRect): number => {
    const l = ev.clientX - rect.left;
    const t = ev.clientY - rect.top;
    const x = l - (rect.width / 2) * (rect.width > rect.height ? rect.height / rect.width : 1);
    const y = t - (rect.height / 2) * (rect.height > rect.width ? (rect.width / rect.height) : 1);
    return (Math.round(Math.atan2(y, x) / 1.57079633 + 5) % 4 + 4) % 4;
};

/**
 * Direction-aware enter/exit classes (in-top/right/bottom/left, out-*).
 * Mirrors left/right in RTL. Touch + reduced-motion + motion-off safe.
 */
export const useDirectionHover = <T extends HTMLElement>(enabled: boolean) => {
    const ref = useRef<T | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled || !motionAllowed()) return;
        const classes = ['in', 'out'].flatMap((p) => DIRECTIONS.map((d) => `${p}-${d}`));
        const onOver = (ev: MouseEvent) => {
            let dir = DIRECTIONS[directionKey(ev, el.getBoundingClientRect())];
            if (document.documentElement.dir === 'rtl' && (dir === 'left' || dir === 'right')) {
                dir = dir === 'left' ? 'right' : 'left';
            }
            el.classList.remove(...classes);
            el.classList.add(`in-${dir}`);
        };
        const onOut = (ev: MouseEvent) => {
            let dir = DIRECTIONS[directionKey(ev, el.getBoundingClientRect())];
            if (document.documentElement.dir === 'rtl' && (dir === 'left' || dir === 'right')) {
                dir = dir === 'left' ? 'right' : 'left';
            }
            el.classList.remove(...classes);
            el.classList.add(`out-${dir}`);
        };
        el.addEventListener('mouseover', onOver);
        el.addEventListener('mouseout', onOut);
        return () => {
            el.removeEventListener('mouseover', onOver);
            el.removeEventListener('mouseout', onOut);
            el.classList.remove(...classes);
        };
    }, [enabled]);
    return ref;
};

/** Clamped pointer tilt (no text distortion, smooth reset, cleanup included). */
export const useTilt = <T extends HTMLElement>(enabled: boolean, maxDeg = 6) => {
    const ref = useRef<T | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled || !motionAllowed()) return;
        let raf = 0;
        const onMove = (ev: MouseEvent) => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const r = el.getBoundingClientRect();
                const x = (ev.clientX - r.left) / r.width - 0.5;
                const y = (ev.clientY - r.top) / r.height - 0.5;
                el.style.transform = `perspective(800px) rotateY(${(x * maxDeg * 2).toFixed(2)}deg) rotateX(${(-y * maxDeg * 2).toFixed(2)}deg)`;
            });
        };
        const onLeave = () => {
            cancelAnimationFrame(raf);
            el.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1)';
            el.style.transform = '';
            window.setTimeout(() => { el.style.transition = ''; }, 500);
        };
        const onEnter = () => { el.style.transition = 'transform .1s ease'; };
        el.addEventListener('mousemove', onMove);
        el.addEventListener('mouseleave', onLeave);
        el.addEventListener('mouseenter', onEnter);
        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener('mousemove', onMove);
            el.removeEventListener('mouseleave', onLeave);
            el.removeEventListener('mouseenter', onEnter);
            el.style.transform = '';
            el.style.transition = '';
        };
    }, [enabled, maxDeg]);
    return ref;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animated counter that ALWAYS lands on the exact final value.
 * Never use for live financial truth — Studio/decorative stats only.
 */
export const useCountUp = (target: number, duration = 1400, formatter: (n: number) => string = (n) => Math.floor(n).toLocaleString()): string => {
    const [text, setText] = useState(() => formatter(target));
    useEffect(() => {
        if (!motionAllowed()) { setText(formatter(target)); return; }
        let raf = 0;
        const start = performance.now();
        const tick = (ts: number) => {
            const p = Math.min((ts - start) / duration, 1);
            setText(formatter(easeOutCubic(p) * target));
            if (p < 1) raf = requestAnimationFrame(tick);
            else setText(formatter(target));
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);
    return text;
};
