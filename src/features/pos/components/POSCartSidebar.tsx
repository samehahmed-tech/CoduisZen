import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe2, ShoppingBag, Store, Trash2, X } from 'lucide-react';
import CartItem from './CartItem';
import PaymentSummary from './PaymentSummary';
import type { DeliveryPlatform, OrderItem, OrderType, PaymentMethod } from '@/types';

interface POSCartSidebarProps {
    activeCart: OrderItem[];
    filteredCartItems: OrderItem[];
    cartSubtotal: number;
    cartTotal: number;
    cartTax: number;
    cartStats: { lines: number; qty: number };
    discount: number;
    orderDiscountAmount?: number;
    itemDiscountTotal?: number;
    orderTypeLabel: string;
    orderTypeSubLabel: string;
    activeOrderType: OrderType;
    selectedTableId: string | null;
    cartSearchQuery: string;
    onCartSearchChange: (q: string) => void;
    cartPanelWidth: 'compact' | 'normal' | 'wide';
    onSetCartWidth: (w: 'compact' | 'normal' | 'wide') => void;
    tipAmount: number;
    onSetTipAmount: (amount: number) => void;
    paymentMethod: PaymentMethod;
    onSetPaymentMethod: (m: PaymentMethod) => void;
    isPaymentPanelCollapsed: boolean;
    onTogglePaymentCollapsed: () => void;
    couponCode: string;
    activeCoupon: any;
    isApplyingCoupon: boolean;
    onCouponCodeChange: (c: string) => void;
    onApplyCoupon: () => void;
    onClearCoupon: () => void;
    onEditNote: (cartId: string, note: string) => void;
    onEditSeat: (cartId: string, seat?: number) => void;
    onEditCourse: (cartId: string, course?: string) => void;
    onUpdateQuantity: (cartId: string, delta: number) => void;
    onRemoveItem: (cartId: string) => void;
    onEditItemDiscount?: (cartId: string) => void;
    onVoid: () => void;
    onClear: () => void;
    onSendKitchen: () => void;
    onSubmit: () => void;
    onQuickPay: () => void;
    onShowSplitModal: () => void;
    onLeaveTable: () => void;
    onCloseCart: () => void;
    onFocusSearch: () => void;
    isSubmitting?: boolean;
    currencySymbol: string;
    isTouchMode: boolean;
    lang: 'en' | 'ar';
    t: any;
    isCartOpenMobile: boolean;
    shouldShowCart: boolean;
    cartPanelWidthClass: string;
    splitPayments: { method: PaymentMethod; amount: number }[];
    deliveryPlatforms?: DeliveryPlatform[];
    deliverySource: string;
    onDeliverySourceChange: (source: string) => void;
    externalOrderNumber: string;
    onExternalOrderNumberChange: (value: string) => void;
    orderNote: string;
    onOrderNoteChange: (value: string) => void;
}

