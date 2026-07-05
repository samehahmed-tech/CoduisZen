import React from 'react';
import { X, Clock, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface HeldOrdersModalProps {
    isOpen: boolean;
    onClose: () => void;
    heldOrders: any[];
    onRecall: (index: number) => void;
    currencySymbol: string;
    lang: string;
}

const HeldOrdersModal: React.FC<HeldOrdersModalProps> = ({ isOpen, onClose, heldOrders, onRecall, currencySymbol, lang }) => {
    const isRTL = lang === 'ar';

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 theme-modal-overlay flex items-center justify-center z-[110] p-2 sm:p-3"
                dir={isRTL ? 'rtl' : 'ltr'}
            >
                <div className="absolute inset-0" onClick={onClose} />
                <motion.div
                    initial={{ y: "100%", scale: 1 }} animate={{ y: 0, scale: 1 }} exit={{ y: "100%", scale: 1 }}
                    transition={{ type: "spring", duration: 0.15 }}
                    className="theme-modal-content w-full sm:max-w-xl relative z-10 overflow-hidden flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1.5rem)]"
                >
                    <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between bg-elevated/40">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center text-slate-500">
                                <Clock size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-main uppercase tracking-widest">{isRTL ? 'الفواتير المعلقة' : 'Held Orders'}</h2>
                                <p className="text-xs font-bold text-muted">{heldOrders.length} {isRTL ? 'فواتير' : 'orders'}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-lg bg-elevated/50 flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 pos-scroll">
                        {heldOrders.length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center text-muted/50">
                                <ShoppingBag size={48} className="mb-4 opacity-50" />
                                <p className="text-sm font-bold uppercase tracking-widest">{isRTL ? 'لا توجد فواتير معلقة' : 'No Held Orders'}</p>
                            </div>
                        ) : (
                            heldOrders.map((order, index) => {
                                const total = order.cart.reduce((sum: number, item: any) => {
                                    const modPrice = (item.selectedModifiers || []).reduce((s: number, m: any) => s + (m.price || 0), 0);
                                    return sum + ((item.price + modPrice) * item.quantity);
                                }, 0);
                                
                                return (
                                    <button
                                        key={order.id || index}
                                        onClick={() => {
                                            onRecall(index);
                                            onClose();
                                        }}
                                        className="w-full bg-elevated/50 hover:bg-elevated/80 focus:bg-elevated/80 border border-border/10 p-4 rounded-2xl flex items-center justify-between group transition-colors text-left outline-none active:scale-[0.99]"
                                    >
                                        <div>
                                            <p className="text-sm font-black text-main mb-1 tracking-tight">
                                                {order.customerName || (isRTL ? `أوردر معلق #${index + 1}` : `Held Order #${index + 1}`)}
                                            </p>
                                            <p className="text-xs font-bold text-muted flex items-center gap-1.5 opacity-80">
                                                <ShoppingBag size={12} /> {order.cart.length} {isRTL ? 'أصناف' : 'items'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-base font-black text-primary tabular-nums tracking-tight">
                                                {total.toFixed(2)} <span className="text-[10px] opacity-70">{currencySymbol}</span>
                                            </p>
                                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mt-1 group-hover:text-primary transition-colors">
                                                {isRTL ? 'استدعاء الآن' : 'Recall Now'}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default HeldOrdersModal;
