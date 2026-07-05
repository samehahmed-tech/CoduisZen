import React from 'react';

interface SkeletonLineProps {
    width?: string;
    className?: string;
}

interface SkeletonCircleProps {
    size?: number;
    className?: string;
}

interface SkeletonRectProps {
    width?: string;
    height?: string;
    rounded?: string;
    className?: string;
}

const shimmer = 'animate-pulse bg-elevated';

/**
 * Inline skeleton loading primitives. Combine for custom layouts.
 *
 * Usage:
 *   <SkeletonLine />
 *   <SkeletonLine width="60%" />
 *   <SkeletonCircle size={40} />
 *   <SkeletonRect width="100%" height="200px" rounded="2xl" />
 */
export const SkeletonLine: React.FC<SkeletonLineProps> = ({ width = '100%', className = '' }) => (
    <div className={`h-3 rounded-md ${shimmer} ${className}`} style={{ width }} />
);

export const SkeletonCircle: React.FC<SkeletonCircleProps> = ({ size = 32, className = '' }) => (
    <div className={`rounded-full ${shimmer} ${className} shrink-0`} style={{ width: size, height: size }} />
);

export const SkeletonRect: React.FC<SkeletonRectProps> = ({ width = '100%', height = '100px', rounded = 'xl', className = '' }) => (
    <div className={`rounded-${rounded} ${shimmer} ${className}`} style={{ width, height }} />
);

/**
 * Pre-built skeleton row (avatar + two lines). Common pattern.
 */
export const SkeletonRow: React.FC = () => (
    <div className="flex items-center gap-3 p-3">
        <SkeletonCircle size={36} />
        <div className="flex-1 space-y-2">
            <SkeletonLine width="70%" />
            <SkeletonLine width="40%" />
        </div>
    </div>
);

/**
 * Generic Skeleton placeholder. Accepts className for sizing via Tailwind.
 */
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`${shimmer} rounded-lg ${className}`} />
);

export default Skeleton;
