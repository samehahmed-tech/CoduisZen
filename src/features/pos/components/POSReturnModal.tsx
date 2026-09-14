import React from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { ordersApi } from '@/services/api/orders';
import { refundApi } from '@/services/api/refunds';
import { getActionableErrorMessage } from '@/services/api/core';
import { useToast } from '@/components/common/ToastProvider';

interface POSReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    lang: string;
    branchId?: string;
    userName?: string;
    currencySymbol?: string;
}

const REASON_CATEGORIES = ['CUSTOMER_COMPLAINT', 'WRONG_ORDER', 'QUALITY', 'LATE_DELIVERY', 'OTHER'];

const POSReturnModal: React.FC<POSReturnModalProps> = ({ isOpen, onClose, lang, branchId, userName, currencySymbol = '' }) => {
    const isAr = lang === 'ar';
    const { showToast } = useToast();
    const [orderQuery, setOrderQuery] = React.useState('');
    const [order, setOrder] = React.useState<any | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [qtyByItem, setQtyByItem] = React.useState<Record<string, number>>({});
    const [reasonCategory, setReasonCategory] = React.useState('CUSTOMER_COMPLAINT');
    const [reason, setReason] = React.useState('');
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (!isOpen) {
            setOrderQuery('');
            setOrder(null);
            setQtyByItem({});
            setReason('');
            setReasonCategory('CUSTOMER_COMPLAINT');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const loadOrder = async () => {
        const q = orderQuery.trim();
        if (!q) return;
        setLoading(true);
        try {
            // Direct id lookup (receipt); falls back to list search by number.
            let found: any = null;
            try {
                found = await ordersApi.getById(q);
            } catch {
                const list: any[] = await ordersApi.getAll({ branch_id: branchId, limit: 50 } as any);
                found = (Array.isArray(list) ? list : []).find((o: any) =>
                    String(o.id) === q || String(o.orderNumber || o.order_number || '') === q);
            }
            if (!found || found?.error) throw new Error('ORDER_NOT_FOUND');
            setOrder(found);
            setQtyByItem({});
        } catch (e: any) {
            showToast(getActionableErrorMessage(e, lang as any), 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleQty = (key: string, max: number, delta: number) => {
        setQtyByItem((prev) => {
            const next = Math.max(0, Math.min(max, Number(prev[key] || 0) + delta));
            return { ...prev, [key]: next };
        });
    };

    const selectedLines = (order?.items || [])
        .map((item: any, index: number) => ({ item, index, key: String(item.id || item.menuItemId || index), qty: Number(qtyByItem[String(item.id || item.menuItemId || index)] || 0) }))
        .filter((l: any) => l.qty > 0);
    const refundAmount = selectedLines.reduce((s: number, l: any) => s + Number(l.item.price || 0) * l.qty, 0);

    const submit = async () => {
        if (!order || selectedLines.length === 0) {
            showToast(isAr ? 'اختر صنفاً واحداً على الأقل' : 'Select at least one item', 'warning');
            return;
        }
        if (reason.trim().length < 3) {
            showToast(isAr ? 'اكتب سبب الاسترجاع' : 'Enter a refund reason', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            await refundApi.requestRefund({
                orderId: String(order.id),
                type: 'PARTIAL',
                reason: reason.trim(),
                reasonCategory,
                refundMethod: 'ORIGINAL_PAYMENT',
                requestedByName: userName,
                items: selectedLines.map((l: any) => ({
                    orderItemId: Number(l.item.id) || 0,
                    quantity: l.qty,
                    reason: reason.trim(),
                })),
                customAmount: Number(refundAmount.toFixed(2)),
            });
            showToast(isAr ? 'تم إرسال طلب الاسترجاع للاعتماد' : 'Refund request sent for approval', 'success');
            onClose();
        } catch (e: any) {
            showToast(getActionableErrorMessage(e, lang as any), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-card rounded-2xl border border-border/50 shadow-2xl p-5 space-y-3 max-h-[90dvh] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-main uppercase tracking-widest flex items-center gap-2">
                        <RotateCcw size={16} className="text-amber-500" />
                        {isAr ? 'مرتجع كاشير' : 'Counter return'}
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-lg text-muted hover:text-rose-500"><X size={16} /></button>
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-3' : 'left-3'}`} />
                        <input
                            value={orderQuery}
                            onChange={(e) => setOrderQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void loadOrder(); }}
                            placeholder={isAr ? 'رقم الطلب من الإيصال…' : 'Order # from receipt…'}
                            className={`w-full bg-elevated border border-border/50 rounded-xl py-2.5 text-sm font-bold outline-none focus:border-amber-500/50 text-main placeholder-muted ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
                        />
                    </div>
                    <button onClick={() => { void loadOrder(); }} disabled={loading} className="px-4 rounded-xl bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                        {isAr ? 'بحث' : 'Find'}
                    </button>
                </div>

                {order && (
                    <>
                        <div className="rounded-xl bg-elevated/60 border border-border/50 p-3 text-xs font-bold flex justify-between">
                            <span>#{order.orderNumber || order.id}</span>
                            <span className="tabular-nums">{Number(order.total || 0).toFixed(2)} {currencySymbol}</span>
                            <span className="text-muted">{order.status}</span>
                        </div>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                            {(order.items || []).map((item: any, index: number) => {
                                const key = String(item.id || item.menuItemId || index);
                                const max = Number(item.quantity || 0);
                                const qty = Number(qtyByItem[key] || 0);
                                return (
                                    <div key={key} className="flex items-center gap-2 rounded-xl border border-border/50 p-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black text-main truncate">{item.nameAr || item.name}</p>
                                            <p className="text-[10px] text-muted font-bold tabular-nums">{Number(item.price || 0).toFixed(2)} × {max}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => toggleQty(key, max, -1)} className="w-7 h-7 rounded-lg bg-elevated border border-border/50 font-black">−</button>
                                            <span className="w-6 text-center text-sm font-black tabular-nums">{qty}</span>
                                            <button onClick={() => toggleQty(key, max, 1)} className="w-7 h-7 rounded-lg bg-elevated border border-border/50 font-black">+</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <select value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)} className="w-full bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-xs font-bold outline-none text-main">
                            {REASON_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isAr ? 'سبب الاسترجاع *' : 'Refund reason *'} className="w-full bg-elevated border border-border/50 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:border-amber-500/50 text-main placeholder-muted" />
                        <div className="flex items-center justify-between text-sm font-black">
                            <span className="text-muted">{isAr ? 'المبلغ المقترح' : 'Suggested'}</span>
                            <span className="tabular-nums">{refundAmount.toFixed(2)} {currencySymbol}</span>
                        </div>
                        <button onClick={() => { void submit(); }} disabled={submitting || selectedLines.length === 0} className="w-full py-3 rounded-xl bg-amber-500 text-white font-black text-[11px] uppercase tracking-widest disabled:opacity-50 hover:opacity-90">
                            {isAr ? 'إرسال للاعتماد' : 'Send for approval'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default POSReturnModal;
