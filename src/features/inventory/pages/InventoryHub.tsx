import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowRightLeft, Brain, Calculator, ClipboardCheck,
  Factory, FileText, Home, Layers, Package, Plus, Trash2, Truck, ChevronLeft,
} from 'lucide-react';
import { useInventoryWorkspace } from '../shared/useInventoryWorkspace';
import { InvPageShell, InvStat, InvError } from '../shared/inventoryUi';

const MODULES = (lang: 'ar' | 'en') => [
  { to: '/inventory/items', icon: Package, color: '#10b981', title: lang === 'ar' ? 'الأصناف المخزنية' : 'Stock Items', desc: lang === 'ar' ? 'بطاقات الأصناف والأرصدة والتسويات والاستيراد' : 'Item cards, balances, adjustments and Excel import', countKey: 'items' as const },
  { to: '/inventory/suppliers', icon: Truck, color: '#6366f1', title: lang === 'ar' ? 'الموردين' : 'Suppliers', desc: lang === 'ar' ? 'سجل الموردين والمرتجعات' : 'Supplier directory and purchase returns', countKey: 'suppliers' as const },
  { to: '/inventory/procurement', icon: FileText, color: '#8b5cf6', title: lang === 'ar' ? 'المشتريات' : 'Procurement', desc: lang === 'ar' ? 'أوامر الشراء والاستلام المباشر' : 'Purchase orders and direct receiving', countKey: 'orders' as const },
  { to: '/inventory/warehouses', icon: Home, color: '#06b6d4', title: lang === 'ar' ? 'المخازن والتحويلات' : 'Warehouses & Transfers', desc: lang === 'ar' ? 'عقد المخازن وتحركات الفروع' : 'Warehouse nodes and branch logistics', countKey: 'warehouses' as const },
  { to: '/inventory/counts', icon: ClipboardCheck, color: '#a855f7', title: lang === 'ar' ? 'الجرد' : 'Stock Counts', desc: lang === 'ar' ? 'جلسات الجرد الفعلي والفروقات' : 'Physical counts, variances and posting', countKey: null },
  { to: '/inventory/movements', icon: Activity, color: '#0ea5e9', title: lang === 'ar' ? 'الحركات والمسحوبات' : 'Movements & Withdrawals', desc: lang === 'ar' ? 'سجل الحركات ومسحوبات الوصفات' : 'Movement log and recipe consumption', countKey: null },
];

