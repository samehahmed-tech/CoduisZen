import React, { useState, useRef, useEffect } from 'react';
import { Compass, UtensilsCrossed, ShoppingBag, MapPin, Truck, X, Tag, Cloud, CloudOff, ChevronDown, User, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OrderType, Customer } from '@/types';
import { useAuthStore } from '@/stores/useAuthStore';
import BranchContextSwitcher from '@/components/common/BranchContextSwitcher';
import UserAvatar from '@/components/common/UserAvatar';

interface POSHeaderProps {
    activeMode: OrderType;
    lang: 'en' | 'ar';
    t: any;
    selectedTableId: string | null;
    onClearTable: () => void;
    deliveryCustomer: Customer | null;
    onClearCustomer: () => void;
    isTouchMode: boolean;
    onRecall?: () => void;
    activePriceListId: string | null;
    onSetPriceList: (id: string | null) => void;
    isOnline: boolean;
    onHomeClick?: () => void;
    activeShift?: { id: string; openingTime?: string } | null;
    onCloseShift?: () => void;
}

const POSHeader: React.FC<POSHeaderProps> = React.memo(({
    activeMode, lang, t, selectedTableId, onClearTable,
    deliveryCustomer, onClearCustomer, isTouchMode, onRecall,
    activePriceListId, onSetPriceList, isOnline, onHomeClick, activeShift, onCloseShift
}) => {
    const isAr = lang === 'ar';
    const navigate = useNavigate();
    const currentUser = useAuthStore(state => state.settings.currentUser);
    const logout = useAuthStore(state => state.logout);

    const [showUserMenu, setShowUserMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showUserMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showUserMenu]);

    const handleLogout = () => { logout(); navigate('/login'); };

    const modeMap = {
        [OrderType.DINE_IN]: { label: t.dine_in, icon: UtensilsCrossed, color: 'text-blue-500', bg: 'bg-blue-500/10' },
        [OrderType.TAKEAWAY]: { label: t.takeaway, icon: ShoppingBag, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        [OrderType.PICKUP]: { label: t.pickup || 'Pickup', icon: MapPin, color: 'text-violet-500', bg: 'bg-violet-500/10' },
        [OrderType.DELIVERY]: { label: t.delivery, icon: Truck, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    };
    const mode = modeMap[activeMode] || modeMap[OrderType.DINE_IN];
    const ModeIcon = mode.icon;

    return (
        <header className="pos-header-slim shrink-0 flex items-center justify-between px-3 md:px-4 bg-card/80 backdrop-blur-lg border-b border-border/8 z-30 sticky top-0">
            {/* Left: Home + Mode + Context */}
            <div className="flex items-center gap-2 min-w-0">
                {onHomeClick && (
                    <button onClick={onHomeClick} className="min-h-11 min-w-11 h-11 w-11 shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-primary/8 transition-all active:scale-90" title="Dashboard" aria-label="Dashboard">
                        <Compass size={18} />
                    </button>
                )}

                {/* Mode Pill */}
                <div className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg ${mode.bg} shrink-0`}>
                    <ModeIcon size={13} className={mode.color} />
                    <span className={`text-[11px] font-bold ${mode.color}`}>{mode.label}</span>
                </div>

                <BranchContextSwitcher variant="pos" />

                {/* Context badges */}
                {activeMode === OrderType.DINE_IN && selectedTableId && (
                    <div className="flex items-center gap-1.5 h-7 px-2.5 bg-blue-500/8 rounded-lg text-[11px] font-bold text-blue-600 shrink-0 animate-in slide-in-from-left-2">
                        <span>{t.table} {selectedTableId}</span>
                        <button onClick={onClearTable} className="min-w-8 min-h-8 w-8 h-8 rounded-full hover:bg-rose-500 hover:text-white flex items-center justify-center touch-target transition-all">
                            <X size={14} />
                        </button>
                    </div>
                )}
                {activeMode === OrderType.DELIVERY && deliveryCustomer && (
                    <div className="flex items-center gap-1.5 h-7 px-2.5 bg-amber-500/8 rounded-lg text-[11px] font-bold text-amber-600 shrink-0 animate-in slide-in-from-left-2">
                        <span className="truncate max-w-[100px]">{deliveryCustomer.name}</span>
                        <button onClick={onClearCustomer} className="min-w-8 min-h-8 w-8 h-8 rounded-full hover:bg-rose-500 hover:text-white flex items-center justify-center text-main transition-all">
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* Right: Status + Price List + User */}
            <div className="flex items-center gap-1.5 shrink-0">
                {activeShift && onCloseShift && (
                    <button
                        onClick={onCloseShift}
                        className="hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-rose-500/8 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors active:scale-95"
                        title={isAr ? 'إغلاق الوردية' : 'Close shift'}
                    >
                        <LogOut size={12} />
                        <span className="text-[10px] font-black uppercase tracking-wider">
                            {isAr ? 'إغلاق الشيفت' : 'Close Shift'}
                        </span>
                    </button>
                )}

                {/* Price List */}
                <div className="hidden md:flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-elevated/50 hover:bg-elevated transition-colors">
                    <Tag size={11} className="text-muted" />
                    <select
                        value={activePriceListId || 'standard'}
                        onChange={(e) => onSetPriceList(e.target.value === 'standard' ? null : e.target.value)}
                        className="bg-transparent text-[11px] font-bold text-main outline-none cursor-pointer appearance-none"
                    >
                        <option value="standard">{isAr ? 'قياسي' : 'Standard'}</option>
                        <option value="delivery">{isAr ? 'توصيل' : 'Delivery'}</option>
                        <option value="vip">VIP</option>
                    </select>
                </div>

                {/* Online/Offline */}
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isOnline ? 'text-emerald-500' : 'text-rose-500'}`} title={isOnline ? 'Online' : 'Offline'}>
                    {isOnline ? <Cloud size={15} /> : <CloudOff size={15} className="animate-pulse" />}
                </div>

                {/* User */}
                <div className="relative" ref={menuRef}>
                    <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-1.5 h-8 pl-1 pr-2 rounded-full hover:bg-elevated/60 transition-colors active:scale-95" aria-label={currentUser?.name || 'User profile'}>
                        <UserAvatar name={currentUser?.name} src={currentUser?.avatar} size="xs" />
                        <ChevronDown size={10} className={`text-muted transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showUserMenu && (
                        <div className={`absolute top-full mt-1.5 w-52 bg-card border border-border/15 shadow-xl rounded-2xl z-50 overflow-hidden pos-scale-in ${isAr ? 'left-0' : 'right-0'}`}>
                            <div className="px-4 py-3 border-b border-border/8 flex items-center gap-3">
                                <UserAvatar name={currentUser?.name} src={currentUser?.avatar} size="md" />
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-main truncate">{currentUser?.name || 'User'}</div>
                                    <div className="text-[10px] text-muted mt-0.5">{currentUser?.role || 'Staff'}</div>
                                </div>
                            </div>
                            <div className="p-1.5">
                                <button onClick={() => { setShowUserMenu(false); navigate('/settings'); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-muted hover:text-main hover:bg-elevated/60 rounded-lg transition-colors">
                                    <User size={14} />
                                    {isAr ? 'حسابي' : 'My Profile'}
                                </button>
                                <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-rose-500 hover:bg-rose-500/8 rounded-lg transition-colors">
                                    <LogOut size={14} />
                                    {isAr ? 'تسجيل خروج' : 'Sign Out'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
});

export default POSHeader;
