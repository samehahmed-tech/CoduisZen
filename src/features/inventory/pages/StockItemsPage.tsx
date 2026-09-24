import React, { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRightLeft, Calculator, Download, Layers,
  Package, Plus, Search, Tag, Trash2, Truck, Undo2, Upload, Home, SlidersHorizontal,
} from 'lucide-react';
import { useInventoryWorkspace } from '../shared/useInventoryWorkspace';
import { InvPageShell, InvPageHeader, InvError } from '../shared/inventoryUi';
import VirtualList from '@/components/common/VirtualList';
import PageSkeleton from '@/components/common/PageSkeleton';
import ItemModal from '../components/ItemModal';
import StockAdjustmentModal from '../components/StockAdjustmentModal';

const inventoryGridColumns = 'grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]';

const StockItemsPage: React.FC = () => {
  const {
    lang, settings, inventoryError, clearError,
    inventory, inventoryLoading, activeInventory, activeWarehouses, warehouses,
    warehouseById, inventoryTotalsById, displayItemName, displayWarehouseName,
    inventoryValuation, outOfStockCount, lowStockCount,
    searchQuery, setSearchQuery, stockSort, setStockSort, filteredInventory,
    editingItem, setEditingItem, itemModalOpen, setItemModalOpen,
    adjustmentModalOpen, setAdjustmentModalOpen,
    aiForecasts, handleRequestForecast,
    isImportingInventory, exportInventoryTemplate, handleInventoryFileImport,
    handleSaveItem, handleDeleteItem, handleAdjustment, handleZeroInventory,
    setReceiptModalOpen, setReturnModalOpen, setTransferModalOpen, setWarehouseModalOpen,
  } = useInventoryWorkspace();

  // Page-level flow filters: category + attention-only (low/out), layered
  // over the shared search/sort. KPI cards below drive these directly.
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    activeInventory.forEach(item => {
      const c = String(item.category || '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeInventory]);

  const visibleItems = useMemo(() => filteredInventory.filter(item => {
    if (categoryFilter !== 'all' && String(item.category || '') !== categoryFilter) return false;
    if (attentionOnly) {
      const total = inventoryTotalsById.get(item.id) || 0;
      if (!(total === 0 || total <= item.threshold)) return false;
    }
    return true;
  }), [filteredInventory, categoryFilter, attentionOnly, inventoryTotalsById]);

  const showLow = () => { setAttentionOnly(true); setStockSort('low-first'); };
  const clearFlowFilters = () => { setAttentionOnly(false); setCategoryFilter('all'); setSearchQuery(''); };

  return (
    <InvPageShell>
      <InvPageHeader
        icon={<Package size={30} className="text-emerald-500" />}
        title={lang === 'ar' ? 'الأصناف المخزنية' : 'Stock Items'}
        subtitle={lang === 'ar' ? 'بطاقات الأصناف والأرصدة والتسويات' : 'Item cards, balances and adjustments'}
        accent="emerald"
        backLabel={lang === 'ar' ? 'المخزون' : 'Inventory'}
        actions={
          <>
            <button type="button" onClick={() => void handleZeroInventory()} className="h-14 flex items-center justify-center gap-2 bg-rose-500/10 text-rose-500 px-5 rounded-2xl border border-rose-500/20 font-black text-[10px] uppercase tracking-widest">
              <AlertTriangle size={17} /> {lang === 'ar' ? 'تصفير المخزون' : 'Zero stock'}
            </button>
            <button type="button" onClick={exportInventoryTemplate} className="h-14 flex items-center justify-center gap-2 bg-card/60 text-emerald-500 px-5 rounded-2xl border border-border/30 font-black text-[10px] uppercase tracking-widest">
              <Download size={17} /> {lang === 'ar' ? 'قالب إكسل' : 'Excel template'}
            </button>
            <label className={`h-14 flex items-center justify-center gap-2 bg-card/60 text-sky-500 px-5 rounded-2xl border border-border/30 font-black text-[10px] uppercase tracking-widest ${isImportingInventory ? 'cursor-wait opacity-60 pointer-events-none' : 'cursor-pointer'}`}>
              <Upload size={17} /> {isImportingInventory ? (lang === 'ar' ? 'جاري الاستيراد...' : 'Importing...') : (lang === 'ar' ? 'استيراد إكسل' : 'Import Excel')}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async event => {
                const file = event.target.files?.[0];
                if (file) await handleInventoryFileImport(file);
                event.target.value = '';
              }} />
            </label>
            <button
              onClick={() => setItemModalOpen(true)}
              className="h-14 flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-8 rounded-2xl shadow-2xl shadow-emerald-600/30 font-black text-[11px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
            >
              <Plus size={18} /> {lang === 'ar' ? 'إضافة صنف مخزني' : 'REGISTER ASSET'}
            </button>
          </>
        }
      />

      {inventoryError && (
        <InvError message={inventoryError} onDismiss={clearError} dismissLabel={lang === 'ar' ? 'إغلاق' : 'Dismiss'} />
      )}

      {/* Clickable KPI strip — attention cards drive the flow filters below */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: lang === 'ar' ? 'قيمة المخزون' : 'Valuation', value: inventoryValuation.toLocaleString(), sub: settings.currencySymbol || 'ج.م', color: '#10b981', icon: Layers, onClick: clearFlowFilters, active: false },
          { label: lang === 'ar' ? 'الأصناف النشطة' : 'Active SKUs', value: activeInventory.length, sub: lang === 'ar' ? 'صنف' : 'items', color: '#3b82f6', icon: Package, onClick: clearFlowFilters, active: false },
          { label: lang === 'ar' ? 'رصيد صفر' : 'Out of Stock', value: outOfStockCount, sub: lang === 'ar' ? 'اطلب الآن' : 'order now', color: '#f43f5e', icon: AlertTriangle, onClick: showLow, active: attentionOnly },
          { label: lang === 'ar' ? 'مخزون منخفض' : 'Low Stock', value: lowStockCount, sub: lang === 'ar' ? 'راجع' : 'review', color: '#f59e0b', icon: Activity, onClick: showLow, active: attentionOnly },
        ].map(card => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            title={lang === 'ar' ? 'اضغط للتصفية' : 'Click to filter'}
            className={`relative group overflow-hidden bg-card/60 border rounded-[1.5rem] p-4 lg:p-5 text-start transition-all hover:scale-[1.02] active:scale-[0.98] ${card.active ? 'border-current shadow-xl' : 'border-border/30 hover:shadow-2xl hover:shadow-black/5'}`}
            style={card.active ? { borderColor: `${card.color}66`, boxShadow: `0 18px 40px -22px ${card.color}66` } : undefined}
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br opacity-20 blur-3xl" style={{ background: card.color }} />
            <div className="flex items-start justify-between relative z-10 gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-1.5 truncate">{card.label}</p>
                <p className="text-xl lg:text-2xl font-black text-main tracking-tighter tabular-nums">{card.value} <span className="text-[10px] font-bold text-muted opacity-60">{card.sub}</span></p>
              </div>
              <div className="p-3 rounded-xl border shrink-0" style={{ borderColor: `${card.color}30`, backgroundColor: `${card.color}15`, color: card.color }}>
                <card.icon size={20} />
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-col xl:flex-row justify-between items-stretch lg:items-center gap-4">
        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto xl:flex-1">
          <div className="relative w-full lg:max-w-md group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-muted w-5 h-5 group-focus-within:text-emerald-500 transition-colors z-10" />
            <input
              type="text"
              placeholder={lang === 'ar' ? 'ابحث في الأصناف المخزنية...' : 'Query master inventory...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-card/60 border border-border/30 rounded-[1.5rem] outline-none focus:border-emerald-500/50 transition-all font-bold text-sm text-main placeholder:text-muted/40 shadow-xl"
            />
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <SlidersHorizontal size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label={lang === 'ar' ? 'تصنيف' : 'Category'}
                className="h-full min-h-[56px] appearance-none bg-card/60 border border-border/30 rounded-[1.5rem] pl-10 pr-4 text-xs font-black text-main outline-none focus:border-emerald-500/50 cursor-pointer max-w-[180px]"
              >
                <option value="all">{lang === 'ar' ? 'كل التصنيفات' : 'All categories'}</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setAttentionOnly(v => !v)}
              aria-pressed={attentionOnly}
              title={lang === 'ar' ? 'النواقص ورصيد الصفر فقط' : 'Low and out-of-stock only'}
              className={`px-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 whitespace-nowrap ${attentionOnly ? 'bg-amber-500/15 text-amber-500 border-amber-500/40 shadow-[0_0_18px_rgba(245,158,11,0.15)]' : 'bg-card/60 text-muted border-border/30 hover:border-amber-500/30 hover:text-amber-500'}`}
            >
              {lang === 'ar' ? 'النواقص فقط' : 'NEEDS ORDER'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setReceiptModalOpen(true)} className="h-12 flex items-center gap-2 bg-card/60 text-emerald-500 px-5 rounded-2xl border border-border/30 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all active:scale-95 shadow-lg">
            <Truck size={16} /> {lang === 'ar' ? 'استلام مباشر' : 'DIRECT RECEIPT'}
          </button>
          <button type="button" onClick={() => setReturnModalOpen(true)} className="h-12 flex items-center gap-2 bg-card/60 text-amber-600 px-5 rounded-2xl border border-border/30 font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all active:scale-95 shadow-lg">
            <Undo2 size={16} /> {lang === 'ar' ? 'مرتجع مورد' : 'SUPPLIER RETURN'}
          </button>
          <button type="button" onClick={() => setTransferModalOpen(true)} className="h-12 flex items-center gap-2 bg-card/60 text-sky-500 px-5 rounded-2xl border border-border/30 font-black text-[10px] uppercase tracking-widest hover:bg-sky-500 hover:text-white transition-all active:scale-95 shadow-lg">
            <ArrowRightLeft size={16} /> {lang === 'ar' ? 'تحويل مخزني' : 'INTER-TRANSFER'}
          </button>
          <button type="button" onClick={() => setWarehouseModalOpen(true)} className="h-12 flex items-center gap-2 bg-card/60 text-main px-5 rounded-2xl border border-border/30 font-black text-[10px] uppercase tracking-widest hover:bg-main hover:text-app transition-all active:scale-95 shadow-lg">
            <Home size={16} /> {lang === 'ar' ? 'المخازن' : 'WAREHOUSES'}
          </button>
        </div>
      </div>

      <div className="bg-card/60 rounded-[2rem] border border-border/20 overflow-hidden relative shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)]">
        {(() => {
          if (inventoryLoading && inventory.length === 0 && !searchQuery) {
            return (
              <div className="p-8">
                <PageSkeleton />
              </div>
            );
          }
          return (
            <div className="flex-1 flex flex-col min-h-0 relative z-10 w-full overflow-hidden min-h-[600px]">
              {/* Sort Bar */}
              <div className="shrink-0 px-4 sm:px-6 py-4 flex items-center gap-2 overflow-x-auto border-b border-border/20 bg-elevated/20 sticky top-0 z-20">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted mr-2">{lang === 'ar' ? 'ترتيب:' : 'Sort:'}</span>
                {[
                  { id: 'name', label: lang === 'ar' ? 'الاسم' : 'Name' },
                  { id: 'qty-asc', label: lang === 'ar' ? 'الأقل كمية' : 'Qty ?' },
                  { id: 'qty-desc', label: lang === 'ar' ? 'الأكثر كمية' : 'Qty ?' },
                  { id: 'cost', label: lang === 'ar' ? 'التكلفة' : 'Cost' },
                  { id: 'low-first', label: lang === 'ar' ? 'نقص أولاً' : 'Low First' },
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => setStockSort(s.id as any)}
                    className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 border ${stockSort === s.id
                      ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                      : 'bg-card/30 text-muted border-border/20 hover:border-emerald-500/20 hover:text-emerald-400'
                      }`}
                  >
                    {s.label}
                  </button>
                ))}
                <span className="ms-auto shrink-0 text-[9px] font-bold text-muted tabular-nums bg-elevated/40 px-2 py-1 rounded-lg border border-border/10">
                  {visibleItems.length} {lang === 'ar' ? 'صنف' : 'items'}
                </span>
              </div>

              {/* Header Row */}
              <div className={`hidden lg:grid ${inventoryGridColumns} gap-4 px-8 py-5 bg-elevated/30 border-b border-border/20 text-muted text-[10px] uppercase font-black tracking-widest sticky top-0 z-20`}>
                <div className="min-w-0 whitespace-nowrap">{lang === 'ar' ? 'الصنف' : 'Item Name'}</div>
                <div className="min-w-0 whitespace-nowrap">{lang === 'ar' ? 'التوزيع' : 'Warehouses'}</div>
                <div className="min-w-0 whitespace-nowrap">{lang === 'ar' ? 'الكمية الإجمالية' : 'Total Qty'}</div>
                <div className="min-w-0 whitespace-nowrap font-secondary">{lang === 'ar' ? 'سعر الشراء' : 'Purchase Price'}</div>
                <div className="min-w-0 whitespace-nowrap">{lang === 'ar' ? 'التكلفة' : 'Cost'}</div>
                <div className="min-w-0 whitespace-nowrap text-right">{lang === 'ar' ? 'إجراءات' : 'Actions'}</div>
              </div>

              {/* Virtualized Body */}
              <div className="hidden lg:block flex-1 overflow-hidden min-h-0 bg-card/10">
                {visibleItems.length === 0 ? (
                  <div className="flex min-h-[420px] flex-col items-center justify-center gap-5 p-8 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                      <Package size={34} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-main">
                        {lang === 'ar' ? 'لا توجد أصناف مخزنية ظاهرة' : 'No inventory items visible'}
                      </h3>
                      <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-relaxed text-muted">
                        {inventoryError
                          ? (lang === 'ar'
                              ? `تعذر تحميل الأصناف: ${inventoryError}. تأكد من صلاحيات المستخدم أو الاتصال بالخادم ثم اضغط تحديث.`
                              : `Could not load inventory: ${inventoryError}. Check user permissions or server connection, then refresh.`)
                          : (filteredInventory.length > 0
                              ? (lang === 'ar'
                                  ? 'الفلاتر الحالية تخفي كل الأصناف — امسحها لعرض الكل.'
                                  : 'Current filters hide everything — clear them to show all.')
                              : (lang === 'ar'
                                  ? 'ابدأ بإضافة صنف مخزني أو تأكد أن الأصناف متصلة بالمخزن الحالي.'
                                  : 'Add a raw material or confirm items are linked to the current warehouse.'))}
                      </p>
                    </div>
                    {filteredInventory.length > 0 && (
                      <button
                        type="button"
                        onClick={clearFlowFilters}
                        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-500 transition-all hover:bg-emerald-500/20 active:scale-95"
                      >
                        {lang === 'ar' ? 'مسح الفلاتر' : 'Clear filters'}
                      </button>
                    )}
                  </div>
                ) : (
                  <VirtualList
                    itemCount={visibleItems.length}
                    itemHeight={100}
                    overscan={5}
                    getKey={(index) => visibleItems[index].id}
                    renderItem={(index) => {
                    const item = visibleItems[index];
                    const totalQty = inventoryTotalsById.get(item.id) || 0;
                    const isLow = totalQty <= item.threshold;
                    const hasBrokenWarehouseLink = item.warehouseQuantities.some((row) => {
                      const warehouse = warehouseById.get(row.warehouseId);
                      return !warehouse || warehouse.isActive === false;
                    });
                    return (
                      <div
                        className={`grid ${inventoryGridColumns} gap-4 px-8 items-center h-full hover:bg-emerald-500/5 transition-colors border-b border-white/5 group`}
                      >
                        {/* Item Profile */}
                        <div className="min-w-0 flex items-center gap-4 py-2">
                          <div className={`p-3.5 rounded-[1.2rem] border ${item.isComposite ? 'bg-violet-500/10 text-violet-500 border-violet-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'} shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-transform duration-150 ease-out`}>
                            {item.isComposite ? <Layers size={20} /> : <Package size={20} />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-main text-[13px] truncate group-hover:text-emerald-500 transition-colors uppercase">
                              {displayItemName(item)}
                            </div>
                            <div className="text-[10px] flex items-center gap-2 mt-1 truncate">
                              <span className="uppercase font-black tracking-widest text-muted">{item.category}</span>
                              {item.sku && <span className="font-mono font-bold tracking-widest text-teal-500 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">[{item.sku}]</span>}
                            </div>
                          </div>
                        </div>

                        {/* Warehouses */}
                        <div className="min-w-0 flex flex-wrap gap-1.5 py-2 overflow-hidden">
                          {item.warehouseQuantities.slice(0, 3).map(wq => {
                            const wh = warehouseById.get(wq.warehouseId);
                            return (
                              <span key={wq.warehouseId} className="px-2 py-1 bg-elevated/40 border border-border/20 shadow-sm rounded-lg text-[9px] font-bold text-main hover:border-emerald-500/30 transition-colors">
                                <span className="truncate">{displayWarehouseName(wh)}: {wq.quantity}</span>
                              </span>
                            );
                          })}
                          {item.warehouseQuantities.length > 3 && <span className="text-[9px] font-black text-muted">+{item.warehouseQuantities.length - 3} {lang === 'ar' ? 'أكثر' : 'More'}</span>}
                          {item.warehouseQuantities.length === 0 && <span className="text-[10px] italic text-muted opacity-60">{lang === 'ar' ? 'لا يوجد رصيد' : 'Empty Stock'}</span>}
                          {hasBrokenWarehouseLink && <span className="px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[9px] font-black text-amber-500">{lang === 'ar' ? 'مخزن غير نشط' : 'Invalid warehouse link'}</span>}
                        </div>

                        {/* Qty */}
                        <div className="min-w-0 font-black py-2">
                          <div className={`text-[13px] ${isLow ? 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]' : 'text-main'}`}>
                            {totalQty} <span className="text-[10px] text-muted ml-0.5 font-normal">{item.unit}</span>
                          </div>
                          {isLow && (
                            <div className="text-[8px] uppercase font-black text-rose-500 bg-rose-500/10 border border-rose-500/20 w-fit px-1.5 py-0.25 rounded mt-1 overflow-hidden whitespace-nowrap animate-pulse">
                              {lang === 'ar' ? 'منخفض' : 'Low Stock'}
                            </div>
                          )}
                        </div>

                        {/* Price */}
                        <div className="min-w-0 font-black text-[13px] text-emerald-500 drop-shadow-sm py-2 whitespace-nowrap">
                          {settings.currencySymbol || 'ج.م'} {(item.purchasePrice || 0).toLocaleString()}
                        </div>

                        {/* Cost */}
                        <div className="min-w-0 font-black text-[13px] text-muted/80 py-2 whitespace-nowrap">
                          {settings.currencySymbol || 'ج.م'} {item.costPrice.toLocaleString()}
                        </div>

                        {/* Actions */}
                        <div className="min-w-0 flex items-center justify-end gap-2 pr-2 opacity-30 group-hover:opacity-100 transition-opacity">
                          {/* AI Forecast Button */}
                          <button
                            onClick={() => handleRequestForecast(item.id)}
                            disabled={aiForecasts[item.id]?.loading}
                            title={lang === 'ar' ? 'توقعات الذكاء الاصطناعي' : 'AI Forecast'}
                            className={`p-2.5 border border-border/20 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2 ${
                              aiForecasts[item.id]?.loading
                                ? 'bg-primary/5 text-primary animate-pulse'
                                : 'bg-card/50 hover:bg-primary/10 hover:border-primary/30 text-muted hover:text-primary'
                            }`}
                          >
                            <Activity size={15} />
                            {aiForecasts[item.id]?.text && (
                              <div className="absolute bottom-full right-0 mb-3 w-64 p-3 bg-card/95 border border-primary/20 rounded-2xl shadow-2xl z-50 text-[10px] normal-case font-bold text-main leading-relaxed ring-1 ring-white/10 animate-in fade-in slide-in-from-bottom-2">
                                <div className="flex items-center gap-2 mb-1.5 text-primary uppercase tracking-tighter">
                                  <Activity size={10} />
                                  {lang === 'ar' ? 'تحليل ذكي' : 'Smart Insight'}
                                </div>
                                {aiForecasts[item.id].text}
                              </div>
                            )}
                          </button>

                          <button
                            onClick={() => { setEditingItem(item); setItemModalOpen(true); }}
                            aria-label={lang === 'ar' ? `تعديل ${displayItemName(item)}` : `Edit ${displayItemName(item)}`}
                            title={lang === 'ar' ? 'تعديل الصنف' : 'Edit item'}
                            className="p-2.5 bg-card/50 hover:bg-emerald-500/10 border border-border/20 hover:border-emerald-500/30 rounded-xl text-muted hover:text-emerald-500 transition-all shadow-sm active:scale-95"
                          >
                            <Tag size={15} />
                          </button>
                          <button
                            onClick={() => { setEditingItem(item); setAdjustmentModalOpen(true); }}
                            aria-label={lang === 'ar' ? `تسوية مخزون ${displayItemName(item)}` : `Adjust stock for ${displayItemName(item)}`}
                            title={lang === 'ar' ? 'تسوية المخزون' : 'Adjust stock'}
                            className="p-2.5 bg-card/50 hover:bg-amber-500/10 border border-border/20 hover:border-amber-500/30 rounded-xl text-muted hover:text-amber-500 transition-all shadow-sm active:scale-95"
                          >
                            <Calculator size={15} />
                          </button>
                          <button
                            onClick={() => void handleDeleteItem(item)}
                            aria-label={lang === 'ar' ? `أرشفة ${displayItemName(item)}` : `Archive ${displayItemName(item)}`}
                            title={lang === 'ar' ? 'أرشفة الصنف' : 'Archive item'}
                            className="p-2.5 bg-card/50 hover:bg-rose-500/10 border border-border/20 hover:border-rose-500/30 rounded-xl text-muted hover:text-rose-500 transition-all shadow-sm active:scale-95"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                    }}
                  />
                )}
              </div>

              <div className="lg:hidden flex-1 min-h-0 overflow-y-auto bg-card/10 p-3 sm:p-4 space-y-3">
                {visibleItems.length === 0 ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 px-5 text-center">
                    <Package size={38} className="text-muted/30" />
                    <p className="text-sm font-black text-muted">
                      {filteredInventory.length > 0
                        ? (lang === 'ar' ? 'الفلاتر تخفي كل الأصناف' : 'Filters hide everything')
                        : (lang === 'ar' ? 'لا توجد أصناف مخزنية ظاهرة' : 'No inventory items visible')}
                    </p>
                    {filteredInventory.length > 0 && (
                      <button
                        type="button"
                        onClick={clearFlowFilters}
                        className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-[10px] font-black text-emerald-500"
                      >
                        {lang === 'ar' ? 'مسح الفلاتر' : 'Clear filters'}
                      </button>
                    )}
                  </div>
                ) : visibleItems.map((item) => {
                  const totalQty = inventoryTotalsById.get(item.id) || 0;
                  const isLow = totalQty <= item.threshold;
                  const hasBrokenWarehouseLink = item.warehouseQuantities.some((row) => {
                    const warehouse = warehouseById.get(row.warehouseId);
                    return !warehouse || warehouse.isActive === false;
                  });
                  return (
                    <article key={item.id} className="rounded-2xl border border-border/25 bg-card/70 p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-xl border p-2.5 ${item.isComposite ? 'border-violet-500/20 bg-violet-500/10 text-violet-500' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'}`}>
                          {item.isComposite ? <Layers size={18} /> : <Package size={18} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-black text-main">{displayItemName(item)}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted">
                            <span>{item.category || (lang === 'ar' ? 'بدون تصنيف' : 'Uncategorized')}</span>
                            {item.sku && <span className="rounded-md bg-elevated px-1.5 py-0.5 font-mono">{item.sku}</span>}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${isLow ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          {isLow ? (lang === 'ar' ? 'منخفض' : 'LOW') : (lang === 'ar' ? 'متاح' : 'OK')}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-elevated/35 p-3 text-center">
                        <div>
                          <p className="text-[9px] font-black text-muted">{lang === 'ar' ? 'الرصيد' : 'STOCK'}</p>
                          <p className={`mt-1 text-sm font-black tabular-nums ${isLow ? 'text-rose-500' : 'text-main'}`}>{totalQty} <small>{item.unit}</small></p>
                        </div>
                        <div className="border-x border-border/20">
                          <p className="text-[9px] font-black text-muted">{lang === 'ar' ? 'الشراء' : 'BUY'}</p>
                          <p className="mt-1 text-sm font-black text-emerald-500 tabular-nums">{settings.currencySymbol || 'ج.م'} {item.purchasePrice || 0}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-muted">{lang === 'ar' ? 'التكلفة' : 'COST'}</p>
                          <p className="mt-1 text-sm font-black text-main tabular-nums">{settings.currencySymbol || 'ج.م'} {item.costPrice || 0}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.warehouseQuantities.slice(0, 2).map((wq) => (
                          <span key={wq.warehouseId} className="rounded-lg border border-border/20 bg-elevated/30 px-2 py-1 text-[9px] font-bold text-muted">
                            {displayWarehouseName(warehouseById.get(wq.warehouseId)) || (lang === 'ar' ? 'مخزن غير موجود' : 'Missing warehouse')}: {wq.quantity}
                          </span>
                        ))}
                        {hasBrokenWarehouseLink && <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-black text-amber-500">{lang === 'ar' ? 'مراجعة ربط المخزن' : 'Review warehouse link'}</span>}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setEditingItem(item); setItemModalOpen(true); }} className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-[10px] font-black text-emerald-500">
                          {lang === 'ar' ? 'تعديل الصنف' : 'Edit item'}
                        </button>
                        <button type="button" onClick={() => { setEditingItem(item); setAdjustmentModalOpen(true); }} className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-[10px] font-black text-amber-500">
                          {lang === 'ar' ? 'تسوية الرصيد' : 'Adjust stock'}
                        </button>
                        <button type="button" onClick={() => void handleDeleteItem(item)} className="col-span-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-[10px] font-black text-rose-500">
                          {lang === 'ar' ? 'أرشفة الصنف' : 'Archive item'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      <ItemModal
        isOpen={itemModalOpen}
        onClose={() => { setItemModalOpen(false); setEditingItem(null); }}
        onSave={handleSaveItem}
        lang={lang}
        warehouses={warehouses}
        existingItems={activeInventory}
        initialItem={editingItem}
      />
      <StockAdjustmentModal
        isOpen={adjustmentModalOpen}
        onClose={() => { setAdjustmentModalOpen(false); setEditingItem(null); }}
        onSave={handleAdjustment}
        lang={lang}
        items={activeInventory}
        warehouses={activeWarehouses}
        initialItem={editingItem}
      />
    </InvPageShell>
  );
};

export default StockItemsPage;
