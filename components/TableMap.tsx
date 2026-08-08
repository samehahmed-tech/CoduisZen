import React, { useState, useMemo } from 'react';
import {
    Users,
    LayoutGrid,
    Search,
    Grid3X3,
    Maximize2,
    Crown,
    Percent,
    Layers,
    List,
    Clock,
    Utensils,
    Wallet,
    Trash2,
    Merge,
    ChevronRight,
    Sparkles,
    Timer,
    Plus,
    Tag,
    StickyNote
} from 'lucide-react';
import { Table, TableStatus, FloorZone, Order, OrderStatus } from '../types';
import VirtualGrid from './common/VirtualGrid';
import { useAuthStore } from '../stores/useAuthStore';

interface TableMapProps {
    tables: Table[];
    zones: FloorZone[];
    orders: Order[];
    onSelectTable: (table: Table) => void;
    onResumeTable: (table: Table) => void;
    onTempBill: (table: Table) => void;
    onCloseTable: (table: Table) => void;
    onMergeTable: (table: Table) => void;
    onResetTable?: (table: Table) => void;
    canResetTables?: boolean;
    onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
    lang: 'en' | 'ar';
    t: any;
    isDarkMode: boolean;
}

const TableMap: React.FC<TableMapProps> = ({
    tables,
    zones,
    orders,
    onSelectTable,
    onResumeTable,
    onTempBill,
    onCloseTable,
    onMergeTable,
    onResetTable,
    canResetTables = false,
    onUpdateOrderStatus,
    lang,
    t,
    isDarkMode
}) => {
    const isAr = lang === 'ar';
    const settings = useAuthStore(state => state.settings);
    const currencySymbol = settings.currencySymbol || (isAr ? 'ج.م' : 'EGP');

    const formattedZones = useMemo(() => {
        return [{ id: 'all', name: isAr ? 'جميع المناطق' : 'All Zones', color: '#6366f1' }, ...zones];
    }, [zones, isAr]);

    const [activeZone, setActiveZone] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'GRID' | 'COMPACT' | 'LIST'>('GRID');

    const tableTotals = useMemo(() => {
        const map: Record<string, number> = {};
        orders
            .filter(o => tables.some(table => table.id === o.tableId && table.currentOrderId === o.id))
            .forEach(o => {
                const key = o.tableId as string;
                map[key] = (map[key] || 0) + (o.total || 0);
            });
        return map;
    }, [orders, tables]);

    const activeOrderByTable = useMemo(() => {
        const map: Record<string, Order> = {};
        const list = orders.filter(o => tables.some(table => table.id === o.tableId && table.currentOrderId === o.id));
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        list.forEach(o => {
            const key = o.tableId as string;
            if (!map[key]) map[key] = o;
        });
        return map;
    }, [orders, tables]);

    const tableSummaries = useMemo(() => {
        const map: Record<string, { items: number; total: number; status: OrderStatus; openedAt?: Date; lastActivity?: Date }> = {};
        orders
            .filter(o => tables.some(table => table.id === o.tableId && table.currentOrderId === o.id))
            .forEach(o => {
                const key = o.tableId as string;
                const itemsCount = (o.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
                if (!map[key]) {
                    map[key] = {
                        items: itemsCount,
                        total: o.total || 0,
                        status: o.status,
                        openedAt: o.createdAt ? new Date(o.createdAt) : undefined,
                        lastActivity: o.createdAt ? new Date(o.createdAt) : undefined
                    };
                } else {
                    map[key].items += itemsCount;
                    map[key].total += o.total || 0;
                    if (o.createdAt) {
                        const activity = new Date(o.createdAt);
                        if (!map[key].lastActivity || activity > map[key].lastActivity) {
                            map[key].lastActivity = activity;
                        }
                    }
                }
            });
        return map;
    }, [orders, tables]);

    const decoratedTables = useMemo(() => {
        return tables.map(table => {
            const activeOrder = activeOrderByTable[table.id];
            if (activeOrder) {
                return {
                    ...table,
                    status: TableStatus.OCCUPIED,
                    currentOrderTotal: tableTotals[table.id] || 0,
                };
            }
            return table;
        });
    }, [tables, tableTotals, activeOrderByTable]);

    const filteredTables = useMemo(() => {
        return decoratedTables.filter((table) => {
            if (activeZone !== 'all' && table.zoneId !== activeZone) return false;
            if (searchQuery && !table.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        }).sort((a, b) => {
            const aNum = parseInt(a.name.replace(/\D/g, '')) || 0;
            const bNum = parseInt(b.name.replace(/\D/g, '')) || 0;
            return aNum - bNum || a.name.localeCompare(b.name);
        });
    }, [decoratedTables, activeZone, searchQuery]);

    const stats = useMemo(() => {
        return {
            available: decoratedTables.filter(t => t.status === TableStatus.AVAILABLE).length,
            occupied: decoratedTables.filter(t => [TableStatus.OCCUPIED, TableStatus.WAITING_FOOD, TableStatus.READY_TO_PAY].includes(t.status)).length,
            total: decoratedTables.length,
            activeTotal: Object.values(tableTotals).reduce((a, b) => a + b, 0)
        };
    }, [decoratedTables, tableTotals]);

    const getElapsedMinutes = (date?: Date) => {
        if (!date) return null;
        return Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
    };

    const StatusTheme = {
        [TableStatus.AVAILABLE]: {
            bg: 'bg-emerald-500/5',
            border: 'border-emerald-500/20',
            text: 'text-emerald-600 dark:text-emerald-400',
            icon: 'bg-emerald-500 text-white',
            badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
            glow: 'shadow-emerald-500/10',
            label: isAr ? 'متاحة' : 'Available'
        },
        [TableStatus.OCCUPIED]: {
            bg: 'bg-indigo-500/5',
            border: 'border-indigo-500/20',
            text: 'text-indigo-600 dark:text-indigo-400',
            icon: 'bg-indigo-500 text-white',
            badge: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
            glow: 'shadow-indigo-500/10',
            label: isAr ? 'مشغولة' : 'Occupied'
        },
    };

    const TableCard = ({ table }: { table: Table }) => {
        const theme = table.status === TableStatus.AVAILABLE
            ? StatusTheme[TableStatus.AVAILABLE]
            : StatusTheme[TableStatus.OCCUPIED];
        const summary = tableSummaries[table.id];
        const total = tableTotals[table.id] || 0;
        const elapsed = summary?.openedAt ? getElapsedMinutes(summary.openedAt) : null;
        const isUrgent = elapsed && elapsed > 25;
        const order = activeOrderByTable[table.id];

        return (
            <div
                dir={isAr ? 'rtl' : 'ltr'}
                onClick={() => onSelectTable(table)}
                className={`group flex flex-col h-full rounded-[2rem] border transition-all duration-150 relative overflow-hidden cursor-pointer ${theme.bg} ${theme.border} ${theme.glow} ${isUrgent ? 'ring-4 ring-rose-500/20 animate-pulse' : 'hover:shadow-2xl hover:border-primary/40'}`}
            >
                {/* Status Indicator Bar */}
                <div className={`absolute top-0 left-0 right-0 h-2 opacity-90 ${theme.icon} shadow-[0_2px_10px_rgba(0,0,0,0.1)]`} />
                
                <div className="p-4 sm:p-5 flex-1 flex flex-col min-w-0">
                    {/* Header: Table Name & Stats */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center shadow-lg border-2 border-white/20 ${theme.icon}`}>
                                <Users size={22} />
                            </div>
                            <div className="min-w-0">
                                <p title={table.name} className="mb-1 truncate text-base font-black text-main">
                                    {table.name}
                                </p>
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5 mb-1">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${theme.badge}`}>
                                        {theme.label}
                                    </span>
                                    {table.isVIP && (
                                        <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                                            <Crown size={12} className="text-amber-500 fill-amber-500" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-muted">
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-elevated rounded-lg border border-border/30">
                                        <Users size={12} className="text-primary" />
                                        <span className="text-[11px] font-black tabular-nums">{table.seats}</span>
                                    </div>
                                    {elapsed !== null && (
                                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border tabular-nums ${isUrgent ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600'}`}>
                                            <Timer size={12} className={isUrgent ? 'animate-spin-slow' : ''} />
                                            <span className="text-[11px] font-black">{elapsed}m</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {total > 0 && (
                            <div className={`flex min-w-0 max-w-[6.5rem] shrink-0 flex-col ${isAr ? 'items-start text-start' : 'items-end text-end'}`}>
                                <span className="text-[9px] font-black text-muted uppercase tracking-tighter opacity-60">{isAr ? 'القيمة' : 'TOTAL'}</span>
                                <span className="w-full truncate text-base font-black tabular-nums text-indigo-600 dark:text-indigo-400" title={`${total.toFixed(2)} ${currencySymbol}`}>
                                    {total.toFixed(0)} {currencySymbol}
                                </span>
                            </div>
                        )}
                    </div>

                    {(table.defaultCouponCode || Number(table.discount) > 0 || Number(table.minSpend) > 0 || table.notes) && (
                        <div className="mb-4 flex flex-wrap gap-1.5">
                            {table.defaultCouponCode ? (
                                <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[10px] font-black text-violet-600">
                                    <Tag size={11} />
                                    <span className="truncate">{table.defaultCouponCode}</span>
                                </span>
                            ) : Number(table.discount) > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-600">
                                    <Percent size={11} /> {Number(table.discount)}%
                                </span>
                            ) : null}
                            {Number(table.minSpend) > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-600">
                                    <Wallet size={11} /> {isAr ? 'حد أدنى' : 'MIN'} {currencySymbol}{Number(table.minSpend).toFixed(0)}
                                </span>
                            )}
                            {table.notes && (
                                <span title={table.notes} className="inline-flex items-center gap-1 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[10px] font-black text-sky-600">
                                    <StickyNote size={11} /> {isAr ? 'تعليمات' : 'NOTES'}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Quick Item View / Tags */}
                    {summary?.items > 0 && (
                        <div className="flex flex-wrap gap-2 mb-5">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/60 border border-border/40 text-[11px] font-black shadow-sm group-hover:bg-primary/5 transition-colors">
                                <Layers size={14} className="text-primary" />
                                <span>{summary.items} {isAr ? 'أصناف' : 'ITEMS'}</span>
                            </div>
                            
                            {order && (
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black shadow-sm transition-all ${order.status === OrderStatus.READY ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-600'}`}>
                                    <Utensils size={14} />
                                    <span className="uppercase tracking-wider">{isAr ? (order.status === OrderStatus.READY ? 'جاهز' : 'تحضير') : order.status}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Interactive Action Belt */}
                    <div className="mt-auto pt-4 border-t border-border/10 flex min-w-0 items-center justify-between gap-2">
                        {total > 0 ? (
                            <>
                                <div className="flex shrink-0 gap-2">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onTempBill(table); }}
                                        className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 text-muted border border-border shadow-sm hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center active:scale-95 group/btn"
                                        title={isAr ? 'طباعة فاتورة' : 'Print Pro-forma'}
                                    >
                                        <Wallet size={18} className="group-hover/btn:scale-110 transition-transform" />
                                    </button>
                                    {canResetTables && onResetTable && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onResetTable(table); }}
                                            className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 border border-rose-500/20 shadow-sm hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center active:scale-95"
                                            title={isAr ? 'تصفير الطاولة وإلغاء التعليق' : 'Reset stuck table'}
                                        >
                                            <Trash2 size={17} />
                                        </button>
                                    )}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onMergeTable(table); }}
                                        className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 text-muted border border-border shadow-sm hover:border-indigo-500/40 hover:text-indigo-500 hover:bg-indigo-500/5 transition-all flex items-center justify-center active:scale-95 group/btn"
                                        title={isAr ? 'دمج' : 'Merge'}
                                    >
                                        <Merge size={18} className="group-hover/btn:scale-110 transition-transform" />
                                    </button>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onResumeTable(table); }} 
                                    className="flex-1 min-w-0 h-12 rounded-2xl bg-primary text-white text-[11px] font-black uppercase tracking-[0.08em] shadow-xl shadow-primary/30 hover:shadow-primary/40 active:scale-95 transition-all flex items-center justify-center gap-2 overflow-hidden relative group/order"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent translate-x-[-100%] group-hover/order:translate-x-[100%] transition-transform duration-700" />
                                    <span>{isAr ? 'تعديل' : 'MODIFY'}</span>
                                    <ChevronRight size={16} className={`transition-transform group-hover/order:translate-x-1 ${isAr ? 'rotate-180 group-hover/order:-translate-x-1' : ''}`} />
                                </button>
                            </>
                        ) : (
                            <button className="w-full h-12 rounded-2xl bg-card border-2 border-dashed border-border/60 text-muted group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary transition-all flex items-center justify-center gap-2.5 text-xs font-black uppercase tracking-[0.2em] shadow-sm">
                                <div className="p-1.5 rounded-lg bg-elevated group-hover:bg-primary group-hover:text-white transition-colors">
                                    <Plus size={16} />
                                </div>
                                {isAr ? 'فتح الطلب' : 'NEW ORDER'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Header / Stats */}
            <div className={`flex flex-col gap-4 mb-6 ${isAr ? 'md:flex-row-reverse' : 'md:flex-row'} items-center justify-between`}>
                <div className={`flex flex-wrap gap-3 ${isAr ? 'justify-end' : 'justify-start'}`}>
                    {/* Status Stats */}
                    <div className="flex items-center gap-4 bg-card/40  border border-border/40 p-1.5 rounded-[1.5rem] shadow-sm">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 tabular-nums">{stats.available}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span className="text-xs font-black text-indigo-700 dark:text-indigo-400 tabular-nums">{stats.occupied}</span>
                        </div>
                        <div className="h-6 w-px bg-border/40 mx-1" />
                        <div className="flex items-center gap-2 px-3 py-1.5">
                            <Users size={14} className="text-muted" />
                            <span className="text-xs font-black text-main tabular-nums">{stats.total}</span>
                        </div>
                    </div>

                    {/* Sales Mini Card */}
                    <div className="bg-primary/5 border border-primary/10 px-4 py-2 rounded-[1.5rem] flex flex-col justify-center">
                        <div className="text-[8px] font-black text-primary uppercase tracking-widest leading-none mb-1">{isAr ? 'إجمالي المبيعات النشطة' : 'ACTIVE FLOOR SALES'}</div>
                        <div className="text-base font-black text-primary tabular-nums leading-none">
                            {currencySymbol}{stats.activeTotal.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                        </div>
                    </div>
                </div>

                {/* Search / Filter Controls */}
                <div className={`flex items-center gap-3 w-full md:w-auto ${isAr ? 'flex-row-reverse' : ''}`}>
                    <div className="relative flex-1 md:w-64 group">
                        <Search className={`absolute top-1/2 -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary ${isAr ? 'right-4' : 'left-4'}`} size={16} />
                        <input
                            type="text"
                            placeholder={isAr ? 'بحث عن طاولة...' : 'Search table...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`w-full ${isAr ? 'pr-11 pl-4' : 'pl-11 pr-4'} py-3 bg-card/60  border border-border/40 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all outline-none`}
                        />
                    </div>
                    
                    <div className="flex bg-card/60  p-1.5 rounded-2xl gap-1 border border-border/40">
                        <button 
                            onClick={() => setViewMode('GRID')}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'GRID' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-muted hover:bg-elevated'}`}
                            aria-label={isAr ? 'عرض الطاولات كشبكة' : 'Show tables as grid'}
                            title={isAr ? 'عرض الشبكة' : 'Grid view'}
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button 
                            onClick={() => setViewMode('LIST')}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'LIST' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-muted hover:bg-elevated'}`}
                            aria-label={isAr ? 'عرض الطاولات كقائمة' : 'Show tables as list'}
                            title={isAr ? 'عرض القائمة' : 'List view'}
                        >
                            <List size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Zone Grid Navigation */}
            <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-1">
                {formattedZones.map(zone => {
                    const isActive = activeZone === zone.id;
                    const count = zone.id === 'all' ? decoratedTables.length : decoratedTables.filter(t => t.zoneId === zone.id).length;
                    return (
                        <button
                            key={zone.id}
                            onClick={() => setActiveZone(zone.id)}
                            className={`flex flex-col items-start px-5 py-3 rounded-2xl min-w-[120px] transition-all border relative overflow-hidden group ${isActive 
                                ? 'bg-primary text-white border-primary shadow-xl shadow-primary/20 scale-[1.02]' 
                                : 'bg-card/40  border-border/40 text-muted hover:border-primary/40'}`}
                        >
                            <div className="flex justify-between w-full items-center mb-1 relative z-10">
                                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-primary'}`} />
                                <span className={`text-[10px] font-black tabular-nums transition-colors ${isActive ? 'text-white/60' : 'text-muted'}`}>
                                    {count}
                                </span>
                            </div>
                            <span className="text-xs font-black uppercase tracking-wider relative z-10">{zone.name}</span>
                            {!isActive && <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </button>
                    );
                })}
            </div>

            {/* Tables Grid */}
            <div className="flex-1 min-h-0">
                {filteredTables.length > 0 ? (
                    <VirtualGrid
                        itemCount={filteredTables.length}
                        columnWidth={viewMode === 'GRID' ? 300 : 360}
                        rowHeight={300}
                        gap={20}
                        className="h-full no-scrollbar"
                        renderItem={(index) => (
                            <TableCard table={filteredTables[index]} />
                        )}
                        getKey={(index) => filteredTables[index].id}
                    />
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-40">
                        <Utensils size={64} className="mb-4 text-muted" strokeWidth={1} />
                        <p className="text-sm font-black uppercase tracking-widest">{isAr ? 'لا توجد طاولات' : 'No Tables Found'}</p>
                    </div>
                )}
            </div>

            {/* Quick Actions / Legend */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-6 py-4 px-6 bg-card/20 rounded-3xl border border-border/30">
                {Object.entries(StatusTheme).map(([status, theme]) => (
                    <div key={status} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${theme.icon}`} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">{theme.label}</span>
                    </div>
                ))}
                <div className="h-4 w-px bg-border/40 mx-2" />
                <div className="flex items-center gap-2">
                    <Sparkles size={12} className="text-amber-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">{isAr ? 'تميز VIP' : 'VIP TABLE'}</span>
                </div>
                <div className="flex items-center gap-2 ml-4">
                    <div className="w-4 h-4 rounded bg-rose-500/20 border border-rose-500/40" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 animate-pulse">{isAr ? 'متأخرة (>25د)' : 'URGENT (>25m)'}</span>
                </div>
            </div>
        </div>
    );
};

export default TableMap;
