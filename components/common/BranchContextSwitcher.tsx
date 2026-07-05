import React, { useMemo } from 'react';
import { ChevronDown, GitBranch, MapPin } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../../stores/useAuthStore';
import { isCorporateRole, UserRole } from '../../types';

interface BranchContextSwitcherProps {
    variant?: 'topbar' | 'sidebar' | 'pos';
}

const BranchContextSwitcher: React.FC<BranchContextSwitcherProps> = ({ variant = 'topbar' }) => {
    const { activeBranchId, branches, currentUser, language, setActiveBranch } = useAuthStore(
        useShallow((state) => ({
            activeBranchId: state.settings.activeBranchId,
            branches: state.branches,
            currentUser: state.settings.currentUser,
            language: state.settings.language,
            setActiveBranch: state.setActiveBranch,
        }))
    );

    const lang = (language || 'en') as 'en' | 'ar';
    const isRtl = lang === 'ar';
    const displayBranchName = (branch?: { name?: string; nameAr?: string | null }) => {
        if (!branch) return '';
        if (!isRtl) return branch.name || '';
        if (branch.nameAr) return branch.nameAr;
        return /^main branch$/i.test(branch.name || '') ? 'الفرع الرئيسي' : branch.name || '';
    };

    const branchOptions = useMemo(() => {
        const activeBranches = branches.filter((branch) => branch.isActive !== false);
        if (!currentUser) return activeBranches;

        const hasGlobalAccess =
            currentUser.role === UserRole.SUPER_ADMIN ||
            currentUser.branchAccessMode === 'ALL' ||
            isCorporateRole(currentUser.role);

        if (hasGlobalAccess) return activeBranches;

        const allowedBranchIds = new Set<string>([
            ...(currentUser.allowedBranches || []),
            ...(currentUser.assignedBranchIds || []),
            ...(currentUser.assignedBranchId ? [currentUser.assignedBranchId] : []),
        ].filter(Boolean));

        if (allowedBranchIds.size === 0) return activeBranches;
        return activeBranches.filter((branch) => allowedBranchIds.has(branch.id));
    }, [branches, currentUser]);

    const activeBranch = branchOptions.find((branch) => branch.id === activeBranchId) || branchOptions[0];
    const canSwitch = branchOptions.length > 1;
    const selectedValue = activeBranchId && branchOptions.some((branch) => branch.id === activeBranchId)
        ? activeBranchId
        : activeBranch?.id || '';

    if (branchOptions.length === 0) {
        return (
            <div className="flex items-center gap-1.5 text-main font-bold">
                <GitBranch size={11} className="text-primary" />
                <span>{lang === 'ar' ? 'لا توجد فروع' : 'No branches'}</span>
            </div>
        );
    }

    if (variant === 'sidebar') {
        return (
            <div className="sidebar-panel">
                <div className="sidebar-panel-title">{lang === 'ar' ? 'سياق الفرع' : 'Branch Context'}</div>
                <label className="sr-only" htmlFor="sidebar-branch-switcher">
                    {lang === 'ar' ? 'تبديل الفرع' : 'Switch branch'}
                </label>
                <div className="relative">
                    <select
                        id="sidebar-branch-switcher"
                        value={selectedValue}
                        onChange={(event) => setActiveBranch(event.target.value)}
                        disabled={!canSwitch}
                        className="sidebar-select pe-8"
                    >
                        {branchOptions.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                                {displayBranchName(branch)}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute top-1/2 end-2 -translate-y-1/2 text-muted" />
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted/70">
                    <MapPin size={10} className="text-primary" />
                    <span className="truncate">{displayBranchName(activeBranch)}</span>
                </div>
            </div>
        );
    }

    if (variant === 'pos') {
        return (
            <div className="relative h-8 min-w-[150px] max-w-[230px] shrink-0">
                <div className="pointer-events-none absolute inset-y-0 start-2 flex items-center text-primary">
                    <MapPin size={13} />
                </div>
                {canSwitch ? (
                    <>
                        <label className="sr-only" htmlFor="pos-branch-switcher">
                            {lang === 'ar' ? 'تبديل الفرع' : 'Switch branch'}
                        </label>
                        <select
                            id="pos-branch-switcher"
                            value={selectedValue}
                            onChange={(event) => setActiveBranch(event.target.value)}
                            className="h-8 w-full truncate rounded-lg border border-border/20 bg-elevated/45 py-0 ps-8 pe-7 text-[11px] font-black text-main outline-none appearance-none cursor-pointer transition-colors hover:bg-elevated/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                        >
                            {branchOptions.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                    {displayBranchName(branch)}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute top-1/2 end-2 -translate-y-1/2 text-muted" />
                    </>
                ) : (
                    <div className="h-8 w-full flex items-center rounded-lg border border-border/20 bg-elevated/45 ps-8 pe-3 text-[11px] font-black text-main">
                        <span className="truncate">{displayBranchName(activeBranch)}</span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative flex h-8 min-w-[170px] max-w-[240px] items-center gap-1.5 rounded-lg border border-border/25 bg-elevated/35 px-2 text-main shadow-sm transition-colors hover:bg-elevated/55">
            <GitBranch size={12} className="text-primary shrink-0" />
            {canSwitch ? (
                <>
                    <label className="sr-only" htmlFor="topbar-branch-switcher">
                        {lang === 'ar' ? 'تبديل الفرع' : 'Switch branch'}
                    </label>
                    <select
                        id="topbar-branch-switcher"
                        value={selectedValue}
                        onChange={(event) => setActiveBranch(event.target.value)}
                        className="h-full min-w-0 flex-1 truncate bg-transparent py-0 ps-0 pe-5 text-[11px] font-black text-main outline-none appearance-none cursor-pointer"
                    >
                        {branchOptions.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                                {displayBranchName(branch)}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute top-1/2 end-2.5 -translate-y-1/2 text-muted" />
                </>
            ) : (
                <span className="truncate text-[11px] font-black">{displayBranchName(activeBranch)}</span>
            )}
        </div>
    );
};

export default BranchContextSwitcher;
