import React, { useEffect, useState } from 'react';
import { Banknote, CreditCard, Smartphone, Landmark, Calculator, ChefHat, ChevronDown, Tag, ArrowRight, X } from 'lucide-react';
import { PaymentMethod } from '@/types';

interface PaymentSummaryProps {
    subtotal: number;
    discount: number;
    discountAmount?: number;
    tax: number;
    total: number;
    currencySymbol: string;
    paymentMethod: PaymentMethod;
    onSetPaymentMethod: (method: PaymentMethod) => void;
    onShowSplitModal: () => void;
    isTouchMode: boolean;
    lang: 'en' | 'ar';
    t: any;
    tipAmount: number;
    onSetTipAmount: (amount: number) => void;
    onVoid: () => void;
    onSubmit: () => void;
    onQuickPay: () => void;
    onSendKitchen: () => void;
    canSubmit: boolean;
    couponCode: string;
    activeCoupon: string | null;
    isApplyingCoupon: boolean;
    onCouponCodeChange: (value: string) => void;
    onApplyCoupon: () => void;
    onClearCoupon: () => void;
    itemCount?: number;
    splitPayments: { method: PaymentMethod; amount: number }[];
    activeOrderType?: string;
}

const ar = {
    tender: '\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0645\u0633\u062a\u0644\u0645',
    tips: '\u0625\u0643\u0631\u0627\u0645\u064a\u0629',
    coupon: '\u0643\u0648\u0628\u0648\u0646',
    couponCode: '\u0643\u0648\u062f \u0627\u0644\u062e\u0635\u0645',
    apply: '\u062a\u0637\u0628\u064a\u0642',
    remove: '\u062d\u0630\u0641',
    clear: '\u0645\u0633\u062d',
    close: '\u0625\u063a\u0644\u0627\u0642',
    exact: '\u0628\u0627\u0644\u0636\u0628\u0637',
    change: '\u0627\u0644\u0628\u0627\u0642\u064a',
    short: '\u0646\u0627\u0642\u0635',
    pay: '\u062f\u0641\u0639',
    multiTender: '\u062f\u0641\u0639\u0627\u062a \u0645\u062a\u0639\u062f\u062f\u0629',
    edit: '\u062a\u0639\u062f\u064a\u0644',
};

