import React, { useState, useEffect } from 'react';
import { User, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TakeawayNameModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialName: string;
    onSave: (name: string) => void;
    lang: string;
}

const TakeawayNameModal: React.FC<TakeawayNameModalProps> = ({ isOpen, onClose, initialName, onSave, lang }) => {
    const isRTL = lang === 'ar';
    const [name, setName] = useState(initialName);

    useEffect(() => {
        if (isOpen) setName(initialName);
    }, [isOpen, initialName]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(name.trim());
        onClose();
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 theme-modal-overlay flex items-center justify-center z-[120] p-2 sm:p-3"
                dir={isRTL ? 'rtl' : 'ltr'}
            >
                <div className="absolute inset-0" onClick={onClose} />
                <motion.div
                    initial={{ y: "100%", scale: 1 }} animate={{ y: 0, scale: 1 }} exit={{ y: "100%", scale: 1 }}
                    transition={{ type: "spring", duration: 0.15 }}
                    className="theme-modal-content w-full max-w-sm relative z-10 overflow-hidden max-h-[calc(100dvh-1rem)]"
                >
                    <div className="p-6 text-center space-y-4">
                        <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-full mx-auto flex items-center justify-center">
                            <User size={32} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-main uppercase tracking-widest">{isRTL ? 'تسمية الأوردر' : 'Order Tag'}</h2>
                            <p className="text-xs font-bold text-muted mt-1">{isRTL ? 'تسجيل اسم لتسهيل النداء' : 'Enter a name to call when ready'}</p>
                        </div>

                        <input
                            autoFocus
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                            placeholder={isRTL ? "مثال: أستاذ أحمد..." : "e.g. John Doe..."}
                            className="w-full h-12 bg-elevated border border-border/20 rounded-xl px-4 text-center font-bold text-main outline-none focus:border-blue-500/50 transition-colors"
                        />

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={onClose}
                                className="flex-1 h-12 rounded-xl bg-elevated hover:bg-elevated/80 border border-border/20 text-muted font-bold transition-colors"
                            >
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex-1 h-12 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold transition-colors shadow-lg shadow-blue-500/20"
                            >
                                {isRTL ? 'حفظ واسناد' : 'Set Name'}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default TakeawayNameModal;
