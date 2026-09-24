import React, { useEffect } from 'react';
import { ClipboardCheck, Download, Printer, Search, X } from 'lucide-react';
import { useInventoryWorkspace } from '../shared/useInventoryWorkspace';
import { InvPageShell, InvPageHeader, InvError } from '../shared/inventoryUi';

const StockCountsPage: React.FC = () => {
  const {
    lang, settings, branches, inventoryError, clearError,
    activeWarehouses, warehouseById, displayWarehouseName, showToast,
    countSession, blindCount, setBlindCount,
    countScan, setCountScan, countScanFilter, setCountScanFilter,
    countLoading, selectedCountWarehouse, setSelectedCountWarehouse,
    selectedCountDate, setSelectedCountDate, selectedCountType, setSelectedCountType,
    countHistory, countError, activeCountWarehouseName,
    loadCountHistory, handleStartCount, handleOpenCount, handlePrintCount,
    exportStockCount, handleUpdateCountItem, handleCompleteCount, handleZeroCountInputs,
  } = useInventoryWorkspace();

  useEffect(() => {
    void loadCountHistory();
  }, [selectedCountWarehouse, selectedCountDate, activeWarehouses.length, settings.activeBranchId]);

  return (
    <InvPageShell>
      <InvPageHeader
        icon={<ClipboardCheck size={30} className="text-violet-500" />}
        title={lang === 'ar' ? 'الجرد' : 'Stock Counts'}
        subtitle={lang === 'ar' ? 'جلسات الجرد الفعلي ومقارنة النظام' : 'Physical count sessions vs system records'}
        accent="violet"
        backLabel={lang === 'ar' ? 'المخزون' : 'Inventory'}
      />

      {inventoryError && (
        <InvError message={inventoryError} onDismiss={clearError} dismissLabel={lang === 'ar' ? 'إغلاق' : 'Dismiss'} />
      )}

      <div className="relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-150">
      {!countSession ? (
        <div className="text-center py-20 space-y-8">
          <div className="w-24 h-24 mx-auto rounded-[2rem] bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center border border-violet-500/30 shadow-2xl shadow-violet-500/10 transition-transform duration-700 hover:rotate-12">
            <ClipboardCheck size={40} className="text-violet-500" />
          </div>
          <div>
            <h3 className="text-3xl font-black text-main tracking-tighter mb-3">
              {lang === 'ar' ? 'بدء جلسة جرد جديدة' : 'Initialize Inventory Audit'}
            </h3>
            <p className="text-muted text-sm font-bold max-w-sm mx-auto leading-relaxed">
              {lang === 'ar' ? 'اختر المخزن للبدء في مراجعة الكميات الفعلية ومقارنتها بالنظام.' : 'Select a target warehouse to begin cross-referencing physical stock with system records.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] items-center justify-center gap-4 max-w-4xl mx-auto">
            <input
              type="date"
              value={selectedCountDate}
              onChange={(e) => setSelectedCountDate(e.target.value)}
              className="w-full px-6 py-4 bg-card/60  border border-border/30 rounded-2xl text-main font-black text-xs uppercase tracking-widest outline-none focus:border-violet-500/50 shadow-sm"
            />
            <select
              value={selectedCountType}
              onChange={(e) => setSelectedCountType(e.target.value as 'DAILY' | 'MONTHLY')}
              className="w-full px-6 py-4 bg-card/60 border border-border/30 rounded-2xl text-main font-black text-xs uppercase tracking-widest outline-none focus:border-violet-500/50 appearance-none shadow-sm"
            >
              <option value="DAILY">{lang === 'ar' ? 'جرد يومي' : 'Daily count'}</option>
              <option value="MONTHLY">{lang === 'ar' ? 'جرد شهري' : 'Monthly count'}</option>
            </select>
            <select
              value={selectedCountWarehouse}
              onChange={(e) => setSelectedCountWarehouse(e.target.value)}
              className="w-full px-6 py-4 bg-card/60  border border-border/30 rounded-2xl text-main font-black text-xs uppercase tracking-widest outline-none focus:border-violet-500/50 appearance-none shadow-sm"
            >
              <option value="">{lang === 'ar' ? 'اختر المخزن...' : 'Select Warehouse...'}</option>
              {activeWarehouses.map(wh => <option key={wh.id} value={wh.id}>{displayWarehouseName(wh)}</option>)}
            </select>
            <button
              onClick={handleStartCount}
              disabled={!selectedCountWarehouse || countLoading}
              className="w-full px-10 py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-violet-600/25 hover:opacity-90 disabled:opacity-40 transition-all active:scale-95 border-b-4 border-violet-800/40"
            >
              {countLoading ? '...' : (lang === 'ar' ? 'بدء الجرد' : 'START AUDIT')}
            </button>
          </div>
          {countError && (
            <p className="max-w-xl mx-auto rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {countError}
            </p>
          )}
          {countHistory.length > 0 && (
            <div className="max-w-4xl mx-auto text-left">
              <h4 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-muted">
                {lang === 'ar' ? 'جرد هذا اليوم' : 'Counts for selected day'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {countHistory.map((count) => (
                  <div
                    key={count.id}
                    onClick={() => handleOpenCount(count.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') handleOpenCount(count.id);
                    }}
                    role="button"
                    tabIndex={0}
                    className="rounded-2xl border border-border/30 bg-card/60 p-4 text-left hover:border-violet-400/50 hover:bg-violet-500/5 transition-all"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-main">{count.warehouseName || count.warehouseId}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted">{count.id} / {count.type} / {count.status}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-[10px] font-black text-violet-700">
                          {count.summary?.varianceLines || 0} {lang === 'ar' ? 'فرق' : 'variance'}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handlePrintCount(count.id);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/30 bg-card text-violet-600 hover:bg-violet-500 hover:text-white"
                          title={lang === 'ar' ? 'طباعة جلسة الجرد' : 'Print stock count'}
                          aria-label={lang === 'ar' ? 'طباعة جلسة الجرد' : 'Print stock count'}
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void exportStockCount(count.id);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/30 bg-card text-emerald-600 hover:bg-emerald-500 hover:text-white"
                          title={lang === 'ar' ? 'تصدير الجرد إلى Excel' : 'Export stock count to Excel'}
                          aria-label={lang === 'ar' ? 'تصدير الجرد إلى Excel' : 'Export stock count to Excel'}
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-black">
                      <div className="rounded-xl bg-elevated/60 p-2">
                        <p className="text-muted">{lang === 'ar' ? 'بنود' : 'Lines'}</p>
                        <p className="text-main">{count.summary?.lines || 0}</p>
                      </div>
                      <div className="rounded-xl bg-rose-50 p-2 text-rose-700">
                        <p>{lang === 'ar' ? 'عجز' : 'Short'}</p>
                        <p>{Number(count.summary?.shortageQty || 0).toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                        <p>{lang === 'ar' ? 'زيادة' : 'Over'}</p>
                        <p>{Number(count.summary?.overQty || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-elevated/20 p-6 rounded-3xl border border-border/10">
            <div>
              <h3 className="text-xl font-black text-main tracking-tight flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-500">
                   <ClipboardCheck size={20} />
                </div>
                {activeCountWarehouseName}
                <span className="text-[10px] bg-violet-500 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">{lang === 'ar' ? 'جاري الجرد' : 'In Progress'}</span>
              </h3>
              <p className="text-[10px] text-muted font-black uppercase tracking-[0.2em] mt-2 opacity-60">
                Audit Session: {countSession.id?.slice(0, 8)} / {countSession.items?.length || 0} Assets
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 px-5 py-3.5 bg-card border border-border/30 rounded-xl text-main font-black text-[10px] uppercase tracking-widest cursor-pointer select-none" title={lang === 'ar' ? 'إخفاء كمية النظام أثناء العد' : 'Hide system qty while counting'}>
                <input type="checkbox" checked={blindCount} onChange={(e) => setBlindCount(e.target.checked)} className="w-4 h-4 accent-violet-600" />
                {lang === 'ar' ? 'جرد أعمى' : 'BLIND'}
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
                <input
                  value={countScan}
                  onChange={(e) => setCountScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const q = countScan.trim().toLowerCase();
                    if (!q) { setCountScanFilter(''); return; }
                    const match = (countSession?.items || []).find((ci: any) =>
                      String(ci.barcode || '').toLowerCase() === q
                      || String(ci.sku || '').toLowerCase() === q
                      || String(ci.itemName || '').toLowerCase().includes(q));
                    if (match) {
                      setCountScanFilter(String(match.itemId));
                      showToast(lang === 'ar' ? `تم العثور: ${match.itemName}` : `Found: ${match.itemName}`, 'success');
                    } else {
                      setCountScanFilter('');
                      showToast(lang === 'ar' ? 'لا يوجد صنف بهذا الباركود' : 'No item with this barcode', 'warning');
                    }
                  }}
                  placeholder={lang === 'ar' ? 'امسح باركود…' : 'Scan barcode…'}
                  className="h-full min-h-[52px] pl-11 pr-4 bg-card border border-border/30 rounded-xl text-sm font-bold outline-none focus:border-violet-500/50 placeholder-muted"
                />
                {countScanFilter && (
                  <button onClick={() => { setCountScan(''); setCountScanFilter(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-rose-500">
                    <X size={16} />
                  </button>
                )}
              </div>
              <button
                onClick={() => void handleZeroCountInputs()}
                disabled={countLoading}
                className="flex items-center gap-2 px-5 py-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 font-black text-[10px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all active:scale-95"
              >
                {lang === 'ar' ? 'تصفير الجرد' : 'ZERO COUNT'}
              </button>
              <button
                onClick={() => void handlePrintCount()}
                disabled={countLoading}
                className="flex items-center gap-2 px-5 py-3.5 bg-card border border-border/30 rounded-xl text-violet-600 font-black text-[10px] uppercase tracking-widest hover:bg-violet-500 hover:text-white transition-all active:scale-95"
              >
                <Printer size={15} />
                {lang === 'ar' ? 'طباعة الجرد' : 'PRINT COUNT'}
              </button>
              <button
                onClick={() => void exportStockCount()}
                disabled={countLoading}
                className="flex items-center gap-2 px-5 py-3.5 bg-card border border-border/30 rounded-xl text-emerald-600 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all active:scale-95"
              >
                <Download size={15} />
                {lang === 'ar' ? 'تصدير Excel' : 'EXPORT EXCEL'}
              </button>
              <button
                onClick={() => handleCompleteCount(false)}
                disabled={countLoading}
                className="px-6 py-3.5 bg-card border border-border/30 rounded-xl text-muted font-black text-[10px] uppercase tracking-widest hover:bg-violet-500/10 hover:text-violet-500 hover:border-violet-500/30 transition-all active:scale-95"
              >
                {lang === 'ar' ? 'حفظ كمسودة' : 'SAVE DRAFT'}
              </button>
              <button
                onClick={() => handleCompleteCount(true)}
                disabled={countLoading}
                className="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/25 hover:opacity-90 transition-all active:scale-95 border-b-4 border-emerald-800/40"
              >
                {countLoading ? '...' : (lang === 'ar' ? 'اعتماد النتائج' : 'FINALIZE & SYNC')}
              </button>
            </div>
          </div>

          <div className="responsive-table border border-border/10 rounded-3xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-elevated/30 text-muted uppercase font-black text-[10px] tracking-widest">
                <tr>
                  <th className="text-left px-8 py-5">{lang === 'ar' ? 'الصنف' : 'Item Asset'}</th>
                  <th className="text-center px-4 py-5">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                  <th className="text-center px-4 py-5">{lang === 'ar' ? 'كمية النظام' : 'System Qty'}</th>
                  <th className="text-center px-4 py-5">{lang === 'ar' ? 'الجرد الفعلي' : 'Counted'}</th>
                  <th className="text-center px-4 py-5">{lang === 'ar' ? 'الفرق' : 'Variance'}</th>
                  <th className="text-left px-8 py-5">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(countSession.items || []).filter((ci: any) => !countScanFilter || String(ci.itemId) === countScanFilter).map((ci: any) => {
                  const variance = ci.countedQty !== null ? ci.countedQty - ci.systemQty : 0;
                  return (
                    <tr key={ci.itemId} className="hover:bg-violet-500/5 transition-colors group">
                      <td className="px-8 py-4 font-bold text-main uppercase tracking-tight">{ci.itemName}</td>
                      <td className="px-4 py-4 text-center text-[10px] font-black text-muted uppercase tracking-widest">{ci.unit}</td>
                      <td className="px-4 py-4 text-center font-black text-muted/60 tabular-nums">{blindCount ? '•••' : ci.systemQty}</td>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="number"
                          value={ci.countedQty ?? ''}
                          onChange={(e) => handleUpdateCountItem(ci.itemId, 'countedQty', e.target.value === '' ? null : Number(e.target.value))}
                          className="w-24 text-center px-3 py-2 bg-card/60 border border-border/20 rounded-xl font-black text-main tabular-nums focus:border-violet-500/50 outline-none transition-all shadow-inner"
                          placeholder="-"
                        />
                      </td>
                      <td className={`px-4 py-4 text-center font-black tabular-nums transition-all ${blindCount || ci.countedQty === null ? 'text-muted/30' : variance > 0 ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]' : variance < 0 ? 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]' : 'text-main'}`}>
                        {blindCount ? '•••' : ci.countedQty !== null ? (variance > 0 ? `+${variance}` : variance) : '-'}
                      </td>
                      <td className="px-8 py-4">
                        <input
                          type="text"
                          value={ci.notes || ''}
                          onChange={(e) => handleUpdateCountItem(ci.itemId, 'notes', e.target.value)}
                          className="w-full px-4 py-2 bg-card/40 border border-border/10 rounded-xl text-[11px] font-bold text-main outline-none focus:border-violet-500/30 transition-all"
                          placeholder={lang === 'ar' ? 'ملاحظة...' : 'Audit note...'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </InvPageShell>
  );
};

export default StockCountsPage;
