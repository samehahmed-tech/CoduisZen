
import React, { useState, useRef, useEffect } from 'react';
import {
    Plus,
    Trash2,
    RotateCcw,
    Save,
    Square,
    Circle,
    Layout,
    Users,
    Move,
    Layers,
    StickyNote,
    Copy,
    RectangleHorizontal,
    X,
    Settings2,
    Type,
    Tag,
    Crown,
    ChevronDown,
    Undo2,
    Grid3X3,
    Table as TableIcon,
    Palette,
    Wind,
    Home,
    Palmtree,
    Monitor
} from 'lucide-react';
import { Table, TableStatus, FloorZone } from '../types';

// Stores
import { useOrderStore } from '../stores/useOrderStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { tablesApi } from '../services/api/tables';
import { couponsApi, ManagedCoupon } from '../services/api/campaigns';
import { localDb } from '../db/localDb';
import { syncService } from '../services/syncService';
import { toBranchEntityCache } from '../src/utils/branchEntityCache';
import { useToast } from './common/ToastProvider';
import { useConfirm } from './common/ConfirmProvider';
import TableVisual from './floor/TableVisual';

export type DesignerTableShape = 'square' | 'round' | 'rectangle' | 'oval' | 'booth' | 'bar';

const TABLE_CATALOG: { id: DesignerTableShape; nameEn: string; nameAr: string; width: number; height: number; seats: number }[] = [
    { id: 'square', nameEn: 'Wooden Square · 4', nameAr: 'ترابيزة مربعة خشب · 4', width: 150, height: 150, seats: 4 },
    { id: 'round', nameEn: 'Round Top · 4-6', nameAr: 'ترابيزة دائرية · 4-6', width: 160, height: 160, seats: 4 },
    { id: 'rectangle', nameEn: 'Family Rect · 6', nameAr: 'ترابيزة مستطيلة عائلية · 6', width: 190, height: 150, seats: 6 },
    { id: 'oval', nameEn: 'Oval · 6', nameAr: 'ترابيزة بيضاوية · 6', width: 200, height: 160, seats: 6 },
    { id: 'booth', nameEn: 'Booth Sofa · 4', nameAr: 'بوكس كنب · 4', width: 200, height: 170, seats: 4 },
    { id: 'bar', nameEn: 'Bar Counter · 3', nameAr: 'بار مرتفع · 3', width: 210, height: 130, seats: 3 },
];

const ZONE_ICONS: Record<string, any> = {
    Home,
    Wind,
    Palmtree,
    Monitor,
    Layers
};

