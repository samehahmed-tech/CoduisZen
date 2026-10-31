import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Minus, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useSearchParams, useParams } from 'react-router-dom';
import { publicQrApi, type PublicQrMenu as PublicQrMenuData } from '../services/api/publicQr';
import { getActionableErrorMessage } from '../services/api/core';

type CartLine = { menuItemId: string; sizeId?: string; quantity: number; modifiers: Array<{ id: string }> };

const PublicQrMenu: React.FC = () => {
    const { branchId = '', tableId = '' } = useParams<{ branchId: string; tableId: string }>();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const [menu, setMenu] = useState<PublicQrMenuData | null>(null);
    const [cart, setCart] = useState<CartLine[]>([]);
    const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
    const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [placing, setPlacing] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState<{ orderNumber?: string | number; trackingUrl?: string | null } | null>(null);

    const loadMenu = useCallback(async () => {
        if (!branchId || !tableId || !token) {
            setError('رابط الطاولة غير مكتمل أو انتهت صلاحيته.');
            setLoading(false);
            return;
        }
        try {
            setMenu(await publicQrApi.getMenu(branchId, tableId, token));
        } catch (err) {
            setError(getActionableErrorMessage(err, 'ar'));
        } finally {
            setLoading(false);
        }
    }, [branchId, tableId, token]);

    useEffect(() => { void loadMenu(); }, [loadMenu]);

    const modifierIdsFor = (id: string) => selectedModifiers[id] || [];
    const sizeIdFor = (id: string) => selectedSizes[id] || '';
    const lineKey = (id: string, sizeId: string, modifiers: string[]) => `${id}:${sizeId}:${[...modifiers].sort().join(',')}`;
    const quantityFor = (id: string) => {
        const key = lineKey(id, sizeIdFor(id), modifierIdsFor(id));
        return cart.find(line => lineKey(line.menuItemId, line.sizeId || '', line.modifiers.map(modifier => modifier.id)) === key)?.quantity || 0;
    };
    const updateQuantity = (id: string, delta: number) => {
        const sizeId = sizeIdFor(id);
        const modifierIds = modifierIdsFor(id);
        const key = lineKey(id, sizeId, modifierIds);
        setCart(current => {
            const existing = current.find(line => lineKey(line.menuItemId, line.sizeId || '', line.modifiers.map(modifier => modifier.id)) === key);
            const nextQuantity = Math.max(0, (existing?.quantity || 0) + delta);
            return nextQuantity === 0
                ? current.filter(line => lineKey(line.menuItemId, line.sizeId || '', line.modifiers.map(modifier => modifier.id)) !== key)
                : existing
                    ? current.map(line => lineKey(line.menuItemId, line.sizeId || '', line.modifiers.map(modifier => modifier.id)) === key ? { ...line, quantity: nextQuantity } : line)
                    : [...current, { menuItemId: id, sizeId: sizeId || undefined, quantity: nextQuantity, modifiers: modifierIds.map(optionId => ({ id: optionId })) }];
        });
    };

    const toggleModifier = (itemId: string, group: any, optionId: string) => {
        setSelectedModifiers(current => {
            const selected = new Set(current[itemId] || []);
            if (selected.has(optionId)) selected.delete(optionId);
            else {
                const groupOptionIds = new Set((group.options || []).map((option: any) => option.id));
                const selectedInGroup = [...selected].filter(id => groupOptionIds.has(id));
                if (selectedInGroup.length >= Number(group.maxSelection ?? Number.MAX_SAFE_INTEGER)) return current;
                selected.add(optionId);
            }
            return { ...current, [itemId]: [...selected] };
        });
    };

    const total = useMemo(() => cart.reduce((sum, line) => {
        const item = menu?.items.find(candidate => candidate.id === line.menuItemId);
        const selectedSize = (item?.sizes || []).find(size => size.id === line.sizeId);
        const modifierTotal = line.modifiers.reduce((modifierSum, modifier) => {
            const option = (item?.modifierGroups || []).flatMap((group: any) => group.options || []).find((candidate: any) => candidate.id === modifier.id);
            return modifierSum + Number(option?.price || 0);
        }, 0);
        return sum + (Number(selectedSize?.price ?? item?.price ?? 0) + modifierTotal) * line.quantity;
    }, 0), [cart, menu]);

    const placeOrder = async () => {
        if (!menu?.branch.isOpen || cart.length === 0 || placing) return;
        setPlacing(true);
        setError('');
        try {
            const result = await publicQrApi.createOrder(branchId, tableId, token, { items: cart, customerName, customerPhone, notes });
            setSuccess({ orderNumber: result.order?.orderNumber, trackingUrl: result.trackingUrl });
            setCart([]);
        } catch (err) {
            setError(getActionableErrorMessage(err, 'ar'));
        } finally {
            setPlacing(false);
        }
    };

    if (loading) return <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center"><Loader2 className="animate-spin" /></main>;
    if (error && !menu) return <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6"><div className="max-w-md text-center"><AlertCircle className="mx-auto mb-4 text-rose-400" size={40} /><p>{error}</p></div></main>;

    if (success) return <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6"><div className="max-w-md w-full rounded-3xl bg-slate-900 border border-emerald-400/20 p-8 text-center"><CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={52} /><h1 className="text-2xl font-black">تم استلام طلبك</h1><p className="mt-3 text-slate-300">رقم الطلب: <strong>{success.orderNumber || '—'}</strong></p>{success.trackingUrl && <a className="mt-6 inline-block text-emerald-300 underline" href={success.trackingUrl}>متابعة الطلب</a>}<button type="button" className="mt-8 block w-full rounded-2xl bg-emerald-500 px-5 py-3 font-bold text-slate-950" onClick={() => setSuccess(null)}>طلب جديد</button></div></main>;

    return <main className="min-h-screen bg-slate-950 text-white pb-32">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-5 py-5 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between"><div><p className="text-xs uppercase tracking-[0.25em] text-emerald-300">RestoFlow QR Ordering</p><h1 className="mt-1 text-2xl font-black">{menu?.branch.nameAr || menu?.branch.name || 'قائمة المطعم'}</h1><p className="text-sm text-slate-400">طاولة {tableId} · {menu?.branch.isOpen ? 'مفتوح الآن' : 'مغلق الآن'}</p></div><UtensilsCrossed className="text-emerald-300" /></div>
        </header>
        <section className="mx-auto grid max-w-6xl gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">
            {(menu?.items || []).map(item => {
                const quantity = quantityFor(item.id);
                const activeModifiers = modifierIdsFor(item.id);
                const activeSize = sizeIdFor(item.id);
                return <article key={item.id} className="rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-xl">
                    <div className="flex items-start justify-between gap-4"><div><h2 className="font-black">{item.nameAr || item.name}</h2><p className="mt-2 text-sm text-slate-400">{item.descriptionAr || item.description || ''}</p></div><span className="whitespace-nowrap font-black text-emerald-300">{Number(item.price || 0).toLocaleString()} {menu?.branch.currency || 'EGP'}</span></div>
                    {(item.sizes || []).length > 0 && <div className="mt-4"><p className="mb-2 text-sm font-bold text-slate-300">الحجم</p><div className="flex flex-wrap gap-2">{(item.sizes || []).map(size => <button key={size.id} type="button" className={`rounded-xl border px-3 py-2 text-xs ${activeSize === size.id ? 'border-emerald-400 bg-emerald-400/20 text-emerald-200' : 'border-white/10 bg-slate-800 text-slate-300'}`} onClick={() => setSelectedSizes(current => ({ ...current, [item.id]: size.id }))}>{size.nameAr || size.name} {Number(size.price || 0).toLocaleString()}</button>)}</div></div>}
                    {(item.modifierGroups || []).map((group: any) => <div key={group.id || group.name} className="mt-4"><p className="mb-2 text-sm font-bold text-slate-300">{group.nameAr || group.name}{(group.isRequired || Number(group.minSelection || 0) > 0) ? ' *' : ''}</p><div className="flex flex-wrap gap-2">{(group.options || []).map((option: any) => { const active = activeModifiers.includes(option.id); return <button key={option.id} type="button" className={`rounded-xl border px-3 py-2 text-xs ${active ? 'border-emerald-400 bg-emerald-400/20 text-emerald-200' : 'border-white/10 bg-slate-800 text-slate-300'}`} onClick={() => toggleModifier(item.id, group, option.id)}>{option.nameAr || option.name} +{Number(option.price || 0).toLocaleString()}</button>; })}</div></div>)}
                    <div className="mt-5 flex items-center justify-end gap-3"><button type="button" aria-label="تقليل" className="rounded-xl border border-white/15 p-2" onClick={() => updateQuantity(item.id, -1)} disabled={!quantity}><Minus size={16} /></button><span className="min-w-6 text-center font-black">{quantity}</span><button type="button" aria-label="زيادة" className="rounded-xl bg-emerald-500 p-2 text-slate-950" onClick={() => updateQuantity(item.id, 1)} disabled={!menu?.branch.isOpen}><Plus size={16} /></button></div>
                </article>;
            })}
        </section>
        <section className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-900/95 p-4 backdrop-blur"><div className="mx-auto max-w-6xl"><div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><ShoppingBag size={18} /> {cart.reduce((sum, line) => sum + line.quantity, 0)} أصناف</span><strong className="text-emerald-300">{total.toLocaleString()} {menu?.branch.currency || 'EGP'}</strong></div><div className="grid gap-2 md:grid-cols-4"><input className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2" placeholder="الاسم (اختياري)" value={customerName} onChange={event => setCustomerName(event.target.value)} /><input className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2" placeholder="الهاتف (اختياري)" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} /><input className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2" placeholder="ملاحظات" value={notes} onChange={event => setNotes(event.target.value)} /><button type="button" className="rounded-xl bg-emerald-500 px-5 py-2 font-black text-slate-950 disabled:opacity-50" disabled={!menu?.branch.isOpen || cart.length === 0 || placing} onClick={() => void placeOrder()}>{placing ? 'جاري الإرسال...' : 'إرسال الطلب'}</button></div>{error && <p className="mt-2 text-sm text-rose-300">{error}</p>}</div></section>
    </main>;
};

export default PublicQrMenu;
