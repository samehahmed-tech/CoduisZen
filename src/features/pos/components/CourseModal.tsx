import React, { useState, useEffect } from 'react';
import { X, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CourseModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentCourse: string | undefined;
    onSave: (course: string | undefined) => void;
    lang: 'en' | 'ar';
}

const COURSES = ['APPETIZER', 'MAIN', 'DESSERT', 'DRINKS'];

const CourseModal: React.FC<CourseModalProps> = ({ isOpen, onClose, currentCourse, onSave, lang }) => {
    const isRTL = lang === 'ar';
    const [selectedCourse, setSelectedCourse] = useState<string | undefined>(currentCourse);

    useEffect(() => {
        if (isOpen) setSelectedCourse(currentCourse);
    }, [isOpen, currentCourse]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-2 sm:p-3">
                <div className="absolute inset-0" onClick={onClose} />
                <motion.div
                    initial={{ y: "100%", scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: "100%", scale: 0.95 }} transition={{ type: "spring", duration: 0.15 }}
                    className={`relative w-full max-w-sm bg-card rounded-[2rem] shadow-2xl border border-border/20 overflow-hidden flex flex-col max-h-[calc(100dvh-1rem)] ${isRTL ? 'text-right' : 'text-left'}`}
                >
                    {/* Header */}
                    <div className="relative shrink-0 p-5 border-b border-border/10 bg-elevated/40 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-inner">
                            <Utensils className="text-amber-500" size={24} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-main uppercase tracking-widest leading-tight">
                                {isRTL ? 'تحديد دورة التقديم' : 'Kitchen Course'}
                            </h3>
                            <p className="text-[10px] font-bold text-muted uppercase mt-1 tracking-widest">
                                {isRTL ? 'ترتيب تحضير الأطباق' : 'Firing sequence'}
                            </p>
                        </div>
                        <button onClick={onClose} className={`absolute top-5 ${isRTL ? 'left-5' : 'right-5'} w-10 h-10 flex items-center justify-center text-muted hover:text-main hover:bg-elevated rounded-xl transition-all border border-transparent hover:border-border/20 active:scale-95`}>
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 grid grid-cols-2 gap-3 bg-card">
                        {COURSES.map(course => (
                            <button
                                key={course}
                                onClick={() => setSelectedCourse(course)}
                                className={`h-14 rounded-2xl border-2 font-black tracking-widest uppercase text-xs transition-all active:scale-95 flex items-center justify-center ${selectedCourse === course ? 'border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'border-border/20 text-muted hover:bg-elevated hover:text-main hover:border-border/40 bg-elevated/20'}`}
                            >
                                {course}
                            </button>
                        ))}
                        <button
                            onClick={() => setSelectedCourse(undefined)}
                            className={`col-span-2 mt-2 h-14 rounded-2xl border border-dashed font-black tracking-widest uppercase text-xs transition-all active:scale-95 flex items-center justify-center ${!selectedCourse ? 'border-rose-500 bg-rose-500/10 text-rose-500' : 'border-border/40 text-muted hover:bg-elevated/80 hover:text-main'}`}
                        >
                            {isRTL ? 'مسح (تحضير مباشر)' : 'Clear (Fire Immediately)'}
                        </button>
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 p-5 border-t border-border/10 bg-elevated/40 flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 h-14 rounded-2xl border border-border/20 text-main font-black uppercase tracking-widest text-xs hover:bg-elevated bg-card shadow-sm active:scale-95 transition-all"
                        >
                            {isRTL ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            onClick={() => onSave(selectedCourse)}
                            className="flex-1 h-14 rounded-2xl bg-amber-500 text-amber-950 font-black uppercase tracking-widest text-xs hover:bg-amber-600 active:scale-[0.98] transition-all shadow-lg shadow-amber-500/20 border border-amber-400"
                        >
                            {isRTL ? 'حفظ' : 'Save'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default CourseModal;