const POSCartSidebar: React.FC<POSCartSidebarProps> = ({
    activeCart, filteredCartItems, cartSubtotal, cartTotal, cartTax, cartStats, discount, orderDiscountAmount = 0,
    orderTypeLabel, orderTypeSubLabel, activeOrderType, selectedTableId,
    paymentMethod, onSetPaymentMethod,
    couponCode, activeCoupon, isApplyingCoupon, onCouponCodeChange, onApplyCoupon, onClearCoupon,
    onEditNote, onEditSeat, onEditCourse, onUpdateQuantity, onRemoveItem, onEditItemDiscount,
    onVoid, onClear, onSendKitchen, onSubmit, onQuickPay, onShowSplitModal,
    onLeaveTable, onCloseCart, onFocusSearch, isSubmitting = false,
    tipAmount, onSetTipAmount,
    currencySymbol, isTouchMode, lang, t,
    isCartOpenMobile, shouldShowCart, cartPanelWidthClass, splitPayments = [],
    deliveryPlatforms = [], deliverySource, onDeliverySourceChange,
    externalOrderNumber, onExternalOrderNumberChange,
    orderNote, onOrderNoteChange
}) => {
    const isAr = lang === 'ar';
    const hasCartItems = activeCart.length > 0;
    const isDelivery = String(activeOrderType) === 'DELIVERY';
    const activePlatforms = deliveryPlatforms.filter((platform: any) => platform.isActive !== false);

    return (
        <div
            className={`pos-cart-sidebar flex h-full min-h-0 overflow-hidden transition-transform duration-300 ease-out will-change-transform bg-card/95 backdrop-blur-xl
                ${shouldShowCart && isCartOpenMobile ? 'cart-open' : ''}`}
        >
            {/* Header */}
            <div className="shrink-0 px-5 py-3.5 border-b border-border/10 bg-card/70">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-sm border border-primary/20">
                            <ShoppingBag size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-[13px] font-black text-main truncate tracking-wide">{orderTypeLabel}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[11px] font-bold text-primary tabular-nums tracking-tight">{cartStats.qty} {isAr ? 'وحدة' : 'qty'}</span>
                                <span className="text-[10px] text-muted/30">•</span>
                                <span className="text-[11px] font-semibold text-muted/60 tabular-nums tracking-tight">{cartStats.lines} {isAr ? 'صنف' : 'lines'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {/* Total */}
                        <div className="text-right">
                            <span className="text-2xl font-black text-main tabular-nums tracking-tighter leading-none">{(cartTotal || 0).toFixed(2)}</span>
                            <span className="text-[10px] font-semibold text-muted/60 ml-1 mb-1">{currencySymbol}</span>
                        </div>

                        {/* Close — mobile */}
                        <button
                            type="button"
                            onClick={onClear}
                            disabled={!hasCartItems}
                            title={isAr ? 'تفريغ السلة' : 'Clear cart'}
                            aria-label={isAr ? 'تفريغ السلة' : 'Clear cart'}
                            className="flex w-10 h-10 rounded-xl items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all active:scale-95 bg-card shadow-sm disabled:opacity-35 disabled:pointer-events-none"
                        >
                            <Trash2 size={18} />
                        </button>

                        <button onClick={onCloseCart} className="hidden max-lg:flex w-10 h-10 rounded-xl items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all active:scale-95 bg-card shadow-sm">
                            <X size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 pos-scroll space-y-2 overscroll-contain">
                {isDelivery && (
                    <div className="rounded-xl border border-border/40 bg-elevated/40 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    {deliverySource === 'restaurant' ? <Store size={16} /> : <Globe2 size={16} />}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-black text-main">
                                        {isAr ? 'مصدر الدليفري' : 'Delivery source'}
                                    </p>
                                    <p className="text-[10px] font-bold text-muted truncate">
                                        {isAr ? 'مطعم أو منصة خارجية' : 'Restaurant delivery or platform'}
                                    </p>
                                </div>
                            </div>
                            <select
                                value={deliverySource}
                                onChange={(event) => onDeliverySourceChange(event.target.value)}
                                className="h-9 min-w-[132px] rounded-lg border border-border/50 bg-card px-2 text-[11px] font-black text-main outline-none focus:border-primary/70"
                            >
                                <option value="restaurant">{isAr ? 'دليفري المطعم' : 'Restaurant delivery'}</option>
                                <option value="talabat">Talabat</option>
                                {activePlatforms.map((platform: any) => (
                                    <option key={platform.id} value={platform.id}>{platform.name}</option>
                                ))}
                            </select>
                        </div>
                        {deliverySource !== 'restaurant' && (
                            <input
                                value={externalOrderNumber}
                                onChange={(event) => onExternalOrderNumberChange(event.target.value)}
                                placeholder={isAr ? 'رقم أوردر المنصة' : 'Platform order no.'}
                                className="h-10 w-full rounded-lg border border-border/50 bg-card px-3 text-xs font-bold text-main outline-none placeholder:text-muted/50 focus:border-primary/70"
                            />
                        )}
                    </div>
                )}

                <div className="rounded-xl border border-border/40 bg-elevated/30 p-3">
                    <label className="mb-2 block text-[11px] font-black text-main">
                        {isAr ? 'ملاحظة على الطلب بالكامل' : 'Whole order note'}
                    </label>
                    <textarea
                        value={orderNote}
                        onChange={(event) => onOrderNoteChange(event.target.value)}
                        rows={2}
                        maxLength={240}
                        placeholder={isAr ? 'مثال: العميل مستعجل، بدون شطة للطلب كله...' : 'Example: customer is in a hurry, no chili for the whole order...'}
                        className="w-full resize-none rounded-lg border border-border/50 bg-card px-3 py-2 text-xs font-bold text-main outline-none placeholder:text-muted/50 focus:border-primary/70"
                    />
                    <div className="mt-1 text-right text-[9px] font-bold text-muted/60 tabular-nums">
                        {orderNote.length}/240
                    </div>
                </div>

                <AnimatePresence initial={false}>
                    {filteredCartItems.map((item, idx) => (
                        <CartItem
                            key={item.cartId}
                            item={item} currencySymbol={currencySymbol} isTouchMode={isTouchMode}
                            lang={lang} onEditNote={onEditNote} onEditSeat={onEditSeat}
                            onEditCourse={onEditCourse} onUpdateQuantity={onUpdateQuantity}
                            onRemove={onRemoveItem} onEditItemDiscount={onEditItemDiscount}
                            isLastAdded={idx === filteredCartItems.length - 1 && filteredCartItems.length > 0}
                        />
                    ))}
                </AnimatePresence>

                {/* Empty state */}
                {activeCart.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center py-20 px-8">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                            <div className="w-20 h-20 rounded-3xl bg-card border border-border/10 flex items-center justify-center text-muted/20 relative shadow-xl">
                                <ShoppingBag size={40} />
                            </div>
                        </div>
                        <h4 className="text-lg font-black text-main">{t.empty_cart}</h4>
                        <p className="text-sm text-muted/50 mt-2 text-center leading-relaxed max-w-[220px]">
                            {isAr ? 'أضف أصناف من القائمة لبدء طلب جديد' : 'Add items from the menu to start a new order'}
                        </p>
                        <button onClick={onFocusSearch} className="mt-8 px-6 py-3 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 tracking-wide">
                            {isAr ? 'استعراض القائمة' : 'Browse Menu'}
                        </button>
                    </div>
                )}
            </div>

            {/* Payment Footer */}
            <div className="shrink-0 border-t border-border/10 bg-card/95 backdrop-blur-md p-3 shadow-[0_-8px_22px_-18px_rgba(0,0,0,0.2)]">
                <PaymentSummary
                    subtotal={cartSubtotal} discount={discount} discountAmount={orderDiscountAmount} tax={cartTax} total={cartTotal}
                    currencySymbol={currencySymbol} paymentMethod={paymentMethod} onSetPaymentMethod={onSetPaymentMethod}
                    onShowSplitModal={onShowSplitModal} isTouchMode={isTouchMode} lang={lang} t={t}
                    tipAmount={tipAmount} onSetTipAmount={onSetTipAmount} onVoid={onVoid}
                    onSendKitchen={onSendKitchen} onSubmit={onSubmit} onQuickPay={onQuickPay}
                    canSubmit={hasCartItems && !isSubmitting} couponCode={couponCode} activeCoupon={activeCoupon}
                    isApplyingCoupon={isApplyingCoupon}
                    onCouponCodeChange={onCouponCodeChange}
                    onApplyCoupon={onApplyCoupon} onClearCoupon={onClearCoupon} itemCount={cartStats.qty}
                    splitPayments={splitPayments}
                    activeOrderType={activeOrderType}
                />
            </div>
        </div>
    );
};

export default React.memo(POSCartSidebar);
