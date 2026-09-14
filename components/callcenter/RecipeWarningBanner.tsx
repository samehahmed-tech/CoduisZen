import React from 'react';
import { AlertCircle } from 'lucide-react';

/** Warn-only banner: sale is never blocked, branch gets notified. */
export const MenuShortNotice: React.FC<{ count: number; lang: 'en' | 'ar' }> = ({ count, lang }) => {
    if (count <= 0) return null;
    return (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[11px] font-black text-amber-600">
            <AlertCircle size={15} className="shrink-0" />
            <span>
                {lang === 'ar'
                    ? `تنبيه: ${count} أصناف رصيد رسبي الفرع لا يكفيها — البيع مسموح وسيتم تنبيه الفرع`
                    : `Notice: ${count} items are short on recipe stock — sale allowed, branch will be notified`}
            </span>
        </div>
    );
};

export const CartShortWarning: React.FC<{ items: any[]; lang: 'en' | 'ar' }> = ({ items, lang }) => {
    if (items.length === 0) return null;
    return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-600">
                <AlertCircle size={14} className="shrink-0" />
                {lang === 'ar' ? 'تنبيه مخزون الفرع — البيع مسموح' : 'Branch stock notice — sale allowed'}
            </div>
            <div className="mt-1.5 space-y-1">
                {items.slice(0, 4).map((i: any) => (
                    <div key={i.cartId} className="text-[11px] font-bold text-amber-600/90">
                        {i.name} × {i.quantity}
                    </div>
                ))}
            </div>
        </div>
    );
};
