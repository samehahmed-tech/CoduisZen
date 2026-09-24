import React, { useEffect, useState } from 'react';
import { Activity, ArrowRightLeft, Calendar, Download, FileText, Printer, RefreshCw, Search, Utensils } from 'lucide-react';
import { useInventoryWorkspace } from '../shared/useInventoryWorkspace';
import { InvPageShell, InvPageHeader, InvError, MOVEMENT_TYPE_META } from '../shared/inventoryUi';

const MovementsPage: React.FC = () => {
  const {
    lang, settings, inventoryError, clearError,
    movementLoading, movementDateFrom, setMovementDateFrom,
    movementDateTo, setMovementDateTo, movementTypeFilter, setMovementTypeFilter,
    movementSearch, setMovementSearch,
    loadMovements, toggleMovementType, filteredMovementRows, movementSummary,
    exportMovementsCsv, printMovements,
    consumptionRows, consumptionLoading, consumptionDateFrom, setConsumptionDateFrom,
    consumptionDateTo, setConsumptionDateTo, consumptionReportRows, consumptionTotals,
    exportRecipeConsumptionCsv, printRecipeConsumption, loadRecipeConsumption,
  } = useInventoryWorkspace();

  const [subTab, setSubTab] = useState<'MOVEMENTS' | 'CONSUMPTION'>('MOVEMENTS');

  useEffect(() => {
    void loadMovements();
  }, [movementDateFrom, movementDateTo, movementTypeFilter]);
  useEffect(() => {
    if (subTab === 'CONSUMPTION') void loadRecipeConsumption();
  }, [subTab]);

  return (
    <InvPageShell>
      <InvPageHeader
        icon={<ArrowRightLeft size={30} className="text-sky-500" />}
        title={lang === 'ar' ? 'الحركات والمسحوبات' : 'Movements & Withdrawals'}
        subtitle={lang === 'ar' ? 'سجل حركات المخزون ومسحوبات الوصفات' : 'Stock movement log and recipe withdrawals'}
        accent="sky"
        backLabel={lang === 'ar' ? 'المخزون' : 'Inventory'}
      />

      {inventoryError && (
        <InvError message={inventoryError} onDismiss={clearError} dismissLabel={lang === 'ar' ? 'إغلاق' : 'Dismiss'} />
      )}

      <div className="flex bg-card/40 rounded-[2rem] border border-border/30 p-2 overflow-x-auto no-scrollbar w-fit">
        {[
          { id: 'MOVEMENTS' as const, label: lang === 'ar' ? 'سجل الحركات' : 'Movement Log', icon: Activity },
          { id: 'CONSUMPTION' as const, label: lang === 'ar' ? 'مسحوبات الوصفات' : 'Recipe Consumption', icon: Utensils },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-150 flex items-center gap-3 whitespace-nowrap ${subTab === tab.id ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-xl shadow-sky-600/20 scale-105' : 'text-muted hover:text-main hover:bg-elevated/60'}`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'MOVEMENTS' ? (
      <div className="space-y-6 relative z-10 animate-in fade-in duration-150">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-elevated/20 p-5 rounded-3xl border border-border/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center">
            <Calendar size={16} />
          </div>
          <input
            type="date"
            value={movementDateFrom}
            onChange={(e) => setMovementDateFrom(e.target.value)}
            aria-label={lang === 'ar' ? 'من تاريخ' : 'From date'}
            className="bg-card/60 border border-border/30 rounded-xl px-4 py-2 text-[11px] font-black uppercase text-main outline-none focus:border-sky-500/50"
          />
        </div>
        <span className="text-muted text-[10px] font-black uppercase tracking-widest">{lang === 'ar' ? 'إلى' : 'TO'}</span>
        <input
          type="date"
          value={movementDateTo}
          onChange={(e) => setMovementDateTo(e.target.value)}
          aria-label={lang === 'ar' ? 'إلى تاريخ' : 'To date'}
          className="bg-card/60 border border-border/30 rounded-xl px-4 py-2 text-[11px] font-black uppercase text-main outline-none focus:border-sky-500/50"
        />

        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-muted ${lang === 'ar' ? 'right-3' : 'left-3'}`} />
          <input
            value={movementSearch}
            onChange={(e) => setMovementSearch(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث: صنف / سبب / مرجع…' : 'Search item / reason / ref…'}
            aria-label={lang === 'ar' ? 'بحث في الحركات' : 'Search movements'}
            className={`w-full bg-card/60 border border-border/30 rounded-xl ${lang === 'ar' ? 'pr-9 pl-3' : 'pl-9 pr-3'} py-2.5 text-[11px] font-bold text-main outline-none focus:border-sky-500/50`}
          />
        </div>

        <button
          onClick={loadMovements}
          disabled={movementLoading}
          className="flex items-center gap-3 px-7 py-3 bg-card/60 text-sky-500 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border border-border/30 hover:bg-sky-500 hover:text-white transition-all active:scale-95 shadow-sm disabled:opacity-50"
        >
          <RefreshCw size={14} className={movementLoading ? 'animate-spin' : ''} />
          {lang === 'ar' ? 'تحديث السجلات' : 'REFRESH LOGS'}
        </button>
        <button
          onClick={printMovements}
          disabled={filteredMovementRows.length === 0}
          className="flex items-center gap-3 px-5 py-3 bg-card/60 text-muted rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border border-border/30 hover:bg-main hover:text-app disabled:opacity-40 transition-all active:scale-95"
        >
          <Printer size={14} />
          {lang === 'ar' ? 'طباعة / PDF' : 'PRINT / PDF'}
        </button>
        <button
          onClick={exportMovementsCsv}
          disabled={filteredMovementRows.length === 0}
          className="flex items-center gap-3 px-5 py-3 bg-card/60 text-muted rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border border-border/30 hover:bg-emerald-500 hover:text-white disabled:opacity-40 transition-all active:scale-95"
        >
          <Download size={14} />
          Excel
        </button>
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'النوع:' : 'TYPE:'}</span>
        <button
          onClick={() => setMovementTypeFilter(new Set())}
          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${movementTypeFilter.size === 0 ? 'bg-sky-500 text-white border-sky-400 shadow-sm' : 'bg-card/40 text-muted border-border/20 hover:border-sky-500/30 hover:text-sky-400'}`}
        >
          {lang === 'ar' ? 'الكل' : 'ALL'}
        </button>
        {Object.entries(MOVEMENT_TYPE_META).map(([type, meta]) => {
          const active = movementTypeFilter.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleMovementType(type)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${active ? meta.badge : 'bg-card/40 text-muted border-border/20 hover:text-main'}`}
            >
              <span className={`h-2 w-2 rounded-full ${active ? meta.dot : 'bg-muted/40'}`} />
              {lang === 'ar' ? meta.ar : meta.en}
            </button>
          );
        })}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border/20 bg-card/50 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'عدد الحركات' : 'Total Movements'}</p>
          <p className="mt-2 text-2xl font-black text-main tabular-nums">{movementSummary.count.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{lang === 'ar' ? 'كمية واردة +' : 'Inbound Qty'}</p>
          <p className="mt-2 text-2xl font-black text-emerald-500 tabular-nums">{movementSummary.inQty.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">{lang === 'ar' ? 'كمية منصرفة −' : 'Outbound Qty'}</p>
          <p className="mt-2 text-2xl font-black text-rose-500 tabular-nums">{movementSummary.outQty.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-border/20 bg-card/50 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'قيمة الحركات' : 'Movement Value'}</p>
          <p className="mt-2 text-2xl font-black text-main tabular-nums">{settings.currencySymbol || 'EGP'} {movementSummary.cost.toFixed(2)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="responsive-table border border-border/10 rounded-3xl overflow-hidden shadow-sm">
        {filteredMovementRows.length === 0 ? (
          <div className="text-center py-24 bg-card/20">
            <Activity size={64} className="mx-auto text-muted/10 mb-6 animate-pulse" />
            <p className="text-muted font-black uppercase tracking-[0.3em] text-xs">
              {movementLoading ? (lang === 'ar' ? 'جاري استرجاع البيانات...' : 'LOADING...') : (lang === 'ar' ? 'لا توجد حركات مطابقة للفلاتر' : 'No movements match your filters')}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[1100px] table-fixed text-sm">
            <colgroup>
              <col className="w-[150px]" />
              <col className="w-[220px]" />
              <col className="w-[120px]" />
              <col className="w-[90px]" />
              <col className="w-[70px]" />
              <col className="w-[100px]" />
              <col className="w-[110px]" />
              <col className="w-[130px]" />
              <col className="w-[140px]" />
              <col className="w-[120px]" />
            </colgroup>
            <thead className="bg-elevated/40 text-muted uppercase font-black text-[10px] tracking-widest">
              <tr>
                <th className="px-4 py-5 text-start">{lang === 'ar' ? 'الوقت' : 'Timestamp'}</th>
                <th className="px-4 py-5 text-start">{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'تكلفة الوحدة' : 'Unit Cost'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                <th className="px-4 py-5 text-start">{lang === 'ar' ? 'المخزن' : 'Warehouse'}</th>
                <th className="px-4 py-5 text-start">{lang === 'ar' ? 'المرجع / السبب' : 'Reference / Reason'}</th>
                <th className="px-4 py-5 text-start">{lang === 'ar' ? 'بواسطة' : 'By'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredMovementRows.map((mv, idx) => {
                const meta = MOVEMENT_TYPE_META[String(mv.type || '').toUpperCase()];
                const qty = Number(mv.quantity || 0);
                return (
                  <tr key={mv.id || idx} className="hover:bg-sky-500/5 transition-colors group">
                    <td className="px-4 py-3.5 text-[10px] font-black text-muted/70 tabular-nums whitespace-nowrap">
                      {new Date(mv.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="truncate text-xs font-black text-main group-hover:text-sky-500 transition-colors" title={lang === 'ar' ? mv.itemNameAr || mv.itemName : mv.itemName}>
                        {lang === 'ar' ? mv.itemNameAr || mv.itemName : mv.itemName}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border whitespace-nowrap ${meta?.badge || 'bg-card text-muted border-border/20'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta?.dot || 'bg-muted'}`} />
                        {lang === 'ar' ? meta?.ar || mv.type : meta?.en || mv.type}
                      </span>
                    </td>
                    <td className={`px-3 py-3.5 text-center font-black tabular-nums whitespace-nowrap ${qty > 0 ? 'text-emerald-500' : qty < 0 ? 'text-rose-500' : 'text-muted'}`}>
                      {qty > 0 ? `+${qty.toLocaleString()}` : qty.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5 text-center text-[10px] font-black uppercase tracking-widest text-muted whitespace-nowrap">{mv.unit || '-'}</td>
                    <td className="px-3 py-3.5 text-center font-bold text-muted tabular-nums text-[11px] whitespace-nowrap">
                      {Number(mv.unitCost || 0) ? Number(mv.unitCost).toFixed(2) : '-'}
                    </td>
                    <td className="px-3 py-3.5 text-center font-black tabular-nums text-[11px] text-main whitespace-nowrap">
                      {Number(mv.totalCost || 0) ? Math.abs(Number(mv.totalCost)).toFixed(2) : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-[11px] font-bold text-muted truncate">{mv.warehouseName || '-'}</td>
                    <td className="px-4 py-3.5">
                      {mv.referenceId && <p className="truncate text-[10px] font-black text-main font-mono" title={mv.referenceId}>{mv.referenceId}</p>}
                      {mv.reason && <p className="truncate text-[10px] font-bold text-muted" title={mv.reason}>{mv.reason}</p>}
                      {!mv.referenceId && !mv.reason && <span>-</span>}
                    </td>
                    <td className="px-4 py-3.5 text-[10px] font-black text-muted uppercase tracking-widest truncate">{mv.performedBy || 'System'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-elevated/60 font-black text-[11px] text-main">
                <td className="px-4 py-4 uppercase tracking-widest" colSpan={3}>{lang === 'ar' ? 'الإجمالي' : 'TOTALS'}</td>
                <td className="px-3 py-4 text-center tabular-nums text-emerald-500">+{movementSummary.inQty.toLocaleString()}</td>
                <td colSpan={2} />
                <td className="px-3 py-4 text-center tabular-nums">{settings.currencySymbol || 'EGP'} {movementSummary.cost.toFixed(2)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      </div>
      ) : (
      <div className="space-y-6 relative z-10 animate-in fade-in duration-150">
      <div className="flex flex-wrap items-center gap-4 bg-elevated/20 p-5 rounded-3xl border border-border/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center">
            <Utensils size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black text-main">{lang === 'ar' ? 'مسحوبات الوصفات' : 'Recipe Consumption'}</h3>
            <p className="text-[10px] font-bold text-muted">{lang === 'ar' ? 'المكونات التي خرجت من المخزون بسبب المبيعات' : 'Ingredients deducted from stock by sales'}</p>
          </div>
        </div>
        <input
          type="date"
          value={consumptionDateFrom}
          onChange={(e) => setConsumptionDateFrom(e.target.value)}
          className="bg-card/60 border border-border/30 rounded-xl px-4 py-2 text-[11px] font-black uppercase text-main outline-none focus:border-rose-500/50"
        />
        <span className="text-muted text-[10px] font-black uppercase tracking-widest">{lang === 'ar' ? 'إلى' : 'TO'}</span>
        <input
          type="date"
          value={consumptionDateTo}
          onChange={(e) => setConsumptionDateTo(e.target.value)}
          className="bg-card/60 border border-border/30 rounded-xl px-4 py-2 text-[11px] font-black uppercase text-main outline-none focus:border-rose-500/50"
        />
        <button
          onClick={loadRecipeConsumption}
          disabled={consumptionLoading}
          className="flex items-center gap-3 px-7 py-3 bg-card/60 text-rose-500 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border border-border/30 hover:bg-rose-500 hover:text-white transition-all active:scale-95 shadow-sm"
        >
          <Activity size={14} className={consumptionLoading ? 'animate-spin' : ''} />
          {lang === 'ar' ? 'تحديث' : 'REFRESH'}
        </button>
        <button
          onClick={printRecipeConsumption}
          disabled={consumptionRows.length === 0}
          className="flex items-center gap-3 px-5 py-3 bg-card/60 text-muted rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border border-border/30 hover:bg-main hover:text-app disabled:opacity-40 transition-all active:scale-95"
        >
          <Printer size={14} />
          {lang === 'ar' ? 'طباعة' : 'PRINT'}
        </button>
        <button
          onClick={printRecipeConsumption}
          disabled={consumptionRows.length === 0}
          className="flex items-center gap-3 px-5 py-3 bg-card/60 text-muted rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border border-border/30 hover:bg-main hover:text-app disabled:opacity-40 transition-all active:scale-95"
        >
          <FileText size={14} />
          PDF
        </button>
        <button
          onClick={exportRecipeConsumptionCsv}
          disabled={consumptionRows.length === 0}
          className="flex items-center gap-3 px-5 py-3 bg-card/60 text-muted rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border border-border/30 hover:bg-emerald-500 hover:text-white disabled:opacity-40 transition-all active:scale-95"
        >
          <Download size={14} />
          Excel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-border/20 bg-card/50 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'إجمالي الكمية المسحوبة' : 'Total Deducted Qty'}</p>
          <p className="mt-2 text-2xl font-black text-main tabular-nums">{consumptionTotals.quantity.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-border/20 bg-card/50 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'تكلفة تقديرية' : 'Estimated Cost'}</p>
          <p className="mt-2 text-2xl font-black text-main tabular-nums">{settings.currencySymbol || 'EGP'} {consumptionTotals.cost.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-border/20 bg-card/50 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">{lang === 'ar' ? 'عدد حركات السحب' : 'Deduction Movements'}</p>
          <p className="mt-2 text-2xl font-black text-main tabular-nums">{consumptionTotals.movements.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">{lang === 'ar' ? 'إجمالي العجز' : 'Total Shortage'}</p>
          <p className="mt-2 text-2xl font-black text-rose-500 tabular-nums">{consumptionTotals.shortage.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{lang === 'ar' ? 'إجمالي الأوفر' : 'Total Over'}</p>
          <p className="mt-2 text-2xl font-black text-emerald-500 tabular-nums">{consumptionTotals.over.toLocaleString()}</p>
        </div>
      </div>

      <div className="responsive-table border border-border/10 rounded-3xl overflow-hidden shadow-sm">
        {consumptionRows.length === 0 ? (
          <div className="text-center py-24 bg-card/20">
            <Utensils size={58} className="mx-auto text-muted/10 mb-6" />
            <p className="text-muted font-black uppercase tracking-[0.2em] text-xs">
              {consumptionLoading ? (lang === 'ar' ? 'جاري تحميل المسحوبات...' : 'Loading consumption...') : (lang === 'ar' ? 'لا توجد مسحوبات وصفات في الفترة المحددة' : 'No recipe consumption in this period')}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[1180px] table-fixed text-sm">
            <colgroup>
              <col className="w-[220px]" />
              <col className="w-[150px]" />
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[70px]" />
              <col className="w-[110px]" />
              <col className="w-[80px]" />
              <col className="w-[170px]" />
            </colgroup>
            <thead className="bg-elevated/40 text-muted uppercase font-black text-[10px] tracking-widest">
              <tr>
                <th className="px-5 py-5 text-start">{lang === 'ar' ? 'الصنف المخزني' : 'Inventory Item'}</th>
                <th className="px-4 py-5 text-start">{lang === 'ar' ? 'المخزن' : 'Warehouse'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'الكمية' : 'Quantity'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'الرصيد الحالي' : 'Current'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'العجز' : 'Shortage'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'الأوفر' : 'Over'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
                <th className="px-3 py-5 text-center">{lang === 'ar' ? 'الحركات' : 'Moves'}</th>
                <th className="px-5 py-5 text-start">{lang === 'ar' ? 'آخر أوردر' : 'Last Order'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {consumptionReportRows.map((row, idx) => (
                <tr key={`${row.itemId}-${row.warehouseId || idx}`} className="hover:bg-rose-500/5 transition-colors">
                  <td className="px-5 py-4">
                    <p className="truncate text-xs font-black text-main">{lang === 'ar' ? row.itemNameAr || row.itemName : row.itemName}</p>
                    <p className="mt-1 flex items-center gap-2 truncate text-[10px] font-bold text-muted">
                      {row.itemId}
                      {row.source === 'THEORETICAL' && (
                        <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-black text-amber-500">
                          {lang === 'ar' ? 'نظري' : 'THEORETICAL'}
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-xs font-bold text-muted truncate">{row.warehouseName || row.warehouseId || '-'}</td>
                  <td className="px-3 py-4 text-center font-black tabular-nums text-rose-500 whitespace-nowrap">{Number(row.totalQuantity || 0).toLocaleString()}</td>
                  <td className="px-3 py-4 text-center font-black tabular-nums text-main whitespace-nowrap">
                    {Number(row.currentStock || 0).toLocaleString()}
                    {row.lastCountDate && (
                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-muted">
                        {lang === 'ar' ? 'آخر جرد' : 'Last count'}: {new Date(row.lastCountDate).toLocaleDateString()}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-4 text-center font-black tabular-nums text-rose-500 whitespace-nowrap">{Number(row.shortageQty || 0).toLocaleString()}</td>
                  <td className="px-3 py-4 text-center font-black tabular-nums text-emerald-500 whitespace-nowrap">{Number(row.overQty || 0).toLocaleString()}</td>
                  <td className="px-3 py-4 text-center text-[10px] font-black uppercase tracking-widest text-muted whitespace-nowrap">{row.unit || '-'}</td>
                  <td className="px-3 py-4 text-center font-black tabular-nums text-main whitespace-nowrap">{settings.currencySymbol || 'EGP'} {Number(row.estimatedCost || 0).toFixed(2)}</td>
                  <td className="px-3 py-4 text-center font-black tabular-nums text-muted whitespace-nowrap">{row.movementCount}</td>
                  <td className="px-5 py-4">
                    <p className="truncate text-[11px] font-black text-main">{row.lastReferenceId || '-'}</p>
                    <p className="mt-1 truncate text-[10px] font-bold text-muted">{row.lastConsumedAt ? new Date(row.lastConsumedAt).toLocaleString() : '-'}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>
      )}
    </InvPageShell>
  );
};

export default MovementsPage;
