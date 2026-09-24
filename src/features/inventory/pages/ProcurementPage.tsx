import React from 'react';
import { FileText, Truck } from 'lucide-react';
import { useInventoryWorkspace } from '../shared/useInventoryWorkspace';
import { InvPageShell, InvPageHeader, InvError } from '../shared/inventoryUi';
import { ProcurementHub } from '../components/Procurement';
import ReceiptModal from '../components/ReceiptModal';

const ProcurementPage: React.FC = () => {
  const {
    lang, inventoryError, clearError,
    activeInventory, activeWarehouses, suppliers,
    receiptModalOpen, setReceiptModalOpen, handleDirectReceipt,
  } = useInventoryWorkspace();

  return (
    <InvPageShell>
      <InvPageHeader
        icon={<FileText size={30} className="text-indigo-500" />}
        title={lang === 'ar' ? 'المشتريات' : 'Procurement'}
        subtitle={lang === 'ar' ? 'أوامر الشراء والاستلام المباشر' : 'Purchase orders and direct receiving'}
        accent="indigo"
        backLabel={lang === 'ar' ? 'المخزون' : 'Inventory'}
        actions={
          <button
            onClick={() => setReceiptModalOpen(true)}
            className="h-14 flex items-center justify-center gap-3 bg-card/60 text-emerald-500 px-8 rounded-2xl border border-border/30 font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all active:scale-95 shadow-lg"
          >
            <Truck size={18} /> {lang === 'ar' ? 'استلام مباشر' : 'DIRECT RECEIPT'}
          </button>
        }
      />

      {inventoryError && (
        <InvError message={inventoryError} onDismiss={clearError} dismissLabel={lang === 'ar' ? 'إغلاق' : 'Dismiss'} />
      )}

      <ProcurementHub lang={lang} />

      <ReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        onSave={handleDirectReceipt}
        lang={lang}
        inventory={activeInventory}
        warehouses={activeWarehouses}
        suppliers={suppliers}
      />
    </InvPageShell>
  );
};

export default ProcurementPage;