const FloorDesigner: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const navigate = useNavigate();
    const { tables, updateTables, zones, updateZones } = useOrderStore();
    const { settings } = useAuthStore();
    const { success, error } = useToast();
    const { confirm } = useConfirm();

    const lang = (settings.language || 'en') as 'en' | 'ar';
    const tr = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const DEFAULT_ZONE_SIZE = { width: 1600, height: 1200 };
    const initialZones = zones.length > 0 ? zones : [{
        id: 'MAIN',
        name: tr('Main Hall', 'الصالة الرئيسية'),
        color: 'bg-indigo-600',
        ...DEFAULT_ZONE_SIZE,
    }];

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [localTables, setLocalTables] = useState<Table[]>(tables);
    const [localZones, setLocalZones] = useState<FloorZone[]>(initialZones);
    const [activeZone, setActiveZone] = useState<string>(initialZones[0].id);
    const [isZoneManagerOpen, setIsZoneManagerOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [coupons, setCoupons] = useState<ManagedCoupon[]>([]);

    // Layout Templates
    const LAYOUT_TEMPLATES = [
        { id: 'grid', name: tr('Standard Grid', 'شبكة قياسية'), icon: Grid3X3 },
        { id: 'cafeteria', name: tr('Cafeteria Row', 'صف كافيتيريا'), icon: TableIcon },
        { id: 'lounge', name: tr('Lounge Circular', 'لاونج دائري'), icon: Circle },
        { id: 'banquet', name: tr('Banquet Hall', 'قاعة مناسبات'), icon: Layers },
        { id: 'fine-dining', name: tr('Fine Dining', 'مطعم فاخر'), icon: Crown }
    ];

    const designerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const zone = localZones.find(z => z.id === activeZone);
        if (!zone) return;
        if (!zone.width || !zone.height) {
            setLocalZones(localZones.map(z => z.id === activeZone ? { ...z, width: zone.width || DEFAULT_ZONE_SIZE.width, height: zone.height || DEFAULT_ZONE_SIZE.height } : z));
        }
    }, [activeZone, localZones]);

    useEffect(() => {
        let active = true;
        couponsApi.getAll()
            .then(rows => {
                if (active) setCoupons(rows.filter(coupon => coupon.isActive !== false));
            })
            .catch((couponError: unknown) => {
                console.error('[FloorDesigner] Failed to load coupons', couponError);
                if (active) setCoupons([]);
            });
        return () => {
            active = false;
        };
    }, []);

    const getZoneBounds = () => {
        const zone = localZones.find(z => z.id === activeZone);
        const width = zone?.width || DEFAULT_ZONE_SIZE.width;
        const height = zone?.height || DEFAULT_ZONE_SIZE.height;
        return { width, height };
    };

    const clampTablePosition = (x: number, y: number, width: number, height: number) => {
        const bounds = getZoneBounds();
        return {
            x: Math.max(0, Math.min(x, bounds.width - width)),
            y: Math.max(0, Math.min(y, bounds.height - height)),
        };
    };

    const updateZoneSize = (zoneId: string, updates: Partial<FloorZone>) => {
        setLocalZones(localZones.map(z => z.id === zoneId ? { ...z, ...updates } : z));
    };

    // Overlap Prevention Logic
    const isOverlapping = (id: string, x: number, y: number, width: number, height: number) => {
        return localTables.some(t => {
            if (t.id === id || t.zoneId !== activeZone) return false;
            const margin = 10; // Extra buffer
            return (
                x < t.position.x + t.width + margin &&
                x + width + margin > t.position.x &&
                y < t.position.y + t.height + margin &&
                y + height + margin > t.position.y
            );
        });
    };

    const findFreePosition = (tempId: string, width: number, height: number) => {
        const { width: zoneWidth, height: zoneHeight } = getZoneBounds();
        const padding = 40;
        const gap = 24;
        const maxX = Math.max(padding, zoneWidth - width - padding);
        const maxY = Math.max(padding, zoneHeight - height - padding);

        const cols = Math.max(1, Math.floor((zoneWidth - padding * 2) / (width + gap)));
        const rows = Math.max(1, Math.floor((zoneHeight - padding * 2) / (height + gap)));

        let index = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = padding + c * (width + gap);
                const y = padding + r * (height + gap);
                if (!isOverlapping(tempId, x, y, width, height)) {
                    return { x, y };
                }
                index++;
            }
        }

        // Spiral search fallback (keeps adding without stacking)
        const centerX = Math.max(padding, Math.min(maxX, zoneWidth / 2 - width / 2));
        const centerY = Math.max(padding, Math.min(maxY, zoneHeight / 2 - height / 2));
        const step = Math.max(20, Math.floor(Math.min(width, height) / 2));
        let radius = step;
        let angle = 0;
        let attempts = 0;
        while (attempts < 300) {
            const x = Math.max(padding, Math.min(maxX, centerX + Math.cos(angle) * radius));
            const y = Math.max(padding, Math.min(maxY, centerY + Math.sin(angle) * radius));
            if (!isOverlapping(tempId, x, y, width, height)) {
                return { x, y };
            }
            angle += Math.PI / 6;
            if (angle >= Math.PI * 2) {
                angle = 0;
                radius += step;
            }
            attempts++;
        }

        const zoneTables = localTables.filter(t => t.zoneId === activeZone);
        const maxBottom = zoneTables.reduce((max, t) => Math.max(max, t.position.y + t.height), padding);
        const nextY = maxBottom + gap;
        const minHeight = nextY + height + padding;
        if (minHeight > zoneHeight) {
            updateZoneSize(activeZone, { height: minHeight + 200 });
        }
        return { x: padding, y: nextY };
    };

    const handleAddTable = (shape: DesignerTableShape) => {
        const spec = TABLE_CATALOG.find(s => s.id === shape) || TABLE_CATALOG[0];
        const width = spec.width;
        const height = spec.height;
        const { width: zoneWidth, height: zoneHeight } = getZoneBounds();
        const padding = 40;
        const gap = 24;
        const cols = Math.max(1, Math.floor((zoneWidth - padding * 2) / (width + gap)));
        const rows = Math.max(1, Math.floor((zoneHeight - padding * 2) / (height + gap)));
        const capacity = cols * rows;
        if (tablesInZone.length + 1 > capacity) {
            const extraRows = Math.ceil((tablesInZone.length + 1 - capacity) / cols);
            const newHeight = zoneHeight + extraRows * (height + gap) + padding;
            updateZoneSize(activeZone, { height: newHeight });
        }

        const tempId = `new-${Date.now()}`;
        const { x, y } = findFreePosition(tempId, width, height);

        const newTable: Table = {
            id: `tbl-${Date.now()}`,
            name: String(localTables.length + 1),
            seats: spec.seats,
            status: TableStatus.AVAILABLE,
            position: { x, y },
            width,
            height,
            shape: shape as Table['shape'],
            zoneId: activeZone,
            discount: 0,
            isVIP: shape === 'booth' ? false : false
        };
        setLocalTables([...localTables, newTable]);
        setSelectedId(newTable.id);
    };

    const handleUpdateTable = (id: string, updates: Partial<Table>) => {
        setLocalTables(localTables.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const handleDeleteTable = async (id: string) => {
        const ok = await confirm({
            title: tr('Delete table?', 'حذف الطاولة؟'),
            message: tr('This removes the table from the layout. Save to apply it.', 'سيتم حذف الطاولة من التخطيط. احفظ لتطبيق التغيير.'),
            confirmText: tr('Delete', 'حذف'),
            cancelText: tr('Cancel', 'إلغاء'),
            variant: 'danger',
        });
        if (!ok) return;
        setLocalTables(localTables.filter(t => t.id !== id));
        setSelectedId(null);
    };

    const handleDuplicateTable = (table: Table) => {
        const tempId = `dup-${Date.now()}`;
        const { x, y } = findFreePosition(tempId, table.width, table.height);
        const newTable: Table = {
            ...table,
            id: `tbl-${Date.now()}`,
            name: `${table.name} (Copy)`,
            position: { x, y }
        };
        setLocalTables([...localTables, newTable]);
        setSelectedId(newTable.id);
    };

    const handleApplyLayout = (type: string) => {
        // Clear current zone tables
        let newTables = localTables.filter(t => t.zoneId !== activeZone);

        if (type === 'grid') {
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 4; j++) {
                    newTables.push({
                        id: `tbl-grid-${i}-${j}-${Date.now()}`,
                        name: `${newTables.length + 1}`,
                        seats: 4,
                        status: TableStatus.AVAILABLE,
                        position: { x: 100 + j * 160, y: 100 + i * 160 },
                        width: 100, height: 100, shape: 'square', zoneId: activeZone, discount: 0, isVIP: false
                    });
                }
            }
        } else if (type === 'cafeteria') {
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 6; j++) {
                    newTables.push({
                        id: `tbl-caf-${i}-${j}-${Date.now()}`,
                        name: `C${newTables.length + 1}`,
                        seats: 6,
                        status: TableStatus.AVAILABLE,
                        position: { x: 80 + j * 160, y: 150 + i * 250 },
                        width: 140, height: 80, shape: 'rectangle', zoneId: activeZone, discount: 0, isVIP: false
                    });
                }
            }
        } else if (type === 'lounge') {
            const centerX = 600, centerY = 400, radius = 300, count = 8;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                newTables.push({
                    id: `tbl-lng-${i}-${Date.now()}`,
                    name: `L${i + 1}`,
                    seats: 4,
                    status: TableStatus.AVAILABLE,
                    position: { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius },
                    width: 100, height: 100, shape: 'round', zoneId: activeZone, discount: 0, isVIP: false
                });
            }
        } else if (type === 'banquet') {
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 5; j++) {
                    newTables.push({
                        id: `tbl-bnq-${i}-${j}-${Date.now()}`,
                        name: `B${newTables.length + 1}`,
                        seats: 8,
                        status: TableStatus.AVAILABLE,
                        position: { x: 100 + j * 200, y: 100 + i * 180 },
                        width: 120, height: 120, shape: 'round', zoneId: activeZone, discount: 0, isVIP: false
                    });
                }
            }
        } else if (type === 'fine-dining') {
            const spots = [{ x: 200, y: 200 }, { x: 600, y: 200 }, { x: 1000, y: 200 }, { x: 400, y: 500 }, { x: 800, y: 500 }];
            spots.forEach((pos, idx) => {
                newTables.push({
                    id: `tbl-fine-${idx}-${Date.now()}`,
                    name: `VIP ${idx + 1}`,
                    seats: 4,
                    status: TableStatus.AVAILABLE,
                    position: pos,
                    width: 120, height: 120, shape: 'square', zoneId: activeZone, discount: 0, isVIP: true
                });
            });
        }
        setLocalTables(newTables);
    };

    const handleExit = () => {
        if (onClose) onClose();
        else navigate('/settings');
    };

    const handleSave = async () => {
        if (isSaving) return;
        const branchId = settings.activeBranchId;
        if (!branchId) {
            error(tr('Select an active branch before saving the floor layout.', 'اختار فرع نشط قبل حفظ تخطيط الصالة.'));
            return;
        }
        setIsSaving(true);
        const payload = {
            branchId,
            zones: localZones.map(z => ({
                id: z.id,
                name: z.name,
                width: z.width || DEFAULT_ZONE_SIZE.width,
                height: z.height || DEFAULT_ZONE_SIZE.height
            })),
            tables: localTables.map(t => ({
                id: t.id,
                name: t.name,
                seats: t.seats,
                status: t.status || TableStatus.AVAILABLE,
                x: t.position.x,
                y: t.position.y,
                width: t.width,
                height: t.height,
                shape: t.shape || 'square',
                zoneId: t.zoneId || activeZone,
                discount: Math.min(100, Math.max(0, Number(t.discount) || 0)),
                defaultCouponCode: t.defaultCouponCode?.trim().toUpperCase() || '',
                minSpend: Math.max(0, Number(t.minSpend) || 0),
                isVIP: t.isVIP === true,
                notes: t.notes?.trim() || ''
            }))
        };

        try {
            if (navigator.onLine) {
                await tablesApi.saveLayout(payload);
            } else {
                await syncService.queue('tableLayout', 'SAVE', payload);
            }

            updateTables(localTables);
            updateZones(localZones);

            await localDb.floorTables.where('branchId').equals(branchId).delete();
            await localDb.floorZones.where('branchId').equals(branchId).delete();
            await localDb.floorTables.bulkPut(localTables.map(t => toBranchEntityCache({
                ...t,
                x: t.position.x,
                y: t.position.y
            }, branchId)) as any);
            await localDb.floorZones.bulkPut(localZones.map(z => toBranchEntityCache({
                ...z,
                width: z.width || DEFAULT_ZONE_SIZE.width,
                height: z.height || DEFAULT_ZONE_SIZE.height
            }, branchId)) as any);

            success(navigator.onLine ? tr('Layout saved', 'تم حفظ التخطيط') : tr('Layout queued for sync', 'تم وضع التخطيط في قائمة المزامنة'));
            handleExit();
        } catch (saveError: any) {
            const code = String(saveError?.code || saveError?.message || '');
            const message = lang === 'ar'
                ? (
                    code.includes('INVALID_LAYOUT_PAYLOAD') ? 'بيانات الصالة غير مكتملة. راجع المناطق والطاولات ثم حاول مرة أخرى.' :
                    code.includes('INVALID_TABLE_ZONE') ? 'في طاولة مربوطة بمنطقة غير موجودة. راجع توزيع الصالة ثم احفظ مرة أخرى.' :
                    code.includes('BRANCH_REQUIRED') ? 'اختيار الفرع مطلوب قبل حفظ تخطيط الصالة.' :
                    'تعذر حفظ تخطيط الصالة. راجع الطاولات والمناطق ثم حاول مرة أخرى.'
                )
                : (
                    code.includes('INVALID_LAYOUT_PAYLOAD') ? 'Floor layout data is incomplete. Review zones and tables, then try again.' :
                    code.includes('INVALID_TABLE_ZONE') ? 'A table is linked to a missing zone. Review the floor layout, then save again.' :
                    code.includes('BRANCH_REQUIRED') ? 'Branch selection is required before saving the floor layout.' :
                    'Failed to save floor layout. Review tables and zones, then try again.'
                );
            error(message);
        } finally {
            setIsSaving(false);
        }
    };

    const selectedTable = localTables.find(t => t.id === selectedId);
    const tablesInZone = localTables.filter(t => t.zoneId === activeZone);
    const zoneBounds = getZoneBounds();

    return (
        <div className={`fixed inset-0 bg-background z-[200] flex flex-col animate-in fade-in duration-150 ${settings.language === 'ar' ? 'font-neo-ar' : 'font-neo'}`} dir={settings.language === 'ar' ? 'rtl' : 'ltr'}>
            {/* Top Navigation */}
            <div className="h-20 bg-card/90 border-b border-border/70 px-8 flex items-center justify-between shadow-sm shadow-black/5 dark:shadow-black/30 relative z-30">
                <div className="flex items-center gap-6">
                    <button
                        onClick={handleExit}
                        className="p-3 bg-elevated border border-border/50 rounded-2xl text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all"
                        aria-label={tr('Exit floor designer', 'الخروج من مصمم الصالة')}
                        title={tr('Exit', 'خروج')}
                    >
                        <X size={24} />
                    </button>
                    <div className="h-8 w-[1px] bg-border mx-2" />
                    <div>
                        <h2 className="text-xl font-black text-main uppercase tracking-tight flex items-center gap-3">
                            <Layout className="text-indigo-600" /> {tr('Floor Design', 'تصميم الصالة')}
                        </h2>
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] font-black text-muted uppercase tracking-widest">{tr('Active Zone:', 'المنطقة النشطة:')}</p>
                            <div className="flex items-center gap-1">
                                {localZones.map(z => (
                                    <button
                                        key={z.id}
                                        onClick={() => setActiveZone(z.id)}
                                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all tracking-widest ${activeZone === z.id ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/25' : 'bg-elevated text-muted hover:bg-card hover:text-main border border-border/50'}`}
                                    >
                                        {z.name}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setIsZoneManagerOpen(true)}
                                    className="p-1 text-indigo-500 hover:bg-indigo-500/10 rounded-md transition-all"
                                    aria-label={tr('Add or manage zones', 'إضافة أو إدارة المناطق')}
                                    title={tr('Manage zones', 'إدارة المناطق')}
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden lg:flex items-center gap-2 mr-6">
                        {LAYOUT_TEMPLATES.map(lt => (
                            <button
                                key={lt.id}
                                onClick={() => handleApplyLayout(lt.id)}
                                className="p-3 bg-elevated border border-border/50 rounded-xl text-muted hover:text-indigo-500 hover:border-indigo-500/30 transition-all group relative"
                                title={`${tr('Apply', 'تطبيق')} ${lt.name}`}
                            >
                                <lt.icon size={20} />
                                <span className="absolute -bottom-12 left-1/2 -translate-x-1/2 px-3 py-2 bg-slate-800 text-white text-[8px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">{tr('Apply', 'تطبيق')} {lt.name}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-gradient-to-r from-indigo-500 to-cyan-500 text-white px-8 py-3.5 rounded-[1.2rem] font-black uppercase text-xs tracking-widest flex items-center gap-3 shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50"
                    >
                        <Save size={18} /> {isSaving ? tr('Saving...', 'جاري الحفظ...') : tr('Save Layout', 'حفظ التخطيط')}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Toolbar */}
                <div className="w-85 bg-card/80 border-r border-border/70 p-8 flex flex-col gap-10 overflow-y-auto no-scrollbar shadow-2xl shadow-black/5 dark:shadow-black/30 z-20">
                    {/* Element Library */}
                    <div>
                        <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                            <Plus size={14} className="text-indigo-500" /> {tr('Table Shapes', 'أشكال الترابيزات')}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {TABLE_CATALOG.map(spec => (
                                <button
                                    key={spec.id}
                                    onClick={() => handleAddTable(spec.id)}
                                    className="flex flex-col items-center gap-2 p-3 bg-elevated rounded-[1.2rem] border border-border/50 hover:bg-card hover:shadow-xl hover:border-indigo-500/40 hover:-translate-y-0.5 transition-all group"
                                >
                                    <div className="w-full h-20 rounded-xl bg-card/80 border border-border/40 overflow-hidden pointer-events-none">
                                        <TableVisual shape={spec.id} seats={spec.seats} name={spec.seats} compact showChairs />
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-wider text-main text-center leading-tight">{lang === 'ar' ? spec.nameAr : spec.nameEn}</span>
                                </button>
                            ))}
                        </div>
                        <p className="mt-3 text-[9px] font-bold text-muted leading-relaxed">{tr('Realistic top-view tables with chairs. Seats auto-adjust.', 'ترابيزات بشكل واقعي من الأعلى مع كراسي. عدد الكراسي بيتظبط تلقائي.')}</p>
                    </div>

                    {/* Inspector */}
                    {selectedTable ? (
                        <div className="space-y-8 animate-in slide-in-from-left-4 duration-150">
                            <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                <Settings2 size={14} className="text-indigo-500" /> {tr('Node Configuration', 'إعدادات العنصر')}
                            </p>

                            <div className="space-y-6 bg-card/50 p-6 rounded-[2.5rem] border border-border/50 shadow-inner">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1 flex items-center gap-2">
                                        <Type size={10} /> {tr('Identifier', 'المعرف')}
                                    </label>
                                    <input
                                        type="text"
                                        value={selectedTable.name}
                                        onChange={(e) => handleUpdateTable(selectedTable.id, { name: e.target.value })}
                                        className="w-full p-4 bg-elevated rounded-xl font-black text-sm text-main uppercase tracking-widest outline-none border border-border/50 focus:border-indigo-500 transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">{tr('Table Shape', 'شكل الترابيزة')}</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {TABLE_CATALOG.map(spec => {
                                            const active = (selectedTable.shape || 'square') === spec.id;
                                            return (
                                                <button
                                                    key={spec.id}
                                                    onClick={() => {
                                                        const updates: Partial<Table> = { shape: spec.id as Table['shape'] };
                                                        // auto-resize to realistic footprint, keep position
                                                        updates.width = spec.width;
                                                        updates.height = spec.height;
                                                        if ((selectedTable.seats || 0) <= 0) updates.seats = spec.seats;
                                                        handleUpdateTable(selectedTable.id, updates);
                                                    }}
                                                    className={`rounded-xl border-2 overflow-hidden transition-all ${active ? 'border-indigo-500 ring-2 ring-indigo-500/30 scale-105' : 'border-border/50 hover:border-indigo-500/40'}`}
                                                    title={lang === 'ar' ? spec.nameAr : spec.nameEn}
                                                >
                                                    <div className="h-14 bg-card pointer-events-none">
                                                        <TableVisual shape={spec.id} seats={selectedTable.seats || spec.seats} name={selectedTable.name} compact showChairs selected={active} />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">{tr('Capacity', 'السعة')}</label>
                                        <div className="flex items-center gap-2 px-4 py-3 bg-elevated border border-border/50 rounded-xl">
                                            <Users size={14} className="text-muted" />
                                            <input
                                                type="number"
                                                value={selectedTable.seats}
                                                onChange={(e) => handleUpdateTable(selectedTable.id, { seats: parseInt(e.target.value) || 0 })}
                                                className="w-full bg-transparent font-black text-sm text-main outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">{tr('Default Discount', 'الخصم الافتراضي')}</label>
                                        <select
                                            value={selectedTable.discountMode || (selectedTable.defaultCouponCode ? 'COUPON' : 'PERCENT')}
                                            onChange={(e) => handleUpdateTable(selectedTable.id, e.target.value === 'COUPON'
                                                ? { discountMode: 'COUPON', discount: 0, defaultCouponCode: coupons[0]?.code || '' }
                                                : { discountMode: 'PERCENT', defaultCouponCode: '' })}
                                            className="w-full p-3 bg-elevated rounded-xl font-black text-xs text-main outline-none border border-border/50 focus:border-indigo-500"
                                        >
                                            <option value="PERCENT">{tr('Percentage', 'نسبة مئوية')}</option>
                                            <option value="COUPON">{tr('Campaign coupon', 'كود حملة تسويقية')}</option>
                                        </select>
                                        {(selectedTable.discountMode || (selectedTable.defaultCouponCode ? 'COUPON' : 'PERCENT')) === 'COUPON' ? (
                                            <>
                                                <input
                                                    type="text"
                                                    list={`table-coupons-${selectedTable.id}`}
                                                    value={selectedTable.defaultCouponCode || ''}
                                                    onChange={(e) => handleUpdateTable(selectedTable.id, {
                                                        discountMode: 'COUPON',
                                                        defaultCouponCode: e.target.value.toUpperCase(),
                                                        discount: 0
                                                    })}
                                                    placeholder={tr('Enter coupon code', 'اكتب كود الخصم')}
                                                    className="w-full p-3 bg-elevated rounded-xl font-black text-sm text-main uppercase outline-none border border-border/50 focus:border-indigo-500"
                                                />
                                                <datalist id={`table-coupons-${selectedTable.id}`}>
                                                    {coupons.map(coupon => (
                                                        <option key={coupon.id} value={coupon.code}>
                                                            {coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : coupon.value}
                                                        </option>
                                                    ))}
                                                </datalist>
                                            </>
                                        ) : (
                                            <div className="flex items-center gap-2 px-4 py-3 bg-elevated border border-border/50 rounded-xl">
                                                <Tag size={14} className="text-muted" />
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={selectedTable.discount || 0}
                                                    onChange={(e) => handleUpdateTable(selectedTable.id, {
                                                        discount: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                                                        discountMode: 'PERCENT',
                                                        defaultCouponCode: ''
                                                    })}
                                                    className="w-full bg-transparent font-black text-sm text-main outline-none"
                                                />
                                                <span className="text-xs font-black text-muted">%</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">{tr('Minimum Spend', 'الحد الأدنى للطلب')}</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={selectedTable.minSpend || 0}
                                        onChange={(e) => handleUpdateTable(selectedTable.id, { minSpend: Math.max(0, Number(e.target.value) || 0) })}
                                        className="w-full p-4 bg-elevated rounded-xl font-black text-sm text-main outline-none border border-border/50 focus:border-indigo-500 transition-all"
                                    />
                                </div>

                                <div className="flex items-center justify-between p-4 bg-elevated rounded-xl border border-border/50 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${selectedTable.isVIP ? 'bg-amber-500/20 text-amber-500' : 'bg-card text-muted'}`}>
                                            <Crown size={16} />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-main">{tr('VIP Privilege', 'ميزة VIP')}</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={selectedTable.isVIP}
                                        onChange={(e) => handleUpdateTable(selectedTable.id, { isVIP: e.target.checked })}
                                        className="w-5 h-5 accent-indigo-500 rounded border-border/50"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">{tr('Registry Notes', 'ملاحظات التسجيل')}</label>
                                    <textarea
                                        value={selectedTable.notes || ''}
                                        onChange={(e) => handleUpdateTable(selectedTable.id, { notes: e.target.value })}
                                        className="w-full p-4 bg-elevated text-main rounded-xl font-bold text-xs outline-none border border-border/50 focus:border-indigo-500 transition-all h-20 resize-none"
                                        placeholder={tr('Special handling instructions...', 'تعليمات خاصة للتعامل...')}
                                    />
                                </div>

                                <div className="pt-6 grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => handleDuplicateTable(selectedTable)}
                                        className="p-4 bg-elevated text-muted rounded-xl flex items-center justify-center gap-2 hover:text-indigo-500 transition-all shadow-sm group border border-border/50"
                                    >
                                        <Copy size={16} /> <span className="text-[10px] font-black uppercase">{tr('Clone', 'نسخ')}</span>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTable(selectedTable.id)}
                                        className="p-4 bg-rose-500/10 text-rose-500 rounded-xl flex items-center justify-center gap-2 hover:bg-rose-500/20 hover:text-rose-400 transition-all shadow-sm group border border-rose-500/20"
                                    >
                                        <Trash2 size={16} /> <span className="text-[10px] font-black uppercase">{tr('Wipe', 'حذف')}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 mt-20">
                            <StickyNote size={64} className="mb-6" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em]">{tr('Idle Inspector', 'لا يوجد عنصر محدد')}</p>
                        </div>
                    )}
                </div>

                {/* Main Design Area */}
                <div className="flex-1 relative bg-elevated/30 overflow-auto p-16 group/designer">
                    <div
                        ref={designerRef}
                        className="relative bg-card/95 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] dark:shadow-[0_32px_80px_-20px_rgba(0,0,0,0.75)] border border-border/70 rounded-[2rem]"
                        style={{ width: `${zoneBounds.width}px`, height: `${zoneBounds.height}px` }}
                        onClick={() => setSelectedId(null)}
                    >
                        {/* Visual Grid Background */}
                        <div className="absolute inset-0 opacity-[0.08] dark:opacity-[0.14] pointer-events-none rounded-[2rem]"
                            style={{
                                backgroundImage: 'linear-gradient(rgba(var(--text-main), 0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--text-main), 0.45) 1px, transparent 1px)',
                                backgroundSize: '40px 40px'
                            }}
                        />
                        {tablesInZone.map(table => {
                            const isSelected = selectedId === table.id;
                            return (
                            <div
                                key={table.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedId(table.id); }}
                                onMouseDown={(e) => {
                                    const startX = e.clientX - table.position.x;
                                    const startY = e.clientY - table.position.y;
                                    const originalPosition = table.position;

                                    const onMouseMove = (moveEvent: MouseEvent) => {
                                        const next = clampTablePosition(moveEvent.clientX - startX, moveEvent.clientY - startY, table.width, table.height);

                                        // Update state immediately for visual feedback
                                        handleUpdateTable(table.id, {
                                            position: next
                                        });
                                    };

                                    const onMouseUp = (upEvent: MouseEvent) => {
                                        document.removeEventListener('mousemove', onMouseMove);
                                        document.removeEventListener('mouseup', onMouseUp);

                                        const next = clampTablePosition(upEvent.clientX - startX, upEvent.clientY - startY, table.width, table.height);

                                        // Overlap check on release
                                        if (isOverlapping(table.id, next.x, next.y, table.width, table.height)) {
                                            handleUpdateTable(table.id, { position: originalPosition });
                                            error(tr('Tables cannot overlap. Move it to an empty spot.', 'لا يمكن تداخل الطاولات. انقلها إلى مكان فارغ.'));
                                        } else {
                                            handleUpdateTable(table.id, { position: next });
                                        }
                                    };

                                    document.addEventListener('mousemove', onMouseMove);
                                    document.addEventListener('mouseup', onMouseUp);
                                }}
                                style={{
                                    position: 'absolute',
                                    left: table.position.x,
                                    top: table.position.y,
                                    width: table.width,
                                    height: table.height,
                                    cursor: 'move',
                                    zIndex: isSelected ? 100 : 10
                                }}
                                className={`transition-all relative ${isSelected ? 'scale-[1.04] drop-shadow-[0_0_18px_rgba(99,102,241,0.45)]' : 'hover:scale-[1.02]'}`}
                            >
                                <div className={`absolute -inset-2 rounded-[1.6rem] border-2 border-dashed pointer-events-none transition-all ${isSelected ? 'border-indigo-500/70 bg-indigo-500/5' : 'border-transparent hover:border-indigo-500/20'}`} />
                                <TableVisual shape={table.shape || 'square'} seats={table.seats} name={table.name} selected={isSelected} isVIP={table.isVIP} />

                                {/* badges row under table */}
                                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none">
                                    {table.defaultCouponCode ? (
                                        <span className="px-1.5 py-0.5 rounded-md bg-violet-500 text-white text-[8px] font-black flex items-center gap-0.5"><Tag size={8} />{table.defaultCouponCode}</span>
                                    ) : table.discount ? (
                                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[8px] font-black">{table.discount}%</span>
                                    ) : null}
                                    {Number(table.minSpend) > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[8px] font-black">{Number(table.minSpend).toFixed(0)}</span>
                                    )}
                                    {table.notes && (
                                        <span className="p-1 rounded-md bg-sky-500 text-white"><StickyNote size={8} /></span>
                                    )}
                                </div>

                                {isSelected && (
                                    <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex gap-2 animate-in slide-in-from-top-2 p-2 bg-card/95 border border-border/70 rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/40 z-50">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDuplicateTable(table); }}
                                            className="w-10 h-10 rounded-xl bg-elevated border border-border/50 flex items-center justify-center text-muted hover:text-indigo-500 hover:bg-card hover:border-indigo-500/30 transition-all"
                                        >
                                            <Copy size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteTable(table.id); }}
                                            className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 hover:bg-rose-500/20 transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            );
                        })}
                    </div>

                    {/* HUD / Info Overlay */}
                    <div className="absolute right-10 bottom-10 flex flex-col items-end gap-3 pointer-events-none opacity-20 group-hover:opacity-100 transition-opacity">
                        <div className="p-4 bg-card/90 rounded-2xl border border-border/60 shadow-2xl shadow-black/10 dark:shadow-black/40 flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-indigo-600 animate-pulse" />
                                <span className="text-[10px] font-black uppercase text-main">{tr('Live Mapping Active', 'تخطيط مباشر نشط')}</span>
                            </div>
                            <div className="w-[1px] h-4 bg-border" />
                            <span className="text-[10px] font-black uppercase text-muted">
                                {lang === 'ar'
                                    ? `${tablesInZone.length} وحدات في ${localZones.find(z => z.id === activeZone)?.name || ''}`
                                    : `${tablesInZone.length} Units in ${localZones.find(z => z.id === activeZone)?.name || ''}`}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Zone Manager Modal */}
            {isZoneManagerOpen && (
                <div className="fixed inset-0 bg-background/80 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-150">
                    <div className="bg-card w-full max-w-lg rounded-[3.5rem] p-10 shadow-2xl border border-border/50 space-y-8 animate-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black text-main uppercase tracking-tight">{tr('Zone Management', 'إدارة المناطق')}</h3>
                                <p className="text-[10px] font-black text-muted uppercase tracking-widest">{tr('Manage distinct spatial areas', 'إدارة مناطق الصالة المختلفة')}</p>
                            </div>
                            <button onClick={() => setIsZoneManagerOpen(false)} className="p-3 bg-elevated text-muted hover:text-main rounded-2xl transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {localZones.map(zone => (
                                <div key={zone.id} className="p-5 bg-elevated/70 rounded-2xl flex flex-col gap-4 border border-border/50 hover:border-indigo-500/30 transition-all">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-xl ${zone.color} text-white`}>
                                                <Layers size={18} />
                                            </div>
                                            <div>
                                                <input
                                                    value={zone.name}
                                                    onChange={(e) => setLocalZones(localZones.map(z => z.id === zone.id ? { ...z, name: e.target.value } : z))}
                                                    className="bg-transparent font-black text-sm uppercase tracking-widest outline-none text-main"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    if (localZones.length > 1) {
                                                        setLocalTables(localTables.filter(t => t.zoneId !== zone.id));
                                                        setLocalZones(localZones.filter(z => z.id !== zone.id));
                                                        if (activeZone === zone.id) setActiveZone(localZones[0].id);
                                                    }
                                                }}
                                                className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-muted uppercase tracking-widest">{tr('Width', 'العرض')}</label>
                                            <input
                                                type="number"
                                                value={zone.width || DEFAULT_ZONE_SIZE.width}
                                                onChange={(e) => updateZoneSize(zone.id, { width: parseInt(e.target.value) || DEFAULT_ZONE_SIZE.width })}
                                                className="w-full p-3 rounded-xl bg-card text-main text-xs font-black border border-border/70 outline-none focus:border-indigo-500 transition-all"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-muted uppercase tracking-widest">{tr('Height', 'الارتفاع')}</label>
                                            <input
                                                type="number"
                                                value={zone.height || DEFAULT_ZONE_SIZE.height}
                                                onChange={(e) => updateZoneSize(zone.id, { height: parseInt(e.target.value) || DEFAULT_ZONE_SIZE.height })}
                                                className="w-full p-3 rounded-xl bg-card text-main text-xs font-black border border-border/70 outline-none focus:border-indigo-500 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                const newId = `zone-${Date.now()}`;
                                setLocalZones([...localZones, { id: newId, name: tr('New Area', 'منطقة جديدة'), color: 'bg-emerald-600', width: DEFAULT_ZONE_SIZE.width, height: DEFAULT_ZONE_SIZE.height }]);
                            }}
                            className="w-full py-5 border-2 border-dashed border-border rounded-2xl flex items-center justify-center gap-3 text-muted hover:text-indigo-500 hover:border-indigo-500 transition-all group"
                        >
                            <Plus size={20} />
                            <span className="text-xs font-black uppercase tracking-widest">{tr('Provision New Area', 'إضافة منطقة جديدة')}</span>
                        </button>

                        <button
                            onClick={() => setIsZoneManagerOpen(false)}
                            className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30 active:scale-95 transition-all"
                        >
                            {tr('Initialize Environment', 'تأكيد الإعداد')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FloorDesigner;
