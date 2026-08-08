import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  AlertTriangle, Plus, Search, X, Truck, FileText, Package,
  Tag, Briefcase,
  ArrowRightLeft, ListChecks, Download, Upload, Calculator, Home, Layers, LayoutGrid,
  ClipboardCheck, Activity, Play, CheckCircle2, Save, Calendar, Utensils, Printer
} from 'lucide-react';
import { Supplier, PurchaseOrder, Warehouse, Branch, WarehouseType, InventoryItem } from '@/types';

// Stores
import { useInventoryStore } from '@/stores/useInventoryStore';
import { useAuthStore } from '@/stores/useAuthStore';

// Services
import { translations } from '@/services/translations';
import { inventoryIntelligenceApi } from '@/services/api/inventoryIntelligence';
import { reportsApi } from '@/services/api/reports';
import { inventoryApi } from '@/services/api/inventory';
import { socketService } from '@/services/socketService';
import { prepareInventoryExcelRows } from '@/services/inventoryExcelRows';
import { printStockCountSession } from '@/services/stockCountPrint';
import { formatLocalDate } from '@/utils/formatters';

// Modals
import ItemModal from './components/ItemModal';
import WarehouseModal from './components/WarehouseModal';
import StockAdjustmentModal from './components/StockAdjustmentModal';
import StockTransferModal from './components/StockTransferModal';
import ReceiptModal from './components/ReceiptModal';

// Shared Components
import VirtualList from '@/components/common/VirtualList';
import PageSkeleton from '@/components/common/PageSkeleton';
import Skeleton from '@/components/common/Skeleton';
import { ProcurementHub } from './components/Procurement';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { useToast } from '@/components/Toast';

// --- Subcomponents for Premium UI ---

