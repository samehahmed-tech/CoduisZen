import React, { useState, useEffect } from 'react';
import {
    Lock, Unlock, LogOut, Calculator, ArrowRight,
    CheckCircle2, History, ShieldAlert, Coins,
    TrendingUp, ArrowDownRight, User
} from 'lucide-react';
import { useFinanceStore } from '@/stores/useFinanceStore';
import { shiftsApi } from '@/services/api/shifts';
import { useAuthStore } from '@/stores/useAuthStore';
import { translations } from '@/services/translations';
import { useToast } from '@/components/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { generateShiftId } from '@/src/utils/idGenerator';

interface ShiftOverlaysProps {
    onOpen: () => void;
}

export const ShiftOverlays: React.FC<ShiftOverlaysProps> = ({ onOpen }) => {
    const activeShift = useFinanceStore(state => state.activeShift);
    const setShift = useFinanceStore(state => state.setShift);
    const settings = useAuthStore(state => state.settings);
    const user = useAuthStore(state => state.settings.currentUser);
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const t = translations[lang] || translations.en;
    const { showToast } = useToast();
    const isRTL = lang === 'ar';

    const [openingBalance, setOpeningBalance] = useState('0');
    const [loading, setLoading] = useState(false);
    const [isCheckingShift, setIsCheckingShift] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const hydrateShift = async () => {
            const activeBranchId = settings.activeBranchId;
            if (!activeBranchId) {
                if (!cancelled && activeShift) setShift(null);
                setIsCheckingShift(false);
                return;
            }
            if (activeShift?.branchId === activeBranchId) {
                setIsCheckingShift(false);
                return;
            }
            if (activeShift && !cancelled) setShift(null);
            setIsCheckingShift(true);
            try {
                const res = await shiftsApi.getActive(activeBranchId);
                if (!cancelled && res && res.id) setShift(res);
            } catch {
                if (!cancelled) setShift(null);
            } finally {
                if (!cancelled) setIsCheckingShift(false);
            }
        };
        hydrateShift();
        return () => { cancelled = true; };
    }, [activeShift, settings.activeBranchId, setShift, user?.id]);

    if (isCheckingShift && !activeShift) {
        return (
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#020617]/95">
               <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (!activeShift) {
        const handleOpenShift = async () => {
            setLoading(true);
            try {
                const id = generateShiftId();
                const openingBalanceNum = parseFloat(openingBalance);
                if (!Number.isFinite(openingBalanceNum) || openingBalanceNum < 0) {
                    showToast(isRTL ? 'يرجى إدخال رصيد افتتاحي صحيح' : 'Please enter a valid opening balance', 'error');
                    setLoading(false);
                    return;
                }
                const data = {
                    id,
                    branchId: settings.activeBranchId || 'b1',
                    userId: user?.id || 'u1',
                    openingBalance: openingBalanceNum,
                };
                const res = await shiftsApi.open(data);
                setShift(res);
                onOpen();
            } catch (err) {
                showToast(t.shift_open_failed || 'Failed to open shift', 'error');
            } finally {
                setLoading(false);
            }
        };

        const addAmount = (amount: number) => {
            const current = parseFloat(openingBalance) || 0;
            setOpeningBalance((current + amount).toString());
        };

        const isOpeningBalanceValid = (value: string): boolean => {
            const num = parseFloat(value);
            return Number.isFinite(num) && num >= 0;
        };

        return (
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="fixed inset-0 z-[500] flex items-center justify-center overflow-y-auto p-2 md:p-4"
            >
                <div className="absolute inset-0 bg-[#020617]/95 " />

                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl opacity-50" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl opacity-50" />

                <motion.div
                    initial={{ y: 40, opacity: 0, scale: 0.95 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    className="relative w-full max-w-4xl bg-card shadow-[0_32px_128px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col md:flex-row rounded-[2rem] lg:rounded-[3rem] max-h-[calc(100dvh-1rem)]"
                >
                    {/* Left Side: Branding & Info */}
                    <div className="md:w-5/12 bg-primary p-5 lg:p-8 flex flex-col justify-between relative overflow-hidden shrink-0">
                        {/* Subtle Background Pattern */}
                        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -mr-40 -mt-40 opacity-30" />
                        <div className="absolute bottom-0 left-0 w-40 h-40 bg-black/10 rounded-full -ml-20 -mb-20 opacity-20" />

                        <div className="relative z-10">
                            <div className="w-14 h-14 lg:w-20 lg:h-20 bg-white/20 rounded-[2rem] flex items-center justify-center mb-4 lg:mb-8 shadow-inner border border-white/20 ">
                                <Lock className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
                            </div>
                            <h2 className="text-2xl lg:text-4xl font-black text-white leading-tight mb-3 lg:mb-4 uppercase tracking-tighter">
                                {isRTL ? 'وردية جديدة' : 'Safe Lock'}
                            </h2>
                            <p className="text-white/80 text-sm lg:text-base font-medium leading-relaxed max-w-[90%]">
                                {t.open_shift_message || 'Initialize the POS system by declaring your starting cash drawer balance.'}
                            </p>
                        </div>

                        <div className="relative z-10 space-y-3 lg:space-y-4 mt-5 md:mt-8">
                            <div className="flex items-center gap-3 lg:gap-4 p-3 lg:p-5 bg-black/20 rounded-2xl border border-white/10 shadow-sm ">
                                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                                    <User className="w-6 h-6 text-white" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-black text-white/60 uppercase tracking-[0.2em]">{isRTL ? 'الموظف' : 'OPERATOR'}</p>
                                    <p className="text-base font-black text-white uppercase truncate">{user?.username || user?.name || 'GUEST MANAGER'}</p>
                                </div>
                            </div>
                            <div className="pt-5 border-t border-white/10">
                                <p className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">Coduis Zen Production v1.2</p>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Input & Actions */}
                    <div className="md:w-7/12 p-5 md:p-8 flex min-h-0 flex-col justify-center bg-card border-l border-border/20 overflow-y-auto pos-scroll">
                        <div className="mb-5 lg:mb-8 text-center md:text-left">
                            <h3 className="text-xs lg:text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-3 lg:mb-6">
                                {isRTL ? 'رصيد الافتتاح' : 'DECLARE STARTING CASH'}
                            </h3>
                            <div className="relative">
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300 dark:text-slate-600">EGP</span>
                                <input
                                    type="number"
                                    value={openingBalance}
                                    onChange={(e) => setOpeningBalance(e.target.value)}
                                    className="w-full py-4 lg:py-8 pl-20 lg:pl-24 pr-5 lg:pr-8 bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-3xl text-3xl lg:text-5xl font-black text-slate-900 dark:text-white focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all text-left tabular-nums outline-none shadow-inner"
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {/* Quick Presets */}
                        <div className="grid grid-cols-3 gap-3 lg:gap-4 mb-5 lg:mb-8">
                            {[100, 200, 500].map(amt => (
                                <button
                                    key={amt}
                                    onClick={() => addAmount(amt)}
                                    className="py-3 lg:py-4 px-2 rounded-2xl bg-card border-2 border-border/30 text-base lg:text-lg font-black text-muted hover:border-primary hover:text-primary transition-all active:scale-95 shadow-sm"
                                >
                                    +{amt}
                                </button>
                            ))}
                        </div>

<button
                            onClick={handleOpenShift}
                            disabled={loading || !isOpeningBalanceValid(openingBalance)}
                            className="w-full py-4 lg:py-6 mt-auto bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-3xl font-black text-base lg:text-xl flex items-center justify-center gap-3 lg:gap-4 transition-all active:scale-[0.98] shadow-[0_8px_30px_rgba(var(--primary-rgb),0.3)]"
                        >
                            {loading ? (
                                <div className="w-7 h-7 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Unlock className="w-6 h-6" />
                                    <span>{isRTL ? 'فتح الوردية' : 'UNLOCK SYSTEM'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        );
    }

    return null;
};
