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
  CreditCard,
  User,
  Sparkles,
  ShoppingBag,
  Flame,
  Plus,
  Minus
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
  const brandName = settings.restaurantName || 'RestoFlow';

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
  const cartQty = useMemo(
    () => activeCart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [activeCart]
  );
  const activeCategoryData = useMemo(
    () => currentCategories.find(c => c.id === activeCategory) || currentCategories[0],
    [activeCategory, currentCategories]
  );
  const activeItems = activeCategoryData?.items || [];
  const featuredItem = activeItems.find(item => item.image) || activeItems[0] || null;

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
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="z-10 text-center max-w-5xl"
            >
              <div className="mb-8 inline-flex p-6 rounded-[32px] kiosk-soft border border-primary/20 shadow-2xl">
                <UtensilsCrossed size={72} className="kiosk-accent" />
              </div>
              <h1 className="kiosk-brand mb-6">
                {brandName}
              </h1>
              <p className="kiosk-subtitle mb-12 max-w-lg mx-auto">
                {tr('Choose your meal and send it straight to the kitchen.', 'اختار وجبتك والطلب يروح للمطبخ مباشرة.')}
              </p>

              <motion.div
                animate={{ scale: [1, 1.035, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="inline-flex min-h-20 items-center gap-4 kiosk-btn-primary px-8 py-5 sm:px-12 sm:py-6 rounded-[28px] text-2xl sm:text-3xl active:scale-95"
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
            <header className="kiosk-shell mb-5 flex items-center justify-between gap-4">
              <div>
                <motion.h2 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="kiosk-heading"
                >
                  {brandName}
                </motion.h2>
                <div className="flex items-center gap-2 kiosk-muted mt-2 font-bold uppercase text-xs sm:text-sm">
                  <Clock size={20} className="kiosk-accent" />
                  <span>{tr('Fresh ingredients - prepared to order', 'مكونات طازة - تحضير حسب الطلب')}</span>
                </div>
              </div>
              <div className="hidden sm:flex h-16 min-w-44 lg:h-20 rounded-3xl glass-panel items-center justify-center gap-3 px-5">
                <ShoppingBag size={28} className="kiosk-accent" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] kiosk-muted">{tr('Bag', 'السلة')}</p>
                  <p className="text-xl font-black">{cartQty} / {cartTotal.toLocaleString()} {currency}</p>
                </div>
              </div>
            </header>

            <div className="kiosk-shell flex-1 grid grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)_24rem] xl:grid-cols-[14rem_minmax(0,1fr)_26rem] gap-5 lg:gap-6 min-h-0">
              <KioskCategoryRail 
                categories={currentCategories} 
                activeCategoryId={activeCategory}
                onSelectCategory={setActiveCategory}
                lang={lang}
              />

              <div className="min-h-0 overflow-y-auto pb-36 lg:pb-10 no-scrollbar">
                {featuredItem && (
                  <motion.button
                    type="button"
                    onClick={() => setSelectedItem(featuredItem)}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="kiosk-plate mb-5 grid min-h-[360px] w-full overflow-hidden rounded-[2.25rem] text-start lg:grid-cols-[minmax(0,1fr)_23rem]"
                  >
                    <div className="relative min-h-[360px]">
                      {featuredItem.image ? (
                        <img src={featuredItem.image} alt={featuredItem.name} className="absolute inset-0 h-full w-full object-cover opacity-75" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-8xl opacity-40">🍱</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/45 to-black/15" />
                      <div className="relative z-10 flex h-full max-w-xl flex-col justify-end p-6 md:p-8 text-white">
                        <div className="mb-4 flex w-max items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] backdrop-blur-md">
                          <Flame size={15} className="text-amber-300" />
                          {tr('Featured now', 'اختيار مميز')}
                        </div>
                        <h3 className="text-4xl font-black leading-none md:text-5xl">{isAr ? (featuredItem.nameAr || featuredItem.name) : featuredItem.name}</h3>
                        <p className="mt-3 max-w-md text-sm font-bold text-white/75 line-clamp-2">{isAr ? (featuredItem.descriptionAr || featuredItem.description) : featuredItem.description}</p>
                        <div className="mt-5 flex flex-wrap items-center gap-2">
                          {['30 cm', '45 cm', '60 cm'].map((size) => (
                            <span key={size} className="rounded-full bg-white/12 px-4 py-2 text-xs font-black text-white backdrop-blur-md">{size}</span>
                          ))}
                        </div>
                        <div className="mt-5 flex items-center gap-3">
                          <span className="rounded-2xl bg-white px-5 py-3 text-xl font-black text-black">{featuredItem.price} {currency}</span>
                          <span className="rounded-2xl bg-primary px-5 py-3 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-black/20">{tr('Customize', 'اختيارات')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="relative z-10 hidden flex-col justify-between border-l border-white/10 bg-black/28 p-5 backdrop-blur-md lg:flex">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/50">{tr('Fast choices', 'اختيارات سريعة')}</p>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          {[tr('Extra cheese', 'جبنة زيادة'), tr('No onion', 'بدون بصل'), tr('Spicy', 'حار'), tr('Sauce', 'صوص')].map((label, index) => (
                            <span key={label} className="rounded-2xl bg-white/10 px-3 py-4 text-center text-xs font-black text-white/85">
                              <span className="mb-2 block text-2xl">{['🧀', '🧅', '🌶️', '🥫'][index]}</span>
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-3xl bg-white p-4 text-black">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-black/45">{tr('Tap product', 'اضغط المنتج')}</p>
                        <p className="mt-1 text-xl font-black">{tr('Open full choices', 'افتح كل الاختيارات')}</p>
                      </div>
                    </div>
                  </motion.button>
                )}

                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] kiosk-muted">{tr('Category', 'القسم')}</p>
                    <h3 className="text-3xl font-black">{isAr ? (activeCategoryData?.nameAr || activeCategoryData?.name) : activeCategoryData?.name}</h3>
                  </div>
                  <p className="rounded-2xl kiosk-surface px-4 py-2 text-xs font-black kiosk-muted">{activeItems.length} {tr('items', 'صنف')}</p>
                </div>

                <div className="kiosk-grid">
                  {activeItems.map((item) => (
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

              <aside className="hidden min-h-0 lg:flex glass-panel rounded-[2rem] flex-col overflow-hidden">
                <div className="border-b border-border/50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] kiosk-muted">{tr('Current order', 'الطلب الحالي')}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <h3 className="text-2xl font-black">{cartQty} {tr('items', 'صنف')}</h3>
                    <span className="kiosk-accent text-2xl font-black">{cartTotal.toLocaleString()} {currency}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                  {activeCart.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center kiosk-muted">
                      <ShoppingBag size={56} className="mb-4 opacity-35" />
                      <p className="text-sm font-black uppercase tracking-widest">{tr('Your bag is empty', 'السلة فاضية')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeCart.map((item) => (
                        <div key={item.cartId} className="kiosk-surface rounded-2xl p-3">
                          <div className="flex items-center gap-3">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl kiosk-soft">
                              {item.image ? <img src={item.image} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl">🍱</div>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black">{isAr ? (item.nameAr || item.name) : item.name}</p>
                              <p className="text-xs font-black kiosk-accent">{item.price} {currency}</p>
                            </div>
                            <button onClick={() => removeFromCart(item.cartId)} className="h-9 w-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                              <X size={18} />
                            </button>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <button onClick={() => updateCartItemQuantity(item.cartId, -1)} className="h-10 w-10 rounded-xl bg-card border border-border flex items-center justify-center">
                              <Minus size={18} />
                            </button>
                            <span className="text-xl font-black tabular-nums">{item.quantity}</span>
                            <button onClick={() => updateCartItemQuantity(item.cartId, 1)} className="h-10 w-10 rounded-xl kiosk-btn-primary flex items-center justify-center">
                              <Plus size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-border/50 p-5">
                  <button
                    onClick={() => setStep('SUMMARY')}
                    disabled={activeCart.length === 0}
                    className="kiosk-btn-primary flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-xl disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {t.checkout || tr('Checkout', 'إكمال الطلب')}
                    <ChevronRight size={28} strokeWidth={3} className={isAr ? 'rotate-180' : ''} />
                  </button>
                </div>
              </aside>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-app to-transparent lg:hidden" />
            <div className="kiosk-cart-bar glass-panel border-t-0 rounded-t-[32px] p-4 lg:hidden z-20">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="kiosk-muted text-[10px] font-black uppercase tracking-widest">{tr('Your selection', 'اختياراتك')}</p>
                  <p className="text-2xl font-black">{cartQty} / <span className="kiosk-accent">{cartTotal.toLocaleString()} {currency}</span></p>
                </div>
                <button
                  onClick={() => setStep('SUMMARY')}
                  disabled={activeCart.length === 0}
                  className="kiosk-btn-primary h-16 rounded-2xl px-6 text-lg disabled:opacity-35"
                >
                  {t.checkout || 'View Bag'}
                </button>
              </div>
            </div>
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
                <div className="p-5 sm:p-8 lg:p-12 border-b border-border/50 flex items-center justify-between gap-4">
                   <h2 className="kiosk-heading">{t.kiosk_order_summary || 'Review Order'}</h2>
                   <button 
                     onClick={() => setStep('MENU')}
                     className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl glass-panel flex items-center justify-center kiosk-muted active:rotate-90 transition-transform"
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
                     className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 kiosk-surface p-4 sm:p-6 rounded-[28px] hover:border-primary/25 transition-all"
                      >
                        <div className="w-full sm:w-24 h-36 sm:h-24 rounded-2xl kiosk-surface overflow-hidden shadow-xl">
                           {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-5xl">🍱</div>}
                        </div>
                        <div className="flex-1">
                           <h3 className="text-xl sm:text-2xl font-black mb-2">{lang === 'ar' ? (item.nameAr || item.name) : item.name}</h3>
                           <p className="kiosk-accent text-xl font-black">{item.price} {currency}</p>
                           {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                             <div className="flex flex-wrap gap-2 mt-3">
                                {item.selectedModifiers.map((m: any, idx: number) => (
                                  <span key={idx} className="text-xs font-bold px-3 py-1 kiosk-soft rounded-full kiosk-accent">
                                    + {lang === 'ar' ? (m.nameAr || m.name) : m.name}
                                  </span>
                                ))}
                             </div>
                           )}
                        </div>
                        <div className="flex items-center gap-4 kiosk-surface p-3 rounded-2xl px-4">
                           <button 
                             onClick={() => updateCartItemQuantity(item.cartId, -1)}
                             className="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-2xl font-bold active:scale-90"
                           >–</button>
                           <span className="text-3xl font-black min-w-[48px] text-center">{item.quantity}</span>
                           <button 
                             onClick={() => updateCartItemQuantity(item.cartId, 1)}
                             className="w-12 h-12 rounded-2xl kiosk-btn-primary flex items-center justify-center text-2xl active:scale-90"
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

                <div className="p-5 sm:p-8 lg:p-10 bg-elevated/20 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <button 
                     onClick={() => setStep('MENU')}
                     className="h-[4.5rem] sm:h-20 rounded-[24px] border border-border text-xl sm:text-2xl font-black flex items-center justify-center gap-3 hover:bg-elevated transition-all"
                   >
                     <ChevronLeft size={40} strokeWidth={3} />
                     {t.kiosk_back || 'Add More'}
                   </button>
                   <button 
                     onClick={() => setStep('PAYMENT')}
                     className="h-[4.5rem] sm:h-20 rounded-[24px] kiosk-btn-primary text-xl sm:text-2xl flex items-center justify-center gap-3"
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
                    <p className="kiosk-muted font-bold">{tr('Fast & simple', 'سريع وبسيط')}</p>
                  </div>
                </button>

                <button 
                  onClick={() => handlePlaceOrder(PaymentMethod.VISA)}
                  disabled={isPlacingOrder}
                  className="glass-panel-hover glass-panel p-6 sm:p-8 rounded-[32px] flex flex-col items-center gap-5 group"
                >
                  <div className="h-24 w-24 rounded-[28px] kiosk-soft kiosk-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CreditCard size={58} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-2xl sm:text-3xl font-black mb-2">{tr('Credit Card', 'بطاقة بنكية')}</p>
                    <p className="kiosk-muted font-bold">{tr('Card terminal payment', 'دفع عبر ماكينة البطاقة')}</p>
                  </div>
                </button>
              </div>

              <button 
                onClick={() => setStep('SUMMARY')}
                className="kiosk-muted font-black text-2xl flex items-center gap-3 active:scale-95 transition-transform"
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
              className="mb-16 inline-flex p-16 rounded-full bg-emerald-500 text-white shadow-[0_0_80px_rgba(16,185,129,0.25)]"
            >
              <CheckCircle2 size={160} strokeWidth={2.5} />
            </motion.div>

            <h2 className="kiosk-brand mb-6">{t.kiosk_checkout_success || 'Order Placed!'}</h2>
            <p className="text-xl sm:text-2xl kiosk-muted mb-10 max-w-2xl mx-auto font-semibold">{tr("Please take your receipt. We'll call your order number when it's ready.", 'من فضلك خذ الإيصال. سننادي رقم الطلب عند التجهيز.')}</p>

            <div className="glass-panel p-8 sm:p-12 rounded-[40px] mb-12 w-full max-w-[500px]">
               <p className="kiosk-muted font-black uppercase tracking-[0.3em] mb-4 text-sm">{t.kiosk_order_number || 'Your Order ID'}</p>
               <p className="text-7xl sm:text-9xl leading-none font-black kiosk-accent drop-shadow-2xl">#{lastOrderNumber?.toString().padStart(3, '0')}</p>
            </div>

            <button 
              onClick={handleStart}
              className="h-20 px-12 rounded-[28px] kiosk-btn-primary text-2xl sm:text-3xl hover:scale-105 active:scale-95"
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