const InventoryHub: React.FC = () => {
  const {
    lang, settings, inventoryError, clearError,
    activeInventory, suppliers, purchaseOrders, warehouses, transferMovements,
    inventoryTotalsById, inventoryValuation, outOfStockCount, lowStockCount,
    displayItemName, orphanedWarehouseAssignments,
  } = useInventoryWorkspace();
  const currency = settings.currencySymbol || 'ج.م';

  const counts: Record<string, number> = {
    items: activeInventory.length,
    suppliers: suppliers.length,
    orders: purchaseOrders.filter(o => !['RECEIVED', 'CANCELLED', 'REJECTED'].includes(String((o as any).status || '').toUpperCase())).length,
    warehouses: warehouses.filter(w => w.isActive !== false).length,
  };

  const outItems = activeInventory.filter(i => (inventoryTotalsById.get(i.id) || 0) === 0).slice(0, 6);
  const lowItems = activeInventory.filter(i => {
    const total = inventoryTotalsById.get(i.id) || 0;
    return total > 0 && total <= i.threshold;
  }).slice(0, 6);
  const recentMoves = (transferMovements || []).slice(0, 6);

  return (
    <InvPageShell>
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 pb-6 border-b border-border/20">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-[1.4rem] bg-gradient-to-br from-emerald-600 to-teal-600 p-0.5 shadow-2xl shadow-emerald-600/20">
            <div className="w-full h-full rounded-[1.25rem] bg-card flex items-center justify-center">
              <Package size={30} className="text-emerald-500" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-main tracking-tighter uppercase">
              {lang === 'ar' ? 'مركز المخزون' : 'Stock Center'}
            </h1>
            <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] mt-2 opacity-60">
              {lang === 'ar' ? 'مشتريات آلية · مزامنة فورية · إدارة متعددة المخازن' : 'Automated purchasing · Real-time sync · Multi-warehouse routing'}
            </p>
          </div>
        </div>
        <Link
          to="/inventory/items"
          className="h-14 inline-flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-8 rounded-2xl shadow-2xl shadow-emerald-600/30 font-black text-[11px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={18} /> {lang === 'ar' ? 'إضافة صنف مخزني' : 'REGISTER ASSET'}
        </Link>
      </header>

      {inventoryError && (
        <InvError message={inventoryError} onDismiss={clearError} dismissLabel={lang === 'ar' ? 'إغلاق' : 'Dismiss'} />
      )}

      {orphanedWarehouseAssignments.length > 0 && (
        <div className="flex items-start gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-amber-600 shadow-lg dark:text-amber-400">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest">
              {lang === 'ar' ? `تنبيه بيانات: ${orphanedWarehouseAssignments.length} ربط بمخزن غير نشط` : `${orphanedWarehouseAssignments.length} item-to-warehouse links need attention`}
            </p>
            <Link to="/inventory/items" className="mt-1 inline-flex items-center gap-1 text-xs font-bold leading-relaxed underline underline-offset-4">
              {lang === 'ar' ? 'مراجعة من صفحة الأصناف' : 'Review from the items page'} <ChevronLeft size={12} className="rtl:rotate-180" />
            </Link>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <InvStat label={lang === 'ar' ? 'قيمة المخزون' : 'Inventory Valuation'} value={inventoryValuation.toLocaleString()} subValue={currency} icon={Calculator} color="#10b981" lang={lang} />
        <InvStat label={lang === 'ar' ? 'الأصناف النشطة' : 'Active SKUs'} value={activeInventory.length} subValue={lang === 'ar' ? 'صنف' : 'Items'} icon={Layers} color="#3b82f6" lang={lang} />
        <InvStat label={lang === 'ar' ? 'رصيد صفر' : 'Out of Stock'} value={outOfStockCount} subValue={lang === 'ar' ? 'تنبيه' : 'Alerts'} icon={AlertTriangle} color="#f43f5e" lang={lang} />
        <InvStat label={lang === 'ar' ? 'مخزون منخفض' : 'Low Stock'} value={lowStockCount} subValue={lang === 'ar' ? 'صنف' : 'Items'} icon={Activity} color="#f59e0b" lang={lang} />
      </section>

      <section>
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-muted mb-4">
          {lang === 'ar' ? 'أقسام الإدارة' : 'Management sections'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {MODULES(lang as 'ar' | 'en').map(mod => (
            <Link
              key={mod.to}
              to={mod.to}
              className="group relative overflow-hidden rounded-[1.75rem] border border-border/25 bg-card/60 p-6 transition-all duration-150 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/10"
            >
              <div className="absolute top-0 right-0 w-28 h-28 rounded-full blur-[60px] opacity-20 group-hover:opacity-35 transition-opacity" style={{ background: mod.color }} />
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner transition-transform duration-150 group-hover:scale-110 group-hover:-rotate-6" style={{ color: mod.color, backgroundColor: `${mod.color}15`, borderColor: `${mod.color}30` }}>
                  <mod.icon size={26} />
                </div>
                {mod.countKey && (
                  <span className="rounded-full bg-elevated/60 border border-border/20 px-3 py-1 text-[11px] font-black tabular-nums text-main">
                    {counts[mod.countKey].toLocaleString()}
                  </span>
                )}
              </div>
              <h3 className="relative z-10 mt-5 text-lg font-black text-main group-hover:opacity-90">{mod.title}</h3>
              <p className="relative z-10 mt-1 text-xs font-bold leading-relaxed text-muted">{mod.desc}</p>
              <span className="relative z-10 mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] transition-colors" style={{ color: mod.color }}>
                {lang === 'ar' ? 'فتح القسم' : 'Open section'} <ChevronLeft size={13} className="rtl:rotate-180 transition-transform group-hover:-translate-x-1 rtl:group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="rounded-[1.75rem] border border-rose-500/20 bg-card/60 p-6">
          <h3 className="flex items-center gap-2 text-sm font-black text-rose-500">
            <AlertTriangle size={16} /> {lang === 'ar' ? 'رصيد صفر — يحتاج طلب' : 'Out of stock — needs ordering'}
          </h3>
          <div className="mt-4 space-y-2">
            {outItems.length === 0 && <p className="text-xs font-bold text-muted">{lang === 'ar' ? 'لا توجد أصناف نافذة.' : 'Nothing is out of stock.'}</p>}
            {outItems.map(item => (
              <Link key={item.id} to="/inventory/items" className="flex items-center justify-between gap-3 rounded-xl border border-border/20 bg-elevated/30 px-4 py-2.5 hover:border-rose-500/30 transition-colors">
                <span className="truncate text-xs font-black text-main">{displayItemName(item)}</span>
                <span className="shrink-0 text-[10px] font-black text-rose-500">{lang === 'ar' ? 'اطلب الآن' : 'ORDER'}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-amber-500/20 bg-card/60 p-6">
          <h3 className="flex items-center gap-2 text-sm font-black text-amber-500">
            <Activity size={16} /> {lang === 'ar' ? 'مخزون منخفض' : 'Running low'}
          </h3>
          <div className="mt-4 space-y-2">
            {lowItems.length === 0 && <p className="text-xs font-bold text-muted">{lang === 'ar' ? 'لا توجد أصناف منخفضة.' : 'Nothing is running low.'}</p>}
            {lowItems.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/20 bg-elevated/30 px-4 py-2.5">
                <span className="truncate text-xs font-black text-main">{displayItemName(item)}</span>
                <span className="shrink-0 text-[10px] font-black tabular-nums text-amber-500">{(inventoryTotalsById.get(item.id) || 0)} / {item.threshold}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-border/20 bg-card/60 p-6">
          <h3 className="flex items-center gap-2 text-sm font-black text-main">
            <ArrowRightLeft size={16} className="text-cyan-400" /> {lang === 'ar' ? 'أحدث التحويلات' : 'Latest transfers'}
          </h3>
          <div className="mt-4 space-y-2">
            {recentMoves.length === 0 && <p className="text-xs font-bold text-muted">{lang === 'ar' ? 'لا توجد تحويلات بعد.' : 'No transfers yet.'}</p>}
            {recentMoves.map((mv: any) => (
              <div key={mv.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/20 bg-elevated/30 px-4 py-2.5">
                <span className="truncate text-xs font-black text-main">{mv.itemName}</span>
                <span className="shrink-0 text-[10px] font-black tabular-nums text-cyan-400">{Number(mv.quantity || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-border/20 bg-card/40 p-6">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted mb-4">
          {lang === 'ar' ? 'مرتبط بالمخزون' : 'Related modules'}
        </h3>
        <div className="flex flex-wrap gap-3">
          {[
            { to: '/stock-requests', icon: ClipboardCheck, label: lang === 'ar' ? 'الطلبيات المخزنية' : 'Stock Requests' },
            { to: '/inventory-intelligence', icon: Brain, label: lang === 'ar' ? 'ذكاء المخزون' : 'Intelligence' },
            { to: '/production', icon: Factory, label: lang === 'ar' ? 'الإنتاج' : 'Production' },
            { to: '/wastage', icon: Trash2, label: lang === 'ar' ? 'الهالك' : 'Wastage' },
          ].map(link => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex items-center gap-2 rounded-2xl border border-border/25 bg-elevated/30 px-5 py-3 text-xs font-black text-main hover:border-emerald-500/40 hover:text-emerald-500 transition-all active:scale-95"
            >
              <link.icon size={15} />
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </InvPageShell>
  );
};

export default InventoryHub;
