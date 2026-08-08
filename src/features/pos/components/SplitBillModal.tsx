import React, { useState } from 'react';
import { X, Calculator, Banknote, CreditCard, Smartphone, Landmark, Trash2 } from 'lucide-react';
import { CustomPaymentMethod, PaymentMethod, PaymentRecord } from '@/types';
import { useToast } from '@/components/Toast';
import { motion, AnimatePresence } from 'framer-motion';

interface SplitBillModalProps {
    isOpen: boolean;
    onClose: () => void;
    total: number;
    currencySymbol: string;
    lang: 'en' | 'ar';
    t: any;
    splitPayments: PaymentRecord[];
    onAddPayment: (method: PaymentMethod | string) => void;
    onRemovePayment: (index: number) => void;
    onUpdateAmount: (index: number, amount: number) => void;
    onSetPayments: (payments: PaymentRecord[]) => void;
    customPaymentMethods?: CustomPaymentMethod[];
}

const SplitBillModal: React.FC<SplitBillModalProps> = ({
    isOpen,
    onClose,
    total,
    currencySymbol,
    lang,
    t,
    splitPayments,
    onAddPayment,
    onRemovePayment,
    onUpdateAmount,
    onSetPayments,
    customPaymentMethods = [],
}) => {
    const [peopleCount, setPeopleCount] = useState(2);
    const { showToast } = useToast();
    const currentSum = splitPayments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = total - currentSum;
    const isRTL = lang === 'ar';

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-2 sm:p-3"
            >
                <motion.div
                    initial={{ y: "100%", scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: "100%", scale: 0.95 }} transition={{ type: "spring", duration: 0.15 }}
                    className="bg-card w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1.5rem)] border border-border/20 relative"
                >
                    {/* Ambient Glow */}
                    <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

                    {/* Header */}
                    <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border/20 bg-elevated/40 flex justify-between items-center relative z-10">
                        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-main text-app rounded-2xl flex shrink-0 items-center justify-center shadow-lg shadow-main/20">
                                <Calculator size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg sm:text-xl font-black text-main uppercase tracking-widest leading-tight">
                                    {t.split_bill}
                                </h3>
                                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">{isRTL ? 'تقسيم المدفوعات' : 'Payment Distribution'}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 bg-elevated/50 hover:bg-elevated text-muted hover:text-main rounded-2xl flex items-center justify-center transition-all border border-border/20 active:scale-95 shadow-sm">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 pos-scroll relative z-10">
                        {/* Total Summary */}
                        <div className="bg-main text-app p-4 sm:p-6 rounded-[2rem] flex justify-between items-center shadow-xl shadow-main/10 border border-main/10 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_2s_infinite]" />
                            <span className="text-sm font-black uppercase tracking-widest relative z-10">
                                {isRTL ? 'إجمالي الفاتورة' : 'Bill Total'}
                            </span>
                            <span className="text-2xl sm:text-3xl font-black tabular-nums tracking-tight relative z-10">
                                {total.toFixed(2)} <span className="text-sm opacity-80 uppercase">{currencySymbol}</span>
                            </span>
                        </div>

                        {/* Split Quick Action */}
                        <div className="bg-elevated/40 border border-border/20 rounded-[1.5rem] p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shadow-sm">
                            <div className="flex items-center gap-3 flex-1">
                                <span className="text-xs font-black uppercase tracking-widest text-muted">
                                    {isRTL ? 'تقسيم على' : 'Split By'}
                                </span>
                                <div className="flex items-center bg-card border border-border/20 rounded-xl overflow-hidden shadow-inner h-12">
                                    <button onClick={() => setPeopleCount(Math.max(2, peopleCount - 1))} className="w-12 h-full flex items-center justify-center text-muted hover:text-main hover:bg-elevated transition-colors">-</button>
                                    <input
                                        type="number" min={2} value={peopleCount}
                                        onChange={(e) => setPeopleCount(Math.max(2, Number(e.target.value) || 2))}
                                        className="w-14 h-full bg-transparent text-center font-black text-lg text-main outline-none"
                                    />
                                    <button onClick={() => setPeopleCount(peopleCount + 1)} className="w-12 h-full flex items-center justify-center text-muted hover:text-main hover:bg-elevated transition-colors">+</button>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    const n = Math.max(2, peopleCount || 2);
                                    const base = Math.floor((total / n) * 100) / 100;
                                    const payments: PaymentRecord[] = Array.from({ length: n }).map((_, i) => ({
                                        method: PaymentMethod.CASH,
                                        amount: i === n - 1 ? Number((total - base * (n - 1)).toFixed(2)) : base
                                    }));
                                    onSetPayments(payments);
                                }}
                                className="h-12 px-6 rounded-xl bg-indigo-500 text-white font-black text-xs uppercase tracking-widest shadow-md hover:bg-indigo-600 transition-all active:scale-95 border border-indigo-400"
                            >
                                {isRTL ? 'توزيع تلقائي' : 'Auto Split'}
                            </button>
                        </div>

                        {/* Payment List */}
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase text-muted tracking-widest px-2">
                                {isRTL ? 'الدفعات المستلمة' : 'Tendered Methods'}
                            </h4>
                            <AnimatePresence>
                                {splitPayments.map((p, idx) => (
                                    <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="flex items-center gap-3 p-3 bg-elevated/40 rounded-2xl border border-border/20 shadow-sm transition-all focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/10">
                                        <div className="w-12 h-12 bg-card rounded-xl flex items-center justify-center shadow-sm text-indigo-500 border border-border/20 shrink-0">
                                            {p.method === PaymentMethod.CASH && <Banknote size={20} />}
                                            {p.method === PaymentMethod.VISA && <CreditCard size={20} />}
                                            {p.method === PaymentMethod.VODAFONE_CASH && <Smartphone size={20} />}
                                            {p.method === PaymentMethod.INSTAPAY && <Landmark size={20} />}
                                            {![PaymentMethod.CASH, PaymentMethod.VISA, PaymentMethod.VODAFONE_CASH, PaymentMethod.INSTAPAY].includes(p.method as PaymentMethod) && <CreditCard size={20} />}
                                        </div>
                                        <div className="flex-1 flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                                {p.method.replace('_', ' ')}
                                            </span>
                                            <div className="relative">
                                                <span className={`absolute top-1/2 -translate-y-1/2 text-muted text-xs font-black uppercase ${isRTL ? 'left-2' : 'left-0'}`}>
                                                    {currencySymbol}
                                                </span>
                                                <input
                                                    type="number" value={p.amount}
                                                    onChange={(e) => onUpdateAmount(idx, parseFloat(e.target.value) || 0)}
                                                    className={`w-full bg-transparent border-none outline-none font-black text-xl text-main ${isRTL ? 'pl-8 pr-1 text-left' : 'pl-6 pr-1 text-left'} `}
                                                />
                                            </div>
                                        </div>
                                        <button onClick={() => onRemovePayment(idx)} className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:bg-rose-500/10 hover:text-rose-500 transition-colors shrink-0">
                                            <Trash2 size={16} />
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {splitPayments.length === 0 && (
                                <div className="py-10 border-2 border-dashed border-border/40 rounded-3xl flex flex-col items-center justify-center bg-elevated/20 text-muted">
                                    <Calculator size={32} className="opacity-20 mb-3" />
                                    <p className="text-xs font-black uppercase tracking-widest">
                                        {isRTL ? 'لم يتم إضافة دفعات' : 'No payments added'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Add Method Dock */}
                        <div>
                            <h4 className="text-[10px] font-black uppercase text-muted tracking-widest px-2 mb-3">
                                {isRTL ? 'إضافة طريقة دفع' : 'Add Method'}
                            </h4>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { id: PaymentMethod.CASH, icon: Banknote, label: 'CASH' },
                                    { id: PaymentMethod.VISA, icon: CreditCard, label: 'VISA' },
                                    { id: PaymentMethod.VODAFONE_CASH, icon: Smartphone, label: 'V-CASH' },
                                    { id: PaymentMethod.INSTAPAY, icon: Landmark, label: 'INSTA' },
                                    ...customPaymentMethods
                                        .filter(method => method.isActive !== false)
                                        .map(method => ({
                                            id: method.id,
                                            icon: CreditCard,
                                            label: isRTL ? method.nameAr || method.name : method.name,
                                        })),
                                ].map(m => (
                                    <button
                                        key={m.id} onClick={() => onAddPayment(m.id)}
                                        className="h-16 rounded-2xl bg-card border border-border/20 text-muted hover:text-indigo-500 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all flex flex-col items-center justify-center gap-1 shadow-sm active:scale-95"
                                    >
                                        <m.icon size={20} />
                                        <span className="text-[8px] font-black uppercase tracking-widest">{m.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer Confirmation */}
                    <div className="p-4 sm:p-6 border-t border-border/20 bg-elevated/40 space-y-3 sm:space-y-5 relative z-10 shrink-0">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] bg-card px-4 sm:px-6 py-3 sm:py-4 rounded-[1.5rem] border border-border/20 shadow-inner">
                            <span className="text-muted">{t.remaining}</span>
                            <span className={`text-xl flex items-center gap-1 ${Math.abs(remaining) > 0.01 ? (remaining > 0 ? 'text-rose-500' : 'text-amber-500') : 'text-emerald-500'} `}>
                                {remaining > 0.01 && <span className="text-[10px] opacity-60 mr-1">{isRTL ? 'متبقي' : 'Due'}</span>}
                                {remaining < -0.01 && <span className="text-[10px] opacity-60 mr-1">{isRTL ? 'تجاوز' : 'Over'}</span>}
                                {Math.abs(remaining) < 0.01 && <span className="text-[10px] opacity-60 mr-1">{isRTL ? 'مكتمل' : 'Settled'}</span>}
                                <span className="tabular-nums font-black">{Math.abs(remaining).toFixed(2)}</span>
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                if (Math.abs(remaining) < 0.01) onClose();
                                else showToast(lang === 'ar' ? 'المبلغ غير مكتمل' : "Payment doesn't match total", 'error');
                            }}
                            className={`w-full h-14 sm:h-16 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center ${Math.abs(remaining) < 0.01 ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20 border-b-4 border-emerald-800/40 animate-pulse' : 'bg-elevated text-muted border border-border/20 cursor-not-allowed hidden'}`}
                        >
                            {lang === 'ar' ? 'تأكيد وقبول الدفع' : 'Confirm & Collect Payment'}
                        </button>

                        <button
                            onClick={onClose}
                            className={`w-full h-14 sm:h-16 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center bg-main text-app shadow-xl shadow-black/20 border-b-4 border-black/20 ${Math.abs(remaining) < 0.01 ? 'hidden' : 'block'}`}
                        >
                            {isRTL ? 'الرجوع للخلف' : 'RETURN TO ORDER'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default SplitBillModal;
