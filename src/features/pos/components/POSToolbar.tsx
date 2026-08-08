/**
 * POSToolbar — Slim mode switcher + context actions + quick pay
 */
import React from 'react';
import { UtensilsCrossed, ShoppingBag, MapPin, Truck, LayoutGrid, Zap, Plus, QrCode, Pause, Clock, User, List } from 'lucide-react';
import { OrderType } from '@/types';

interface POSToolbarProps {
    activeOrderType: OrderType;
    onSetOrderMode: (mode: OrderType) => void;
    lang: string;
    t: any;
    cartCount: number;
    onToggleCart: () => void;
    onShowTables: () => void;
    onShowCustomers: () => void;
    onNewCustomer: () => void;
    onQuickPay: () => void;
    onFocusSearch: () => void;
    hasCartItems: boolean;
    cartTotal: number;
    currencySymbol: string;
    onHoldOrder?: () => void;
    onRecallOrders?: () => void;
    heldOrdersCount?: number;
    onSetOrderName?: () => void;
    orderName?: string;
    posMode?: 'grid' | 'retail';
    onTogglePosMode?: () => void;
}

const modes = [
    { mode: OrderType.DINE_IN, icon: UtensilsCrossed, key: 'dine_in', en: 'Dine In', ar: 'صالة' },
    { mode: OrderType.TAKEAWAY, icon: ShoppingBag, key: 'takeaway', en: 'Takeaway', ar: 'تيك اواي' },
    { mode: OrderType.PICKUP, icon: MapPin, key: 'pickup', en: 'Pickup', ar: 'استلام عميل' },
    { mode: OrderType.DELIVERY, icon: Truck, key: 'delivery', en: 'Delivery', ar: 'ديلفري' },
];

