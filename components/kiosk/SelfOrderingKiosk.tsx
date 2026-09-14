import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  WalletCards,
  X,
} from 'lucide-react';
import { useMenuStore } from '../../stores/useMenuStore';
import { useOrderStore } from '../../stores/useOrderStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { MenuItem, OrderStatus, OrderType, PaymentMethod } from '../../types';
import { calculateOrderTotals } from '../../services/orderTotals';
import { getActionableErrorMessage } from '../../services/api/core';
import KioskCategoryRail from './KioskCategoryRail';
import KioskItemCard from './KioskItemCard';
import KioskModifierModal from './KioskModifierModal';
import '../../styles/layout/kiosk.css';

type KioskStep = 'WELCOME' | 'MENU' | 'SUMMARY' | 'PAYMENT' | 'SUCCESS';

const SelfOrderingKiosk: React.FC = () => {
  const [step, setStep] = useState<KioskStep>('WELCOME');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastOrderNumber, setLastOrderNumber] = useState<number | null>(null);
  const [orderError, setOrderError] = useState('');
  const [kitchenWarning, setKitchenWarning] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  // Idle warning: 30s countdown before the 120s auto-reset wipes the cart.
  const [idleCountdown, setIdleCountdown] = useState<number | null>(null);
  const [idleToken, setIdleToken] = useState(0);
  const idleCountdownRef = React.useRef<number | null>(null);
  const setIdleCountdownSafe = (value: number | null) => {
    idleCountdownRef.current = value;
    setIdleCountdown(value);
  };

  const { categories, fetchMenu, isLoading: menuLoading } = useMenuStore();
  const {
    activeCart,
    addToCart,
    removeFromCart,
    updateCartItemQuantity,
    clearCart,
    placeOrder,
    setOrderMode,
  } = useOrderStore();
  const { settings, branches } = useAuthStore();

  const lang = settings.language || 'en';
  const isAr = lang === 'ar';
  const tr = (en: string, ar: string) => isAr ? ar : en;
  const currency = settings.currencySymbol || (isAr ? 'ج.م' : 'EGP');
  const brandName = isAr
    ? settings.restaurantNameAr || settings.restaurantName || 'Coduis Zen'
    : settings.restaurantName || 'Coduis Zen';
  const brandLogo = settings.receiptLogoUrl || '';
  const activeBranch = branches.find(branch => branch.id === settings.activeBranchId);
  const taxRate = activeBranch?.taxRate ?? settings.taxRate ?? 0;

  useEffect(() => {
    fetchMenu(true);
    setOrderMode(OrderType.KIOSK);
  }, [fetchMenu, setOrderMode]);

  useEffect(() => {
    if (step === 'WELCOME' || step === 'SUCCESS') {
      setIdleCountdownSafe(null);
      return;
    }
    const IDLE_LIMIT_MS = 120_000;
    const WARN_BEFORE_MS = 30_000;
    let timeoutId = 0;
    let warnId = 0;
    let countId = 0;
    const doReset = () => {
      clearCart();
      setSelectedItem(null);
      setSearchQuery('');
      setIdleCountdownSafe(null);
      setStep('WELCOME');
    };
    const arm = () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(warnId);
      window.clearInterval(countId);
      setIdleCountdownSafe(null);
      warnId = window.setTimeout(() => {
        setIdleCountdownSafe(Math.ceil(WARN_BEFORE_MS / 1000));
        countId = window.setInterval(() => {
          setIdleCountdownSafe(idleCountdownRef.current !== null && idleCountdownRef.current > 1 ? idleCountdownRef.current - 1 : idleCountdownRef.current);
        }, 1000);
      }, IDLE_LIMIT_MS - WARN_BEFORE_MS);
      timeoutId = window.setTimeout(doReset, IDLE_LIMIT_MS);
    };
    const reset = () => {
      if (idleCountdownRef.current !== null) return; // modal owns the timer now
      arm();
    };
    arm();
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(warnId);
      window.clearInterval(countId);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearCart, step, idleToken]);

  useEffect(() => {
    if (step !== 'SUCCESS') return;
    const timeoutId = window.setTimeout(() => {
      clearCart();
      setStep('WELCOME');
    }, 15_000);
    return () => window.clearTimeout(timeoutId);
  }, [clearCart, step]);

  const currentCategories = useMemo(() => (
    (categories || [])
      .filter(category => category.isActive !== false)
      .map(category => ({
        ...category,
        items: (category.items || []).filter(item => item.isAvailable !== false && !item.archivedAt),
      }))
      .filter(category => category.items.length > 0)
  ), [categories]);

  useEffect(() => {
    if (currentCategories.length > 0 && !currentCategories.some(category => category.id === activeCategory)) {
      setActiveCategory(currentCategories[0].id);
    }
  }, [activeCategory, currentCategories]);

  const activeCategoryData = currentCategories.find(category => category.id === activeCategory) || currentCategories[0];
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleItems = useMemo(() => {
    if (!normalizedSearch) return activeCategoryData?.items || [];
    return currentCategories.flatMap(category => category.items).filter(item => (
      [item.name, item.nameAr, item.description, item.descriptionAr]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase().includes(normalizedSearch))
    ));
  }, [activeCategoryData, currentCategories, normalizedSearch]);

  const totals = useMemo(() => calculateOrderTotals({
    items: activeCart,
    taxRate,
    serviceCharge: 0,
  }), [activeCart, taxRate]);
  const cartQty = activeCart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const paymentMethods = useMemo(() => [
    { id: PaymentMethod.CASH, label: tr('Pay at counter', 'الدفع عند الكاشير'), icon: WalletCards },
    { id: PaymentMethod.VISA, label: tr('Card at counter', 'بطاقة عند الكاشير'), icon: CreditCard },
    ...(settings.customPaymentMethods || [])
      .filter(method => method.isActive !== false)
      .map(method => ({
        id: method.id,
        label: isAr ? method.nameAr || method.name : method.name,
        icon: CreditCard,
      })),
  ], [isAr, settings.customPaymentMethods]);

  const startOrder = () => {
    clearCart();
    setOrderMode(OrderType.KIOSK);
    setSearchQuery('');
    setOrderError('');
    setKitchenWarning(false);
    setStep('MENU');
  };

  const addConfiguredItem = (item: MenuItem, selectedModifiers: any[], quantity: number) => {
    addToCart({
      ...item,
      cartId: globalThis.crypto?.randomUUID?.() || `kiosk-${Date.now()}`,
      quantity,
      selectedModifiers,
      course: 'KIOSK',
    } as any);
    setSelectedItem(null);
  };

  const submitOrder = async (method: string) => {
    if (activeCart.length === 0 || isPlacingOrder) return;
    if (!settings.activeBranchId) {
      setOrderError(tr('This kiosk is not linked to a branch. Ask a cashier for help.', 'هذا الكشك غير مربوط بفرع. اطلب مساعدة الكاشير.'));
      return;
    }
    setOrderError('');
    setIsPlacingOrder(true);
    try {
      const result = await placeOrder({
        id: globalThis.crypto?.randomUUID?.() || `kiosk-order-${Date.now()}`,
        type: OrderType.KIOSK,
        source: 'kiosk',
        branchId: settings.activeBranchId,
        items: activeCart,
        status: OrderStatus.PENDING,
        subtotal: totals.subtotal,
        tax: totals.tax,
        serviceCharge: totals.serviceCharge,
        total: totals.total,
        paymentMethod: method,
        createdAt: new Date(),
      } as any);
      setKitchenWarning(Boolean(result.warnings?.some(warning => warning.code === 'KDS_DISPATCH_FAILED')));
      setLastOrderNumber(result.orderNumber || null);
      setStep('SUCCESS');
    } catch (error) {
      setOrderError(getActionableErrorMessage(error, isAr ? 'ar' : 'en'));
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const CartItems = ({ compact = false }: { compact?: boolean }) => (
    <div className="space-y-3">
      {activeCart.map(item => (
        <article key={item.cartId} className="kiosk-cart-item">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">{isAr ? item.nameAr || item.name : item.name}</p>
            <p className="mt-1 text-sm font-black kiosk-accent">
              {((Number(item.price) + (item.selectedModifiers || []).reduce((sum, modifier) => sum + Number(modifier.price || 0), 0)) * item.quantity).toLocaleString()} {currency}
            </p>
          </div>
          <div className="kiosk-quantity-control">
            <button type="button" aria-label={tr('Decrease', 'تقليل')} onClick={() => updateCartItemQuantity(item.cartId, -1)}><Minus size={18} /></button>
            <span>{item.quantity}</span>
            <button type="button" aria-label={tr('Increase', 'زيادة')} onClick={() => updateCartItemQuantity(item.cartId, 1)}><Plus size={18} /></button>
          </div>
          {!compact && (
            <button type="button" aria-label={tr('Remove', 'حذف')} onClick={() => removeFromCart(item.cartId)} className="kiosk-remove-button"><Trash2 size={18} /></button>
          )}
        </article>
      ))}
    </div>
  );

  if (step === 'WELCOME') {
    return (
      <main className="kiosk-screen kiosk-welcome" dir={isAr ? 'rtl' : 'ltr'}>
        <section className="kiosk-welcome-shell">
          <div className="kiosk-welcome-brand">
            <div className="kiosk-welcome-mark">
              {brandLogo ? <img src={brandLogo} alt={brandName} /> : <UtensilsCrossed size={58} />}
            </div>
            <p className="kiosk-eyebrow">{tr('Self ordering, made simple', 'طلبك أسهل وأسرع')}</p>
            <h1>{brandName}</h1>
            <p>{tr('Build your meal at your pace. We will handle the rest.', 'كوّن طلبك براحتك، وإحنا هنجهز الباقي.')}</p>
            <button type="button" onClick={startOrder} className="kiosk-start-button">
              {tr('Explore the menu', 'استعرض المنيو')}
              {isAr ? <ArrowLeft size={30} /> : <ArrowRight size={30} />}
            </button>
          </div>
          <div className="kiosk-welcome-journey" aria-label={tr('Ordering steps', 'خطوات الطلب')}>
            {[tr('Choose', 'اختار'), tr('Customize', 'ظبط'), tr('Confirm', 'أكد')].map((label, index) => (
              <div key={label}><span>{index + 1}</span><strong>{label}</strong></div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (step === 'SUCCESS') {
    return (
      <main className="kiosk-screen kiosk-success" dir={isAr ? 'rtl' : 'ltr'}>
        <CheckCircle2 size={96} />
        <p className="kiosk-eyebrow">{tr('Order received', 'تم استلام طلبك')}</p>
        <h1>{lastOrderNumber ? `#${String(lastOrderNumber).padStart(3, '0')}` : tr('Done', 'تم')}</h1>
        <p>{kitchenWarning
          ? tr('Your order is saved. Please show this number to the cashier now.', 'طلبك محفوظ. من فضلك ورّي الرقم للكاشير دلوقتي.')
          : tr('Keep this number. We will call it when your order is ready.', 'احتفظ بالرقم. هننادي عليه لما طلبك يجهز.')}</p>
        <button type="button" onClick={startOrder} className="kiosk-start-button">{tr('New order', 'طلب جديد')}</button>
      </main>
    );
  }

  if (step === 'SUMMARY' || step === 'PAYMENT') {
    return (
      <main className="kiosk-screen kiosk-review-screen" dir={isAr ? 'rtl' : 'ltr'}>
        <section className="kiosk-review-panel">
          <header>
            <div>
              <p className="kiosk-eyebrow">{step === 'SUMMARY' ? tr('Step 2 of 3', 'الخطوة ٢ من ٣') : tr('Step 3 of 3', 'الخطوة ٣ من ٣')}</p>
              <h1>{step === 'SUMMARY' ? tr('Review your order', 'راجع طلبك') : tr('How will you pay?', 'هتدفع إزاي؟')}</h1>
            </div>
            <button type="button" aria-label={tr('Back to menu', 'الرجوع للمنيو')} onClick={() => setStep(step === 'PAYMENT' ? 'SUMMARY' : 'MENU')} className="kiosk-close-button"><X size={28} /></button>
          </header>

          {step === 'SUMMARY' ? (
            <div className="kiosk-review-body"><CartItems /></div>
          ) : (
            <div className="kiosk-payment-grid">
              <p style={{ gridColumn: '1 / -1', textAlign: 'center', fontWeight: 800, opacity: 0.75 }}>
                {tr('Order now — pay at the counter. Your pickup number shows right after.', 'اطلب دلوقتي — وادفع عند الكاشير. رقم الاستلام هيظهر فوراً.')}
              </p>
              {paymentMethods.map(method => {
                const Icon = method.icon;
                return (
                  <button key={method.id} type="button" disabled={isPlacingOrder} onClick={() => submitOrder(method.id)}>
                    <Icon size={40} />
                    <strong>{method.label}</strong>
                    <span>{tr('Order now, pay at counter', 'اطلب الآن وادفع عند الكاشير')}</span>
                  </button>
                );
              })}
            </div>
          )}

          {orderError && <p className="kiosk-error">{orderError}</p>}
          <footer>
            <div className="kiosk-total-lines">
              <span>{tr('Subtotal', 'قبل الضريبة')} <strong>{totals.subtotal.toLocaleString()} {currency}</strong></span>
              {totals.tax > 0 && <span>{tr('Tax', 'الضريبة')} <strong>{totals.tax.toLocaleString()} {currency}</strong></span>}
              <span className="kiosk-grand-total">{tr('Total', 'الإجمالي')} <strong>{totals.total.toLocaleString()} {currency}</strong></span>
            </div>
            {step === 'SUMMARY' && (
              <button type="button" disabled={activeCart.length === 0} onClick={() => setStep('PAYMENT')} className="kiosk-primary-action">
                {tr('Continue to payment', 'اختار طريقة الدفع')}
                {isAr ? <ArrowLeft size={24} /> : <ArrowRight size={24} />}
              </button>
            )}
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="kiosk-screen kiosk-menu-screen" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="kiosk-menu-header">
        <div className="kiosk-menu-brand">
          {brandLogo && <img src={brandLogo} alt="" />}
          <div>
          <p className="kiosk-eyebrow">{brandName}</p>
          <h1>{tr('What would you like?', 'تحب تطلب إيه؟')}</h1>
          </div>
        </div>
        <label className="kiosk-search">
          <Search size={22} />
          <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder={tr('Search menu', 'دور في المنيو')} />
          {searchQuery && <button type="button" aria-label={tr('Clear search', 'مسح البحث')} onClick={() => setSearchQuery('')}><X size={20} /></button>}
        </label>
      </header>

      <KioskCategoryRail categories={currentCategories} activeCategoryId={activeCategory} onSelectCategory={id => { setActiveCategory(id); setSearchQuery(''); }} lang={lang} />

      <div className="kiosk-menu-layout">
        <section className="kiosk-products">
          {menuLoading && currentCategories.length === 0 ? (
            <div className="kiosk-empty-state">{tr('Loading menu…', 'جاري تحميل المنيو…')}</div>
          ) : visibleItems.length === 0 ? (
            <div className="kiosk-empty-state">{tr('No matching items', 'مفيش أصناف مطابقة')}</div>
          ) : (
            <div className="kiosk-grid">
              {visibleItems.map(item => <KioskItemCard key={item.id} item={item} onAdd={setSelectedItem} lang={lang} currency={currency} />)}
            </div>
          )}
        </section>

        <aside className="kiosk-cart-panel">
          <header><ShoppingBag size={24} /><strong>{tr('Your order', 'طلبك')}</strong><span>{cartQty}</span></header>
          <div className="kiosk-cart-scroll">
            {activeCart.length ? <CartItems /> : <div className="kiosk-empty-cart"><ShoppingBag size={48} /><p>{tr('Tap any item to add it', 'اضغط على أي صنف علشان تضيفه')}</p></div>}
          </div>
          <footer>
            <div><span>{tr('Total', 'الإجمالي')}</span><strong>{totals.total.toLocaleString()} {currency}</strong></div>
            <button type="button" disabled={activeCart.length === 0} onClick={() => setStep('SUMMARY')} className="kiosk-primary-action">{tr('Review order', 'راجع الطلب')}</button>
          </footer>
        </aside>
      </div>

      <button type="button" disabled={activeCart.length === 0} onClick={() => setStep('SUMMARY')} className="kiosk-mobile-cart">
        <span><ShoppingBag size={22} /> {cartQty}</span>
        <strong>{tr('Review order', 'راجع الطلب')}</strong>
        <span>{totals.total.toLocaleString()} {currency}</span>
      </button>

      {selectedItem && <KioskModifierModal item={selectedItem} lang={lang} currency={currency} onClose={() => setSelectedItem(null)} onConfirm={addConfiguredItem} />}

      {/* Idle warning: extend or the cart resets when the countdown ends. */}
      {idleCountdown !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-6" dir={isAr ? 'rtl' : 'ltr'}>
          <div className="w-full max-w-sm rounded-3xl bg-card p-8 text-center shadow-2xl">
            <p className="text-6xl font-black tabular-nums text-main">{idleCountdown}</p>
            <h3 className="mt-2 text-lg font-black text-main">{tr('Still there?', 'لسه موجود؟')}</h3>
            <p className="mt-1 text-sm font-bold text-muted">{tr('Your order will reset for the next guest.', 'طلبك هيتمسح للضيف اللي بعدك.')}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { clearCart(); setSelectedItem(null); setSearchQuery(''); setIdleCountdownSafe(null); setStep('WELCOME'); }}
                className="h-14 rounded-2xl bg-elevated text-sm font-black text-main"
              >
                {tr('Reset now', 'امسح الآن')}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => { setIdleCountdownSafe(null); setIdleToken((t) => t + 1); }}
                className="h-14 rounded-2xl bg-primary text-sm font-black text-white"
              >
                {tr("I'm still here", 'أنا لسه هنا')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default SelfOrderingKiosk;
