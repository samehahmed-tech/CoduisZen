import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, 
  ChevronLeft, 
  X, 
  ArrowRight, 
  CheckCircle2, 
  UtensilsCrossed, 
  Clock,
  Heart,
  CreditCard,
  User
} from 'lucide-react';
import { useMenuStore } from '../../stores/useMenuStore';
import { useOrderStore } from '../../stores/useOrderStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { OrderType, OrderStatus, MenuItem, PaymentMethod } from '../../types';
import { translations } from '../../services/translations';

// Import New Kiosk Components
import KioskCategoryRail from './KioskCategoryRail';
import KioskItemCard from './KioskItemCard';
import KioskModifierModal from './KioskModifierModal';

// Import Kiosk CSS
import '../../styles/layout/kiosk.css';

type KioskStep = 'WELCOME' | 'MENU' | 'SUMMARY' | 'PAYMENT' | 'SUCCESS';

const SelfOrderingKiosk: React.FC = () => {
  const [step, setStep] = useState<KioskStep>('WELCOME');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [lastOrderNumber, setLastOrderNumber] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [orderError, setOrderError] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const { categories, fetchMenu } = useMenuStore();
  const { 
    activeCart, 
    addToCart, 
    removeFromCart, 
    updateCartItemQuantity, 
    clearCart, 
    placeOrder,
    setOrderMode
  } = useOrderStore();
  const { settings } = useAuthStore();

  const lang = settings.language || 'en';
  const t = translations[lang];
  const isAr = lang === 'ar';
  const tr = (en: string, ar: string) => isAr ? ar : en;
  const currency = settings.currencySymbol || (lang === 'ar' ? 'ج.م' : 'EGP');

  useEffect(() => {
    fetchMenu(true);
    setOrderMode(OrderType.KIOSK);
  }, [fetchMenu, setOrderMode]);

  const currentCategories = useMemo(() => 
    (categories || []).filter(c => c.isActive !== false), 
  [categories]);

  useEffect(() => {
    if (currentCategories.length > 0 && !activeCategory) {
      setActiveCategory(currentCategories[0].id);
    }
  }, [currentCategories, activeCategory]);

  const cartTotal = useMemo(() => 
    activeCart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
  [activeCart]);

  const handleStart = () => {
    clearCart();
    setStep('MENU');
    setPaymentMethod(null);
    setOrderError('');
    setIsPlacingOrder(false);
  };

  const handleAddToCart = (item: MenuItem, selectedModifiers: any[], quantity: number) => {
    addToCart({ 
      ...item, 
      cartId: Math.random().toString(36).substring(7), 
      quantity,
      selectedModifiers,
      course: 'KIOSK'
    } as any);
    setSelectedItem(null);
  };

  const handlePlaceOrder = async (method: PaymentMethod) => {
    if (activeCart.length === 0 || isPlacingOrder) return;
    setPaymentMethod(method);
    setOrderError('');
    setIsPlacingOrder(true);
    try {
      const order = {
        id: Math.random().toString(36).substring(7),
        type: OrderType.KIOSK,
        branchId: settings.activeBranchId || 'b1',
        items: activeCart,
        status: OrderStatus.PENDING,
        subtotal: cartTotal,
        tax: cartTotal * 0.14,
        total: cartTotal * 1.14,
        paymentMethod: method,
        createdAt: new Date(),
      };
      const result = await placeOrder(order as any);
      setLastOrderNumber(result.orderNumber || 0);
      setStep('SUCCESS');
    } catch {
      setOrderError(tr('Could not send your order. Please ask a cashier for help.', 'تعذر إرسال الطلب. من فضلك اطلب مساعدة الكاشير.'));
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="kiosk-screen" dir={isAr ? 'rtl' : 'ltr'}>
      <AnimatePresence mode="wait">
        {step === 'WELCOME' && (
          <motion.div 
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full flex flex-col items-center justify-center relative p-6 sm:p-8"
            onClick={handleStart}
          >
            {/* Background Decor */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="kiosk-bg-glow top-[-10%] left-[-10%] bg-indigo-600" />
              <div className="kiosk-bg-glow bottom-[-10%] right-[-10%] bg-rose-600" />
            </div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="z-10 text-center"
            >
              <div className="mb-8 inline-flex p-6 rounded-[32px] bg-white/5 border border-white/10 backdrop-blur-3xl shadow-2xl">
                <UtensilsCrossed size={72} className="text-indigo-400" />
              </div>
              <h1 className="kiosk-brand mb-6">
                Resto<span className="text-indigo-500">Flow</span>
              </h1>
              <p className="kiosk-subtitle mb-12 max-w-lg mx-auto">
                {tr('Choose your meal and send it straight to the kitchen.', 'اختار وجبتك والطلب يروح للمطبخ مباشرة.')}
              </p>

              <motion.div
                animate={{ scale: [1, 1.05, 1], boxShadow: ['0 20px 50px rgba(79,70,229,0.3)', '0 20px 80px rgba(79,70,229,0.5)', '0 20px 50px rgba(79,70,229,0.3)'] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="inline-flex min-h-20 items-center gap-4 bg-indigo-600 px-8 py-5 sm:px-12 sm:py-6 rounded-[28px] text-2xl sm:text-3xl font-black shadow-2xl active:scale-95 transition-transform"
              >
                {t.kiosk_welcome || 'Tap to Start'}
                <ArrowRight size={34} strokeWidth={3} className={isAr ? 'rotate-180' : ''} />
              </motion.div>
            </motion.div>
          </motion.div>
        )}

        {step === 'MENU' && (
          <motion.div 
            key="menu"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="h-full flex flex-col pt-5 sm:pt-8 lg:pt-10"
          >
            {/* Header */}
            <header className="kiosk-shell mb-5 flex items-center justify-between gap-4">
              <div>
                <motion.h2 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="kiosk-heading"
                >
                  {t.kiosk_select_category || 'Our Menu'}
                </motion.h2>
                <div className="flex items-center gap-2 text-slate-400 mt-2 font-bold uppercase text-xs sm:text-sm">
                  <Clock size={20} className="text-indigo-400" />
                  <span>{tr('Fresh ingredients - prepared to order', 'مكونات طازة - تحضير حسب الطلب')}</span>
                </div>
              </div>
              <div className="hidden sm:flex h-16 w-16 lg:h-20 lg:w-20 rounded-3xl glass-panel items-center justify-center border-white/10">
                <Heart size={32} className="text-rose-500 fill-rose-500/20" />
              </div>
            </header>

            {/* Main Content */}
            <div className="kiosk-shell flex-1 flex flex-col lg:flex-row gap-5 lg:gap-8 min-h-0">
              <KioskCategoryRail 
                categories={currentCategories} 
                activeCategoryId={activeCategory}
                onSelectCategory={setActiveCategory}
                lang={lang}
              />

              <div className="flex-1 kiosk-grid overflow-y-auto pb-36 lg:pb-12 no-scrollbar">
                {currentCategories.find(c => c.id === activeCategory)?.items.map((item) => (
                  <KioskItemCard 
                    key={item.id}
                    item={item}
                    onAdd={setSelectedItem}
                    lang={lang}
                    currency={currency}
                  />
                ))}
              </div>
            </div>

            {/* Footer / Cart Strip */}
            <AnimatePresence>
              {activeCart.length > 0 && (
                <motion.div 
                  initial={{ y: 200 }}
                  animate={{ y: 0 }}
                  exit={{ y: 200 }}
                  className="kiosk-cart-bar glass-panel border-t-0 rounded-t-[32px] sm:rounded-t-[44px] p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 z-20 shadow-[0_-20px_60px_rgba(0,0,0,0.5)]"
                >
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className={`flex ${isAr ? 'space-x-reverse' : ''} -space-x-4`}>
                      {activeCart.slice(0, 4).map((item, idx) => (
                        <div key={idx} className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-600 border-4 border-[#0a0a0b] flex items-center justify-center text-3xl shadow-2xl relative">
                           {item.image ? <img src={item.image} className="w-full h-full object-cover rounded-[20px]" /> : '🍱'}
                        </div>
                      ))}
                      {activeCart.length > 4 && (
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-800 border-4 border-[#0a0a0b] flex items-center justify-center font-black text-xl shadow-2xl">
                          +{activeCart.length - 4}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-slate-500 font-black uppercase tracking-widest text-xs mb-1">{tr('Your selection', 'اختياراتك')}</p>
                      <p className="text-2xl sm:text-3xl font-black">{activeCart.length} {tr('items', 'صنف')}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className={isAr ? 'text-right' : 'text-left lg:text-right'}>
                       <p className="text-slate-500 font-black uppercase tracking-widest text-xs mb-1">{tr('Estimated Total', 'الإجمالي التقريبي')}</p>
                       <p className="text-3xl sm:text-4xl font-black text-indigo-400">{cartTotal.toLocaleString()} {currency}</p>
                    </div>
                    <button
                      onClick={() => setStep('SUMMARY')}
                      className="bg-indigo-600 hover:bg-indigo-500 h-16 sm:h-20 px-6 sm:px-10 rounded-[24px] text-xl sm:text-2xl font-black flex items-center gap-3 transition-all shadow-[0_20px_50px_rgba(79,70,229,0.3)]"
                    >
                      {t.checkout || 'View Bag'}
                      <ChevronRight size={32} strokeWidth={3} className={isAr ? 'rotate-180' : ''} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {step === 'SUMMARY' && (
           <motion.div 
             key="summary"
             initial={{ opacity: 0, y: 50 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: -50 }}
             className="h-full flex items-center justify-center p-4 sm:p-8 lg:p-12"
           >
             <div className="w-full max-w-6xl h-full glass-panel rounded-[36px] lg:rounded-[60px] flex flex-col overflow-hidden relative">
                <div className="p-5 sm:p-8 lg:p-12 border-b border-white/10 flex items-center justify-between gap-4">
                   <h2 className="kiosk-heading">{t.kiosk_order_summary || 'Review Order'}</h2>
                   <button 
                     onClick={() => setStep('MENU')}
                     className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl glass-panel flex items-center justify-center text-slate-400 active:rotate-90 transition-transform"
                   >
                     <X size={32} />
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 sm:p-8 lg:p-12 space-y-4 sm:space-y-6 no-scrollbar">
                   {activeCart.map((item) => (
                     <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={item.cartId} 
                        className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 bg-white/[0.03] p-4 sm:p-6 rounded-[28px] border border-white/5 hover:bg-white/[0.05] transition-all"
                      >
                        <div className="w-full sm:w-24 h-36 sm:h-24 rounded-2xl bg-slate-900 overflow-hidden shadow-xl">
                           {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-5xl">🍱</div>}
                        </div>
                        <div className="flex-1">
                           <h3 className="text-xl sm:text-2xl font-black mb-2">{lang === 'ar' ? (item.nameAr || item.name) : item.name}</h3>
                           <p className="text-indigo-400 text-xl font-black">{item.price} {currency}</p>
                           {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                             <div className="flex flex-wrap gap-2 mt-3">
                                {item.selectedModifiers.map((m: any, idx: number) => (
                                  <span key={idx} className="text-xs font-bold px-3 py-1 bg-white/5 rounded-full text-slate-400">
                                    + {lang === 'ar' ? (m.nameAr || m.name) : m.name}
                                  </span>
                                ))}
                             </div>
                           )}
                        </div>
                        <div className="flex items-center gap-4 bg-black/40 p-3 rounded-2xl border border-white/10 px-4">
                           <button 
                             onClick={() => updateCartItemQuantity(item.cartId, -1)}
                             className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl font-bold active:scale-90"
                           >–</button>
                           <span className="text-3xl font-black min-w-[48px] text-center">{item.quantity}</span>
                           <button 
                             onClick={() => updateCartItemQuantity(item.cartId, 1)}
                             className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl font-bold active:scale-90"
                           >+</button>
                        </div>
                        <button 
                          onClick={() => removeFromCart(item.cartId)}
                          className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center active:scale-90 transition-transform"
                        >
                          <X size={28} />
                        </button>
                     </motion.div>
                   ))}
                </div>

                <div className="p-5 sm:p-8 lg:p-10 bg-white/[0.01] border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <button 
                     onClick={() => setStep('MENU')}
                     className="h-[4.5rem] sm:h-20 rounded-[24px] border-2 border-white/10 text-xl sm:text-2xl font-black flex items-center justify-center gap-3 hover:bg-white/5 transition-all"
                   >
                     <ChevronLeft size={40} strokeWidth={3} />
                     {t.kiosk_back || 'Add More'}
                   </button>
                   <button 
                     onClick={() => setStep('PAYMENT')}
                     className="h-[4.5rem] sm:h-20 rounded-[24px] bg-indigo-600 text-xl sm:text-2xl font-black flex items-center justify-center gap-3 shadow-[0_20px_50px_rgba(79,70,229,0.3)] active:scale-95 transition-all"
                   >
                     {t.checkout || 'Next'}
                     <ArrowRight size={40} strokeWidth={3} />
                   </button>
                </div>
             </div>
           </motion.div>
        )}

        {step === 'PAYMENT' && (
          <motion.div 
            key="payment"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="h-full flex items-center justify-center p-4 sm:p-8 lg:p-12"
          >
            <div className="w-full max-w-4xl glass-panel rounded-[36px] lg:rounded-[60px] p-6 sm:p-10 lg:p-14 flex flex-col items-center text-center">
              <h2 className="kiosk-heading mb-4">{tr('Choose Payment', 'اختر طريقة الدفع')}</h2>
              <p className="kiosk-subtitle mb-10">{tr('How would you like to pay for your order?', 'تحب تدفع الطلب إزاي؟')}</p>
              {orderError && (
                <div className="mb-8 w-full rounded-[28px] border border-rose-500/30 bg-rose-500/10 px-8 py-5 text-xl font-black text-rose-300">
                  {orderError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full mb-10">
                <button 
                  onClick={() => handlePlaceOrder(PaymentMethod.CASH)}
                  disabled={isPlacingOrder}
                  className="glass-panel-hover glass-panel p-6 sm:p-8 rounded-[32px] flex flex-col items-center gap-5 group"
                >
                  <div className="h-24 w-24 rounded-[28px] bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <User size={58} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-2xl sm:text-3xl font-black mb-2">{tr('Pay at Counter', 'الدفع عند الكاشير')}</p>
                    <p className="text-slate-400 font-bold">{tr('Fast & simple', 'سريع وبسيط')}</p>
                  </div>
                </button>

                <button 
                  onClick={() => handlePlaceOrder(PaymentMethod.VISA)}
                  disabled={isPlacingOrder}
                  className="glass-panel-hover glass-panel p-6 sm:p-8 rounded-[32px] flex flex-col items-center gap-5 group"
                >
                  <div className="h-24 w-24 rounded-[28px] bg-indigo-500/10 text-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CreditCard size={58} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-2xl sm:text-3xl font-black mb-2">{tr('Credit Card', 'بطاقة بنكية')}</p>
                    <p className="text-slate-400 font-bold">{tr('Card terminal payment', 'دفع عبر ماكينة البطاقة')}</p>
                  </div>
                </button>
              </div>

              <button 
                onClick={() => setStep('SUMMARY')}
                className="text-slate-400 font-black text-2xl flex items-center gap-3 active:scale-95 transition-transform"
              >
                <ChevronLeft size={24} />
                {tr('Back to Summary', 'الرجوع للملخص')}
              </button>
            </div>
          </motion.div>
        )}

        {step === 'SUCCESS' && (
          <motion.div 
            key="success"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full flex flex-col items-center justify-center text-center p-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1.25 }}
              transition={{ type: "spring", stiffness: 260, damping: 15 }}
              className="mb-16 inline-flex p-16 rounded-full bg-emerald-500 text-white shadow-[0_0_100px_rgba(16,185,129,0.3)]"
            >
              <CheckCircle2 size={160} strokeWidth={2.5} />
            </motion.div>

            <h2 className="kiosk-brand mb-6">{t.kiosk_checkout_success || 'Order Placed!'}</h2>
            <p className="text-xl sm:text-2xl text-slate-400 mb-10 max-w-2xl mx-auto font-medium">{tr("Please take your receipt. We'll call your order number when it's ready.", 'من فضلك خذ الإيصال. سننادي رقم الطلب عند التجهيز.')}</p>

            <div className="glass-panel p-8 sm:p-12 rounded-[40px] mb-12 w-full max-w-[500px] border-white/20">
               <p className="text-slate-500 font-black uppercase tracking-[0.3em] mb-4 text-sm">{t.kiosk_order_number || 'Your Order ID'}</p>
               <p className="text-7xl sm:text-9xl leading-none font-black text-indigo-500 drop-shadow-2xl">#{lastOrderNumber?.toString().padStart(3, '0')}</p>
            </div>

            <button 
              onClick={handleStart}
              className="h-20 px-12 rounded-[28px] bg-white text-black text-2xl sm:text-3xl font-black shadow-2xl hover:scale-105 active:scale-95 transition-all"
            >
              {t.kiosk_finish || 'Done'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modifier Modal Integration */}
      <AnimatePresence>
        {selectedItem && (
          <KioskModifierModal 
            item={selectedItem}
            lang={lang}
            currency={currency}
            onClose={() => setSelectedItem(null)}
            onConfirm={handleAddToCart}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SelfOrderingKiosk;