const POSToolbar: React.FC<POSToolbarProps> = ({
    activeOrderType, onSetOrderMode, lang, t, cartCount,
    onToggleCart, onShowTables, onShowCustomers, onNewCustomer, onQuickPay, onFocusSearch,
    hasCartItems, cartTotal, currencySymbol,
    onHoldOrder, onRecallOrders, heldOrdersCount = 0, onSetOrderName, orderName, posMode, onTogglePosMode
}) => {
    const isAr = lang === 'ar';

    return (
        <div className="pos-toolbar-slim shrink-0 border-b border-border/8 bg-card/50 backdrop-blur-sm px-2 md:px-3 flex items-center gap-1.5 z-20 overflow-x-auto no-scrollbar">
            {/* Mode Segments */}
            <div className="flex items-center bg-elevated/50 rounded-lg p-0.5 shrink-0 pressable">
                {modes.map(({ mode, key: modKey, icon: Icon, en, ar }) => {
                    const active = activeOrderType === mode;
                    const label = active ? ((t as any)[modKey] || ar) : ((t as any)[modKey] || en);
                    return (
                        <button
                            key={mode}
                            onClick={() => onSetOrderMode(mode)}
                            aria-label={label}
                            title={label}
                            className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[10px] font-bold whitespace-nowrap transition-all ${active
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-muted hover:text-main'
                            }`}
                        >
                            <Icon size={12} />
                            <span className="hidden sm:inline">{label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Context Actions */}
            {activeOrderType === OrderType.DINE_IN && (
                <button onClick={onShowTables} className="shrink-0 flex items-center gap-1 px-2.5 h-7 rounded-lg bg-blue-500/8 text-blue-600 text-[10px] font-bold hover:bg-blue-500 hover:text-white transition-colors active:scale-95">
                    <LayoutGrid size={12} />
                    <span className="hidden sm:inline">{isAr ? 'الطاولات' : 'Tables'}</span>
                </button>
            )}
            {activeOrderType === OrderType.DELIVERY && (
                <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={onShowCustomers} className="flex items-center gap-1 px-2.5 h-7 rounded-lg bg-amber-500/8 text-amber-600 text-[10px] font-bold hover:bg-amber-500 hover:text-white transition-colors active:scale-95">
                        <Truck size={12} />
                        <span className="hidden sm:inline">{isAr ? 'العملاء' : 'Customers'}</span>
                    </button>
                    <button onClick={onNewCustomer} className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-all active:scale-90">
                        <Plus size={12} />
                    </button>
                </div>
            )}
            {(activeOrderType === OrderType.TAKEAWAY || activeOrderType === OrderType.PICKUP) && onSetOrderName && (
                <button onClick={onSetOrderName} className="shrink-0 flex items-center gap-1 px-2.5 h-7 rounded-lg bg-violet-500/8 text-violet-600 text-[10px] font-bold hover:bg-violet-500 hover:text-white transition-colors active:scale-95">
                    <User size={12} />
                    <span className="hidden sm:inline truncate max-w-[80px]">{orderName || (isAr ? 'اسم العميل' : 'Name')}</span>
                </button>
            )}

            {/* Hold / Recall */}
            <div className="flex items-center gap-0.5 shrink-0">
                {onHoldOrder && hasCartItems && (
                    <button onClick={onHoldOrder} title={isAr ? 'تعليق' : 'Hold'} className="flex items-center gap-1 px-2 h-7 rounded-lg text-muted hover:text-main hover:bg-elevated/60 text-[10px] font-bold transition-colors active:scale-95">
                        <Pause size={12} />
                        <span className="hidden md:inline">{isAr ? 'تعليق' : 'Hold'}</span>
                    </button>
                )}
                {onRecallOrders && (
                    <button onClick={onRecallOrders} className="relative flex items-center gap-1 px-2 h-7 rounded-lg text-muted hover:text-main hover:bg-elevated/60 text-[10px] font-bold transition-colors active:scale-95">
                        <Clock size={12} />
                        <span className="hidden md:inline">{isAr ? 'معلقة' : 'Recall'}</span>
                        {heldOrdersCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-rose-500 text-white text-[7px] font-bold flex items-center justify-center">{heldOrdersCount}</span>
                        )}
                    </button>
                )}
            </div>

            {/* Cart toggle — mobile */}
            <button
                onClick={onToggleCart}
                className="shrink-0 hidden max-md:flex items-center gap-1 px-2 h-7 rounded-lg text-muted hover:text-primary bg-elevated/40 transition-colors active:scale-95 relative"
                aria-label={isAr ? 'فتح السلة' : 'Open cart'}
                title={isAr ? 'فتح السلة' : 'Open cart'}
            >
                <ShoppingBag size={14} />
                {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-1 rounded-full bg-primary text-white text-[7px] font-bold flex items-center justify-center">{cartCount > 9 ? '9+' : cartCount}</span>
                )}
            </button>

            <div className="flex-1" />

            {/* Scanner */}
            <div className="shrink-0 hidden md:flex items-center gap-1 px-2 h-7 rounded-lg text-emerald-500 bg-emerald-500/5">
                <QrCode size={11} className="animate-pulse" />
                <span className="text-[9px] font-bold">{isAr ? 'ماسح' : 'Scanner'}</span>
            </div>

            {/* View Mode */}
            {onTogglePosMode && (
                <button
                    onClick={onTogglePosMode}
                    className="shrink-0 flex items-center gap-1 px-2 h-7 rounded-lg text-muted hover:text-main bg-elevated/40 transition-colors active:scale-95"
                    aria-label={posMode === 'retail' ? (isAr ? 'عرض الشبكة' : 'Switch to grid view') : (isAr ? 'عرض التجزئة' : 'Switch to retail view')}
                    title={posMode === 'retail' ? (isAr ? 'عرض الشبكة' : 'Switch to grid view') : (isAr ? 'عرض التجزئة' : 'Switch to retail view')}
                >
                    {posMode === 'retail' ? <LayoutGrid size={12} /> : <List size={12} />}
                    <span className="hidden md:inline text-[10px] font-bold">{posMode === 'retail' ? (isAr ? 'شبكة' : 'Grid') : (isAr ? 'تجزئة' : 'Retail')}</span>
                </button>
            )}

            {/* Total + Quick Pay */}
            {hasCartItems && (
                <div className="shrink-0 hidden md:flex items-center gap-1">
                    <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-primary/6">
                        <span className="text-[10px] font-bold text-primary/60">{isAr ? 'الإجمالي' : 'Total'}</span>
                        <span className="text-sm font-black tabular-nums text-primary">{currencySymbol}{(cartTotal || 0).toFixed(2)}</span>
                    </div>
                    <button onClick={onQuickPay} className="flex items-center gap-1 h-7 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold hover:shadow-md transition-all active:scale-95">
                        <Zap size={11} fill="currentColor" />
                        <span className="hidden sm:inline">{isAr ? 'سريع' : 'Quick'}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default React.memo(POSToolbar);
