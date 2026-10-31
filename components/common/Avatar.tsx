import React from 'react';
import { useAuthStore } from '../../stores/useAuthStore';

interface AvatarProps {
    name?: string;
    src?: string;
    size?: 'sm' | 'md' | 'lg';
    status?: 'online' | 'offline' | 'busy' | 'away';
}

const SIZE_MAP = {
    sm: 'w-7 h-7 text-[9px]',
    md: 'w-9 h-9 text-[10px]',
    lg: 'w-12 h-12 text-sm',
};

const STATUS_COLORS = {
    online: 'bg-emerald-500',
    offline: 'bg-slate-400',
    busy: 'bg-rose-500',
    away: 'bg-amber-500',
};

const COLOR_POOL = [
    'from-indigo-500 to-indigo-600',
    'from-emerald-500 to-emerald-600',
    'from-rose-500 to-rose-600',
    'from-amber-500 to-amber-600',
    'from-cyan-500 to-cyan-600',
    'from-violet-500 to-violet-600',
    'from-teal-500 to-teal-600',
];

function getColorFromName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return COLOR_POOL[Math.abs(hash) % COLOR_POOL.length];
}

function getInitials(name: string): string {
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Avatar component with initials fallback and optional status indicator.
 *
 * Usage:
 *   <Avatar name="Ahmed Hassan" size="md" status="online" />
 *   <Avatar src="/user.jpg" size="lg" />
 */
const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', status }) => {
    const sizeClass = SIZE_MAP[size];
    const initials = name ? getInitials(name) : '?';
    const gradient = name ? getColorFromName(name) : COLOR_POOL[0];

    return (
        <div className={`relative ${sizeClass} shrink-0`}>
            {src ? (
                <img src={src} alt={name || 'avatar'} className={`${sizeClass} rounded-xl object-cover`} />
            ) : (
                <div className={`${sizeClass} rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-black shadow-sm`}>
                    {initials}
                </div>
            )}
            {status && (
                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status]} border-2 border-card`} />
            )}
        </div>
    );
};

export default Avatar;