const StockMetric: React.FC<{
  label: string;
  value: any;
  subValue?: string;
  icon: any;
  color: string;
  trend?: { val: number; up: boolean };
  lang: string;
}> = ({ label, value, subValue, icon: Icon, color, trend, lang }) => (
  <div className="relative group overflow-hidden bg-card/60  border border-border/30 rounded-[1.5rem] p-5 lg:p-6 transition-all hover:scale-[1.02] hover:bg-card/70 hover:shadow-2xl hover:shadow-black/5 active:scale-[0.98]">
    <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br transition-opacity duration-150 opacity-20 group-hover:opacity-30 blur-3xl`} style={{ background: color }} />
    <div className="flex items-start justify-between relative z-10">
      <div>
        <p className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.15em] text-muted mb-2">{label}</p>
        <h2 className="text-xl lg:text-3xl font-black text-main tracking-tighter tabular-nums flex items-end gap-1.5">
          {value}
          {subValue && <span className="text-xs font-bold text-muted mb-1 opacity-60">{subValue}</span>}
        </h2>
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-[10px] font-black uppercase tracking-wider ${trend.up ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trend.up ? <Activity size={14} /> : <Activity size={14} className="rotate-180" />}
            {trend.val}% <span className="text-muted ml-1 opacity-70">{lang === 'ar' ? 'عن السابق' : 'vs prev'}</span>
          </div>
        )}
      </div>
      <div className={`p-4 rounded-2xl border flex items-center justify-center shadow-lg transition-transform duration-150 group-hover:rotate-12`} style={{ borderColor: `${color}30`, backgroundColor: `${color}15`, color }}>
        <Icon size={24} />
      </div>
    </div>
  </div>
);

const dateOnly = (date = new Date()) => date.toISOString().split('T')[0];

const Inventory: React.FC = () => {
  // Global State
  const {
    inventory, suppliers, purchaseOrders, warehouses, transferMovements,
    isLoading: inventoryLoading, error: inventoryError,
    fetchInventory, fetchWarehouses, fetchSuppliers, fetchPurchaseOrders, fetchTransferMovements,
    addInventoryItem, updateInventoryItem,
    addWarehouse, updateStock,
    patchStockFromSocket,
    createSupplierInDB, updateSupplierInDB, deactivateSupplierInDB,
    createPurchaseOrderInDB, updatePurchaseOrderStatusInDB, receivePurchaseOrderInDB,
    createBranchTransferInDB, clearError
  } = useInventoryStore(
    useShallow((state) => ({
      inventory: state.inventory,
      suppliers: state.suppliers,
      purchaseOrders: state.purchaseOrders,
      warehouses: state.warehouses,
      transferMovements: state.transferMovements,
      isLoading: state.isLoading,
      error: state.error,
      fetchInventory: state.fetchInventory,
      fetchWarehouses: state.fetchWarehouses,
      fetchSuppliers: state.fetchSuppliers,
      fetchPurchaseOrders: state.fetchPurchaseOrders,
      fetchTransferMovements: state.fetchTransferMovements,
      addInventoryItem: state.addInventoryItem,
      updateInventoryItem: state.updateInventoryItem,
      addWarehouse: state.addWarehouse,
      updateStock: state.updateStock,
      patchStockFromSocket: state.patchStockFromSocket,
      createSupplierInDB: state.createSupplierInDB,
      updateSupplierInDB: state.updateSupplierInDB,
      deactivateSupplierInDB: state.deactivateSupplierInDB,
      createPurchaseOrderInDB: state.createPurchaseOrderInDB,
      updatePurchaseOrderStatusInDB: state.updatePurchaseOrderStatusInDB,
      receivePurchaseOrderInDB: state.receivePurchaseOrderInDB,
      createBranchTransferInDB: state.createBranchTransferInDB,
      clearError: state.clearError,
    }))
  );

  const { branches, settings } = useAuthStore(
    useShallow((state) => ({
      branches: state.branches,
      settings: state.settings,
    }))
  );
  const lang = settings.language;
  const t = translations[lang];
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const displayItemName = (item?: InventoryItem | null) => (lang === 'ar' ? item?.nameAr || item?.name : item?.name) || '';
  const displayWarehouseName = (warehouse?: Warehouse | null) => (lang === 'ar' ? warehouse?.nameAr || warehouse?.name : warehouse?.name) || '';

  // UI State
  const [activeTab, setActiveTab] = useState<'STOCK' | 'SUPPLIERS' | 'PROCUREMENT' | 'WAREHOUSES' | 'BRANCHES' | 'STOCKCOUNT' | 'MOVEMENTS' | 'CONSUMPTION'>('STOCK');
  const activeTabTitle = ({
    STOCK: lang === 'ar' ? 'مركز المخزون' : 'Stock Center',
    SUPPLIERS: lang === 'ar' ? 'الموردين' : 'Suppliers',
    PROCUREMENT: lang === 'ar' ? 'المشتريات' : 'Procurement',
    WAREHOUSES: lang === 'ar' ? 'المخازن' : 'Warehouses',
    BRANCHES: lang === 'ar' ? 'تحويلات الفروع' : 'Branch Transfers',
    STOCKCOUNT: lang === 'ar' ? 'الجرد' : 'Stock Counts',
    MOVEMENTS: lang === 'ar' ? 'الحركات' : 'Movements',
    CONSUMPTION: lang === 'ar' ? 'مسحوبات الوصفات' : 'Recipe Consumption',
  } as const)[activeTab];
  const [searchQuery, setSearchQuery] = useState('');
  const [stockSort, setStockSort] = useState<'name' | 'qty-asc' | 'qty-desc' | 'cost' | 'low-first'>('name');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  // Modal Visibility State
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [supplierForm, setSupplierForm] = useState<Supplier>({
    id: '',
    name: '',
    nameAr: '',
    contactPerson: '',
    phone: '',
    email: '',
    category: '',
  });
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poItemId, setPoItemId] = useState('');
  const [poQty, setPoQty] = useState(1);
  const [poPrice, setPoPrice] = useState(0);
  const [poWarehouseId, setPoWarehouseId] = useState('');
  const [branchTransferItemId, setBranchTransferItemId] = useState('');
  const [branchTransferFromWh, setBranchTransferFromWh] = useState('');
  const [branchTransferToWh, setBranchTransferToWh] = useState('');
  const [branchTransferQty, setBranchTransferQty] = useState(1);
  const [branchTransferReason, setBranchTransferReason] = useState('Inter-branch transfer');
  const [isImportingInventory, setIsImportingInventory] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const handleDeactivateSupplier = async (supplier: Supplier) => {
    const ok = await confirm({
      title: lang === 'ar' ? 'تعطيل المورد؟' : 'Suspend supplier?',
      message: lang === 'ar'
        ? `سيتم تعطيل ${supplier.nameAr || supplier.name}.`
        : `${supplier.name} will be suspended.`,
      confirmText: lang === 'ar' ? 'تعطيل' : 'Suspend',
      cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    await deactivateSupplierInDB(supplier.id);
  };

  useEffect(() => {
    fetchInventory();
    fetchWarehouses();
    fetchSuppliers();
    fetchPurchaseOrders();
    fetchTransferMovements();

    const handleStockUpdate = (data: any) => {
        if (data.itemId && data.warehouseId && data.quantity !== undefined) {
            patchStockFromSocket(data.itemId, data.warehouseId, data.quantity);
        } else {
            fetchInventory();
        }
    };

    socketService.on('stock:updated', handleStockUpdate);

    // Reconnect catch-up: refetch all inventory data on socket reconnection
    const handleReconnect = () => {
      fetchInventory();
      fetchWarehouses();
      fetchPurchaseOrders();
    };
    socketService.onReconnect(handleReconnect);

    return () => {
        socketService.off('stock:updated', handleStockUpdate);
        socketService.offReconnect(handleReconnect);
    };
  }, []);

  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches]
  );

  const warehouseById = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses]
  );

  const supplierById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers]
  );

  const inventoryTotalsById = useMemo(() => {
    const totals = new Map<string, number>();
    inventory.forEach((item) => {
      totals.set(
        item.id,
        item.warehouseQuantities.reduce((sum, quantity) => sum + quantity.quantity, 0)
      );
    });
    return totals;
  }, [inventory]);

  const inventoryById = useMemo(
    () => new Map(inventory.map((item) => [item.id, item])),
    [inventory]
  );

  const warehouseSkuCounts = useMemo(() => {
    const counts = new Map<string, number>();
    inventory.forEach((item) => {
      item.warehouseQuantities.forEach((quantity) => {
        counts.set(quantity.warehouseId, (counts.get(quantity.warehouseId) || 0) + 1);
      });
    });
    return counts;
  }, [inventory]);

  const inventoryValuation = useMemo(
    () => inventory.reduce((sum, item) => sum + (item.costPrice * (inventoryTotalsById.get(item.id) || 0)), 0),
    [inventory, inventoryTotalsById]
  );

  const outOfStockCount = useMemo(
    () => inventory.filter((item) => (inventoryTotalsById.get(item.id) || 0) === 0).length,
    [inventory, inventoryTotalsById]
  );

  const filteredInventory = useMemo(() => {
    const filtered = inventory.filter((item) => {
      if (!normalizedSearchQuery) return true;
      return (
        (item.name || '').toLowerCase().includes(normalizedSearchQuery) ||
        (item.nameAr || '').toLowerCase().includes(normalizedSearchQuery) ||
        (item.sku || '').toLowerCase().includes(normalizedSearchQuery) ||
        (item.category || '').toLowerCase().includes(normalizedSearchQuery)
      );
    });

    filtered.sort((a, b) => {
      const totalA = inventoryTotalsById.get(a.id) || 0;
      const totalB = inventoryTotalsById.get(b.id) || 0;
      switch (stockSort) {
        case 'qty-asc': return totalA - totalB;
        case 'qty-desc': return totalB - totalA;
        case 'cost': return b.costPrice - a.costPrice;
        case 'low-first':
          return (totalA <= a.threshold ? 0 : 1) - (totalB <= b.threshold ? 0 : 1) || totalA - totalB;
        default:
          return (a.name || '').localeCompare(b.name || '');
      }
    });

    return filtered;
  }, [inventory, normalizedSearchQuery, stockSort, inventoryTotalsById]);

  const filteredSuppliers = useMemo(
    () => suppliers.filter((supplier) =>
      `${supplier.name}${supplier.contactPerson}${supplier.phone}${supplier.email}`
        .toLowerCase()
        .includes(normalizedSearchQuery)
    ),
    [suppliers, normalizedSearchQuery]
  );

  const filteredPurchaseOrders = useMemo(
    () => purchaseOrders.filter((purchaseOrder) => purchaseOrder.id.toLowerCase().includes(normalizedSearchQuery)),
    [purchaseOrders, normalizedSearchQuery]
  );

  const selectedItem = useMemo(
    () => inventory.find((item) => item.id === poItemId) || null,
    [inventory, poItemId]
  );

  const selectedSourceWarehouse = useMemo(
    () => warehouseById.get(branchTransferFromWh) || null,
    [warehouseById, branchTransferFromWh]
  );

  const destinationWarehouses = useMemo(() => {
    const currentSourceBranchId = selectedSourceWarehouse?.branchId;
    return warehouses.filter((warehouse) => (
      warehouse.id !== branchTransferFromWh &&
      (!currentSourceBranchId || warehouse.branchId !== currentSourceBranchId)
    ));
  }, [warehouses, branchTransferFromWh, selectedSourceWarehouse]);


  const handleSaveItem = async (item: InventoryItem) => {
    if (editingItem) {
      await updateInventoryItem(item.id, {
        ...item,
        warehouseQuantities: item.warehouseQuantities,
      });
      for (const row of item.warehouseQuantities || []) {
        const previousQuantity = editingItem.warehouseQuantities.find(value => value.warehouseId === row.warehouseId)?.quantity || 0;
        const nextQuantity = Number(row.quantity) || 0;
        if (nextQuantity !== previousQuantity) {
          await updateStock(item.id, row.warehouseId, nextQuantity, 'ADJUSTMENT', 'Stock corrected from inventory item edit');
        }
      }
    } else {
      try {
        await addInventoryItem(item);
      } catch {
        showToast(
          lang === 'ar'
            ? 'تعذر إنشاء الصنف؛ لم يتم تسجيل أي رصيد افتتاحي.'
            : 'Item creation failed; no opening stock was recorded.',
          'error',
        );
        return;
      }
      for (const row of item.warehouseQuantities || []) {
        if (Number(row.quantity) > 0) {
          await updateStock(item.id, row.warehouseId, Number(row.quantity), 'ADJUSTMENT', 'Opening stock');
        }
      }
    }
    setItemModalOpen(false);
    setEditingItem(null);
  };

  const exportInventoryTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = inventory.flatMap(item => {
        const quantities = item.warehouseQuantities.length
          ? item.warehouseQuantities
          : [{ warehouseId: '', quantity: 0 }];
        return quantities.map(stock => ({
          code: item.sku || item.id,
          name_en: item.name,
          name_ar: item.nameAr || '',
          unit: item.unit,
          category: item.category || '',
          barcode: item.barcode || '',
          purchase_price: item.purchasePrice || 0,
          cost_price: item.costPrice || 0,
          alert_threshold: item.threshold || 0,
          warehouse_id: stock.warehouseId,
          warehouse_name: displayWarehouseName(warehouseById.get(stock.warehouseId)),
          opening_quantity: Number(stock.quantity || 0),
        }));
      });
      const guide = [
        { column: 'code', required: 'Yes', description: 'Unique item code / كود الصنف الفريد' },
        { column: 'name_en', required: 'Yes', description: 'English name / الاسم بالإنجليزية' },
        { column: 'name_ar', required: 'Yes', description: 'Arabic name / الاسم بالعربية' },
        { column: 'warehouse_id', required: 'For opening stock', description: 'Use an ID supplied in the Inventory sheet' },
        { column: 'opening_quantity', required: 'No', description: 'Opening quantity, zero or greater / رصيد أول المدة' },
      ];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Inventory');
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(guide), 'Guide');
      XLSX.writeFile(book, 'restoflow-inventory-template.xlsx');
      showToast(lang === 'ar' ? 'تم تنزيل قالب المخزون.' : 'Inventory template downloaded.', 'success');
    } catch (error: any) {
      showToast(error?.message || (lang === 'ar' ? 'تعذر تصدير القالب.' : 'Template export failed.'), 'error');
    }
  };

  const importInventoryTemplate = async (file: File) => {
    const XLSX = await import('xlsx');
    const book = XLSX.read(await file.arrayBuffer());
    if (!book.SheetNames.length) throw new Error(lang === 'ar' ? 'ملف Excel لا يحتوي على صفحات.' : 'Excel file has no sheets.');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
    if (!rows.length) throw new Error(lang === 'ar' ? 'ملف Excel فارغ.' : 'Excel file is empty.');
    const { candidates, skipped } = prepareInventoryExcelRows(
      rows,
      inventory.map(item => String(item.sku || '')),
      warehouses.map(warehouse => warehouse.id),
    );
    let imported = 0;
    for (const { index, row, name, nameAr, sku, warehouseId, quantity, purchasePrice, costPrice, threshold } of candidates) {
      const id = `INV-${Date.now()}-${index}`;
      await addInventoryItem({
        id, name, nameAr, sku, barcode: String(row.barcode || ''),
        unit: String(row.unit || 'COUNT'), category: String(row.category || ''),
        purchasePrice, costPrice, threshold, isAudited: true, auditFrequency: 'DAILY',
        isComposite: false, bom: [], warehouseQuantities: [],
      } as InventoryItem);
      if (warehouseId && quantity > 0) await updateStock(id, warehouseId, quantity, 'ADJUSTMENT', 'Excel opening stock import');
      imported++;
    }
    await fetchInventory();
    return { imported, skipped };
  };

  const handleInventoryFileImport = async (file: File) => {
    setIsImportingInventory(true);
    try {
      const { imported, skipped } = await importInventoryTemplate(file);
      showToast(lang === 'ar' ? `تم استيراد ${imported} صنف، وتخطي ${skipped}.` : `Imported ${imported} items; skipped ${skipped}.`, imported ? 'success' : 'warning');
    } catch (error: any) {
      const [code, row] = String(error?.message || '').split(':');
      const message = code === 'INVALID_NUMERIC_VALUE'
        ? (lang === 'ar' ? `قيمة رقمية غير صحيحة في الصف ${row}.` : `Invalid numeric value at row ${row}.`)
        : code === 'INVALID_WAREHOUSE'
          ? (lang === 'ar' ? `كود مخزن غير صحيح في الصف ${row}.` : `Invalid warehouse at row ${row}.`)
          : error?.message || (lang === 'ar' ? 'فشل استيراد ملف Excel.' : 'Excel import failed.');
      showToast(message, 'error');
    } finally {
      setIsImportingInventory(false);
    }
  };

  const handleSaveWarehouse = async (wh: Warehouse) => {
    await addWarehouse(wh);
    setWarehouseModalOpen(false);
  };

  const handleAdjustment = async (itemId: string, warehouseId: string, quantity: number, reason: string) => {
    await updateStock(itemId, warehouseId, quantity, 'ADJUSTMENT', reason);
  };

  const handleTransfer = async (itemId: string, fromWh: string, toWh: string, qty: number) => {
    const item = inventory.find(i => i.id === itemId);
    if (!item) return;

    await createBranchTransferInDB({
      itemId,
      fromWarehouseId: fromWh,
      toWarehouseId: toWh,
      quantity: qty,
      reason: `Transfer ${displayWarehouseName(warehouseById.get(fromWh))} -> ${displayWarehouseName(warehouseById.get(toWh))}`,
      actorId: settings.currentUser?.id,
    });
  };

  const handleDirectReceipt = async (data: {
    warehouseId: string;
    supplierId?: string;
    items: { itemId: string; quantity: number; costPrice?: number }[];
  }) => {
    await inventoryApi.receiveStock({
      warehouse_id: data.warehouseId,
      supplier_id: data.supplierId,
      reference_id: `DIRECT-${crypto.randomUUID()}`,
      actor_id: settings.currentUser?.id,
      items: data.items.map(item => ({
        item_id: item.itemId,
        quantity: Number(item.quantity),
        unit_cost: Number(item.costPrice),
      })),
    });
    await Promise.all([fetchInventory(), fetchTransferMovements(100)]);
  };

  const handleZeroInventory = async () => {
    const branchId = settings.activeBranchId || branches[0]?.id;
    if (!branchId) return;
    const ok = await confirm({
      title: lang === 'ar' ? 'تصفير كميات المخزون؟' : 'Zero stock quantities?',
      message: lang === 'ar'
        ? 'سيتم جعل كل كميات مخازن الفرع صفراً مع الاحتفاظ بالأصناف وتسجيل حركة ومراجعة للعملية.'
        : 'All branch warehouse quantities will become zero. Items stay; movements and audit are recorded.',
      confirmText: lang === 'ar' ? 'تصفير الكميات' : 'Zero quantities',
      cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    const result = await inventoryApi.zeroStock({ branchId });
    await fetchInventory();
    showToast(
      lang === 'ar' ? `تم تصفير ${result.affectedRows} رصيد مخزني.` : `Zeroed ${result.affectedRows} stock balances.`,
      'success',
    );
  };

  const handleZeroCountInputs = async () => {
    const ok = await confirm({
      title: lang === 'ar' ? 'تصفير الجرد الحالي؟' : 'Zero current count?',
      message: lang === 'ar'
        ? 'سيتم وضع الكمية المعدودة بصفر لكل بنود الجلسة الحالية. لن يتغير المخزون قبل اعتماد الجرد.'
        : 'Every counted quantity becomes zero. Stock changes only after posting the count.',
      confirmText: lang === 'ar' ? 'تصفير الجرد' : 'Zero count',
      cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    setCountSession((current: any) => ({
      ...current,
      items: (current?.items || []).map((item: any) => ({ ...item, countedQty: 0 })),
    }));
  };

  const renderStockCount = () => (
    <div className="p-6 md:p-8 space-y-6 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-150">
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
              {warehouses.map(wh => <option key={wh.id} value={wh.id}>{displayWarehouseName(wh)}</option>)}
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
                {(countSession.items || []).map((ci: any) => {
                  const variance = ci.countedQty !== null ? ci.countedQty - ci.systemQty : 0;
                  return (
                    <tr key={ci.itemId} className="hover:bg-violet-500/5 transition-colors group">
                      <td className="px-8 py-4 font-bold text-main uppercase tracking-tight">{ci.itemName}</td>
                      <td className="px-4 py-4 text-center text-[10px] font-black text-muted uppercase tracking-widest">{ci.unit}</td>
                      <td className="px-4 py-4 text-center font-black text-muted/60 tabular-nums">{ci.systemQty}</td>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="number"
                          value={ci.countedQty ?? ''}
                          onChange={(e) => handleUpdateCountItem(ci.itemId, 'countedQty', e.target.value === '' ? null : Number(e.target.value))}
                          className="w-24 text-center px-3 py-2 bg-card/60 border border-border/20 rounded-xl font-black text-main tabular-nums focus:border-violet-500/50 outline-none transition-all shadow-inner"
                          placeholder="-"
                        />
                      </td>
                      <td className={`px-4 py-4 text-center font-black tabular-nums transition-all ${ci.countedQty === null ? 'text-muted/30' : variance > 0 ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]' : variance < 0 ? 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]' : 'text-main'}`}>
                        {ci.countedQty !== null ? (variance > 0 ? `+${variance}` : variance) : '-'}
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
  );

  const renderMovements = () => (
    <div className="p-6 md:p-8 space-y-8 relative z-10 animate-in fade-in duration-150">
      <div className="flex flex-wrap items-center gap-4 bg-elevated/20 p-5 rounded-3xl border border-border/10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-500">
                <Calendar size={14} />
             </div>
             <input
               type="date"
               value={movementDateFrom}
               onChange={(e) => setMovementDateFrom(e.target.value)}
               className="bg-card/60  border border-border/30 rounded-xl px-4 py-2 text-[11px] font-black uppercase text-main outline-none focus:border-sky-500/50"
             />
          </div>
          <span className="text-muted text-[10px] font-black uppercase tracking-widest">{lang === 'ar' ? 'إلى' : 'TO'}</span>
          <input
            type="date"
            value={movementDateTo}
            onChange={(e) => setMovementDateTo(e.target.value)}
            className="bg-card/60  border border-border/30 rounded-xl px-4 py-2 text-[11px] font-black uppercase text-main outline-none focus:border-sky-500/50"
          />
        </div>
        <button
          onClick={loadMovements}
          disabled={movementLoading}
          className="flex items-center gap-3 px-8 py-3 bg-card/60  text-sky-500 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border border-border/30 hover:bg-sky-500 hover:text-white transition-all active:scale-95 shadow-sm"
        >
          <Activity size={14} className={movementLoading ? 'animate-spin' : ''} />
          {lang === 'ar' ? 'تحديث السجلات' : 'REFRESH LOGS'}
        </button>
        <div className="ml-auto px-4 py-2 bg-elevated/40 rounded-xl text-[10px] font-black text-muted uppercase tracking-widest border border-border/10">
           {movementLog.length} Records Detected
        </div>
      </div>

      <div className="responsive-table border border-border/10 rounded-3xl overflow-hidden shadow-sm">
        {movementLog.length === 0 ? (
          <div className="text-center py-24 bg-card/20">
            <Activity size={64} className="mx-auto text-muted/10 mb-6 animate-pulse" />
            <p className="text-muted font-black uppercase tracking-[0.3em] text-xs">
              {movementLoading ? (lang === 'ar' ? 'جاري استرجاع البيانات...' : 'QUERYING BLOCKCHAIN...') : (lang === 'ar' ? 'لا توجد حركات في هذه الفترة' : 'No movements found')}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-elevated/40 text-muted uppercase font-black text-[10px] tracking-widest">
              <tr>
                <th className="text-left px-8 py-5">{lang === 'ar' ? 'الوقت' : 'Timestamp'}</th>
                <th className="text-left px-4 py-5">{lang === 'ar' ? 'الأصل' : 'Asset'}</th>
                <th className="text-center px-4 py-5">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="text-center px-4 py-5">{lang === 'ar' ? 'الكمية' : 'Quantity'}</th>
                <th className="text-center px-4 py-5">{lang === 'ar' ? 'تكلفة الوحدة' : 'Unit Cost'}</th>
                <th className="text-left px-4 py-5">{lang === 'ar' ? 'السبب' : 'Reason'}</th>
                <th className="text-left px-8 py-5">{lang === 'ar' ? 'المستخدم' : 'Operator'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {movementLog.map((mv, idx) => {
                const typeColors: Record<string, string> = {
                  ADJUSTMENT: 'text-amber-500 bg-amber-500/10 border-amber-500/20', 
                  TRANSFER: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
                  PURCHASE: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', 
                  SALE: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
                  WASTE: 'text-red-500 bg-red-500/10 border-red-500/20', 
                  SALE_CONSUMPTION: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
                };
                return (
                  <tr key={mv.id || idx} className="hover:bg-sky-500/5 transition-colors group">
                    <td className="px-8 py-4 text-[10px] font-black text-muted/60 uppercase tracking-tighter tabular-nums whitespace-nowrap">
                      {new Date(mv.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-4">
                       <span className="font-black text-main text-xs uppercase tracking-tight group-hover:text-sky-500 transition-colors">{mv.itemName}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${typeColors[mv.type] || 'bg-card text-muted border-border/20'}`}>
                        {mv.type}
                      </span>
                    </td>
                    <td className={`px-4 py-4 text-center font-black tabular-nums transition-all ${mv.quantity > 0 ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'text-rose-500'}`}>
                      {mv.quantity > 0 ? `+${mv.quantity}` : mv.quantity}
                    </td>
                    <td className="px-4 py-4 text-center font-black text-muted/80 tabular-nums text-[11px]">
                      {mv.totalCost ? `${mv.totalCost.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-4 text-[11px] text-muted font-bold truncate max-w-[150px]">{mv.reason || '-'}</td>
                    <td className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">{mv.performedBy || 'System'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
  // --- AI Forecasting State ---
  const [aiForecasts, setAiForecasts] = useState<Record<string, { text: string; loading: boolean }>>({});

  const handleRequestForecast = async (itemId: string) => {
    setAiForecasts(prev => ({ ...prev, [itemId]: { text: '', loading: true } }));
    try {
      const forecast = await inventoryIntelligenceApi.getAIForecast(itemId);
      setAiForecasts(prev => ({ ...prev, [itemId]: { text: forecast, loading: false } }));
    } catch (e) {
      setAiForecasts(prev => ({ ...prev, [itemId]: { text: 'Forecast failed.', loading: false } }));
    }
  };

  // --- STOCK COUNT STATE ---
  const [countSession, setCountSession] = useState<any>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [selectedCountWarehouse, setSelectedCountWarehouse] = useState('');
  const [selectedCountDate, setSelectedCountDate] = useState(dateOnly());
  const [selectedCountType, setSelectedCountType] = useState<'DAILY' | 'MONTHLY'>('DAILY');
  const [countHistory, setCountHistory] = useState<any[]>([]);
  const [countError, setCountError] = useState<string | null>(null);
  const activeCountWarehouseName = useMemo(
    () => (countSession ? displayWarehouseName(warehouseById.get(countSession.warehouseId)) : undefined),
    [countSession, warehouseById, lang]
  );

  const loadCountHistory = async () => {
    const warehouse = selectedCountWarehouse ? warehouseById.get(selectedCountWarehouse) : null;
    const branchId = warehouse?.branchId || settings.activeBranchId || branches[0]?.id;
    if (!branchId) return;
    try {
      setCountError(null);
      const rows = await inventoryApi.getStockCounts({
        branchId,
        warehouseId: selectedCountWarehouse || undefined,
        date: selectedCountDate || undefined,
        limit: 20,
      });
      setCountHistory(rows || []);
    } catch (error: any) {
      setCountError(error?.message || (lang === 'ar' ? 'تعذر تحميل سجل الجرد' : 'Failed to load stock count history'));
    }
  };

  useEffect(() => {
    if (activeTab === 'STOCKCOUNT') {
      void loadCountHistory();
    }
  }, [activeTab, selectedCountWarehouse, selectedCountDate, warehouses.length, settings.activeBranchId]);

  const handleStartCount = async () => {
    if (!selectedCountWarehouse) return;
    setCountLoading(true);
    try {
      setCountError(null);
      const warehouse = warehouseById.get(selectedCountWarehouse);
      const branchId = warehouse?.branchId || settings.activeBranchId || branches[0]?.id;
      if (!branchId) throw new Error(lang === 'ar' ? 'اختر فرعا أو مخزنا صالحا قبل بدء الجرد' : 'Select a valid branch or warehouse before starting count');
      const sessionResponse = await inventoryApi.createStockCount({
        branchId,
        warehouseId: selectedCountWarehouse,
        countDate: selectedCountDate,
        type: selectedCountType,
        remarks: selectedCountType === 'MONTHLY'
          ? (lang === 'ar' ? 'جرد شهري' : 'Monthly count')
          : (lang === 'ar' ? 'جرد يومي' : 'Daily count'),
        userId: settings.currentUser?.id,
      });
      const frozenSession = await inventoryApi.freezeStockCount(sessionResponse.id);
      setCountSession(frozenSession);
      await loadCountHistory();
    } catch (e: any) {
      setCountError(e?.message || (lang === 'ar' ? 'تعذر بدء الجرد' : 'Failed to start stock count'));
    }
    setCountLoading(false);
  };

  const handleOpenCount = async (id: string) => {
    setCountLoading(true);
    try {
      setCountError(null);
      const count = await inventoryApi.getStockCount(id);
      setCountSession(count);
      if (count.warehouseId) setSelectedCountWarehouse(count.warehouseId);
      if (count.countDate) setSelectedCountDate(String(count.countDate).split('T')[0]);
      if (count.type === 'DAILY' || count.type === 'MONTHLY') setSelectedCountType(count.type);
    } catch (e: any) {
      setCountError(e?.message || (lang === 'ar' ? 'تعذر فتح جلسة الجرد' : 'Failed to open stock count'));
    }
    setCountLoading(false);
  };

  const handlePrintCount = async (id?: string) => {
    setCountLoading(true);
    try {
      setCountError(null);
      const count = id && countSession?.id !== id
        ? await inventoryApi.getStockCount(id)
        : countSession;
      if (!count) return;
      printStockCountSession(count, {
        lang,
        restaurantName: settings.restaurantName,
        currencySymbol: settings.currencySymbol,
      });
    } catch (e: any) {
      setCountError(e?.message || (lang === 'ar' ? 'تعذرت طباعة جلسة الجرد' : 'Failed to print stock count'));
    } finally {
      setCountLoading(false);
    }
  };

  const handleUpdateCountItem = (itemId: string, field: string, value: any) => {
    if (!countSession) return;
    setCountSession((prev: any) => ({
      ...prev,
      items: prev.items.map((it: any) => it.itemId === itemId ? { ...it, [field]: value } : it),
    }));
  };

  const handleCompleteCount = async (apply: boolean) => {
    if (!countSession) return;
    setCountLoading(true);
    try {
      const counts = countSession.items
        .filter((it: any) => (
          (it.countedQty !== null && it.countedQty !== undefined)
          || String(it.notes || '').trim()
        ))
        .map((it: any) => ({
          itemId: it.itemId,
          countedQty: it.countedQty === null || it.countedQty === undefined ? null : Number(it.countedQty),
          notes: it.notes || '',
        }));
      if (!apply) {
          await inventoryApi.submitCount(countSession.id, counts, { finalize: false });
          setCountSession(null);
          await loadCountHistory();
          showToast(lang === 'ar' ? 'تم حفظ مسودة الجرد.' : 'Stock count draft saved.', 'success');
      } else {
        const incompleteCount = countSession.items.some(
          (it: any) => it.countedQty === null || it.countedQty === undefined
        );
        if (incompleteCount) {
          throw new Error(
            lang === 'ar'
              ? 'لا يمكن اعتماد الجرد قبل إدخال الكمية الفعلية لكل الأصناف.'
              : 'Enter the physical quantity for every item before posting the count.'
          );
        }
        await inventoryApi.submitCount(
          countSession.id,
          counts.filter((it: any) => it.countedQty !== null),
        );
        await inventoryApi.postStockCount(countSession.id);
        setCountSession(null);
        await Promise.all([fetchInventory(), loadCountHistory()]);
      }
    } catch (e: any) {
      setCountError(e?.message || (lang === 'ar' ? 'تعذر إنهاء الجرد' : 'Failed to complete stock count'));
    }
    setCountLoading(false);
  };

  // --- MOVEMENT LOG STATE ---
  const [movementLog, setMovementLog] = useState<any[]>([]);
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementDateFrom, setMovementDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return formatLocalDate(d);
  });
  const [movementDateTo, setMovementDateTo] = useState(() => formatLocalDate(new Date()));

  const loadMovements = async () => {
    setMovementLoading(true);
    try {
      const data = await reportsApi.getStockMovements({ startDate: movementDateFrom, endDate: movementDateTo });
      setMovementLog(data || []);
    } catch {
      setMovementLog([]);
    }
    setMovementLoading(false);
  };

  const [consumptionRows, setConsumptionRows] = useState<any[]>([]);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [consumptionDateFrom, setConsumptionDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return formatLocalDate(d);
  });
  const [consumptionDateTo, setConsumptionDateTo] = useState(() => formatLocalDate(new Date()));

  const consumptionReportRows = useMemo(() => consumptionRows.map((row) => {
    const item = inventoryById.get(row.itemId);
    const apiCurrentStock = Number(row.currentStock);
    const currentStock = Number.isFinite(apiCurrentStock)
      ? apiCurrentStock
      : row.warehouseId
        ? Number(item?.warehouseQuantities?.find((qty) => qty.warehouseId === row.warehouseId)?.quantity || 0)
        : Number(inventoryTotalsById.get(row.itemId) || 0);
    const consumedQty = Number(row.totalQuantity || 0);
    return {
      ...row,
      currentStock,
      shortageQty: Math.max(consumedQty - currentStock, 0),
      overQty: Math.max(currentStock - consumedQty, 0),
    };
  }), [consumptionRows, inventoryById, inventoryTotalsById]);

  const consumptionTotals = useMemo(() => ({
    quantity: consumptionReportRows.reduce((sum, row) => sum + Number(row.totalQuantity || 0), 0),
    cost: consumptionReportRows.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0),
    movements: consumptionReportRows.reduce((sum, row) => sum + Number(row.movementCount || 0), 0),
    shortage: consumptionReportRows.reduce((sum, row) => sum + Number(row.shortageQty || 0), 0),
    over: consumptionReportRows.reduce((sum, row) => sum + Number(row.overQty || 0), 0),
  }), [consumptionReportRows]);

  const getConsumptionExportRows = () => consumptionReportRows.map((row) => ({
    item: lang === 'ar' ? row.itemNameAr || row.itemName : row.itemName,
    warehouse: row.warehouseName || row.warehouseId || '-',
    consumed: Number(row.totalQuantity || 0),
    currentStock: Number(row.currentStock || 0),
    shortage: Number(row.shortageQty || 0),
    over: Number(row.overQty || 0),
    unit: row.unit || '',
    cost: Number(row.estimatedCost || 0),
    movements: Number(row.movementCount || 0),
    lastOrder: row.lastReferenceId || '',
    lastConsumedAt: row.lastConsumedAt ? new Date(row.lastConsumedAt).toLocaleString() : '',
  }));

  const exportRecipeConsumptionCsv = () => {
    const headers = lang === 'ar'
      ? ['الصنف', 'المخزن', 'المسحوب', 'الرصيد الحالي', 'العجز', 'الأوفر', 'الوحدة', 'التكلفة', 'الحركات', 'آخر أوردر', 'آخر سحب']
      : ['Item', 'Warehouse', 'Consumed', 'Current Stock', 'Shortage', 'Over', 'Unit', 'Cost', 'Movements', 'Last Order', 'Last Consumed At'];
    const rows = getConsumptionExportRows().map((row) => [row.item, row.warehouse, row.consumed, row.currentStock, row.shortage, row.over, row.unit, row.cost, row.movements, row.lastOrder, row.lastConsumedAt]);
    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `recipe-consumption-${consumptionDateFrom}-${consumptionDateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printRecipeConsumption = () => {
    const headers = lang === 'ar'
      ? ['الصنف', 'المخزن', 'المسحوب', 'الرصيد الحالي', 'العجز', 'الأوفر', 'الوحدة', 'التكلفة']
      : ['Item', 'Warehouse', 'Consumed', 'Current Stock', 'Shortage', 'Over', 'Unit', 'Cost'];
    const escapeHtml = (value: any) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
    const rows = getConsumptionExportRows().map((row) => [row.item, row.warehouse, row.consumed, row.currentStock, row.shortage, row.over, row.unit, row.cost.toFixed(2)]);
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) return;
    win.document.write(`
      <html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
        <head>
          <title>${lang === 'ar' ? 'مسحوبات الوصفات' : 'Recipe Consumption'}</title>
          <style>
            body{font-family:Arial,sans-serif;padding:24px;color:#111}
            h1{font-size:20px;margin:0 0 6px}
            p{margin:0 0 18px;color:#555}
            table{width:100%;border-collapse:collapse;font-size:12px}
            th,td{border:1px solid #ddd;padding:8px;text-align:center}
            th{background:#f4f4f5}
          </style>
        </head>
        <body>
          <h1>${lang === 'ar' ? 'مسحوبات الوصفات' : 'Recipe Consumption'}</h1>
          <p>${consumptionDateFrom} - ${consumptionDateTo}</p>
          <table>
            <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          <script>window.onload=()=>window.print()</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const loadRecipeConsumption = async () => {
    setConsumptionLoading(true);
    try {
      const data = await inventoryApi.getRecipeConsumption({
        startDate: consumptionDateFrom,
        endDate: consumptionDateTo,
        branchId: settings.activeBranchId,
        limit: 250,
      });
      setConsumptionRows(data || []);
    } catch {
      setConsumptionRows([]);
    }
    setConsumptionLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'MOVEMENTS') loadMovements();
    if (activeTab === 'CONSUMPTION') loadRecipeConsumption();
  }, [activeTab]);

  // --- TAB CONTENT RENDERERS ---

  const renderRecipeConsumption = () => (
    <div className="p-6 md:p-8 space-y-6 relative z-10 animate-in fade-in duration-150">
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
                  <td className="px-3 py-4 text-center font-black tabular-nums text-main whitespace-nowrap">{Number(row.currentStock || 0).toLocaleString()}</td>
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
  );

  const renderStock = () => {
    if (inventoryLoading && inventory.length === 0 && !searchQuery) {
      return (
        <div className="p-8">
          <PageSkeleton />
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col min-h-0 relative z-10 w-full overflow-hidden">
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
            {filteredInventory.length} {lang === 'ar' ? 'صنف' : 'items'}
          </span>
        </div>

        {/* Header Row */}
        <div className="hidden lg:grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_0.8fr] gap-4 px-8 py-5 bg-elevated/30 border-b border-border/20 text-muted text-[10px] uppercase font-black tracking-widest sticky top-0 z-20">
          <div className="whitespace-nowrap">{lang === 'ar' ? 'الصنف' : 'Item Name'}</div>
          <div className="whitespace-nowrap">{lang === 'ar' ? 'التوزيع' : 'Warehouses'}</div>
          <div className="whitespace-nowrap">{lang === 'ar' ? 'الكمية الإجمالية' : 'Total Qty'}</div>
          <div className="whitespace-nowrap font-secondary">{lang === 'ar' ? 'سعر الشراء' : 'Purchase Price'}</div>
          <div className="whitespace-nowrap">{lang === 'ar' ? 'التكلفة' : 'Cost'}</div>
          <div className="whitespace-nowrap text-right">{lang === 'ar' ? 'إجراءات' : 'Actions'}</div>
        </div>

        {/* Virtualized Body */}
        <div className="hidden lg:block flex-1 overflow-hidden min-h-0 bg-card/10">
          {filteredInventory.length === 0 ? (
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
                    : (lang === 'ar'
                        ? 'ابدأ بإضافة صنف مخزني أو تأكد أن الأصناف متصلة بالمخزن الحالي.'
                        : 'Add a raw material or confirm items are linked to the current warehouse.')}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fetchInventory()}
                  className="rounded-2xl bg-emerald-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
                >
              {lang === 'ar' ? 'تحديث الأصناف' : 'Refresh Items'}
                </button>
                <button
                  type="button"
                  onClick={() => setItemModalOpen(true)}
                  className="rounded-2xl border border-border/30 bg-card/70 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-main transition-all hover:border-emerald-500/40 active:scale-95"
                >
              {lang === 'ar' ? 'إضافة صنف' : 'Add Item'}
                </button>
              </div>
            </div>
          ) : (
            <VirtualList
              itemCount={filteredInventory.length}
              itemHeight={100}
              overscan={5}
              getKey={(index) => filteredInventory[index].id}
              renderItem={(index) => {
              const item = filteredInventory[index];
              const totalQty = inventoryTotalsById.get(item.id) || 0;
              const isLow = totalQty <= item.threshold;
              return (
                <div 
                  className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_0.8fr] gap-4 px-8 items-center h-full hover:bg-emerald-500/5 transition-colors border-b border-white/5 group"
                >
                  {/* Item Profile */}
                  <div className="flex items-center gap-4 py-2">
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
                  <div className="flex flex-wrap gap-1.5 py-2">
                    {item.warehouseQuantities.slice(0, 3).map(wq => {
                      const wh = warehouseById.get(wq.warehouseId);
                      return (
                        <span key={wq.warehouseId} className="px-2 py-1 bg-elevated/40 border border-border/20 shadow-sm rounded-lg text-[9px] font-bold text-main hover:border-emerald-500/30 transition-colors">
                          {displayWarehouseName(wh)}: {wq.quantity}
                        </span>
                      );
                    })}
                    {item.warehouseQuantities.length > 3 && <span className="text-[9px] font-black text-muted">+{item.warehouseQuantities.length - 3} {lang === 'ar' ? 'أكثر' : 'More'}</span>}
                    {item.warehouseQuantities.length === 0 && <span className="text-[10px] italic text-muted opacity-60">{lang === 'ar' ? 'لا يوجد رصيد' : 'Empty Stock'}</span>}
                  </div>

                  {/* Qty */}
                  <div className="font-black py-2">
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
                  <div className="font-black text-[13px] text-emerald-500 drop-shadow-sm py-2">
                    {settings.currencySymbol || 'ج.م'} {(item.purchasePrice || 0).toLocaleString()}
                  </div>

                  {/* Cost */}
                  <div className="font-black text-[13px] text-muted/80 py-2">
                    {settings.currencySymbol || 'ج.م'} {item.costPrice.toLocaleString()}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pr-2 opacity-30 group-hover:opacity-100 transition-opacity">
                    {/* AI Forecast Button */}
                    <button
                      onClick={() => handleRequestForecast(item.id)}
                      disabled={aiForecasts[item.id]?.loading}
                    title={lang === 'ar' ? 'توقعات الذكاء الاصطناعي' : 'AI Forecast'}
                      className={`p-2.5  border border-border/20 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2 ${
                        aiForecasts[item.id]?.loading 
                          ? 'bg-primary/5 text-primary animate-pulse' 
                          : 'bg-card/50 hover:bg-primary/10 hover:border-primary/30 text-muted hover:text-primary'
                      }`}
                    >
                      <Activity size={15} />
                      {aiForecasts[item.id]?.text && (
                        <div className="absolute bottom-full right-0 mb-3 w-64 p-3 bg-card/95  border border-primary/20 rounded-2xl shadow-2xl z-50 text-[10px] normal-case font-bold text-main leading-relaxed ring-1 ring-white/10 animate-in fade-in slide-in-from-bottom-2">
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
                      className="p-2.5 bg-card/50  hover:bg-emerald-500/10 border border-border/20 hover:border-emerald-500/30 rounded-xl text-muted hover:text-emerald-500 transition-all shadow-sm active:scale-95"
                    >
                      <Tag size={15} />
                    </button>
                    <button
                      onClick={() => { setEditingItem(item); setAdjustmentModalOpen(true); }}
                      aria-label={lang === 'ar' ? `تسوية مخزون ${displayItemName(item)}` : `Adjust stock for ${displayItemName(item)}`}
                      title={lang === 'ar' ? 'تسوية المخزون' : 'Adjust stock'}
                      className="p-2.5 bg-card/50  hover:bg-amber-500/10 border border-border/20 hover:border-amber-500/30 rounded-xl text-muted hover:text-amber-500 transition-all shadow-sm active:scale-95"
                    >
                      <Calculator size={15} />
                    </button>
                  </div>
                </div>
              );
              }}
            />
          )}
        </div>

        <div className="lg:hidden flex-1 min-h-0 overflow-y-auto bg-card/10 p-3 sm:p-4 space-y-3">
          {filteredInventory.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 px-5 text-center">
              <Package size={38} className="text-muted/30" />
              <p className="text-sm font-black text-muted">
                {lang === 'ar' ? 'لا توجد أصناف مخزنية ظاهرة' : 'No inventory items visible'}
              </p>
            </div>
          ) : filteredInventory.map((item) => {
            const totalQty = inventoryTotalsById.get(item.id) || 0;
            const isLow = totalQty <= item.threshold;
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
                      {displayWarehouseName(warehouseById.get(wq.warehouseId))}: {wq.quantity}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setEditingItem(item); setItemModalOpen(true); }} className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-[10px] font-black text-emerald-500">
                    {lang === 'ar' ? 'تعديل الصنف' : 'Edit item'}
                  </button>
                  <button type="button" onClick={() => { setEditingItem(item); setAdjustmentModalOpen(true); }} className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-[10px] font-black text-amber-500">
                    {lang === 'ar' ? 'تسوية الرصيد' : 'Adjust stock'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  };
  const renderWarehouses = () => (
    <div className="p-8 grid-auto-fit gap-8 relative z-10 w-full">
      <button
        onClick={() => setWarehouseModalOpen(true)}
        className="bg-card/40  border-2 border-dashed border-border/30 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-[2.5rem] flex flex-col items-center justify-center transition-all duration-150 group min-h-[200px]"
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
          <div key={wh.id} className="bg-card/60  border border-border/20 p-8 rounded-[2.5rem] flex flex-col justify-between group cursor-pointer hover:border-emerald-500/30 shadow-[0_10px_30px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_40px_rgba(16,185,129,0.15)] transition-all duration-150 ease-out hover:-translate-y-2 relative overflow-hidden" onClick={() => setSelectedWarehouse(wh)}>
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
                <Briefcase size={14} className="opacity-50" />
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
    </div>
  );

  const handleUpsertSupplier = async () => {
    if (!supplierForm.name.trim()) return;
    if (supplierForm.id) {
      await updateSupplierInDB(supplierForm);
    } else {
      await createSupplierInDB({ ...supplierForm, id: `sup-${Date.now()}` });
    }
    setSupplierForm({ id: '', name: '', nameAr: '', contactPerson: '', phone: '', email: '', category: '' });
    setSelectedSupplier(null);
  };

  const renderSuppliers = () => (
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
          <button onClick={() => { setSupplierForm({ id: '', name: '', nameAr: '', contactPerson: '', phone: '', email: '', category: '' }); setSelectedSupplier(null); }} className="flex-1 px-4 py-3.5 rounded-2xl bg-elevated/30 hover:bg-elevated/60 text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-border/20 active:scale-95 text-muted hover:text-main">{lang === 'ar' ? 'مسح' : 'Clear'}</button>
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
                        <button onClick={() => { setSelectedSupplier(s); setSupplierForm(s); }} className="px-3 py-1.5 rounded-lg bg-card/50 border border-border/30 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 text-[10px] font-black uppercase tracking-widest text-muted transition-all active:scale-95">{lang === 'ar' ? 'تعديل' : 'Edit'}</button>
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
  );

  const handleCreatePO = async () => {
    if (!poSupplierId || !poItemId || poQty <= 0 || poPrice <= 0) return;
    const item = selectedItem;
    if (!item) return;
    const activeBranchId = settings.activeBranchId || branches[0]?.id;
    if (!activeBranchId) return;
    await createPurchaseOrderInDB({
      id: `po-${Date.now()}`,
      supplierId: poSupplierId,
      status: 'DRAFT',
      items: [{ itemId: poItemId, itemName: item.name, quantity: poQty, unitPrice: poPrice }],
      totalCost: poQty * poPrice,
      date: new Date(),
      targetWarehouseId: poWarehouseId || undefined,
      approvedById: undefined,
    }, activeBranchId);
    setPoQty(1);
    setPoPrice(0);
    setPoItemId('');
    await fetchPurchaseOrders();
  };

  const handlePoStatusUpdate = async (poId: string, status: PurchaseOrder['status']) => {
    await updatePurchaseOrderStatusInDB(poId, status);
    await fetchPurchaseOrders();
  };

  const handleReceivePO = async (po: PurchaseOrder) => {
    const wh = po.targetWarehouseId || poWarehouseId || warehouses[0]?.id;
    if (!wh) return;
    await receivePurchaseOrderInDB(po.id, wh, []);
    await fetchPurchaseOrders();
  };

  const handleCreateBranchTransfer = async () => {
    if (!branchTransferItemId || !branchTransferFromWh || !branchTransferToWh || branchTransferQty <= 0) return;
    await createBranchTransferInDB({
      itemId: branchTransferItemId,
      fromWarehouseId: branchTransferFromWh,
      toWarehouseId: branchTransferToWh,
      quantity: branchTransferQty,
      reason: branchTransferReason,
      actorId: settings.currentUser?.id,
    });
    setBranchTransferQty(1);
  };

  const renderBranchLogistics = () => {
    return (
      <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-6 relative z-10 w-full">
        <div className="xl:col-span-1 bg-card/40  rounded-[2rem] border border-border/20 p-6 space-y-4 shadow-lg group relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-6 flex items-center gap-2 relative z-10">
             <ArrowRightLeft size={16} /> {lang === 'ar' ? 'تحويل بين الفروع' : 'Inter-Branch Transfer'}
          </h4>
          <div className="space-y-3 relative z-10">
            <select className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40  border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm shadow-inner appearance-none cursor-pointer" value={branchTransferItemId} onChange={(e) => setBranchTransferItemId(e.target.value)}>
              <option value="" className="bg-card">{lang === 'ar' ? 'اختر صنف' : 'Select Item'}</option>
              {inventory.map(i => <option key={i.id} value={i.id} className="bg-card">{displayItemName(i)}</option>)}
            </select>
            <select className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40  border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm shadow-inner appearance-none cursor-pointer" value={branchTransferFromWh} onChange={(e) => setBranchTransferFromWh(e.target.value)}>
              <option value="" className="bg-card">{lang === 'ar' ? 'من مخزن' : 'From Warehouse'}</option>
              {warehouses.map(w => <option key={w.id} value={w.id} className="bg-card">{displayWarehouseName(w)}</option>)}
            </select>
            <select className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40  border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm shadow-inner appearance-none cursor-pointer" value={branchTransferToWh} onChange={(e) => setBranchTransferToWh(e.target.value)}>
              <option value="" className="bg-card">{lang === 'ar' ? 'إلى مخزن في فرع آخر' : 'To Warehouse (different branch)'}</option>
              {destinationWarehouses.map(w => <option key={w.id} value={w.id} className="bg-card">{displayWarehouseName(w)}</option>)}
            </select>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-[10px] font-black uppercase">{lang === 'ar' ? 'كمية' : 'Qty'}</span>
              <input type="number" className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-elevated/40  border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm shadow-inner" value={branchTransferQty} onChange={(e) => setBranchTransferQty(Number(e.target.value || 0))} />
            </div>
            <input className="w-full px-4 py-3.5 rounded-2xl bg-elevated/40  border border-border/30 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all text-main font-bold text-sm placeholder:text-muted/50 shadow-inner" placeholder={lang === 'ar' ? 'سبب التحويل...' : 'Reason for Transfer...'} value={branchTransferReason} onChange={(e) => setBranchTransferReason(e.target.value)} />
          </div>
          <div className="pt-4 border-t border-border/20 relative z-10">
            <button onClick={handleCreateBranchTransfer} className="w-full px-4 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_10px_20px_rgba(6,182,212,0.2)] hover:shadow-[0_15px_30px_rgba(6,182,212,0.3)] hover:-translate-y-0.5 transition-all active:scale-95 border border-cyan-400/30">{lang === 'ar' ? 'تنفيذ التحويل' : 'Execute Transfer'}</button>
          </div>
        </div>
        <div className="xl:col-span-2 bg-card/40  rounded-[2rem] border border-border/20 overflow-hidden shadow-lg flex flex-col relative z-10">
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
    );
  };

  return (
    <div className="relative min-h-screen bg-app overflow-hidden selection:bg-emerald-500/30">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-teal-500/5 blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 p-4 lg:p-10 space-y-8 max-w-[1920px] mx-auto overflow-y-auto max-h-screen custom-scrollbar pb-32">
        <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 pb-8 border-b border-border/20">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-[1.75rem] bg-gradient-to-br from-emerald-600 to-teal-600 p-0.5 shadow-2xl shadow-emerald-600/20">
              <div className="w-full h-full rounded-[1.6rem] bg-card flex items-center justify-center">
                <Package size={36} className="text-emerald-600 animate-pulse-soft" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl lg:text-5xl font-black text-main tracking-tighter uppercase flex items-center gap-4">
              {activeTabTitle}
                <span className="hidden md:flex px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                  Enterprise Intelligent Control
                </span>
              </h1>
              <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] mt-2 opacity-60">
                {lang === 'ar' ? 'مشتريات آلية · مزامنة فورية · إدارة متعددة المخازن' : 'Automated purchasing · Real-time sync · Multi-warehouse routing'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
            <button
              onClick={() => setReceiptModalOpen(true)}
              className="h-14 flex items-center justify-center gap-3 bg-card/60 text-emerald-500 px-8 rounded-2xl border border-border/30 font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all active:scale-95 shadow-lg"
            >
              <Truck size={18} /> {lang === 'ar' ? 'استلام مباشر' : 'DIRECT RECEIPT'}
            </button>
            <button
              onClick={() => setTransferModalOpen(true)}
              className="h-14 flex items-center justify-center gap-3 bg-card/60  text-sky-500 px-8 rounded-2xl border border-border/30 font-black text-[11px] uppercase tracking-widest hover:bg-sky-500 hover:text-white transition-all active:scale-95 shadow-lg"
            >
                <ArrowRightLeft size={18} /> {lang === 'ar' ? 'تحويل مخزني' : 'INTER-TRANSFER'}
            </button>
            <button
              onClick={() => setWarehouseModalOpen(true)}
              className="h-14 flex items-center justify-center gap-3 bg-card/60  text-main px-8 rounded-2xl border border-border/30 font-black text-[11px] uppercase tracking-widest hover:bg-main hover:text-app transition-all active:scale-95 shadow-lg"
            >
              <Home size={18} /> {lang === 'ar' ? 'المخازن' : 'WAREHOUSES'}
            </button>
          </div>
        </header>

        {inventoryError && (
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-rose-500 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p className="text-xs font-black uppercase tracking-widest leading-relaxed">
                {inventoryError}
              </p>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="rounded-xl bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20"
            >
              {lang === 'ar' ? 'إغلاق' : 'Dismiss'}
            </button>
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StockMetric label={lang === 'ar' ? 'قيمة المخزون' : 'Inventory Valuation'} value={inventoryValuation.toLocaleString()} subValue={settings.currencySymbol || 'ج.م'} icon={Calculator} color="#10b981" lang={lang} />
          <StockMetric label={lang === 'ar' ? 'الأصناف النشطة' : 'Active SKUs'} value={inventory.length} subValue={lang === 'ar' ? 'صنف' : 'Items'} icon={Layers} color="#3b82f6" lang={lang} />
          <StockMetric label={lang === 'ar' ? 'رصيد صفر' : 'Out of Stock'} value={outOfStockCount} subValue={lang === 'ar' ? 'تنبيه' : 'Alerts'} icon={AlertTriangle} color="#f43f5e" lang={lang} />
          <StockMetric label={lang === 'ar' ? 'معدل الدوران' : 'Turnover Ratio'} value="4.2x" icon={Activity} color="#8b5cf6" lang={lang} />
        </section>

        <div className="flex flex-col xl:flex-row justify-between items-stretch lg:items-center gap-6 relative z-20">
          <div className="flex bg-card/40  rounded-[2rem] border border-border/30 p-2 overflow-x-auto no-scrollbar w-fit">
            {[
            { id: 'STOCK', label: lang === 'ar' ? 'الأصناف' : 'Matrix', icon: LayoutGrid },
              { id: 'SUPPLIERS', label: lang === 'ar' ? 'الموردين' : 'Partners', icon: Truck },
            { id: 'PROCUREMENT', label: lang === 'ar' ? 'المشتريات' : 'Procurement Hub', icon: FileText },
              { id: 'WAREHOUSES', label: lang === 'ar' ? 'المخازن' : 'Nodes', icon: Home },
              { id: 'BRANCHES', label: lang === 'ar' ? 'تحويلات الفروع' : 'Branches', icon: ArrowRightLeft },
              { id: 'CONSUMPTION', label: lang === 'ar' ? 'مسحوبات الوصفات' : 'Recipe Use', icon: Utensils },
            { id: 'MOVEMENTS', label: lang === 'ar' ? 'الحركات' : 'Logs', icon: Activity },
              { id: 'STOCKCOUNT', label: lang === 'ar' ? 'الجرد' : 'Audits', icon: ClipboardCheck },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-150 flex items-center gap-3 whitespace-nowrap ${activeTab === tab.id ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-600/20 scale-105' : 'text-muted hover:text-main hover:bg-elevated/60'}`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-96 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-muted w-5 h-5 group-focus-within:text-emerald-500 transition-colors z-10" />
            <input
              type="text"
              placeholder={lang === 'ar' ? 'ابحث في الأصناف المخزنية...' : 'Query master inventory...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-6 py-5 bg-card/60  border border-border/30 rounded-[2rem] outline-none focus:border-emerald-500/50 transition-all font-bold text-sm text-main placeholder:text-muted/40 shadow-xl"
            />
          </div>
        </div>

        <div className="bg-card/60  rounded-[3.5rem] border border-border/20 overflow-hidden min-h-[600px] relative z-20 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)]">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5 opacity-50 pointer-events-none" />
          {activeTab === 'STOCK' && renderStock()}
          {activeTab === 'WAREHOUSES' && renderWarehouses()}
          {activeTab === 'SUPPLIERS' && renderSuppliers()}
          {activeTab === 'STOCKCOUNT' && renderStockCount()}
          {activeTab === 'CONSUMPTION' && renderRecipeConsumption()}
          {activeTab === 'MOVEMENTS' && renderMovements()}
          {activeTab === 'PROCUREMENT' && <ProcurementHub lang={lang} />}
          {activeTab === 'BRANCHES' && renderBranchLogistics()}
        </div>

        <ItemModal
          isOpen={itemModalOpen}
          onClose={() => { setItemModalOpen(false); setEditingItem(null); }}
          onSave={handleSaveItem}
          lang={lang}
          warehouses={warehouses}
          existingItems={inventory}
          initialItem={editingItem}
        />

        <WarehouseModal
          isOpen={warehouseModalOpen}
          onClose={() => setWarehouseModalOpen(false)}
          onSave={handleSaveWarehouse}
          lang={lang}
          branches={branches}
          warehouses={warehouses}
        />

        <StockAdjustmentModal
          isOpen={adjustmentModalOpen}
          onClose={() => { setAdjustmentModalOpen(false); setEditingItem(null); }}
          onSave={handleAdjustment}
          lang={lang}
          items={inventory}
          warehouses={warehouses}
          initialItem={editingItem}
        />

        <StockTransferModal
          isOpen={transferModalOpen}
          onClose={() => setTransferModalOpen(false)}
          onSave={handleTransfer}
          lang={lang}
          items={inventory}
          warehouses={warehouses}
        />

        <ReceiptModal
          isOpen={receiptModalOpen}
          onClose={() => setReceiptModalOpen(false)}
          onSave={handleDirectReceipt}
          lang={lang}
          inventory={inventory}
          warehouses={warehouses}
          suppliers={suppliers}
        />
      </div>
    </div>
  );
};

export default Inventory;
