import React, { type ElementType } from 'react';
import { Star, ChevronLeft } from 'lucide-react';
import { useTiltEffect } from '../../hooks/useTiltEffect';

export const SECTION_HEX: Record<string, { from: string; to: string; glow: string }> = {
    emerald: { from: '#10b981', to: '#047857', glow: 'rgba(16,185,129,0.35)' },
    violet: { from: '#8b5cf6', to: '#6d28d9', glow: 'rgba(139,92,246,0.35)' },
    orange: { from: '#f97316', to: '#c2410c', glow: 'rgba(249,115,22,0.35)' },
    cyan: { from: '#06b6d4', to: '#0e7490', glow: 'rgba(6,182,212,0.35)' },
    amber: { from: '#f59e0b', to: '#b45309', glow: 'rgba(245,158,11,0.35)' },
    blue: { from: '#3b82f6', to: '#1d4ed8', glow: 'rgba(59,130,246,0.35)' },
    pink: { from: '#ec4899', to: '#be185d', glow: 'rgba(236,72,153,0.35)' },
    slate: { from: '#64748b', to: '#334155', glow: 'rgba(100,116,139,0.35)' },
};

export interface ModuleTileProps {
    icon: ElementType;
    title: string;
    sub: string;
    label: string;
    accentKey?: string;
    badge?: number;
    live?: boolean;
    count?: React.ReactNode;
    meta?: React.ReactNode;
    variant?: 'standard' | 'leader' | 'hero';
    delay?: number;
    isFav?: boolean;
    chevronRtl?: boolean;
    spanClass?: string;
    stretch?: boolean;
    onOpen: () => void;
    onToggleFav?: () => void;
}

/**
 * ModuleTile — the project's tile, re-skinned in the Parallax Depth Cards
 * interaction language (perspective + layered translateZ + counter-moving
 * background + mouse spotlight + dynamic shadow + content reveal).
 * Pure presentational: all data/handlers come from the parent.
 */
export const ModuleTile: React.FC<ModuleTileProps> = ({
    icon: Icon,
    title,
    sub,
    label,
    accentKey = 'slate',
    badge = 0,
    live = false,
    count,
    meta,
    variant = 'standard',
    delay = 0,
    isFav = false,
    chevronRtl = false,
    spanClass,
    stretch = false,
    onOpen,
    onToggleFav,
}) => {
    const accent = SECTION_HEX[accentKey] || SECTION_HEX.slate;
    const { tiltRef, onPointerMove, onPointerEnter, onPointerLeave } = useTiltEffect<HTMLDivElement>();
    const hero = variant === 'hero';
    const leader = variant === 'leader';

    return (
        <div className={spanClass} style={{ perspective: '1100px' }}>
            <div
                ref={tiltRef}
                role="button"
                tabIndex={0}
                onClick={onOpen}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
                onPointerMove={onPointerMove}
                onPointerEnter={onPointerEnter}
                onPointerLeave={onPointerLeave}
                className={`tile-3d w-full${hero ? ' tile-3d--hero' : ''}${leader ? ' tile-3d--leader' : ''}${stretch ? ' h-full' : ''}`}
                style={{
                    '--tile-delay': `${Math.min(delay, 500)}ms`,
                    '--tile-chip-from': accent.from,
                    '--tile-chip-to': accent.to,
                    '--tile-glow': accent.glow,
                    '--tile-border': accent.glow,
                    '--tile-wash-from': accent.glow,
                } as React.CSSProperties}
                aria-label={label}
            >
                {/* Layer 0 — parallax background (counter-moves via --px/--py) */}
                <span className="tile-depth-bg" aria-hidden="true" />
                {/* Layer 1 — hover readability shade */}
                <span className="tile-shade" aria-hidden="true" />

                {badge > 0 ? (
                    <span className="tile-badge">{badge > 99 ? '99+' : badge}</span>
                ) : live ? (
                    <span className="tile-live-dot" aria-hidden="true" />
                ) : null}

                <span className="tile-icon"><Icon size={hero ? 26 : leader ? 24 : 21} /></span>

                <span className="min-w-0 flex-1">
                    <span className="tile-title block">{title}</span>
                    <span className="tile-sub block">{sub}</span>
                    {count != null && <span className="tile-count mt-1 block">{count}</span>}
                    {meta}
                </span>

                {leader && <ChevronLeft size={18} className={`tile-chev shrink-0 text-muted ${chevronRtl ? '' : 'rotate-180'}`} />}

                {onToggleFav && (
                    <button
                        type="button"
                        aria-label="Pin"
                        data-active={isFav}
                        className="tile-pin"
                        onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
                    >
                        <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default ModuleTile;
