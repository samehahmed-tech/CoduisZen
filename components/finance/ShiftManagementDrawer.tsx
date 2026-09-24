import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, Calculator, CheckCircle2, AlertCircle, RefreshCw, 
    Clock, CalendarDays, Coins, History, Banknote, CreditCard, Receipt
} from 'lucide-react';
import { useFinanceStore } from '../../stores/useFinanceStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { shiftsApi } from '../../services/api/shifts';
import { getActionableErrorMessage } from '../../services/api/core';
import { useToast } from '../Toast';

export const ShiftManagementDrawer: React.FC = () => {
    const isShiftDrawerOpen = useFinanceStore(s => s.isShiftDrawerOpen);
    const setIsShiftDrawerOpen = useFinanceStore(s => s.setIsShiftDrawerOpen);
    const activeShift = useFinanceStore(s => s.activeShift);
    const setShift = useFinanceStore(s => s.setShift);
    const refreshActiveShift = useFinanceStore(s => s.refreshActiveShift);
    const settings = useAuthStore(s => s.settings);
    const { showToast } = useToast();
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const isRtl = lang === 'ar';
    const [isRecheckingShift, setIsRecheckingShift] = useState(false);
    
    // Feature Toggle for Blind Reconciliation
    const isBlindReconciliation = settings?.blindShiftReconciliation === true;

    const [activeTab, setActiveTab] = useState<'reconciliation' | 'history'>('reconciliation');
    const [report, setReport] = useState<any>(null);
    const [loadingReport, setLoadingReport] = useState(false);
    
    const [actualBalance, setActualBalance] = useState('');
    const [closingNotes, setClosingNotes] = useState('');
    const [isClosing, setIsClosing] = useState(false);
    const [closedData, setClosedData] = useState<any>(null);

    useEffect(() => {
        if (isShiftDrawerOpen && activeShift && !closedData) {
            loadXReport();
        }
    }, [isShiftDrawerOpen, activeShift]);

    // If the drawer opens with no shift in state (e.g. a transient fetch
    // failure nulled it before the guard landed), re-check once so the
    // header self-corrects instead of showing "no active shift".
    useEffect(() => {
        if (!isShiftDrawerOpen || activeShift || closedData) return;
        const branchId = settings.activeBranchId;
        if (!branchId) return;
        let cancelled = false;
        setIsRecheckingShift(true);
        refreshActiveShift(branchId)
            .catch(() => { })
            .finally(() => { if (!cancelled) setIsRecheckingShift(false); });
        return () => { cancelled = true; };
    }, [isShiftDrawerOpen, activeShift, closedData, settings.activeBranchId, refreshActiveShift]);

    const loadXReport = async () => {
        if (!activeShift) return;
        setLoadingReport(true);
        try {
            const data = await shiftsApi.getXReport(activeShift.id, activeShift.branchId);
            setReport(data);
        } catch {
            showToast(isRtl ? 'تعذر تحميل تقرير الشيفت' : 'Failed to load shift report', 'error');
        } finally {
            setLoadingReport(false);
        }
    };

    const handleCloseShift = async () => {
        if (!activeShift) return;
        if (!report) {
            showToast(isRtl ? 'يرجى الانتظار لحين تحميل تقرير الشيفت' : 'Please wait for the shift report to load', 'error');
            return;
        }
        const balance = Number(actualBalance);
        if (!Number.isFinite(balance) || balance < 0) {
            showToast(getActionableErrorMessage({ code: 'INVALID_CASH_BALANCE' }, lang), 'error');
            return;
        }
        const expectedCashVal = Number(report.expectedCashBalance || 0);
        if (Math.abs(balance - expectedCashVal) > 1 && !closingNotes.trim()) {
            showToast(getActionableErrorMessage({ code: 'VARIANCE_REASON_REQUIRED' }, lang), 'error');
            return;
        }
        
        setIsClosing(true);
        try {
            const res = await shiftsApi.close(activeShift.id, {
                actualBalance: balance,
                notes: closingNotes,
                branchId: activeShift.branchId
            });
            setClosedData(res);
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
        } catch (closeError) {
            showToast(getActionableErrorMessage(closeError, lang), 'error');
        } finally {
            setIsClosing(false);
        }
    };

    if (!isShiftDrawerOpen) return null;

    const expectedCash = report ? Number(report.expectedCashBalance || 0) : null;
    const inputCash = Number(actualBalance);
    const variance = expectedCash !== null ? inputCash - expectedCash : 0;
    const isActualBalanceValid = report !== null && actualBalance !== '' && Number.isFinite(inputCash) && inputCash >= 0;
    const requiresVarianceReason = isActualBalanceValid && Math.abs(variance) > 1;
    const paymentLabel = (method: string) => {
        const custom = settings.customPaymentMethods?.find(item => item.id === method);
        return custom ? (isRtl ? custom.nameAr || custom.name : custom.name) : method.replace(/_/g, ' ');
    };
    const closeDrawer = () => {
        if (closedData) {
            setShift(null);
            setClosedData(null);
        }
        setIsShiftDrawerOpen(false);
    };

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[600] flex"
            >
                {/* Backdrop */}
                <div 
                    className="absolute inset-0 bg-black/30 dark:bg-black/60 " 
                    onClick={() => !isClosing && setIsShiftDrawerOpen(false)} 
                />
                
                {/* Drawer */}
                <motion.div 
                    initial={{ x: isRtl ? '-100%' : '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: isRtl ? '-100%' : '100%' }}
                    transition={{ type: "spring", duration: 0.15 }}
                    className={`bg-card shadow-2xl absolute top-0 bottom-0 ${isRtl ? 'left-0 border-r border-border' : 'right-0 border-l border-border'} w-full max-w-md flex flex-col z-10 overflow-hidden text-main`}
                    style={{ fontFamily: isRtl ? 'var(--font-arabic)' : 'var(--font-body)' }}
                >
                    <div className="relative flex items-center justify-between px-7 py-6 shrink-0 border-b border-border/20">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-500">
                                <History size={20} />
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-main uppercase tracking-widest leading-none">
                                    {isRtl ? 'إدارة الشيفت' : 'Shift Manager'}
                                </h2>
                                <p className="text-[10px] text-muted font-bold mt-1 uppercase">
                                    {activeShift ? `Active ID: ${activeShift.id.slice(0, 8)}` : (isRtl ? 'لا يوجد شيفت نشط' : 'No Active Shift')}
                                </p>
                            </div>
                        </div>
                        {!isClosing && (
                            <button 
                                onClick={closeDrawer}
                                className="w-10 h-10 rounded-xl bg-elevated border border-border/20 text-muted hover:text-main hover:bg-card transition-colors flex items-center justify-center active:scale-95"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    {!activeShift ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                            <div className="w-20 h-20 bg-elevated/40 rounded-full flex items-center justify-center mb-6 border border-border/20">
                                {isRecheckingShift
                                    ? <RefreshCw size={32} className="text-indigo-500 animate-spin" />
                                    : <AlertCircle size={32} className="text-muted/50" />}
                            </div>
                            <h3 className="text-lg font-black text-main mb-2">
                                {isRecheckingShift
                                    ? (isRtl ? 'جاري التحقق من الوردية...' : 'Checking shift...')
                                    : (isRtl ? 'لم يتم فتح أي شيفت' : 'No Shift is Open')}
                            </h3>
                            <p className="text-xs text-muted leading-relaxed max-w-xs">
                                {isRtl 
                                    ? 'يجب فتح وردية جديدة للتمكن من العمل والاطلاع على التقرير.' 
                                    : 'You need to open a new shift to view reports and start accepting orders.'}
                            </p>
                        </div>
                    ) : closedData ? (
                        // Success View
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-t from-emerald-500/5 to-transparent">
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
                                <CheckCircle2 size={48} className="text-emerald-500" />
                            </motion.div>
                            <h3 className="text-2xl font-black text-emerald-500 mb-2 uppercase tracking-tight">
                                {isRtl ? 'تم الإغلاق بنجاح' : 'Session Closed'}
                            </h3>
                            <p className="text-xs font-black text-muted mb-8 tracking-widest uppercase">
                                {isRtl ? 'تم ترحيل العُهدة بنجاح' : 'Cash reconciliation complete'}
                            </p>
                            <div className="bg-card w-full p-4 rounded-2xl border border-border/30">
                                <p className="text-[10px] text-muted uppercase tracking-[0.2em] font-black">{isRtl ? 'النقدية المستلمة' : 'Declared Cash'}</p>
                                <p className="text-3xl font-black text-main mt-1 tabular-nums">
                                    {(closedData.actualBalance || 0).toFixed(2)}
                                </p>
                            </div>
                            <div className="bg-card w-full p-4 rounded-2xl border border-border/30 mt-3 space-y-2">
                                {(closedData.payments || []).map((payment: any) => (
                                    <div key={payment.method} className="flex items-center justify-between text-xs">
                                        <span className="font-black text-muted uppercase">{paymentLabel(payment.method)}</span>
                                        <span className="font-black tabular-nums">{Number(payment.total || 0).toFixed(2)}</span>
                                    </div>
                                ))}
                                {closedData.excluded && Number(closedData.excluded.total || 0) !== 0 && (
                                    <div className="flex items-center justify-between text-xs pt-2 border-t border-border/20">
                                        <span className="font-black text-rose-400 uppercase">{isRtl ? `ضمنها ملغي/مرتجع (${closedData.excluded.orderCount || 0})` : `Incl. cancelled/refunded (${closedData.excluded.orderCount || 0})`}</span>
                                        <span className="font-black text-rose-500 tabular-nums">{Number(closedData.excluded.total || 0).toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                            <button onClick={closeDrawer} className="mt-5 w-full py-3 rounded-xl bg-emerald-600 text-white font-black text-xs">
                                {isRtl ? 'تم' : 'Done'}
                            </button>
                        </div>
                    ) : (
                        <div className="relative flex-1 flex flex-col min-h-0 z-10">
                            {/* Tabs */}
                            <div className="flex p-2 gap-2 shrink-0 border-b border-border/20 bg-elevated/20">
                                <button 
                                    onClick={() => setActiveTab('reconciliation')}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'reconciliation' ? 'bg-card text-primary shadow-sm border border-border/40' : 'text-muted hover:text-main'}`}
                                >
                                    {isRtl ? 'الإغلاق (X-Report)' : 'Reconcile (X)'}
                                </button>
                                <button 
                                    onClick={() => setActiveTab('history')}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-card text-primary shadow-sm border border-border/40' : 'text-muted hover:text-main'}`}
                                >
                                    {isRtl ? 'أرشيف الشيفتات' : 'History'}
                                </button>
                            </div>

                            {activeTab === 'reconciliation' ? (
                                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                                    {/* Snapshot Info */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-elevated/30 p-4 rounded-2xl border border-border/20 content-center text-center">
                                            <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">{isRtl ? 'بدأ في' : 'Started At'}</p>
                                            <p className="text-sm font-black text-main">{new Date(activeShift.openingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                        <div className="bg-elevated/30 p-4 rounded-2xl border border-border/20 content-center text-center">
                                            <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">{isRtl ? 'الرصيد الافتتاحي' : 'Opening Cash'}</p>
                                            <p className="text-sm font-black text-main">{activeShift.openingBalance?.toFixed(2)}</p>
                                        </div>
                                    </div>

                                    {/* X-Report Preview */}
                                    <div className="bg-elevated p-5 rounded-2xl border border-border shadow-sm">

                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-[11px] font-black text-main uppercase tracking-[0.2em]">{isRtl ? 'مبيعات الوردية' : 'Live X-Report'}</h3>
                                            <button onClick={loadXReport} disabled={loadingReport} className="text-muted hover:text-indigo-500 transition-colors">
                                                <RefreshCw size={14} className={loadingReport ? 'animate-spin' : ''} />
                                            </button>
                                        </div>

                                        {loadingReport && !report ? (
                                            <div className="h-32 flex items-center justify-center">
                                                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                            </div>
                                        ) : report ? (
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="font-bold text-muted flex items-center gap-2"><Receipt size={12} /> {isRtl ? 'إجمالي المبيعات' : 'Gross Sales'}</span>
                                                    <span className="font-black text-main tabular-nums">{(report.grossSales || 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="font-bold text-rose-400 flex items-center gap-2"><X size={12} /> {isRtl ? 'الخصومات والمسترد' : 'Discounts & Refunds'}</span>
                                                    <span className="font-black text-rose-500 tabular-nums">-{(report.discountsAndRefunds || 0).toFixed(2)}</span>
                                                </div>
                                                <div className="w-full h-px bg-border/30 my-2" />
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-black text-main uppercase tracking-widest">{isRtl ? 'المبيعات الصافية' : 'Net Sales'}</span>
                                                    <span className="font-black text-indigo-500 tabular-nums">{(report.netSales || 0).toFixed(2)}</span>
                                                </div>
                                                
                                                <div className="mt-4 pt-4 border-t border-border/20 grid grid-cols-2 gap-4">
                                                    {(report.payments || []).map((payment: any) => (
                                                        <div key={payment.method} className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                                {payment.method === 'CASH' ? <Banknote size={14} /> : <CreditCard size={14} />}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-[9px] font-black uppercase text-muted tracking-widest truncate">{paymentLabel(payment.method)}</p>
                                                                <p className="text-xs font-black tabular-nums">{Number(payment.total || 0).toFixed(2)}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {report.excluded && Number(report.excluded.total || 0) !== 0 && (
                                                    <div
                                                        className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3.5 py-2.5"
                                                        title={isRtl ? 'مدفوعات طلبات ملغاة / مرتجعة / تالفة: مسجلة ومتضمنة في إجمالي النقدية أعلاه، لكنها خارج إيراد الداشبورد. لو أعدت النقدية للعميل سجل مرتجعًا.' : 'Payments on cancelled / refunded / voided orders: recorded and included in the cash total above, but outside dashboard revenue. Record a refund if cash was handed back.'}
                                                    >
                                                        <span className="text-[11px] font-bold text-rose-400 flex items-center gap-1.5">
                                                            <X size={12} />
                                                            {isRtl
                                                                ? `ضمن النقدية: ملغي/مرتجع (${report.excluded.orderCount || 0})`
                                                                : `In cash total: cancelled/refunded (${report.excluded.orderCount || 0})`}
                                                        </span>
                                                        <span className="text-xs font-black text-rose-500 tabular-nums">{Number(report.excluded.total || 0).toFixed(2)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted text-center py-4">{isRtl ? 'تعذر جلب التقرير الحي' : 'Failed to load report'}</p>
                                        )}
                                    </div>

                                    {/* Cash Reconciliation Entry */}
                                    <div className="bg-elevated p-6 rounded-2xl border border-border shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-[11px] font-black text-rose-500 uppercase tracking-[0.2em]">{isRtl ? 'تسوية النقدية' : 'Drawer Count'}</h3>
                                            {!isBlindReconciliation && report && (
                                                <span className="text-[9px] font-black bg-indigo-500/10 text-indigo-500 px-2 py-1 rounded-md border border-indigo-500/20">
                                                    EXP: {(report.expectedCashBalance || 0).toFixed(2)}
                                                </span>
                                            )}
                                        </div>

                                        <div className="relative mb-3">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-card rounded-lg flex items-center justify-center shadow-inner border border-border/20">
                                                <Calculator size={14} className="text-main" />
                                            </div>
                                            <input
                                                type="number"
                                                value={actualBalance}
                                                onChange={e => setActualBalance(e.target.value)}
                                                placeholder="0.00"
                                                className="theme-input w-full pl-14 pr-6 py-5 text-3xl font-black tabular-nums text-center"
                                            />
                                        </div>

                                        {!isBlindReconciliation && actualBalance !== '' && variance !== 0 && (
                                            <div className={`p-3 rounded-xl border flex items-center justify-between ${variance > 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                                                <span className="text-[10px] font-black uppercase tracking-widest">{variance > 0 ? 'Overage' : 'Shortage'}</span>
                                                <span className="text-sm font-black tabular-nums">{Math.abs(variance).toFixed(2)}</span>
                                            </div>
                                        )}
                                        {isBlindReconciliation && (
                                            <p className="text-[9px] text-muted font-bold text-center mt-2 px-4 uppercase tracking-[0.1em]">
                                                {isRtl ? 'تم تفعيل وضع التعتيم. أدخل النقدية الفعلية فقط.' : 'Blind tracking enabled. Enter physical cash counted.'}
                                            </p>
                                        )}
                                    </div>
                                    
                                    {/* Notes */}
                                     <textarea 
                                        placeholder={isRtl ? 'ملاحظات العجز/الزيادة أو الشيفت...' : 'Closing notes or explanations...'}
                                        value={closingNotes}
                                        onChange={e => setClosingNotes(e.target.value)}
                                        className="theme-input w-full p-5 text-sm font-semibold resize-none h-24"
                                     />
                                    {requiresVarianceReason && !closingNotes.trim() && (
                                        <p className="text-xs font-bold text-rose-500">
                                            {isRtl ? 'سبب العجز أو الزيادة مطلوب قبل الإغلاق.' : 'A variance reason is required before closing.'}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex-1 p-5 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-elevated rounded-full flex items-center justify-center mx-auto mb-4 text-muted border border-border/20">
                                            <CalendarDays size={24} />
                                        </div>
                                        <p className="text-xs font-black uppercase text-muted tracking-widest">{isRtl ? 'لا توجد ورديات مغلقة' : 'No closed shifts yet'}</p>
                                    </div>
                                </div>
                            )}

                            {/* Footer Submit */}
                            {activeTab === 'reconciliation' && (
                                <div className="relative p-6 border-t border-border/20 shrink-0 bg-card">
                                    <button
                                        onClick={handleCloseShift}
                                        disabled={isClosing || !isActualBalanceValid || (requiresVarianceReason && !closingNotes.trim())}
                                        className="theme-btn theme-btn-primary w-full disabled:opacity-50 text-xs uppercase tracking-[0.2em]"
                                    >
                                        {isClosing ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOutIcon />}
                                        <span className="relative">{isClosing ? (isRtl ? 'جاري الإغلاق...' : 'CLOSING...') : (isRtl ? 'تأكيد وإغلاق الوردية' : 'CONFIRM & CLOSE SHIFT')}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

const LogOutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
