
import React, { useState } from 'react';
import { Building2, ChevronDown, Check, GitCompare, MapPin } from 'lucide-react';
import { Branch } from '../../types';

interface Props {
    branches: Branch[];
    selectedBranchId: string | 'all';
    onSelectBranch: (id: string | 'all') => void;
    comparisonMode: boolean;
    onToggleComparison: () => void;
    lang: string;
}

const BranchSelector: React.FC<Props> = ({
    branches, selectedBranchId, onSelectBranch,
    comparisonMode, onToggleComparison, lang
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const activeBranches = branches.filter(b => b.isActive);
    const selectedBranch = branches.find(b => b.id === selectedBranchId);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`h-8 flex items-center gap-2 px-3 rounded-md border text-[12px] font-medium transition-colors ${selectedBranchId !== 'all'
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        : 'bg-elevated border-border/30 text-muted hover:text-main'
                    }`}
            >
                <Building2 size={14} />
                <span className="max-w-[120px] truncate">
                    {selectedBranchId === 'all'
                        ? (lang === 'ar' ? 'كل الفروع' : 'All Branches')
                        : selectedBranch?.name || 'Branch'
                    }
                </span>
                <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full mt-1 right-0 bg-card border border-border/30 rounded-md shadow-xl z-50 p-1 min-w-[220px]">
                        {/* All Branches */}
                        <button
                            onClick={() => { onSelectBranch('all'); setIsOpen(false); }}
                            className={`w-full text-left px-3 py-2 rounded text-[12px] font-medium transition-colors flex items-center justify-between ${selectedBranchId === 'all'
                                    ? 'bg-indigo-500/10 text-indigo-400'
                                    : 'text-muted hover:bg-elevated/40 hover:text-main'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <Building2 size={13} />
                                {lang === 'ar' ? 'كل الفروع' : 'All Branches'}
                            </span>
                            {selectedBranchId === 'all' && <Check size={12} />}
                        </button>

                        <div className="border-t border-white/[0.06] my-1" />

                        {/* Individual Branches */}
                        {activeBranches.map(branch => (
                            <button
                                key={branch.id}
                                onClick={() => { onSelectBranch(branch.id); setIsOpen(false); }}
                                className={`w-full text-left px-3 py-2 rounded text-[12px] font-medium transition-colors flex items-center justify-between ${selectedBranchId === branch.id
                                        ? 'bg-indigo-500/10 text-indigo-400'
                                        : 'text-muted hover:bg-elevated/40 hover:text-main'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    <MapPin size={13} />
                                    <span className="truncate">{branch.name}</span>
                                </span>
                                {selectedBranchId === branch.id && <Check size={12} />}
                            </button>
                        ))}

                        {activeBranches.length > 1 && (
                            <>
                                <div className="border-t border-white/[0.06] my-1" />
                                <button
                                    onClick={() => { onToggleComparison(); setIsOpen(false); }}
                                    className={`w-full text-left px-3 py-2 rounded text-[12px] font-medium transition-colors flex items-center gap-2 ${comparisonMode
                                            ? 'bg-cyan-500/10 text-cyan-400'
                                            : 'text-muted hover:bg-elevated/40 hover:text-main'
                                        }`}
                                >
                                    <GitCompare size={13} />
                                    {lang === 'ar' ? 'وضع المقارنة' : 'Comparison Mode'}
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default BranchSelector;
