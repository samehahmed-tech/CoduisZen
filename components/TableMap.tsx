import React, { useState, useMemo, useRef } from 'react';
import {
    Users,
    LayoutGrid,
    Search,
    Grip,
    List,
    KanbanSquare,
    Zap,
    Crown,
    Percent,
    Layers,
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
    StickyNote,
    Keyboard,
    CornerDownLeft
} from 'lucide-react';
import { Table, TableStatus, FloorZone, Order, OrderStatus } from '../types';
import { getActiveTableOrders, sumTableOrdersTotal } from '../utils/tableOrder';
import VirtualGrid from './common/VirtualGrid';
import { useAuthStore } from '../stores/useAuthStore';
import POSShortcutsHelp from '../src/features/pos/components/POSShortcutsHelp';

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

type TableViewMode = 'CARDS' | 'COMPACT' | 'LIST' | 'BOARD' | 'EXPRESS';

const VIEW_MODE_KEY = 'coduiszen_tablemap_view_v1';

const normalizeDigits = (value: string): string =>
    String(value || '')
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

const URGENT_MINUTES = 25;

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
    const [viewMode, setViewMode] = useState<TableViewMode>(() => {
        try {
            const saved = localStorage.getItem(VIEW_MODE_KEY) as TableViewMode | null;
            return saved && ['CARDS', 'COMPACT', 'LIST', 'BOARD', 'EXPRESS'].includes(saved) ? saved : 'CARDS';
        } catch {
            return 'CARDS';
        }
    });
    const [showShortcuts, setShowShortcuts] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const setMode = (mode: TableViewMode) => {
        setViewMode(mode);
        try {
            localStorage.setItem(VIEW_MODE_KEY, mode);
        } catch {
            // ignore storage errors
        }
    };

    // ── Order aggregation (all open tickets per table) ─────────────────────
    // Dine-in creates a NEW order per kitchen send (a fired ticket goes
    // PREPARING and becomes read-only), so an occupied table routinely holds
    // several open tickets. The map shows their COMBINED total — showing only
    // the linked ticket reads as "half the bill". Orders are deduped by id so
    // optimistic retries can never double-count.

    const uniqueOrders = useMemo(() => {
        const seen = new Set<string>();
        const out: Order[] = [];
        for (const o of orders) {
            if (!o?.id || seen.has(o.id)) continue;
            seen.add(o.id);
            out.push(o);
        }
        return out;
    }, [orders]);

    const activeOrdersByTable = useMemo(() => {
        const map: Record<string, Order[]> = {};
        tables.forEach(table => {
            const list = getActiveTableOrders(uniqueOrders, tables, table.id);
            if (list.length > 0) map[table.id] = list;
        });
        return map;
    }, [uniqueOrders, tables]);

    // Primary ticket = latest open order. Drives the status chip, elapsed
    // clock anchor for single-ticket tables, and resume/merge actions —
    // per-order flows (close, temp bill, merge) intentionally stay single.
    const activeOrderByTable = useMemo(() => {
        const map: Record<string, Order> = {};
        Object.entries(activeOrdersByTable).forEach(([tableId, list]) => {
            map[tableId] = list[list.length - 1];
        });
        return map;
    }, [activeOrdersByTable]);

    const tableTotals = useMemo(() => {
        const map: Record<string, number> = {};
        Object.entries(activeOrdersByTable).forEach(([tableId, list]) => {
            map[tableId] = sumTableOrdersTotal(list);
        });
        return map;
    }, [activeOrdersByTable]);

    const tableSummaries = useMemo(() => {
        const map: Record<string, { items: number; total: number; status: OrderStatus; openedAt?: Date; lastActivity?: Date }> = {};
        Object.entries(activeOrdersByTable).forEach(([tableId, list]) => {
            const primary = list[list.length - 1];
            const itemsCount = list.reduce((sum, order) =>
                sum + (order.items || []).reduce((s, item) => s + (item.quantity || 0), 0), 0);
            map[tableId] = {
                items: itemsCount,
                total: sumTableOrdersTotal(list),
                status: primary.status,
                openedAt: list[0].createdAt ? new Date(list[0].createdAt) : undefined,
                lastActivity: primary.createdAt ? new Date(primary.createdAt) : undefined,
            };
        });
        return map;
    }, [activeOrdersByTable]);

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

    // Quick-jump: typing a table number + Enter opens it instantly.
    // Supports Arabic-Indic digits, exact numeric match first, then single filtered result.
    const quickJump = (rawValue: string): boolean => {
        const query = normalizeDigits(rawValue).trim();
        if (!query) return false;
        const numericQuery = query.replace(/\D/g, '').replace(/^0+/, '');
        let target = null as Table | null;
        if (numericQuery) {
            target = decoratedTables.find((table) => {
                const label = normalizeDigits(table.name || table.id || '');
                const match = label.match(/\d+/);
                if (!match) return false;
                return match[0].replace(/^0+/, '') === numericQuery;
            }) || null;
        }
        if (!target && filteredTables.length === 1) target = filteredTables[0];
        if (!target) {
            const lowered = query.toLowerCase();
            target = filteredTables.find((table) => table.name.toLowerCase() === lowered)
                || decoratedTables.find((table) => table.name.toLowerCase() === lowered)
                || null;
        }
        if (target) {
            onSelectTable(target);
            return true;
        }
        return false;
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            quickJump(searchQuery);
        }
    };

    // Exact match preview for the Enter hint.
    const quickJumpPreview = useMemo(() => {
        const query = normalizeDigits(searchQuery).trim();
        if (!query) return null;
        const numericQuery = query.replace(/\D/g, '').replace(/^0+/, '');
        if (numericQuery) {
            const exact = decoratedTables.find((table) => {
                const label = normalizeDigits(table.name || table.id || '');
                const match = label.match(/\d+/);
                return match ? match[0].replace(/^0+/, '') === numericQuery : false;
            });
            if (exact) return exact;
        }
        if (filteredTables.length === 1) return filteredTables[0];
        return null;
    }, [searchQuery, decoratedTables, filteredTables]);

    const getElapsedMinutes = (date?: Date) => {
        if (!date) return null;
        return Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
    };

    // ── Theme-aware status styling (semantic tokens follow the active theme) ──
    const StatusTheme = {
        [TableStatus.AVAILABLE]: {
            soft: 'bg-success/5',
            border: 'border-success/25',
            text: 'text-success',
            solid: 'bg-success text-white',
            badge: 'bg-success/10 text-success border-success/25',
            glow: 'shadow-success/10',
            ring: 'ring-success/40',
            label: isAr ? 'متاحة' : 'Available'
        },
        [TableStatus.OCCUPIED]: {
            soft: 'bg-primary/5',
            border: 'border-primary/25',
            text: 'text-primary',
            solid: 'bg-primary text-white',
            badge: 'bg-primary/10 text-primary border-primary/25',
            glow: 'shadow-primary/10',
            ring: 'ring-primary/40',
            label: isAr ? 'مشغولة' : 'Occupied'
        },
    };

    interface CardData {
        theme: typeof StatusTheme[TableStatus.AVAILABLE];
        summary?: { items: number; total: number; status: OrderStatus; openedAt?: Date; lastActivity?: Date };
        total: number;
        elapsed: number | null;
        isUrgent: boolean;
        order?: Order;
    }

    const getCardData = (table: Table): CardData => {
        const theme = table.status === TableStatus.AVAILABLE
            ? StatusTheme[TableStatus.AVAILABLE]
            : StatusTheme[TableStatus.OCCUPIED];
        const summary = tableSummaries[table.id];
        const total = tableTotals[table.id] || 0;
        const elapsed = summary?.openedAt ? getElapsedMinutes(summary.openedAt) : null;
        const isUrgent = !!elapsed && elapsed > URGENT_MINUTES;
        return { theme, summary, total, elapsed, isUrgent, order: activeOrderByTable[table.id] };
    };

    const orderStatusLabel = (order?: Order) => {
        if (!order) return '';
        if (order.status === OrderStatus.READY) return isAr ? 'جاهز' : 'READY';
        return isAr ? 'تحضير' : String(order.status);
    };

    const VipBadge = ({ table }: { table: Table }) => table.isVIP ? (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-warning/15 border border-warning/30" title={isAr ? 'طاولة VIP' : 'VIP table'}>
            <Crown size={12} className="text-warning fill-warning" />
        </span>
    ) : null;

    const ElapsedChip = ({ elapsed, isUrgent, size = 'md' }: { elapsed: number | null; isUrgent: boolean; size?: 'sm' | 'md' }) => {
        if (elapsed === null) return null;
        const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
        return (
            <span className={`inline-flex items-center gap-1 rounded-lg border tabular-nums font-black ${pad} ${isUrgent ? 'bg-danger/10 border-danger/25 text-danger' : 'bg-primary/10 border-primary/20 text-primary'}`}>
                <Timer size={12} />
                {elapsed}{isAr ? 'د' : 'm'}
            </span>
        );
    };

    const TotalBlock = ({ total, align = 'end' }: { total: number; align?: 'end' | 'center' }) => {
        if (!(total > 0)) return null;
        return (
            <div className={`flex flex-col ${align === 'center' ? 'items-center text-center' : isAr ? 'items-start text-start' : 'items-end text-end'}`}>
                <span className="text-[9px] font-black text-muted uppercase tracking-tighter opacity-60">{isAr ? 'القيمة' : 'TOTAL'}</span>
                <span className="truncate text-base font-black tabular-nums text-primary" title={`${total.toFixed(2)} ${currencySymbol}`}>
                    {total.toFixed(0)} {currencySymbol}
                </span>
            </div>
        );
    };

    const ActionBelt = ({ table, total, compact = false }: { table: Table; total: number; compact?: boolean }) => {
        const btn = compact
            ? 'w-9 h-9 rounded-xl'
            : 'w-10 h-10 rounded-2xl';
        if (!(total > 0)) {
            return (
                <button className="w-full h-12 rounded-2xl bg-card border-2 border-dashed border-border/60 text-muted group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary transition-all flex items-center justify-center gap-2.5 text-xs font-black uppercase tracking-[0.2em] shadow-sm">
                    <span className="p-1.5 rounded-lg bg-elevated group-hover:bg-primary group-hover:text-white transition-colors">
                        <Plus size={16} />
                    </span>
                    {isAr ? 'فتح الطلب' : 'NEW ORDER'}
                </button>
            );
        }
        return (
            <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex shrink-0 gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onTempBill(table); }}
                        className={`${btn} bg-card text-muted border border-border shadow-sm hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center active:scale-95`}
                        title={isAr ? 'طباعة فاتورة' : 'Print Pro-forma'}
                    >
                        <Wallet size={17} />
                    </button>
                    {canResetTables && onResetTable && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onResetTable(table); }}
                            className={`${btn} bg-danger/10 text-danger border border-danger/25 shadow-sm hover:bg-danger hover:text-white transition-all flex items-center justify-center active:scale-95`}
                            title={isAr ? 'تصفير الطاولة وإلغاء التعليق' : 'Reset stuck table'}
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onMergeTable(table); }}
                        className={`${btn} bg-card text-muted border border-border shadow-sm hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center active:scale-95`}
                        title={isAr ? 'دمج' : 'Merge'}
                    >
                        <Merge size={17} />
                    </button>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onResumeTable(table); }}
                    className="flex-1 min-w-0 h-12 rounded-2xl bg-primary text-white text-[11px] font-black uppercase tracking-[0.08em] shadow-xl shadow-primary/30 hover:shadow-primary/40 active:scale-95 transition-all flex items-center justify-center gap-2 overflow-hidden relative"
                >
                    <span>{isAr ? 'تعديل' : 'MODIFY'}</span>
                    <ChevronRight size={16} className={isAr ? 'rotate-180' : ''} />
                </button>
            </div>
        );
    };

    const PromoChips = ({ table }: { table: Table }) => {
        if (!(table.defaultCouponCode || Number(table.discount) > 0 || Number(table.minSpend) > 0 || table.notes)) return null;
        return (
            <div className="mb-4 flex flex-wrap gap-1.5">
                {table.defaultCouponCode ? (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-info/25 bg-info/10 px-2 py-1 text-[10px] font-black text-info">
                        <Tag size={11} />
                        <span className="truncate">{table.defaultCouponCode}</span>
                    </span>
                ) : Number(table.discount) > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-success/25 bg-success/10 px-2 py-1 text-[10px] font-black text-success">
                        <Percent size={11} /> {Number(table.discount)}%
                    </span>
                ) : null}
                {Number(table.minSpend) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-warning/25 bg-warning/10 px-2 py-1 text-[10px] font-black text-warning">
                        <Wallet size={11} /> {isAr ? 'حد أدنى' : 'MIN'} {currencySymbol}{Number(table.minSpend).toFixed(0)}
                    </span>
                )}
                {table.notes && (
                    <span title={table.notes} className="inline-flex items-center gap-1 rounded-lg border border-info/25 bg-info/10 px-2 py-1 text-[10px] font-black text-info">
                        <StickyNote size={11} /> {isAr ? 'تعليمات' : 'NOTES'}
                    </span>
                )}
            </div>
        );
    };

    // ── Mode 1: CARDS (current detailed shape, now theme-aware) ───────────────
    const TableCard = ({ table }: { table: Table }) => {
        const { theme, summary, total, elapsed, isUrgent, order } = getCardData(table);

        return (
            <div
                dir={isAr ? 'rtl' : 'ltr'}
                onClick={() => onSelectTable(table)}
                className={`group flex flex-col h-full rounded-[2rem] border transition-all duration-150 relative overflow-hidden cursor-pointer bg-card ${theme.border} ${theme.glow} ${isUrgent ? 'ring-4 ring-danger/25 animate-pulse' : 'hover:shadow-2xl hover:border-primary/40'}`}
            >
                {/* Status Indicator Bar */}
                <div className={`absolute top-0 left-0 right-0 h-2 opacity-90 ${theme.solid} shadow-[0_2px_10px_rgba(0,0,0,0.1)]`} />

                <div className="p-4 sm:p-5 flex-1 flex flex-col min-w-0">
                    {/* Header: Table Name & Stats */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center shadow-lg border-2 border-white/20 ${theme.solid}`}>
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
                                    <VipBadge table={table} />
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-muted">
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-elevated rounded-lg border border-border/30">
                                        <Users size={12} className="text-primary" />
                                        <span className="text-[11px] font-black tabular-nums">{table.seats}</span>
                                    </div>
                                    <ElapsedChip elapsed={elapsed} isUrgent={isUrgent} />
                                </div>
                            </div>
                        </div>

                        <TotalBlock total={total} />
                    </div>

                    <PromoChips table={table} />

                    {/* Quick Item View / Tags */}
                    {summary && summary.items > 0 && (
                        <div className="flex flex-wrap gap-2 mb-5">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/60 border border-border/40 text-[11px] font-black shadow-sm group-hover:bg-primary/5 transition-colors">
                                <Layers size={14} className="text-primary" />
                                <span>{summary.items} {isAr ? 'أصناف' : 'ITEMS'}</span>
                            </div>

                            {order && (
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black shadow-sm transition-all ${order.status === OrderStatus.READY ? 'bg-success/10 border-success/25 text-success' : 'bg-warning/10 border-warning/25 text-warning'}`}>
                                    <Utensils size={14} />
                                    <span className="uppercase tracking-wider">{orderStatusLabel(order)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Interactive Action Belt */}
                    <div className="mt-auto pt-4 border-t border-border/10">
                        <ActionBelt table={table} total={total} />
                    </div>
                </div>
            </div>
        );
    };

    // ── Mode 2: COMPACT — dense tiles for big floors ──────────────────────────
    const CompactTile = ({ table }: { table: Table }) => {
        const { theme, summary, total, elapsed, isUrgent } = getCardData(table);
        return (
            <div
                dir={isAr ? 'rtl' : 'ltr'}
                onClick={() => onSelectTable(table)}
                className={`group h-full rounded-2xl border bg-card ${theme.border} p-3 flex flex-col gap-1.5 cursor-pointer transition-all hover:shadow-xl hover:border-primary/40 active:scale-[0.98] ${isUrgent ? 'ring-2 ring-danger/30 animate-pulse' : ''}`}
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${theme.solid}`} />
                        <p className="truncate text-sm font-black text-main" title={table.name}>{table.name}</p>
                        <VipBadge table={table} />
                    </div>
                    <ElapsedChip elapsed={elapsed} isUrgent={isUrgent} size="sm" />
                </div>
                <div className="flex items-end justify-between gap-2 mt-auto">
                    <div className="flex items-center gap-2 text-muted text-[10px] font-bold">
                        <span className="inline-flex items-center gap-1"><Users size={11} className="text-primary" />{table.seats}</span>
                        {summary && summary.items > 0 && (
                            <span className="inline-flex items-center gap-1"><Layers size={11} className="text-primary" />{summary.items}</span>
                        )}
                    </div>
                    {total > 0 ? (
                        <span className="text-sm font-black tabular-nums text-primary" title={`${total.toFixed(2)} ${currencySymbol}`}>
                            {total.toFixed(0)}
                        </span>
                    ) : (
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted opacity-60">{isAr ? 'فارغة' : 'FREE'}</span>
                    )}
                </div>
            </div>
        );
    };

    // ── Mode 3: LIST — full rows, fastest to scan ─────────────────────────────
    const ListRow = ({ table }: { table: Table }) => {
        const { theme, summary, total, elapsed, isUrgent, order } = getCardData(table);
        return (
            <div
                dir={isAr ? 'rtl' : 'ltr'}
                onClick={() => onSelectTable(table)}
                className={`group flex items-center gap-3 rounded-2xl border bg-card ${theme.border} px-4 py-3 cursor-pointer transition-all hover:shadow-lg hover:border-primary/40 ${isUrgent ? 'ring-2 ring-danger/30' : ''}`}
            >
                <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${theme.solid}`}>
                    <Users size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-black text-main" title={table.name}>{table.name}</p>
                        <VipBadge table={table} />
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${theme.badge}`}>
                            {theme.label}
                        </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-muted">
                        <span className="inline-flex items-center gap-1 tabular-nums"><Users size={11} />{table.seats} {isAr ? 'مقاعد' : 'seats'}</span>
                        {summary && summary.items > 0 && (
                            <span className="inline-flex items-center gap-1 tabular-nums"><Layers size={11} />{summary.items} {isAr ? 'أصناف' : 'items'}</span>
                        )}
                        {order && (
                            <span className={`font-black ${order.status === OrderStatus.READY ? 'text-success' : 'text-warning'}`}>
                                • {orderStatusLabel(order)}
                            </span>
                        )}
                    </div>
                </div>
                <ElapsedChip elapsed={elapsed} isUrgent={isUrgent} size="sm" />
                <div className="w-24 shrink-0">
                    <TotalBlock total={total} />
                </div>
                <div className="hidden sm:flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {total > 0 ? (
                        <>
                            <button
                                onClick={() => onTempBill(table)}
                                className="w-9 h-9 rounded-xl bg-elevated text-muted hover:text-primary hover:bg-primary/10 transition-all flex items-center justify-center active:scale-95"
                                title={isAr ? 'فاتورة مؤقتة' : 'Temp bill'}
                            >
                                <Wallet size={16} />
                            </button>
                            <button
                                onClick={() => onResumeTable(table)}
                                className="h-9 px-4 rounded-xl bg-primary text-white text-[11px] font-black shadow-lg shadow-primary/25 hover:brightness-110 active:scale-95 transition-all"
                            >
                                {isAr ? 'تعديل' : 'OPEN'}
                            </button>
                        </>
                    ) : (
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted opacity-60 px-2">{isAr ? 'فارغة' : 'FREE'}</span>
                    )}
                </div>
            </div>
        );
    };

    // ── Mode 4: BOARD — kanban by status for the host stand ───────────────────
    const BoardColumn = ({ title, count, columnTotal, accent, children }: { title: string; count: number; columnTotal: number; accent: string; children: React.ReactNode }) => (
        <div className="rounded-3xl border border-border/40 bg-elevated/30 p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${accent}`} />
                    <span className="text-xs font-black text-main">{title}</span>
                    <span className="text-[10px] font-black tabular-nums text-muted bg-card border border-border/40 rounded-full px-2 py-0.5">{count}</span>
                </div>
                {columnTotal > 0 && (
                    <span className="text-[11px] font-black tabular-nums text-primary">{columnTotal.toFixed(0)} {currencySymbol}</span>
                )}
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto no-scrollbar min-h-0">{children}</div>
        </div>
    );

    const BoardMiniCard = ({ table }: { table: Table }) => {
        const { theme, summary, total, elapsed, isUrgent } = getCardData(table);
        return (
            <div
                dir={isAr ? 'rtl' : 'ltr'}
                onClick={() => onSelectTable(table)}
                className={`rounded-2xl border bg-card ${theme.border} p-3 cursor-pointer transition-all hover:shadow-lg hover:border-primary/40 active:scale-[0.98] ${isUrgent ? 'ring-2 ring-danger/30' : ''}`}
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <p className="truncate text-sm font-black text-main">{table.name}</p>
                        <VipBadge table={table} />
                    </div>
                    <ElapsedChip elapsed={elapsed} isUrgent={isUrgent} size="sm" />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-bold text-muted">
                    <span className="inline-flex items-center gap-2 tabular-nums">
                        <span className="inline-flex items-center gap-1"><Users size={11} />{table.seats}</span>
                        {summary && summary.items > 0 && (
                            <span className="inline-flex items-center gap-1"><Layers size={11} />{summary.items}</span>
                        )}
                    </span>
                    {total > 0 && (
                        <span className="text-sm font-black tabular-nums text-primary">{total.toFixed(0)} {currencySymbol}</span>
                    )}
                </div>
            </div>
        );
    };

    // ── Mode 5: EXPRESS — giant number keys for rush hour ─────────────────────
    const ExpressTile = ({ table }: { table: Table }) => {
        const { theme, total, elapsed, isUrgent } = getCardData(table);
        return (
            <button
                dir={isAr ? 'rtl' : 'ltr'}
                onClick={() => onSelectTable(table)}
                className={`h-full w-full rounded-3xl border-2 bg-card ${theme.border} p-3 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:shadow-2xl hover:border-primary active:scale-95 relative overflow-hidden ${isUrgent ? 'ring-4 ring-danger/30 animate-pulse' : ''}`}
            >
                <span className={`absolute top-0 left-0 right-0 h-1.5 ${theme.solid}`} />
                {table.isVIP && <Crown size={14} className="text-warning fill-warning" />}
                <span className="text-4xl font-black tabular-nums text-main leading-none" title={table.name}>
                    {normalizeDigits(table.name).match(/\d+/)?.[0] || table.name}
                </span>
                <span className={`text-[9px] font-black uppercase tracking-widest ${theme.text}`}>
                    {theme.label}
                </span>
                {total > 0 ? (
                    <span className="text-sm font-black tabular-nums text-primary">{total.toFixed(0)} {currencySymbol}</span>
                ) : (
                    <ElapsedChip elapsed={elapsed} isUrgent={isUrgent} size="sm" />
                )}
            </button>
        );
    };

    const MODES: { id: TableViewMode; ar: string; en: string; icon: React.ReactNode }[] = [
        { id: 'CARDS', ar: 'بطاقات', en: 'Cards', icon: <LayoutGrid size={16} /> },
        { id: 'COMPACT', ar: 'مدمج', en: 'Compact', icon: <Grip size={16} /> },
        { id: 'LIST', ar: 'قائمة', en: 'List', icon: <List size={16} /> },
        { id: 'BOARD', ar: 'لوحة', en: 'Board', icon: <KanbanSquare size={16} /> },
        { id: 'EXPRESS', ar: 'سريع', en: 'Express', icon: <Zap size={16} /> },
    ];

    const boardGroups = useMemo(() => {
        const available: Table[] = [];
        const occupied: Table[] = [];
        const urgent: Table[] = [];
        filteredTables.forEach(table => {
            const { isUrgent } = getCardData(table);
            if (table.status === TableStatus.AVAILABLE && !activeOrderByTable[table.id]) {
                available.push(table);
            } else if (isUrgent) {
                urgent.push(table);
            } else {
                occupied.push(table);
            }
        });
        const sumOf = (list: Table[]) => list.reduce((s, tb) => s + (tableTotals[tb.id] || 0), 0);
        return {
            available: { list: available, total: sumOf(available) },
            occupied: { list: occupied, total: sumOf(occupied) },
            urgent: { list: urgent, total: sumOf(urgent) },
        };
    }, [filteredTables, activeOrderByTable, tableTotals]);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Header / Stats */}
            <div className={`flex flex-col gap-4 mb-6 ${isAr ? 'md:flex-row-reverse' : 'md:flex-row'} items-center justify-between`}>
                <div className={`flex flex-wrap gap-3 ${isAr ? 'justify-end' : 'justify-start'}`}>
                    {/* Status Stats */}
                    <div className="flex items-center gap-4 bg-card/40  border border-border/40 p-1.5 rounded-[1.5rem] shadow-sm">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-success/10 border border-success/25">
                            <span className="w-2 h-2 rounded-full bg-success" />
                            <span className="text-xs font-black text-success tabular-nums">{stats.available}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-primary/10 border border-primary/25">
                            <span className="w-2 h-2 rounded-full bg-primary" />
                            <span className="text-xs font-black text-primary tabular-nums">{stats.occupied}</span>
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
                    <div className="relative flex-1 md:w-72 group">
                        <Search className={`absolute top-1/2 -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary ${isAr ? 'right-4' : 'left-4'}`} size={16} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            inputMode="numeric"
                            placeholder={isAr ? 'رقم الطاولة + Enter للفتح السريع...' : 'Table number + Enter to open...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            aria-label={isAr ? 'بحث برقم الطاولة والفتح السريع' : 'Search by table number and quick-open'}
                            className={`w-full ${isAr ? 'pr-11 pl-20' : 'pl-11 pr-20'} py-3 bg-card/60  border border-border/40 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all outline-none tabular-nums`}
                        />
                        {quickJumpPreview ? (
                            <button
                                onClick={() => quickJump(searchQuery)}
                                title={isAr ? `فتح ${quickJumpPreview.name} (Enter)` : `Open ${quickJumpPreview.name} (Enter)`}
                                className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-white text-[10px] font-black shadow-lg shadow-primary/30 hover:brightness-110 active:scale-95 transition-all ${isAr ? 'left-2' : 'right-2'}`}
                            >
                                <CornerDownLeft size={12} />
                                <span className="max-w-[5rem] truncate" dir="auto">{quickJumpPreview.name}</span>
                            </button>
                        ) : searchQuery ? (
                            <button
                                onClick={() => quickJump(searchQuery)}
                                title={isAr ? 'فتح (Enter)' : 'Open (Enter)'}
                                className={`absolute top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg border border-border/40 text-muted text-[10px] font-black hover:text-primary hover:border-primary/40 transition-all ${isAr ? 'left-2' : 'right-2'}`}
                            >
                                Enter
                            </button>
                        ) : (
                            <kbd className={`absolute top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md border border-border/40 bg-elevated/60 text-muted font-mono text-[9px] font-black pointer-events-none ${isAr ? 'left-3' : 'right-3'}`} dir="ltr">
                                12 ⏎
                            </kbd>
                        )}
                    </div>
                    <button
                        onClick={() => setShowShortcuts(true)}
                        aria-label={isAr ? 'اختصارات لوحة المفاتيح (؟)' : 'Keyboard shortcuts (?)'}
                        title={isAr ? 'اختصارات لوحة المفاتيح (؟ / F1)' : 'Keyboard shortcuts (? / F1)'}
                        className="p-2.5 rounded-2xl bg-card/60 border border-border/40 text-muted hover:text-primary hover:border-primary/40 transition-all active:scale-95 shrink-0"
                    >
                        <Keyboard size={18} />
                    </button>
                </div>
            </div>

            {/* View mode switcher */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar p-1.5 rounded-2xl bg-card/60 border border-border/40 w-fit max-w-full" role="tablist" aria-label={isAr ? 'طريقة عرض الطاولات' : 'Table view mode'}>
                {MODES.map(mode => {
                    const active = viewMode === mode.id;
                    return (
                        <button
                            key={mode.id}
                            role="tab"
                            aria-selected={active}
                            onClick={() => setMode(mode.id)}
                            title={isAr ? mode.ar : mode.en}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black whitespace-nowrap transition-all active:scale-95 ${active
                                ? 'bg-primary text-white shadow-lg shadow-primary/25'
                                : 'text-muted hover:text-main hover:bg-elevated'}`}
                        >
                            {mode.icon}
                            <span className="hidden sm:inline">{isAr ? mode.ar : mode.en}</span>
                        </button>
                    );
                })}
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

            {/* Tables by mode */}
            <div className="flex-1 min-h-0">
                {filteredTables.length > 0 ? (
                    <>
                        {viewMode === 'CARDS' && (
                            <VirtualGrid
                                itemCount={filteredTables.length}
                                columnWidth={300}
                                rowHeight={300}
                                gap={20}
                                className="h-full no-scrollbar"
                                renderItem={(index) => (
                                    <TableCard table={filteredTables[index]} />
                                )}
                                getKey={(index) => filteredTables[index].id}
                            />
                        )}
                        {viewMode === 'COMPACT' && (
                            <VirtualGrid
                                itemCount={filteredTables.length}
                                columnWidth={190}
                                rowHeight={132}
                                gap={12}
                                className="h-full no-scrollbar"
                                renderItem={(index) => (
                                    <CompactTile table={filteredTables[index]} />
                                )}
                                getKey={(index) => filteredTables[index].id}
                            />
                        )}
                        {viewMode === 'EXPRESS' && (
                            <VirtualGrid
                                itemCount={filteredTables.length}
                                columnWidth={160}
                                rowHeight={188}
                                gap={12}
                                className="h-full no-scrollbar"
                                renderItem={(index) => (
                                    <ExpressTile table={filteredTables[index]} />
                                )}
                                getKey={(index) => filteredTables[index].id}
                            />
                        )}
                        {viewMode === 'LIST' && (
                            <div className="h-full overflow-y-auto no-scrollbar flex flex-col gap-2 pb-2">
                                {filteredTables.map(table => (
                                    <ListRow key={table.id} table={table} />
                                ))}
                            </div>
                        )}
                        {viewMode === 'BOARD' && (
                            <div className="h-full min-h-0 grid grid-cols-1 md:grid-cols-3 gap-3 overflow-y-auto md:overflow-hidden no-scrollbar pb-2">
                                <BoardColumn
                                    title={isAr ? 'متاحة' : 'Available'}
                                    count={boardGroups.available.list.length}
                                    columnTotal={boardGroups.available.total}
                                    accent="bg-success"
                                >
                                    {boardGroups.available.list.map(table => (
                                        <BoardMiniCard key={table.id} table={table} />
                                    ))}
                                    {boardGroups.available.list.length === 0 && (
                                        <p className="text-center text-[11px] font-bold text-muted py-6 opacity-60">{isAr ? 'لا يوجد' : 'None'}</p>
                                    )}
                                </BoardColumn>
                                <BoardColumn
                                    title={isAr ? 'مشغولة' : 'Occupied'}
                                    count={boardGroups.occupied.list.length}
                                    columnTotal={boardGroups.occupied.total}
                                    accent="bg-primary"
                                >
                                    {boardGroups.occupied.list.map(table => (
                                        <BoardMiniCard key={table.id} table={table} />
                                    ))}
                                    {boardGroups.occupied.list.length === 0 && (
                                        <p className="text-center text-[11px] font-bold text-muted py-6 opacity-60">{isAr ? 'لا يوجد' : 'None'}</p>
                                    )}
                                </BoardColumn>
                                <BoardColumn
                                    title={isAr ? 'متأخرة (>25د)' : 'Urgent (>25m)'}
                                    count={boardGroups.urgent.list.length}
                                    columnTotal={boardGroups.urgent.total}
                                    accent="bg-danger"
                                >
                                    {boardGroups.urgent.list.map(table => (
                                        <BoardMiniCard key={table.id} table={table} />
                                    ))}
                                    {boardGroups.urgent.list.length === 0 && (
                                        <p className="text-center text-[11px] font-bold text-muted py-6 opacity-60">{isAr ? 'لا يوجد' : 'None'}</p>
                                    )}
                                </BoardColumn>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-40">
                        <Utensils size={64} className="mb-4 text-muted" strokeWidth={1} />
                        <p className="text-sm font-black uppercase tracking-widest">{isAr ? 'لا توجد طاولات' : 'No Tables Found'}</p>
                    </div>
                )}
            </div>

            {/* Legend — static, no pulse/flash (calm POS surface). Pulse stays only on urgent table cards above. */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 px-6 bg-card/20 rounded-3xl border border-border/30">
                {Object.entries(StatusTheme).map(([status, theme]) => (
                    <div key={status} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${theme.solid}`} aria-hidden="true" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">{theme.label}</span>
                    </div>
                ))}
                <div className="h-4 w-px bg-border/40 mx-2 hidden sm:block" aria-hidden="true" />
                <div className="flex items-center gap-2">
                    <Sparkles size={12} className="text-warning" aria-hidden="true" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-warning">{isAr ? 'تميز VIP' : 'VIP TABLE'}</span>
                </div>
                <div className="flex items-center gap-2 ml-4">
                    <div className="w-4 h-4 rounded bg-danger/15 border border-danger/30" aria-hidden="true" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-danger">{isAr ? 'متأخرة (>25د)' : 'URGENT (>25m)'}</span>
                </div>
                <div className="h-4 w-px bg-border/40 mx-2 hidden sm:block" aria-hidden="true" />
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-muted">
                    <Clock size={11} />
                    {isAr ? 'تلميح: اكتب رقم الطاولة من الكيبورد وهي هتتفتح لوحدها' : 'Tip: type a table number and it opens automatically'}
                </span>
            </div>
            <POSShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} lang={isAr ? 'ar' : 'en'} />
        </div>
    );
};

export default TableMap;
