
import React from 'react';
import { EyeOff } from 'lucide-react';
import { AppPermission } from '../types';

interface SensitiveDataProps {
    children: React.ReactNode;
    permission?: AppPermission;
    hasPermission: (perm?: AppPermission) => boolean;
    maskType?: 'blur' | 'hide' | 'replace';
    replacement?: string;
    lang?: 'en' | 'ar';
}

const SensitiveData: React.FC<SensitiveDataProps> = ({
    children,
    permission,
    hasPermission,
    maskType = 'blur',
    replacement = '***',
    lang = 'en'
}) => {
    const allowed = !permission || hasPermission(permission);

    if (allowed) return <>{children}</>;

    if (maskType === 'hide') return null;

    if (maskType === 'replace') {
        return <span className="font-mono text-slate-400">{replacement}</span>;
    }

    return (
        <div className="relative inline-block group">
            <div className="blur-[6px] select-none pointer-events-none opacity-50">
                {children}
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-slate-800/80  text-[8px] text-white px-2 py-0.5 rounded-lg flex items-center gap-1 font-black uppercase tracking-widest pointer-events-none">
                    <EyeOff size={10} /> {lang === 'ar' ? 'محجوب' : 'Hidden'}
                </div>
            </div>
        </div>
    );
};

export default SensitiveData;