const PaymentSummary: React.FC<PaymentSummaryProps> = ({
    subtotal = 0, discount = 0, discountAmount = 0, tax = 0, total = 0, currencySymbol, paymentMethod, onSetPaymentMethod, onShowSplitModal,
    lang, t, tipAmount = 0, onSetTipAmount, onSubmit, onSendKitchen,
    canSubmit, couponCode, activeCoupon, isApplyingCoupon, onCouponCodeChange, onApplyCoupon, onClearCoupon, splitPayments = [], activeOrderType
}) => {
    const [openSection, setOpenSection] = useState<'methods' | 'tips' | 'coupon' | null>(null);
    const [tenderedStr, setTenderedStr] = useState<string>('');
    const [isCashDrawerOpen, setIsCashDrawerOpen] = useState(false);
    const amountTendered = Number(tenderedStr) || 0;
    const changeDue = amountTendered > 0 ? amountTendered - total : 0;
    const isAr = lang === 'ar';
    const toggleSection = (section: 'methods' | 'tips' | 'coupon') => setOpenSection(p => p === section ? null : section);

    useEffect(() => {
        if (paymentMethod !== PaymentMethod.CASH) setIsCashDrawerOpen(false);
    }, [paymentMethod]);

    const handleSubmitClick = () => {
        if (activeOrderType === 'TAKEAWAY' && paymentMethod === PaymentMethod.CASH && !isCashDrawerOpen) {
            setIsCashDrawerOpen(true);
            setOpenSection(null);
            return;
        }
        onSubmit();
    };

    const handleNumpad = (key: string | number) => {
        if (key === 'C') setTenderedStr('');
        else if (key === '.') {
            if (!tenderedStr.includes('.')) setTenderedStr(prev => prev ? prev + '.' : '0.');
        } else if (key === 'BACKSPACE') setTenderedStr(prev => prev.slice(0, -1));
        else setTenderedStr(prev => prev === '0' ? String(key) : prev + String(key));
    };

    const methods = [
        { id: PaymentMethod.CASH, label: t.cash, icon: Banknote },
        { id: PaymentMethod.VISA, label: t.visa, icon: CreditCard },
        { id: PaymentMethod.VODAFONE_CASH, label: t.v_cash, icon: Smartphone },
        { id: PaymentMethod.INSTAPAY, label: t.insta, icon: Landmark },
        { id: PaymentMethod.SPLIT, label: t.split, icon: Calculator },
    ];
    const activeMethodLabel = methods.find(m => m.id === paymentMethod)?.label.split(' ')[0] || t.cash;

    return (
        <div className="space-y-2.5 shrink-0 flex flex-col pos-payment-summary">
            <div className="flex items-center justify-between px-2 text-[11px]">
                <div className="flex items-center gap-3 text-muted/70 font-bold">
                    <span>{t.subtotal} <b className="text-main tabular-nums ml-1">{subtotal.toFixed(2)}</b></span>
                    <span>{t.tax} <b className="tabular-nums ml-1">{tax.toFixed(2)}</b></span>
                </div>
                {discount > 0 && (
                    <span className="text-emerald-500 font-bold tabular-nums bg-emerald-500/10 px-1.5 rounded">-{discountAmount.toFixed(2)}</span>
                )}
            </div>

            <div className="flex gap-2">
                <button
                    onClick={() => toggleSection('methods')}
                    className={`flex-[2] h-10 flex items-center justify-between px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.98] ${openSection === 'methods' ? 'bg-primary text-white shadow-md' : 'bg-card border border-border/10 text-main hover:border-primary/30 hover:shadow-sm'}`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Banknote size={15} className={openSection === 'methods' ? 'text-white' : 'text-primary'} />
                        <span className="truncate">{activeMethodLabel}</span>
                    </div>
                    <ChevronDown size={14} className={`transition-transform duration-300 ${openSection === 'methods' ? 'rotate-180 opacity-70' : 'text-muted/50'}`} />
                </button>

                {paymentMethod === PaymentMethod.CASH && total > 0 && (
                    <button
                        onClick={() => { setIsCashDrawerOpen(v => !v); setOpenSection(null); }}
                        className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 active:scale-95 ${isCashDrawerOpen ? 'bg-primary text-white shadow-md' : 'bg-card border border-border/10 text-muted hover:text-primary hover:border-primary/30'}`}
                        title={isAr ? ar.tender : 'Tender amount'}
                    >
                        <Calculator size={15} />
                    </button>
                )}

                <button
                    onClick={() => setOpenSection(openSection === 'tips' || openSection === 'coupon' ? null : 'tips')}
                    className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all duration-200 active:scale-95 ${(openSection === 'tips' || openSection === 'coupon' || activeCoupon || tipAmount > 0) ? 'bg-indigo-500 text-white shadow-md' : 'bg-card border border-border/10 text-muted hover:text-indigo-500 hover:border-indigo-500/30'}`}
                >
                    <Tag size={15} />
                </button>
            </div>

            {(openSection === 'tips' || openSection === 'coupon') && (
                <div className="flex bg-elevated/40 p-1 rounded-xl gap-1 pos-animate-in border border-border/5">
                    <button onClick={() => setOpenSection('tips')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${openSection === 'tips' ? 'bg-card text-main shadow-sm' : 'text-muted/50 hover:text-main'}`}>
                        {isAr ? ar.tips : 'Tips'} {tipAmount > 0 ? `(${tipAmount})` : ''}
                    </button>
                    <button onClick={() => setOpenSection('coupon')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${openSection === 'coupon' ? 'bg-card text-main shadow-sm' : 'text-muted/50 hover:text-main'}`}>
                        {isAr ? ar.coupon : 'Coupon'} {activeCoupon ? '\u2713' : ''}
                    </button>
                </div>
            )}

            {openSection === 'methods' && (
                <div className="grid grid-cols-5 gap-1.5 pos-animate-in bg-elevated/20 p-1.5 rounded-xl border border-border/5">
                    {methods.map(btn => (
                        <button
                            key={btn.id}
                            onClick={() => { onSetPaymentMethod(btn.id); if (btn.id === PaymentMethod.SPLIT) onShowSplitModal(); setOpenSection(null); }}
                            className={`pos-payment-method-option flex flex-col items-center justify-center py-3 px-1 rounded-xl transition-all duration-200 active:scale-95 ${paymentMethod === btn.id ? 'bg-primary text-white shadow-md' : 'bg-card border border-border/5 text-muted hover:text-main hover:border-primary/20'}`}
                        >
                            <btn.icon size={18} className={paymentMethod === btn.id ? 'opacity-90' : 'opacity-60'} />
                            <span className="text-[9px] font-bold mt-1.5 truncate w-full text-center">{btn.label.split(' ')[0]}</span>
                        </button>
                    ))}
                </div>
            )}

            {openSection === 'tips' && (
                <div className="flex bg-elevated/20 rounded-xl p-1.5 gap-1.5 pos-animate-in border border-border/5">
                    {[0, Math.round(subtotal * 0.05), Math.round(subtotal * 0.1), Math.round(subtotal * 0.15)].map((amt, i) => (
                        <button
                            key={amt}
                            onClick={() => { onSetTipAmount(amt); setOpenSection(null); }}
                            className={`pos-tip-option flex-1 flex flex-col items-center justify-center py-2.5 rounded-xl transition-all active:scale-95 ${tipAmount === amt ? 'bg-indigo-500 text-white shadow-md' : 'bg-card border border-border/5 text-muted hover:text-main hover:border-indigo-500/30'}`}
                        >
                            <span className="text-[13px] font-black tabular-nums">{amt === 0 ? '0' : `+${amt}`}</span>
                            {i > 0 && <span className="text-[9px] font-semibold mt-0.5 opacity-60">{i * 5}%</span>}
                        </button>
                    ))}
                </div>
            )}

            {openSection === 'coupon' && (
                <div className="flex gap-2 pos-animate-in">
                    <div className="flex-1 flex items-center bg-card border border-border/10 rounded-xl px-3 focus-within:border-primary/30 focus-within:shadow-sm transition-all h-11">
                        <Tag size={14} className="text-muted/40 mr-2" />
                        <input
                            type="text"
                            placeholder={isAr ? ar.couponCode : 'Code'}
                            value={couponCode}
                            onChange={(e) => onCouponCodeChange(e.target.value)}
                            className="w-full bg-transparent text-sm font-bold outline-none uppercase placeholder:text-muted/30 text-main"
                        />
                    </div>
                    <button
                        onClick={activeCoupon ? onClearCoupon : onApplyCoupon}
                        disabled={isApplyingCoupon || (!activeCoupon && !couponCode)}
                        className={`shrink-0 w-24 rounded-xl text-xs font-bold flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 h-11 shadow-sm ${activeCoupon ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-primary text-white hover:bg-primary/90'}`}
                    >
                        {activeCoupon ? (isAr ? ar.remove : 'Remove') : (isApplyingCoupon ? '...' : (isAr ? ar.apply : 'Apply'))}
                    </button>
                </div>
            )}

            {paymentMethod === PaymentMethod.CASH && total > 0 && isCashDrawerOpen && (
                <div className="pos-cash-drawer bg-elevated/25 backdrop-blur-sm border border-border/10 rounded-xl p-2.5 space-y-2.5 pos-animate-in shadow-inner max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain">
                    <div className="sticky -top-2.5 z-10 flex items-center justify-between bg-elevated/95 backdrop-blur px-1 py-1 rounded-lg">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{isAr ? ar.tender : 'Amount Tendered'}</span>
                        <div className="flex items-center gap-1.5">
                            {tenderedStr && (
                                <button onClick={() => setTenderedStr('')} className="text-[10px] font-bold text-rose-500 hover:text-rose-600 transition-colors uppercase tracking-wide">{isAr ? ar.clear : 'Clear'}</button>
                            )}
                            <button
                                onClick={() => setIsCashDrawerOpen(false)}
                                className="h-7 w-7 rounded-lg bg-card border border-border/10 text-muted hover:text-main flex items-center justify-center"
                                title={isAr ? ar.close : 'Close'}
                            >
                                <X size={13} />
                            </button>
                        </div>
                    </div>

                    <div className="pos-cash-display h-12 bg-card border border-border/10 rounded-xl flex items-center justify-center shadow-sm">
                        <span className={`text-2xl font-black tabular-nums tracking-tight ${tenderedStr ? 'text-main' : 'text-muted/20'}`}>{tenderedStr || '0.00'}</span>
                        <span className="text-[10px] font-semibold text-muted/40 ml-2 mb-1">{currencySymbol}</span>
                    </div>

                    <div className="pos-quick-cash grid grid-cols-4 gap-2">
                        {[50, 100, 200, 500].map(amt => (
                            <button key={amt} onClick={() => setTenderedStr(String(amt))} className="h-8 rounded-lg text-[12px] font-black bg-card border border-border/10 text-muted/80 hover:text-primary hover:border-primary/30 hover:shadow-sm transition-all active:scale-95 tabular-nums">
                                {amt}
                            </button>
                        ))}
                    </div>

                    <div className="pos-numpad grid grid-cols-3 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map(key => (
                            <button key={key} onClick={() => handleNumpad(key)} className="pos-numpad-key h-10 bg-card border border-border/10 rounded-lg text-base font-black text-main hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all active:scale-90 shadow-sm">
                                {key}
                            </button>
                        ))}
                        <button onClick={() => setTenderedStr(String(Math.ceil(total)))} className="pos-exact-cash h-10 bg-emerald-500 text-white rounded-lg active:scale-90 transition-all flex flex-col items-center justify-center shadow-md hover:bg-emerald-600">
                            <span className="text-[10px] font-black uppercase tracking-wider">{isAr ? ar.exact : 'Exact'}</span>
                            <span className="text-[11px] font-bold opacity-80 tabular-nums">{Math.ceil(total)}</span>
                        </button>
                    </div>

                    {amountTendered > 0 && (
                        <div className={`pos-change-box flex items-center justify-between px-4 py-3 rounded-xl shadow-sm ${changeDue >= 0 ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'}`}>
                            <span className="text-[10px] font-black uppercase tracking-wider">
                                {changeDue >= 0 ? (isAr ? ar.change : 'Change') : (isAr ? ar.short : 'Short')}
                            </span>
                            <span className="text-xl font-black tabular-nums tracking-tight">{Math.abs(changeDue).toFixed(2)}</span>
                        </div>
                    )}
                </div>
            )}

            {paymentMethod === PaymentMethod.SPLIT && splitPayments.length > 0 && total > 0 && (
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 space-y-2 pos-animate-in">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">{isAr ? ar.multiTender : 'Multi-Tender'}</span>
                        <button onClick={onShowSplitModal} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 bg-indigo-500/10 px-2 py-1 rounded-md transition-colors">{isAr ? ar.edit : 'Edit'}</button>
                    </div>
                    {splitPayments.map((p, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                                <span className="font-semibold text-muted">{p.method.replace('_', ' ')}</span>
                            </div>
                            <span className="font-black tabular-nums text-main">{p.amount.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex gap-2 pt-1">
                {(!activeOrderType || activeOrderType === 'DINE_IN') && (
                    <button onClick={onSendKitchen} disabled={!canSubmit} className="pos-send-kitchen-btn w-12 h-12 bg-card border border-border/10 text-muted hover:text-primary hover:border-primary/30 hover:bg-primary/5 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:hover:border-border/10 disabled:hover:bg-card transition-all duration-300 active:scale-95 shadow-sm" title={t.send_kitchen}>
                        <ChefHat size={22} />
                    </button>
                )}

                <button
                    onClick={handleSubmitClick}
                    disabled={!canSubmit}
                    className="pos-submit-payment-btn flex-1 h-12 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 active:shadow-md flex items-center justify-between px-4 disabled:opacity-40 disabled:shadow-none disabled:from-muted disabled:to-muted transition-all duration-300 relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out mix-blend-overlay rounded-2xl" />
                    <div className="flex items-center gap-2">
                        <span className="font-black text-[15px] uppercase tracking-widest">{isAr ? ar.pay : 'Pay'}</span>
                        <ArrowRight size={16} className="opacity-70 group-hover:translate-x-1 transition-transform" />
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black tabular-nums tracking-tighter">{total.toFixed(2)}</span>
                        <span className="text-[10px] font-semibold opacity-70 mb-1">{currencySymbol}</span>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default PaymentSummary;
