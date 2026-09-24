import React, { useState } from 'react';
import { ArrowRightLeft, Home, Package, Plus, X } from 'lucide-react';
import { useInventoryWorkspace } from '../shared/useInventoryWorkspace';
import { InvPageShell, InvPageHeader, InvError } from '../shared/inventoryUi';
import WarehouseModal from '../components/WarehouseModal';

const WarehousesPage: React.FC = () => {
  const {
    lang, settings, branches, inventoryError, clearError,
    warehouses, branchById, warehouseById, activeInventory, activeWarehouses,
    warehouseSkuCounts, displayWarehouseName, displayItemName,
    selectedWarehouse, setSelectedWarehouse, selectedWarehouseRows, selectedWarehouseStats,
    handleSaveWarehouse, warehouseModalOpen, setWarehouseModalOpen,
    branchTransferItemId, setBranchTransferItemId, branchTransferFromWh, setBranchTransferFromWh,
    branchTransferToWh, setBranchTransferToWh, branchTransferQty, setBranchTransferQty,
    branchTransferReason, setBranchTransferReason, destinationWarehouses,
    handleCreateBranchTransfer, transferMovements,
  } = useInventoryWorkspace();

  const [subTab, setSubTab] = useState<'WAREHOUSES' | 'TRANSFERS'>('WAREHOUSES');

  return (
    <InvPageShell>
      <InvPageHeader
        icon={<Home size={30} className="text-emerald-500" />}
        title={lang === 'ar' ? 'المخازن والتحويلات' : 'Warehouses & Transfers'}
        subtitle={lang === 'ar' ? 'عقد المخازن وتحركات الفروع' : 'Warehouse nodes and branch logistics'}
        accent="emerald"
        backLabel={lang === 'ar' ? 'المخزون' : 'Inventory'}
        actions={
          <button
            onClick={() => setWarehouseModalOpen(true)}
            className="h-14 flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-8 rounded-2xl shadow-2xl shadow-emerald-600/30 font-black text-[11px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={18} /> {lang === 'ar' ? 'إضافة مخزن' : 'ADD WAREHOUSE'}
          </button>
        }
      />

      {inventoryError && (
        <InvError message={inventoryError} onDismiss={clearError} dismissLabel={lang === 'ar' ? 'إغلاق' : 'Dismiss'} />
      )}

      <div className="flex bg-card/40 rounded-[2rem] border border-border/30 p-2 overflow-x-auto no-scrollbar w-fit">
        {[
          { id: 'WAREHOUSES' as const, label: lang === 'ar' ? 'المخازن' : 'Warehouses', icon: Home },
          { id: 'TRANSFERS' as const, label: lang === 'ar' ? 'تحويلات الفروع' : 'Branch Transfers', icon: ArrowRightLeft },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-150 flex items-center gap-3 whitespace-nowrap ${subTab === tab.id ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-600/20 scale-105' : 'text-muted hover:text-main hover:bg-elevated/60'}`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'WAREHOUSES' ? (
      <div className="grid-auto-fit gap-8 relative z-10 w-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <button
        onClick={() => setWarehouseModalOpen(true)}
        className="bg-card/40 border-2 border-dashed border-border/30 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-[2.5rem] flex flex-col items-center justify-center transition-all duration-150 group min-h-[200px]"
      >
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4 transition-transform duration-150 ease-out group-hover:scale-110 group-hover:-translate-y-1 shadow-inner">
          <Plus size={32} />
        </div>
        <span className="text-[11px] font-black text-muted group-hover:text-emerald-500 uppercase tracking-[0.2em] transition-colors">{lang === 'ar' ? 'إضافة مخزن' : 'Add Warehouse'}</span>
      </button>

      {warehouses.map(wh => {
        const branch = branchById.get(wh.branchId);
        const parent = wh.parentId ? warehouseById.get(wh.parentId) : undefined;
        return (
          <div key={wh.id} className="bg-card/60 border border-border/20 p-8 rounded-[2.5rem] flex flex-col justify-between group cursor-pointer hover:border-emerald-500/30 shadow-[0_10px_30px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_40px_rgba(16,185,129,0.15)] transition-all duration-150 ease-out hover:-translate-y-2 relative overflow-hidden" onClick={() => setSelectedWarehouse(wh)}>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

            <div className="flex justify-between items-start mb-8 relative z-10">
              <div className="w-16 h-16 rounded-[1.5rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-inner group-hover:scale-110 group-hover:rotate-6 transition-transform duration-150 ease-out">
                <Home size={28} />
              </div>
              <div className="text-right flex flex-col items-end">
                <div className={`w-3 h-3 rounded-full mb-2 border-2 border-card ${wh.isActive ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-slate-500 shadow-inner'}`} />
                <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded border ${wh.isActive ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10' : 'text-slate-400 border-slate-500/20 bg-slate-500/10'}`}>
                  {wh.isActive ? (lang === 'ar' ? 'متصل' : 'Online') : (lang === 'ar' ? 'غير متصل' : 'Offline')}
                </span>
              </div>
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <h4 className="font-black text-2xl text-main uppercase tracking-tight group-hover:text-emerald-500 transition-colors drop-shadow-sm">{wh.name}</h4>
                {wh.parentId && <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black text-indigo-500 uppercase tracking-widest rounded shadow-sm">Sub</span>}
              </div>
              <p className="text-[13px] text-muted font-bold mb-8 flex items-center gap-2">
                <Package size={14} className="opacity-50" />
                {branch?.name || 'Central'} <span className="opacity-50">/</span> {wh.type}
              </p>

              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-muted border-t border-border/30 pt-5">
                <div className="flex items-center gap-2 bg-elevated/40 px-3 py-1.5 rounded-lg border border-border/20 shadow-sm">
                  <Package size={14} className="text-emerald-500" />
                  <span className="text-main">{warehouseSkuCounts.get(wh.id) || 0} SKUs</span>
                </div>
                {parent && (
                  <div className="flex items-center gap-2 text-indigo-400">
                    <ArrowRightLeft size={14} />
                    <span className="truncate max-w-[100px]">{parent.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {selectedWarehouse && (
        <div className="col-span-full bg-card/80 border border-emerald-500/20 rounded-[2.5rem] p-6 md:p-8 shadow-xl relative">
          <button onClick={() => setSelectedWarehouse(null)} className="absolute top-5 right-5 p-2 rounded-xl text-muted hover:text-main hover:bg-elevated" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}><X size={18} /></button>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6 pr-10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">{lang === 'ar' ? 'نظرة عامة على المخزن' : 'Warehouse overview'}</p>
              <h3 className="mt-1 text-2xl font-black text-main">{displayWarehouseName(warehouseById.get(selectedWarehouse.id) || selectedWarehouse)}</h3>
              <p className="mt-1 text-xs font-bold text-muted">{branchById.get(selectedWarehouse.branchId)?.name || 'Central'} / {selectedWarehouse.type}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                [lang === 'ar' ? 'الأصناف' : 'Items', selectedWarehouseStats.items],
                [lang === 'ar' ? 'الكمية' : 'Quantity', selectedWarehouseStats.quantity],
                [lang === 'ar' ? 'منخفض' : 'Low', selectedWarehouseStats.low],
                [lang === 'ar' ? 'القيمة' : 'Value', `${settings.currencySymbol || 'ج.م'} ${selectedWarehouseStats.value.toLocaleString()}`],
              ].map(([label, value]) => <div key={String(label)} className="min-w-[82px] rounded-xl bg-elevated/40 border border-border/20 px-3 py-2"><p className="text-[9px] font-black text-muted">{label}</p><p className="mt-1 text-sm font-black text-main">{value}</p></div>)}
            </div>
          </div>
          <div className="responsive-table rounded-2xl border border-border/20 overflow-auto max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-elevated text-[10px] font-black uppercase tracking-widest text-muted"><tr><th className="px-4 py-3 text-start">{lang === 'ar' ? 'الصنف' : 'Item'}</th><th className="px-4 py-3 text-start">{lang === 'ar' ? 'الكود' : 'SKU'}</th><th className="px-4 py-3 text-end">{lang === 'ar' ? 'الكمية' : 'Quantity'}</th><th className="px-4 py-3 text-end">{lang === 'ar' ? 'القيمة' : 'Value'}</th><th className="px-4 py-3 text-end">{lang === 'ar' ? 'الحالة' : 'Status'}</th></tr></thead>
              <tbody className="divide-y divide-border/20">{selectedWarehouseRows.map(({ item, quantity }) => <tr key={item.id}><td className="px-4 py-3 font-black text-main">{displayItemName(item)}</td><td className="px-4 py-3 font-mono text-xs text-muted">{item.sku || '-'}</td><td className="px-4 py-3 text-end font-black">{quantity} {item.unit}</td><td className="px-4 py-3 text-end font-black text-emerald-500">{(quantity * (item.costPrice || 0)).toLocaleString()}</td><td className={`px-4 py-3 text-end text-[10px] font-black ${quantity <= item.threshold ? 'text-rose-500' : 'text-emerald-500'}`}>{quantity <= item.threshold ? (lang === 'ar' ? 'منخفض' : 'LOW') : (lang === 'ar' ? 'جيد' : 'OK')}</td></tr>)}</tbody>
            </table>
            {selectedWarehouseRows.length === 0 && <p className="p-8 text-center text-sm font-bold text-muted">{lang === 'ar' ? 'لا توجد أصناف مرتبطة بهذا المخزن.' : 'No items are assigned to this warehouse.'}</p>}
          </div>
        </div>
      )}
      </div>
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 relative z-10 w-full">
        <div className="xl:col-span-1 bg-card/40 rounded-[2rem] border border-border/20 p-6 space-y-4 shadow-lg group relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-6 flex items-center gap-2 relative z-10">
             <ArrowRightLeft size={16} /> {lang === 'ar' ? 'تحويل بين الفروع' : 'Inter-Branch Transfer'}
          </h4>
          <div className="space-y-3 relative z-10">
            <select className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm shadow-inner appearance-none cursor-pointer" value={branchTransferItemId} onChange={(e) => setBranchTransferItemId(e.target.value)}>
              <option value="" className="bg-card">{lang === 'ar' ? 'اختر صنف' : 'Select Item'}</option>
              {activeInventory.map(i => <option key={i.id} value={i.id} className="bg-card">{displayItemName(i)}</option>)}
            </select>
            <select className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm shadow-inner appearance-none cursor-pointer" value={branchTransferFromWh} onChange={(e) => setBranchTransferFromWh(e.target.value)}>
              <option value="" className="bg-card">{lang === 'ar' ? 'من مخزن' : 'From Warehouse'}</option>
              {activeWarehouses.map(w => <option key={w.id} value={w.id} className="bg-card">{displayWarehouseName(w)}</option>)}
            </select>
            <select className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm shadow-inner appearance-none cursor-pointer" value={branchTransferToWh} onChange={(e) => setBranchTransferToWh(e.target.value)}>
              <option value="" className="bg-card">{lang === 'ar' ? 'إلى مخزن في فرع آخر' : 'To Warehouse (different branch)'}</option>
              {destinationWarehouses.map(w => <option key={w.id} value={w.id} className="bg-card">{displayWarehouseName(w)}</option>)}
            </select>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-[10px] font-black uppercase">{lang === 'ar' ? 'كمية' : 'Qty'}</span>
              <input type="number" className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm shadow-inner" value={branchTransferQty} onChange={(e) => setBranchTransferQty(Number(e.target.value || 0))} />
            </div>
            <input className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm placeholder:text-muted/50 shadow-inner" placeholder={lang === 'ar' ? 'سبب التحويل...' : 'Reason for Transfer...'} value={branchTransferReason} onChange={(e) => setBranchTransferReason(e.target.value)} />
          </div>
          <div className="pt-4 border-t border-border/20 relative z-10">
            <button onClick={handleCreateBranchTransfer} className="w-full px-4 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_10px_20px_rgba(6,182,212,0.2)] hover:shadow-[0_15px_30px_rgba(6,182,212,0.3)] hover:-translate-y-0.5 transition-all active:scale-95 border border-cyan-400/30">{lang === 'ar' ? 'تنفيذ التحويل' : 'Execute Transfer'}</button>
          </div>
        </div>
        <div className="xl:col-span-2 bg-card/40 rounded-[2rem] border border-border/20 overflow-hidden shadow-lg flex flex-col relative z-10">
          <div className="responsive-table flex-1">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead className="bg-elevated/30 text-[10px] uppercase font-black tracking-widest text-muted border-b border-border/20">
                <tr>
                  <th className="px-6 py-5 whitespace-nowrap">{lang === 'ar' ? 'الوقت' : 'Timestamp'}</th>
                  <th className="px-6 py-5 whitespace-nowrap">{lang === 'ar' ? 'الصنف' : 'Asset'}</th>
                  <th className="px-6 py-5 whitespace-nowrap">{lang === 'ar' ? 'المصدر' : 'Source'}</th>
                  <th className="px-6 py-5 whitespace-nowrap">{lang === 'ar' ? 'الوجهة' : 'Destination'}</th>
                  <th className="px-6 py-5 whitespace-nowrap">{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                  <th className="px-6 py-5 whitespace-nowrap">{lang === 'ar' ? 'ملاحظة الحركة' : 'Manifest Note'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transferMovements.map((mv: any) => (
                  <tr key={mv.id} className="hover:bg-cyan-500/5 transition-colors group">
                    <td className="px-6 py-5 text-[11px] font-bold text-muted">{new Date(mv.createdAt).toLocaleDateString()} {new Date(mv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-6 py-5">
                      <div className="font-bold text-[13px] text-main">{mv.itemName}</div>
                    </td>
                    <td className="px-6 py-5 text-[12px] font-bold text-muted">{mv.fromWarehouseName}</td>
                    <td className="px-6 py-5 text-[12px] font-bold text-muted">{mv.toWarehouseName}</td>
                    <td className="px-6 py-5">
                      <span className="text-[12px] font-black text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">{Number(mv.quantity || 0)}</span>
                    </td>
                    <td className="px-6 py-5 text-[11px] font-bold text-muted truncate max-w-[150px]">{mv.reason || '-'}</td>
                  </tr>
                ))}
                {transferMovements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted font-black uppercase tracking-[0.2em] text-[11px]">
                      No logistics movements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      <WarehouseModal
        isOpen={warehouseModalOpen}
        onClose={() => setWarehouseModalOpen(false)}
        onSave={handleSaveWarehouse}
        lang={lang}
        branches={branches}
        warehouses={warehouses}
      />
    </InvPageShell>
  );
};

export default WarehousesPage;
