import React from 'react';

interface PageSkeletonProps {
    type?: 'table' | 'cards' | 'form';
    rows?: number;
}

const shimmer = 'bg-elevated animate-pulse rounded-xl';

const PageSkeleton: React.FC<PageSkeletonProps> = ({ type = 'table', rows = 6 }) => {
    if (type === 'cards') {
        return (
            <div className="space-y-6 animate-in fade-in duration-150">
                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-[1.5rem] ${shimmer}`} />
                    <div className="space-y-2">
                        <div className={`h-6 w-48 ${shimmer}`} />
                        <div className={`h-3 w-32 ${shimmer}`} />
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="card-primary border border-border p-5 rounded-[2rem]">
                            <div className={`w-9 h-9 rounded-xl ${shimmer} mb-3`} />
                            <div className={`h-2 w-16 ${shimmer} mb-2`} />
                            <div className={`h-5 w-20 ${shimmer}`} />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="card-primary border border-border rounded-[2rem] p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-12 h-12 rounded-xl ${shimmer}`} />
                                <div className="space-y-2 flex-1">
                                    <div className={`h-4 w-24 ${shimmer}`} />
                                    <div className={`h-2 w-16 ${shimmer}`} />
                                </div>
                            </div>
                            <div className={`h-20 w-full ${shimmer}`} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (type === 'form') {
        return (
            <div className="space-y-6 max-w-2xl animate-in fade-in duration-150">
                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-[1.5rem] ${shimmer}`} />
                    <div className="space-y-2">
                        <div className={`h-6 w-48 ${shimmer}`} />
                        <div className={`h-3 w-32 ${shimmer}`} />
                    </div>
                </div>
                <div className="card-primary border border-border rounded-[2.5rem] p-8 space-y-5">
                    {Array.from({ length: rows }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-app rounded-2xl border border-border">
                            <div className={`h-3 w-32 ${shimmer}`} />
                            <div className={`h-8 w-20 ${shimmer}`} />
                        </div>
                    ))}
                    <div className={`h-12 w-full ${shimmer} mt-4`} />
                </div>
            </div>
        );
    }

    // Default: table
    return (
        <div className="space-y-6 animate-in fade-in duration-150">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-[1.5rem] ${shimmer}`} />
                    <div className="space-y-2">
                        <div className={`h-6 w-48 ${shimmer}`} />
                        <div className={`h-3 w-32 ${shimmer}`} />
                    </div>
                </div>
                <div className={`h-10 w-28 ${shimmer}`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="card-primary border border-border p-5 rounded-[2rem]">
                        <div className={`w-9 h-9 rounded-xl ${shimmer} mb-3`} />
                        <div className={`h-2 w-16 ${shimmer} mb-2`} />
                        <div className={`h-5 w-20 ${shimmer}`} />
                    </div>
                ))}
            </div>
            <div className="card-primary border border-border rounded-[2.5rem] overflow-hidden">
                <div className="p-4 border-b border-border flex gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className={`h-3 w-16 ${shimmer}`} />
                    ))}
                </div>
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="px-6 py-4 border-b border-border/30 flex items-center gap-6">
                        <div className={`h-3 w-20 ${shimmer}`} />
                        <div className={`h-3 w-16 ${shimmer}`} />
                        <div className={`h-3 w-24 ${shimmer}`} />
                        <div className={`h-3 w-12 ${shimmer}`} />
                        <div className={`h-3 w-16 ${shimmer} ml-auto`} />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PageSkeleton;
