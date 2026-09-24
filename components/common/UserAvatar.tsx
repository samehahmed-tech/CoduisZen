import React from 'react';
import { User as UserIcon } from 'lucide-react';

interface UserAvatarProps {
    name?: string;
    src?: string | null;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    status?: 'online' | 'offline' | 'busy' | 'away';
    ring?: boolean;
    className?: string;
}

const SIZE_MAP: Record<NonNullable<UserAvatarProps['size']>, { box: string; icon: number; dot: string }> = {
    xs: { box: 'w-6 h-6', icon: 13, dot: 'w-2 h-2' },
    sm: { box: 'w-8 h-8', icon: 16, dot: 'w-2.5 h-2.5' },
    md: { box: 'w-10 h-10', icon: 19, dot: 'w-3 h-3' },
    lg: { box: 'w-16 h-16', icon: 30, dot: 'w-4 h-4' },
    xl: { box: 'w-24 h-24', icon: 44, dot: 'w-5 h-5' },
};

const STATUS_COLORS = {
    online: 'bg-emerald-500',
    offline: 'bg-slate-400',
    busy: 'bg-rose-500',
    away: 'bg-amber-500',
};

const GRADIENTS = [
    'from-indigo-500 via-indigo-500 to-violet-600',
    'from-emerald-500 via-teal-500 to-cyan-600',
    'from-rose-500 via-pink-500 to-fuchsia-600',
    'from-amber-500 via-orange-500 to-red-500',
    'from-sky-500 via-blue-500 to-indigo-600',
    'from-violet-500 via-purple-500 to-indigo-600',
];

function gradientFor(name?: string): string {
    const seed = String(name || '?');
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

/**
 * UserAvatar — polished profile avatar for the signed-in / listed user.
 * Shows the profile photo when one is set, otherwise a friendly
 * profile icon on a per-user gradient (no raw initials).
 */
const UserAvatar: React.FC<UserAvatarProps> = ({ name, src, size = 'md', status, ring = true, className = '' }) => {
    const s = SIZE_MAP[size];
    const [broken, setBroken] = React.useState(false);
    const showPhoto = !!src && !broken;

    React.useEffect(() => {
        setBroken(false);
    }, [src]);

    return (
        <div className={`relative ${s.box} shrink-0 ${className}`}>
            <div
                className={`${s.box} rounded-full overflow-hidden bg-gradient-to-br ${gradientFor(name)} flex items-center justify-center text-white shadow-md ${ring ? 'ring-2 ring-white/70 dark:ring-white/15' : ''}`}
                title={name}
                aria-label={name || 'User profile'}
                role="img"
            >
                {showPhoto ? (
                    <img
                        src={src as string}
                        alt={name || 'User profile'}
                        className="w-full h-full object-cover"
                        onError={() => setBroken(true)}
                        draggable={false}
                    />
                ) : (
                    <span className="flex items-center justify-center w-full h-full bg-black/10">
                        <UserIcon size={s.icon} strokeWidth={2.2} className="drop-shadow-sm" />
                    </span>
                )}
            </div>
            {status && (
                <span className={`absolute bottom-0 end-0 ${s.dot} rounded-full ${STATUS_COLORS[status]} border-2 border-card`} aria-hidden="true" />
            )}
        </div>
    );
};

export default UserAvatar;
