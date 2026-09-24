import React from 'react';
import { Search, Truck, Undo2 } from 'lucide-react';
import { useInventoryWorkspace } from '../shared/useInventoryWorkspace';
import { InvPageShell, InvPageHeader, InvError } from '../shared/inventoryUi';
import SupplierReturnModal from '../components/SupplierReturnModal';

const SuppliersPage: React.FC = () => {
  const {
    lang, inventoryError, clearError,
    searchQuery, setSearchQuery, filteredSuppliers,
    supplierForm, setSupplierForm, handleUpsertSupplier, handleDeactivateSupplier,
    activeInventory, activeWarehouses, suppliers,
    returnModalOpen, setReturnModalOpen, handleSupplierReturn,
  } = useInventoryWorkspace();

  return (
    <InvPageShell>
      <InvPageHeader
        icon={<Truck size={30} className="text-indigo-500" />}
        title={lang === 'ar' ? 'الموردين' : 'Suppliers'}
        subtitle={lang === 'ar' ? 'سجل الموردين وبيانات التواصل والمرتجعات' : 'Supplier directory, contacts and returns'}
        accent="indigo"
        backLabel={lang === 'ar' ? 'المخزون' : 'Inventory'}
        actions={
          <button
            onClick={() => setReturnModalOpen(true)}
            className="h-14 flex items-center justify-center gap-3 bg-card/60 text-amber-600 px-8 rounded-2xl border border-border/30 font-black text-[11px] uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all active:scale-95 shadow-lg"
          >
            <Undo2 size={18} /> {lang === 'ar' ? 'مرتجع مورد' : 'SUPPLIER RETURN'}
          </button>
        }
      />

      {inventoryError && (
        <InvError message={inventoryError} onDismiss={clearError} dismissLabel={lang === 'ar' ? 'إغلاق' : 'Dismiss'} />
      )}

      <div className="relative w-full lg:w-96 group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-muted w-5 h-5 group-focus-within:text-indigo-500 transition-colors z-10" />
        <input
          type="text"
          placeholder={lang === 'ar' ? 'ابحث باسم المورد أو الهاتف...' : 'Search suppliers...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-14 pr-6 py-5 bg-card/60 border border-border/30 rounded-[2rem] outline-none focus:border-indigo-500/50 transition-all font-bold text-sm text-main placeholder:text-muted/40 shadow-xl"
        />
      </div>

      <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-6 relative z-10 w-full">
      <div className="xl:col-span-1 bg-card/40 rounded-[2rem] border border-border/20 p-6 space-y-4 shadow-lg group relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-6 flex items-center gap-2 relative z-10">
          <Truck size={16} /> {supplierForm.id ? (lang === 'ar' ? 'تعديل مورد' : 'Edit Supplier') : (lang === 'ar' ? 'إضافة مورد' : 'Add Supplier')}
        </h4>
        <div className="space-y-3 relative z-10">
          <input className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all text-main font-bold text-sm placeholder:text-muted/50 shadow-inner" placeholder={lang === 'ar' ? 'اسم المورد (إنجليزي)' : 'Supplier Name (EN)'} value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} />
          <input dir="rtl" className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all text-main font-bold text-sm placeholder:text-muted/50 shadow-inner" placeholder={lang === 'ar' ? 'اسم المورد (عربي)' : 'Supplier Name (AR)'} value={supplierForm.nameAr} onChange={(e) => setSupplierForm({ ...supplierForm, nameAr: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all text-main font-bold text-sm placeholder:text-muted/50 shadow-inner" placeholder={lang === 'ar' ? 'جهة اتصال' : 'Contact Person'} value={supplierForm.contactPerson} onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} />
            <input className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all text-main font-bold text-sm placeholder:text-muted/50 shadow-inner" placeholder={lang === 'ar' ? 'التصنيف' : 'Category'} value={supplierForm.category} onChange={(e) => setSupplierForm({ ...supplierForm, category: e.target.value })} />
          </div>
          <input className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all text-main font-bold text-sm placeholder:text-muted/50 shadow-inner" placeholder={lang === 'ar' ? 'رقم الهاتف' : 'Phone'} value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
          <input className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40 border border-border/30 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all text-main font-bold text-sm placeholder:text-muted/50 shadow-inner" placeholder={lang === 'ar' ? 'البريد الإلكتروني' : 'Email'} value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
        </div>
        <div className="flex gap-3 pt-4 border-t border-border/20 relative z-10">
          <button onClick={() => { setSupplierForm({ id: '', name: '', nameAr: '', contactPerson: '', phone: '', email: '', category: '' }); }} className="flex-1 px-4 py-3.5 rounded-2xl bg-elevated/30 hover:bg-elevated/60 text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-border/20 active:scale-95 text-muted hover:text-main">{lang === 'ar' ? 'مسح' : 'Clear'}</button>
          <button onClick={handleUpsertSupplier} className="flex-[2] px-4 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_10px_20px_rgba(99,102,241,0.2)] hover:shadow-[0_15px_30px_rgba(99,102,241,0.3)] hover:-translate-y-0.5 transition-all active:scale-95 border border-indigo-400/30">{supplierForm.id ? (lang === 'ar' ? 'تحديث' : 'Update') : (lang === 'ar' ? 'تسجيل' : 'Register')}</button>
        </div>
      </div>
      <div className="xl:col-span-2 bg-card/40 rounded-[2rem] border border-border/20 shadow-lg relative z-10">
        <div className="responsive-table rounded-[2rem] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-elevated/30 text-[10px] uppercase font-black tracking-widest text-muted border-b border-border/20">
              <tr>
                <th className="px-6 py-5 whitespace-nowrap">{lang === 'ar' ? 'المورد' : 'Supplier Profile'}</th>
                <th className="px-6 py-5 whitespace-nowrap">{lang === 'ar' ? 'معلومات الاتصال' : 'Contact Info'}</th>
                <th className="px-6 py-5 whitespace-nowrap">{lang === 'ar' ? 'التصنيف' : 'Category'}</th>
                <th className="px-6 py-5 whitespace-nowrap text-right">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredSuppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-indigo-500/5 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-black text-lg border border-indigo-500/20 shadow-inner group-hover:scale-110 group-hover:rotate-6 transition-transform duration-150">
                          {(lang === 'ar' ? s.nameAr || s.name : s.name).charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-main text-[13px] group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{lang === 'ar' ? s.nameAr || s.name : s.name}</div>
                          {s.nameAr && lang === 'en' && <div className="text-[10px] text-muted/60 font-bold">{s.nameAr}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-[12px] font-bold text-main flex items-center gap-2 mb-1">
                        {s.contactPerson || <span className="text-muted italic text-[10px]">{lang === 'ar' ? 'لا يوجد' : 'No Contact'}</span>}
                      </div>
                      <div className="text-[11px] font-bold text-muted flex items-center gap-2">
                        {s.phone || '-'} <span className="opacity-30">|</span> {s.email || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {s.category ? (
                        <span className="px-2.5 py-1 bg-elevated/50 border border-border/20 rounded-lg text-[10px] font-black uppercase tracking-widest text-muted">{s.category}</span>
                      ) : (
                        <span className="text-muted/50 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setSupplierForm(s); }} className="px-3 py-1.5 rounded-lg bg-card/50 border border-border/30 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 text-[10px] font-black uppercase tracking-widest text-muted transition-all active:scale-95">{lang === 'ar' ? 'تعديل' : 'Edit'}</button>
                        <button onClick={() => handleDeactivateSupplier(s)} className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95">{lang === 'ar' ? 'تعطيل' : 'Suspend'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              {filteredSuppliers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted font-black uppercase tracking-[0.2em] text-[11px]">
                    {lang === 'ar' ? 'لا يوجد موردون مطابقون للبحث' : 'No suppliers matched your query.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <SupplierReturnModal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        onSave={handleSupplierReturn}
        lang={lang}
        inventory={activeInventory}
        warehouses={activeWarehouses}
        suppliers={suppliers}
      />
    </InvPageShell>
  );
};

export default SuppliersPage;
