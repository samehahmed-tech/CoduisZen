import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, MapPin, Plus, X } from 'lucide-react';
import { deliveryApi } from '@/services/api/delivery';

export interface DeliveryZoneOption {
    id: number | string;
    name: string;
    nameAr?: string | null;
    branchId?: string | null;
    deliveryFee?: number | null;
    minOrderAmount?: number | null;
    estimatedTime?: number | null;
    isActive?: boolean;
}

interface DeliveryZonePickerProps {
    zones: DeliveryZoneOption[];
    value: string;
    onChange: (zoneId: string, zone?: DeliveryZoneOption) => void;
    onZonesChange?: (zones: DeliveryZoneOption[]) => void;
    branchId?: string;
    branches?: { id: string; name: string; nameAr?: string }[];
    lang: 'en' | 'ar';
    label?: string;
    placeholder?: string;
    compact?: boolean;
}

const DeliveryZonePicker: React.FC<DeliveryZonePickerProps> = ({
    zones,
    value,
    onChange,
    onZonesChange,
    branchId,
    branches = [],
    lang,
    label,
    placeholder,
    compact,
}) => {
    const isRtl = lang === 'ar';
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', nameAr: '', deliveryFee: '', branchId: branchId || '', minOrderAmount: '', estimatedTime: '45' });
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setForm(f => ({ ...f, branchId: branchId || '' }));
    }, [branchId]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const branchNameOf = (id?: string | null) => {
        if (!id) return isRtl ? 'عام — كل الفروع' : 'Global — all branches';
        const b = branches.find(x => String(x.id) === String(id));
        return b ? (isRtl ? (b.nameAr || b.name) : b.name) : String(id);
    };

    const sorted = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = (zones || []).filter(z => {
            if (!q) return true;
            return [z.name, z.nameAr, String(z.deliveryFee ?? '')].some(v => String(v || '').toLowerCase().includes(q));
        });
        return [...list].sort((a, b) => {
            const rank = (z: DeliveryZoneOption) => {
                if (branchId && String(z.branchId || '') === String(branchId)) return 0;
                if (!z.branchId) return 1;
                return 2;
            };
            const r = rank(a) - rank(b);
            if (r !== 0) return r;
            return String(a.nameAr || a.name || '').localeCompare(String(b.nameAr || b.name || ''), isRtl ? 'ar' : 'en');
        });
    }, [zones, search, branchId, isRtl]);

    const selected = (zones || []).find(z => String(z.id) === String(value));
    const selectedLabel = selected ? (isRtl ? (selected.nameAr || selected.name) : (selected.name || selected.nameAr)) : '';

    const openCreate = () => {
        setFormError(null);
        setForm({ name: search.trim(), nameAr: '', deliveryFee: '', branchId: branchId || '', minOrderAmount: '', estimatedTime: '45' });
        setShowCreate(true);
        setOpen(false);
    };

    const handleCreate = async () => {
        const name = form.name.trim();
        const fee = Number(form.deliveryFee);
        if (!name) {
            setFormError(isRtl ? 'اكتب اسم المنطقة' : 'Zone name is required');
            return;
        }
        if (form.deliveryFee === '' || !Number.isFinite(fee) || fee < 0) {
            setFormError(isRtl ? 'اكتب سعر توصيل صحيح (0 أو أكثر)' : 'Enter a valid delivery fee (0 or more)');
            return;
        }
        setIsSaving(true);
        setFormError(null);
        try {
            const created = await deliveryApi.createZone({
                name,
                nameAr: form.nameAr.trim() || null,
                branchId: form.branchId.trim() || null,
                deliveryFee: fee,
                minOrderAmount: Math.max(0, Number(form.minOrderAmount || 0) || 0),
                estimatedTime: Math.max(1, Math.min(480, Number(form.estimatedTime || 45) || 45)),
                isActive: true,
            });
            const next = [...(zones || []), created];
            onZonesChange?.(next);
            onChange(String(created.id), created);
            setShowCreate(false);
            setSearch('');
        } catch (err: any) {
            setFormError(err?.message || (isRtl ? 'تعذر حفظ المنطقة' : 'Failed to save zone'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div ref={rootRef} className="relative w-full">
            {label && (
                <label className="text-[9px] font-black uppercase text-muted tracking-[0.2em] mb-1.5 block">
                    {label}
                </label>
            )}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-elevated/80 py-2 px-3 text-xs font-black text-main transition-all hover:border-indigo-500/30 focus:border-indigo-500/50 ${compact ? '' : 'py-3.5'}`}
            >
                <span className="flex min-w-0 items-center gap-2">
                    <MapPin size={14} className="shrink-0 text-indigo-500" />
                    <span className="truncate">
                        {selected ? (
                            <>{selectedLabel} <span className="text-emerald-600">• {Number(selected.deliveryFee || 0)} {isRtl ? 'ج.م' : 'EGP'}</span></>
                        ) : (
                            <span className="text-muted font-bold">{placeholder || (isRtl ? 'اختر المنطقة...' : 'Select zone...')}</span>
                        )}
                    </span>
                </span>
                <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-[90] mt-2 w-full min-w-[260px] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
                    <div className="p-2 border-b border-border/50">
                        <input
                            autoFocus
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={isRtl ? 'ابحث عن منطقة...' : 'Search zones...'}
                            className="w-full rounded-xl border border-border/50 bg-elevated px-3 py-2 text-xs font-bold text-main outline-none focus:border-indigo-500/50"
                        />
                    </div>
                    <div className="max-h-56 overflow-y-auto custom-scrollbar p-1.5">
                        {sorted.length === 0 && (
                            <p className="px-3 py-4 text-center text-[11px] font-bold text-muted">
                                {isRtl ? 'لا توجد مناطق مطابقة — أضفها جديدة' : 'No matching zones — add it as new'}
                            </p>
                        )}
                        {sorted.map(z => {
                            const active = String(z.id) === String(value);
                            const zLabel = isRtl ? (z.nameAr || z.name) : (z.name || z.nameAr);
                            return (
                                <button
                                    key={z.id}
                                    type="button"
                                    onClick={() => { onChange(String(z.id), z); setOpen(false); setSearch(''); }}
                                    className={`w-full rounded-xl px-3 py-2.5 text-start transition-colors ${active ? 'bg-indigo-500/10' : 'hover:bg-elevated'}`}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5 truncate text-xs font-black text-main">
                                                {active && <CheckCircle2 size={13} className="shrink-0 text-indigo-500" />}
                                                <span className="truncate">{zLabel}</span>
                                            </span>
                                            <span className="mt-0.5 block truncate text-[10px] font-bold text-muted">
                                                {branchNameOf(z.branchId)}{z.estimatedTime ? ` • ${z.estimatedTime}${isRtl ? ' د' : 'm'}` : ''}
                                            </span>
                                        </span>
                                        <span className="shrink-0 rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-600">
                                            {Number(z.deliveryFee || 0)} {isRtl ? 'ج.م' : 'EGP'}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="border-t border-border/50 p-2">
                        <button
                            type="button"
                            onClick={openCreate}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500/10 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-indigo-500 transition-colors hover:bg-indigo-500 hover:text-white"
                        >
                            <Plus size={14} /> {isRtl ? 'منطقة جديدة + سعر التوصيل' : 'New zone + fee'}
                        </button>
                    </div>
                </div>
            )}

            {showCreate && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" dir={isRtl ? 'rtl' : 'ltr'}>
                    <div className="absolute inset-0" onClick={() => !isSaving && setShowCreate(false)} />
                    <div className="relative w-full max-w-sm rounded-3xl border border-border/50 bg-card p-5 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-wider text-main">
                                {isRtl ? 'منطقة توصيل جديدة' : 'New delivery zone'}
                            </h3>
                            <button type="button" onClick={() => !isSaving && setShowCreate(false)} className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-main">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted">{isRtl ? 'اسم المنطقة *' : 'Zone name *'}</label>
                                <input
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder={isRtl ? 'مثال: المعادي' : 'e.g. Maadi'}
                                    className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-indigo-500/60"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted">{isRtl ? 'الاسم الآخر (EN/AR)' : 'Other name (EN/AR)'}</label>
                                <input
                                    value={form.nameAr}
                                    onChange={e => setForm({ ...form, nameAr: e.target.value })}
                                    placeholder={isRtl ? 'Maadi' : 'المعادي'}
                                    className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-indigo-500/60"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted">{isRtl ? 'سعر التوصيل *' : 'Delivery fee *'}</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={form.deliveryFee}
                                        onChange={e => setForm({ ...form, deliveryFee: e.target.value })}
                                        placeholder="0"
                                        className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-indigo-500/60"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted">{isRtl ? 'الوقت (دقيقة)' : 'ETA (min)'}</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={form.estimatedTime}
                                        onChange={e => setForm({ ...form, estimatedTime: e.target.value })}
                                        className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-indigo-500/60"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted">{isRtl ? 'الفرع (اختياري)' : 'Branch (optional)'}</label>
                                <select
                                    value={form.branchId}
                                    onChange={e => setForm({ ...form, branchId: e.target.value })}
                                    className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm font-bold text-main outline-none focus:border-indigo-500/60"
                                >
                                    <option value="">{isRtl ? 'كل الفروع (عام)' : 'All branches (global)'}</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{isRtl ? (b.nameAr || b.name) : b.name}</option>
                                    ))}
                                </select>
                            </div>
                            {formError && (
                                <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-500">{formError}</p>
                            )}
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => setShowCreate(false)}
                                    className="h-11 flex-1 rounded-xl border border-border bg-elevated text-xs font-black uppercase text-muted hover:text-main disabled:opacity-50"
                                >
                                    {isRtl ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={handleCreate}
                                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-xs font-black uppercase text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {isSaving && <Loader2 size={14} className="animate-spin" />}
                                    {isRtl ? 'حفظ المنطقة' : 'Save zone'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeliveryZonePicker;
