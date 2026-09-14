import React, { useEffect, useRef } from 'react';
import { X, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SeatModalProps {
    isOpen: boolean;
    onClose: () => void;
    seatNumber: number | undefined;
    onSeatChange: (val: number | undefined) => void;
    onSave: () => void;
    lang: 'en' | 'ar';
}

const SeatModal: React.FC<SeatModalProps> = ({ isOpen, onClose, seatNumber, onSeatChange, onSave, lang }) => {
    const isRTL = lang === 'ar';
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-2 sm:p-3">
                <div className="absolute inset-0" onClick={onClose} />
                <motion.div
                    initial={{ y: "100%", scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: "100%", scale: 0.95 }} transition={{ type: "spring", duration: 0.15 }}
                    className={`relative w-full max-w-xs bg-card rounded-[2rem] shadow-2xl border border-border/20 overflow-hidden flex flex-col max-h-[calc(100dvh-1rem)] ${isRTL ? 'text-right' : 'text-left'}`}
                >
                    {/* Header */}
                    <div className="relative shrink-0 p-5 border-b border-border/10 bg-elevated/40 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20 shadow-inner">
                                <User className="text-indigo-500" size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-main uppercase tracking-widest leading-tight">
                                    {isRTL ? 'تحديد المقعد' : 'Assign Seat'}
                                </h3>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-muted hover:text-main hover:bg-elevated rounded-xl transition-all border border-transparent hover:border-border/20 active:scale-95">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 sm:p-8 bg-card flex flex-col items-center">
                        <div className="w-full bg-elevated/40 border border-border/20 rounded-[1.5rem] shadow-inner p-4 flex items-center h-24 group-focus-within:border-indigo-500/50 transition-all">
                            <input
                                ref={inputRef}
                                type="number"
                                className="w-full h-full bg-transparent text-main px-4 text-center font-black text-5xl outline-none placeholder:text-muted/20 tabular-nums"
                                placeholder="1"
                                value={seatNumber || ''}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (isNaN(val)) onSeatChange(undefined);
                                    else if (val >= 0) onSeatChange(val);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') onSave();
                                    if (e.key === 'Escape') onClose();
                                }}
                                min="1"
                            />
                        </div>
                        <p className="mt-4 text-[10px] font-black text-muted/60 uppercase tracking-[0.2em]">
                            {isRTL ? 'أدخل رقم المقعد' : 'ENTER SEAT NUMBER'}
                        </p>
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 p-4 sm:p-6 border-t border-border/10 bg-elevated/40 flex items-center gap-3 sm:gap-4">
                        <button
                            onClick={onClose}
                            className="flex-1 h-16 rounded-2xl border border-border/20 text-muted font-black uppercase tracking-[0.2em] text-[10px] hover:bg-elevated hover:text-main bg-card shadow-sm active:scale-95 transition-all"
                        >
                            {isRTL ? 'إلغاء' : 'CANCEL'}
                        </button>
                        <button
                            onClick={onSave}
                            className="flex-1 h-16 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-[0.2em] text-[10px] hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-xl shadow-indigo-600/20 border-b-4 border-indigo-800/40"
                        >
                            {isRTL ? 'تأكيد' : 'CONFIRM'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default SeatModal;
