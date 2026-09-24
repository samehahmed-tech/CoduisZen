import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Supplier, Warehouse, InventoryItem } from '@/types';
import { useInventoryStore } from '@/stores/useInventoryStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { translations } from '@/services/translations';
import { inventoryIntelligenceApi } from '@/services/api/inventoryIntelligence';
import { reportsApi } from '@/services/api/reports';
import { inventoryApi } from '@/services/api/inventory';
import { socketService } from '@/services/socketService';
import { prepareInventoryExcelRows } from '@/services/inventoryExcelRows';
import { printStockCountSession } from '@/services/stockCountPrint';
import { formatLocalDate } from '@/utils/formatters';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { useToast } from '@/components/Toast';
import { dateOnly, MOVEMENT_TYPE_META } from './inventoryUi';

/* ── Shared workspace state: every inventory page calls this hook and
   destructures exactly the slice its UI needs. Identifiers match the
   legacy monolith so moved JSX compiles unchanged. ── */
export function useInventoryWorkspace() {
  const {
    inventory, suppliers, purchaseOrders, warehouses, transferMovements,
    isLoading: inventoryLoading, error: inventoryError,
    fetchInventory, fetchWarehouses, fetchSuppliers, fetchPurchaseOrders, fetchTransferMovements,
    addInventoryItem, updateInventoryItem, deleteInventoryItem,
    addWarehouse, updateStock,
    patchStockFromSocket,
    createSupplierInDB, updateSupplierInDB, deactivateSupplierInDB,
    createBranchTransferInDB,
    clearError,
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
      deleteInventoryItem: state.deleteInventoryItem,
      addWarehouse: state.addWarehouse,
      updateStock: state.updateStock,
      patchStockFromSocket: state.patchStockFromSocket,
      createSupplierInDB: state.createSupplierInDB,
      updateSupplierInDB: state.updateSupplierInDB,
      deactivateSupplierInDB: state.deactivateSupplierInDB,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [stockSort, setStockSort] = useState<'name' | 'qty-asc' | 'qty-desc' | 'cost' | 'low-first'>('name');

  // Modal Visibility State
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
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
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
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

  const activeInventory = useMemo(
    () => inventory.filter((item) => item.isActive !== false),
    [inventory]
  );

  const activeWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.isActive !== false),
    [warehouses]
  );

  const orphanedWarehouseAssignments = useMemo(() => activeInventory.flatMap((item) =>
    item.warehouseQuantities
      .filter((row) => {
        const warehouse = warehouseById.get(row.warehouseId);
        return !warehouse || warehouse.isActive === false;
      })
      .map((row) => ({ item, row, warehouse: warehouseById.get(row.warehouseId) }))
  ), [activeInventory, warehouseById]);

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

  const selectedWarehouseRows = useMemo(() => {
    if (!selectedWarehouse) return [];
    return activeInventory.map(item => {
      const row = item.warehouseQuantities.find(quantity => quantity.warehouseId === selectedWarehouse.id);
      return row ? { item, quantity: Number(row.quantity) || 0 } : null;
    }).filter(Boolean) as { item: InventoryItem; quantity: number }[];
  }, [activeInventory, selectedWarehouse]);

  const selectedWarehouseStats = useMemo(() => ({
    items: selectedWarehouseRows.length,
    quantity: selectedWarehouseRows.reduce((sum, row) => sum + row.quantity, 0),
    low: selectedWarehouseRows.filter(row => row.quantity <= row.item.threshold).length,
    value: selectedWarehouseRows.reduce((sum, row) => sum + row.quantity * (row.item.costPrice || 0), 0),
  }), [selectedWarehouseRows]);

  const inventoryValuation = useMemo(
    () => activeInventory.reduce((sum, item) => sum + (item.costPrice * (inventoryTotalsById.get(item.id) || 0)), 0),
    [activeInventory, inventoryTotalsById]
  );

  const outOfStockCount = useMemo(
    () => activeInventory.filter((item) => (inventoryTotalsById.get(item.id) || 0) === 0).length,
    [activeInventory, inventoryTotalsById]
  );

  const lowStockCount = useMemo(
    () => activeInventory.filter((item) => {
      const total = inventoryTotalsById.get(item.id) || 0;
      return total > 0 && total <= item.threshold;
    }).length,
    [activeInventory, inventoryTotalsById]
  );

  const filteredInventory = useMemo(() => {
    const filtered = activeInventory.filter((item) => {
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
  }, [activeInventory, normalizedSearchQuery, stockSort, inventoryTotalsById]);

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

  const selectedSourceWarehouse = useMemo(
    () => warehouseById.get(branchTransferFromWh) || null,
    [warehouseById, branchTransferFromWh]
  );

  const destinationWarehouses = useMemo(() => {
    const currentSourceBranchId = selectedSourceWarehouse?.branchId;
    return activeWarehouses.filter((warehouse) => (
      warehouse.id !== branchTransferFromWh &&
      (!currentSourceBranchId || warehouse.branchId !== currentSourceBranchId)
    ));
  }, [activeWarehouses, branchTransferFromWh, selectedSourceWarehouse]);

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

  const handleDeleteItem = async (item: InventoryItem) => {
    const itemName = displayItemName(item);
    const totalQty = inventoryTotalsById.get(item.id) || 0;
    const brokenAssignments = item.warehouseQuantities.filter((row) => {
      const warehouse = warehouseById.get(row.warehouseId);
      return !warehouse || warehouse.isActive === false;
    });
    const ok = await confirm({
      title: lang === 'ar' ? 'أرشفة الصنف؟' : 'Archive item?',
      message: lang === 'ar'
        ? `${itemName} سيتم إخفاؤه من الأصناف النشطة مع الاحتفاظ بالحركات والوصفات القديمة.${brokenAssignments.length ? ' تم اكتشاف ربط بمخزن غير نشط وسيظل ظاهرًا كتحذير.' : ''}`
        : `${itemName} will be hidden from active inventory while historical movements and recipes remain safe.${brokenAssignments.length ? ' An inactive warehouse assignment was detected and will remain flagged.' : ''}`,
      confirmText: lang === 'ar' ? 'أرشفة الصنف' : 'Archive item',
      cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    if (totalQty > 0) {
      showToast(
        lang === 'ar'
          ? 'لا يمكن أرشفة صنف له رصيد حالي. صفّر الرصيد أو انقله أولاً حتى لا يصبح الرصيد معلقًا.'
          : 'This item has current stock. Zero or transfer the stock before archiving it so no balance is left orphaned.',
        'error',
      );
      return;
    }
    try {
      await deleteInventoryItem(item.id);
      showToast(lang === 'ar' ? 'تمت أرشفة الصنف وإخفاؤه من القائمة.' : 'Item archived and removed from the active list.', 'success');
    } catch (error: any) {
      const code = error?.code || error?.message;
      const message = code === 'INVENTORY_ITEM_USED_IN_RECIPE'
        ? (lang === 'ar' ? 'لا يمكن أرشفة الصنف لأنه مستخدم في وصفة نشطة. عدّل الوصفة أولاً.' : 'This item is used in an active recipe. Update the recipe before archiving it.')
        : code === 'INVENTORY_ITEM_HAS_STOCK'
          ? (lang === 'ar' ? 'لا يمكن أرشفة الصنف قبل تصفير أو نقل رصيده الحالي.' : 'Zero or transfer the current stock before archiving this item.')
          : (error?.message || (lang === 'ar' ? 'تعذر أرشفة الصنف.' : 'Failed to archive item.'));
      showToast(message, 'error');
    }
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
    items: { itemId: string; quantity: number; costPrice?: number; purchaseUnit?: string }[];
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
        purchase_unit: item.purchaseUnit,
      })),
    });
    await Promise.all([fetchInventory(), fetchTransferMovements(100)]);
  };

  const handleSupplierReturn = async (data: {
    warehouseId: string;
    supplierId?: string;
    reason: string;
    creditNoteRef?: string;
    items: { itemId: string; quantity: number; unitPrice?: number }[];
  }) => {
    const { purchaseOrdersApi } = await import('@/services/api/procurement');
    const result = await purchaseOrdersApi.createPurchaseReturn({
      warehouseId: data.warehouseId,
      supplierId: data.supplierId,
      reason: data.reason,
      creditNoteRef: data.creditNoteRef,
      items: data.items.map(item => ({
        itemId: item.itemId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice || 0),
      })),
    });
    await Promise.all([fetchInventory(), fetchTransferMovements(100)]);
    const skipped = Array.isArray((result as any)?.skipped) ? (result as any).skipped.length : 0;
    showToast(
      lang === 'ar'
        ? `تم حفظ مرتجع المورد (${(result as any)?.returned?.length || 0} صنف)${skipped ? ` وتخطي ${skipped}` : ''}.`
        : `Supplier return saved (${(result as any)?.returned?.length || 0} items)${skipped ? `, ${skipped} skipped` : ''}.`,
      skipped ? 'warning' : 'success',
    );
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

  const handleUpsertSupplier = async () => {
    if (!supplierForm.name.trim()) return;
    if (supplierForm.id) {
      await updateSupplierInDB(supplierForm);
    } else {
      await createSupplierInDB({ ...supplierForm, id: `sup-${Date.now()}` });
    }
    setSupplierForm({ id: '', name: '', nameAr: '', contactPerson: '', phone: '', email: '', category: '' });
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
  const [blindCount, setBlindCount] = useState(false);
  const [countScan, setCountScan] = useState('');
  const [countScanFilter, setCountScanFilter] = useState('');
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

  const exportStockCount = async (id?: string) => {
    setCountLoading(true);
    try {
      const count = id && countSession?.id !== id
        ? await inventoryApi.getStockCount(id)
        : countSession;
      if (!count) return;
      const XLSX = await import('xlsx');
      const details = (count.items || []).map((item: any) => {
        const systemQty = Number(item.systemQty ?? item.expectedQty ?? 0);
        const countedQty = item.countedQty === null || item.countedQty === undefined ? '' : Number(item.countedQty);
        const variance = countedQty === '' ? '' : Number(countedQty) - systemQty;
        const unitCost = Number(item.cost || 0);
        return {
          [lang === 'ar' ? 'الصنف' : 'Item']: item.itemName || item.itemId,
          [lang === 'ar' ? 'الوحدة' : 'Unit']: item.unit || '',
          [lang === 'ar' ? 'كمية النظام' : 'System Qty']: systemQty,
          [lang === 'ar' ? 'الجرد الفعلي' : 'Counted Qty']: countedQty,
          [lang === 'ar' ? 'الفرق' : 'Variance']: variance,
          [lang === 'ar' ? 'تكلفة الوحدة' : 'Unit Cost']: unitCost,
          [lang === 'ar' ? 'قيمة الفرق' : 'Variance Value']: variance === '' ? '' : Number(variance) * unitCost,
          [lang === 'ar' ? 'ملاحظات' : 'Notes']: item.notes || '',
        };
      });
      const summary = [{
        [lang === 'ar' ? 'رقم الجلسة' : 'Session']: count.id,
        [lang === 'ar' ? 'التاريخ' : 'Date']: String(count.countDate || '').split('T')[0],
        [lang === 'ar' ? 'المخزن' : 'Warehouse']: count.warehouseName || count.warehouseId || '',
        [lang === 'ar' ? 'الحالة' : 'Status']: count.status || '',
        [lang === 'ar' ? 'عدد البنود' : 'Lines']: details.length,
        [lang === 'ar' ? 'إجمالي قيمة الفرق' : 'Total Variance Value']: details.reduce((sum: number, row: any) => sum + Number(row[lang === 'ar' ? 'قيمة الفرق' : 'Variance Value'] || 0), 0),
      }];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary), lang === 'ar' ? 'ملخص الجرد' : 'Summary');
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(details), lang === 'ar' ? 'تفاصيل الجرد' : 'Count Details');
      XLSX.writeFile(book, `stock-count-${count.id}.xlsx`);
      showToast(lang === 'ar' ? 'تم تصدير تفاصيل الجرد إلى Excel.' : 'Stock count details exported to Excel.', 'success');
    } catch (error: any) {
      setCountError(error?.message || (lang === 'ar' ? 'تعذر تصدير الجرد.' : 'Stock count export failed.'));
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

  // --- MOVEMENT LOG STATE ---
  const [movementLog, setMovementLog] = useState<any[]>([]);
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementDateFrom, setMovementDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return formatLocalDate(d);
  });
  const [movementDateTo, setMovementDateTo] = useState(() => formatLocalDate(new Date()));
  const [movementTypeFilter, setMovementTypeFilter] = useState<Set<string>>(new Set());
  const [movementSearch, setMovementSearch] = useState('');

  const loadMovements = async () => {
    setMovementLoading(true);
    try {
      const data = await reportsApi.getStockMovements({
        startDate: movementDateFrom,
        endDate: movementDateTo,
        branchId: settings.activeBranchId || undefined,
        types: movementTypeFilter.size > 0 ? Array.from(movementTypeFilter) : undefined,
      });
      setMovementLog(data || []);
    } catch {
      setMovementLog([]);
    }
    setMovementLoading(false);
  };

  const toggleMovementType = (type: string) => {
    setMovementTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filteredMovementRows = useMemo(() => {
    const search = movementSearch.trim().toLowerCase();
    if (!search) return movementLog;
    return movementLog.filter((mv) => (
      `${mv.itemName || ''} ${mv.itemNameAr || ''} ${mv.reason || ''} ${mv.referenceId || ''} ${mv.warehouseName || ''}`
        .toLowerCase()
        .includes(search)
    ));
  }, [movementLog, movementSearch]);

  const movementSummary = useMemo(() => {
    let inQty = 0;
    let outQty = 0;
    let cost = 0;
    for (const mv of filteredMovementRows) {
      const qty = Number(mv.quantity || 0);
      if (qty >= 0) inQty += qty;
      else outQty += Math.abs(qty);
      cost += Math.abs(Number(mv.totalCost || 0));
    }
    return { count: filteredMovementRows.length, inQty, outQty, cost };
  }, [filteredMovementRows]);

  const getMovementExportRows = () => filteredMovementRows.map((mv) => ({
    time: new Date(mv.createdAt).toLocaleString(),
    item: lang === 'ar' ? mv.itemNameAr || mv.itemName : mv.itemName,
    type: MOVEMENT_TYPE_META[String(mv.type || '').toUpperCase()]?.[lang === 'ar' ? 'ar' : 'en'] || String(mv.type || '-'),
    quantity: Number(mv.quantity || 0),
    unit: mv.unit || '',
    unitCost: Number(mv.unitCost || 0),
    totalCost: Math.abs(Number(mv.totalCost || 0)),
    warehouse: mv.warehouseName || '-',
    reference: mv.referenceId || '',
    reason: mv.reason || '',
    operator: mv.performedBy || 'System',
  }));

  const exportMovementsCsv = () => {
    const headers = lang === 'ar'
      ? ['الوقت', 'الصنف', 'النوع', 'الكمية', 'الوحدة', 'تكلفة الوحدة', 'إجمالي التكلفة', 'المخزن', 'المرجع', 'السبب', 'بواسطة']
      : ['Time', 'Item', 'Type', 'Quantity', 'Unit', 'Unit Cost', 'Total Cost', 'Warehouse', 'Reference', 'Reason', 'Operator'];
    const rows = getMovementExportRows().map(row => [
      row.time, row.item, row.type, row.quantity, row.unit,
      row.unitCost.toFixed(2), row.totalCost.toFixed(2),
      row.warehouse, row.reference, row.reason, row.operator,
    ]);
    const csv = [headers, ...rows]
      .map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-movements-${movementDateFrom}-${movementDateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printMovements = () => {
    const escapeHtml = (value: any) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
    const headers = lang === 'ar'
      ? ['الوقت', 'الصنف', 'النوع', 'الكمية', 'الوحدة', 'تكلفة الوحدة', 'الإجمالي', 'المخزن', 'المرجع', 'بواسطة']
      : ['Time', 'Item', 'Type', 'Qty', 'Unit', 'Unit Cost', 'Total', 'Warehouse', 'Ref', 'By'];
    const rows = getMovementExportRows().map(row => [
      row.time, row.item, row.type,
      `${row.quantity >= 0 ? '+' : ''}${row.quantity}`,
      row.unit, row.unitCost.toFixed(2), row.totalCost.toFixed(2),
      row.warehouse, row.reference, row.operator,
    ]);
    const win = window.open('', '_blank', 'width=1200,height=850');
    if (!win) return;
    win.document.write(`
      <html dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
        <head>
          <title>${lang === 'ar' ? 'حركات المخزون' : 'Stock Movements'}</title>
          <style>
            body{font-family:Arial,sans-serif;padding:22px;color:#111}
            h1{font-size:20px;margin:0 0 4px}
            p{margin:0 0 14px;color:#555;font-size:12px}
            table{width:100%;border-collapse:collapse;font-size:11px}
            th,td{border:1px solid #ddd;padding:6px;text-align:center}
            th{background:#f4f4f5}
            tbody tr:nth-child(even){background:#fafafa}
          </style>
        </head>
        <body>
          <h1>${lang === 'ar' ? 'سجل حركات المخزون' : 'Stock Movements Log'}</h1>
          <p>${movementDateFrom} → ${movementDateTo} · ${lang === 'ar' ? 'عدد الحركات' : 'Records'}: ${rows.length}</p>
          <table>
            <thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          <script>window.onload=()=>window.print()</script>
        </body>
      </html>
    `);
    win.document.close();
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
    return {
      ...row,
      currentStock,
      shortageQty: Math.max(Number(row.shortageQty || 0), 0),
      overQty: Math.max(Number(row.overQty || 0), 0),
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
    lastCount: row.lastCountDate ? `${lang === 'ar' ? 'جرد' : 'Count'} ${Number(row.lastCountedQty ?? 0)} @ ${new Date(row.lastCountDate).toLocaleDateString()}` : '',
  }));

  const exportRecipeConsumptionCsv = () => {
    const headers = lang === 'ar'
      ? ['الصنف', 'المخزن', 'المسحوب', 'الرصيد الحالي', 'العجز', 'الأوفر', 'الوحدة', 'التكلفة', 'الحركات', 'آخر أوردر', 'آخر سحب', 'آخر جرد']
      : ['Item', 'Warehouse', 'Consumed', 'Current Stock', 'Shortage', 'Over', 'Unit', 'Cost', 'Movements', 'Last Order', 'Last Consumed At', 'Last Count'];
    const rows = getConsumptionExportRows().map((row) => [row.item, row.warehouse, row.consumed, row.currentStock, row.shortage, row.over, row.unit, row.cost, row.movements, row.lastOrder, row.lastConsumedAt, row.lastCount]);
    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `recipe-consumption-${consumptionDateFrom}-${consumptionDateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printRecipeConsumption = () => {
    const headers = lang === 'ar'
      ? ['الصنف', 'المخزن', 'المسحوب', 'الرصيد الحالي', 'العجز', 'الأوفر', 'الوحدة', 'التكلفة', 'آخر جرد']
      : ['Item', 'Warehouse', 'Consumed', 'Current Stock', 'Shortage', 'Over', 'Unit', 'Cost', 'Last Count'];
    const escapeHtml = (value: any) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
    const rows = getConsumptionExportRows().map((row) => [row.item, row.warehouse, row.consumed, row.currentStock, row.shortage, row.over, row.unit, row.cost.toFixed(2), row.lastCount]);
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

  return {
    branches, settings, lang, t, confirm, showToast, displayItemName, displayWarehouseName,
    inventory, suppliers, purchaseOrders, warehouses, transferMovements,
    inventoryLoading, inventoryError, clearError,
    fetchInventory, fetchTransferMovements,
    activeInventory, activeWarehouses, branchById, warehouseById, supplierById,
    inventoryById, inventoryTotalsById, warehouseSkuCounts,
    inventoryValuation, outOfStockCount, lowStockCount, orphanedWarehouseAssignments,
    searchQuery, setSearchQuery, stockSort, setStockSort, normalizedSearchQuery,
    filteredInventory, filteredSuppliers, filteredPurchaseOrders,
    selectedWarehouse, setSelectedWarehouse, selectedWarehouseRows, selectedWarehouseStats,
    destinationWarehouses, selectedSourceWarehouse,
    itemModalOpen, setItemModalOpen, warehouseModalOpen, setWarehouseModalOpen,
    adjustmentModalOpen, setAdjustmentModalOpen, transferModalOpen, setTransferModalOpen,
    receiptModalOpen, setReceiptModalOpen, returnModalOpen, setReturnModalOpen,
    editingItem, setEditingItem, supplierForm, setSupplierForm,
    branchTransferItemId, setBranchTransferItemId, branchTransferFromWh, setBranchTransferFromWh,
    branchTransferToWh, setBranchTransferToWh, branchTransferQty, setBranchTransferQty,
    branchTransferReason, setBranchTransferReason,
    isImportingInventory,
    handleSaveItem, handleDeleteItem, handleDeactivateSupplier, handleUpsertSupplier,
    exportInventoryTemplate, handleInventoryFileImport,
    handleSaveWarehouse, handleAdjustment, handleTransfer,
    handleDirectReceipt, handleSupplierReturn, handleZeroInventory, handleCreateBranchTransfer,
    aiForecasts, handleRequestForecast,
    countSession, setCountSession, blindCount, setBlindCount,
    countScan, setCountScan, countScanFilter, setCountScanFilter,
    countLoading, selectedCountWarehouse, setSelectedCountWarehouse,
    selectedCountDate, setSelectedCountDate, selectedCountType, setSelectedCountType,
    countHistory, countError, activeCountWarehouseName,
    loadCountHistory, handleStartCount, handleOpenCount, handlePrintCount,
    exportStockCount, handleUpdateCountItem, handleCompleteCount, handleZeroCountInputs,
    movementLog, movementLoading, movementDateFrom, setMovementDateFrom,
    movementDateTo, setMovementDateTo, movementTypeFilter, setMovementTypeFilter,
    movementSearch, setMovementSearch,
    loadMovements, toggleMovementType, filteredMovementRows, movementSummary,
    exportMovementsCsv, printMovements,
    consumptionRows, consumptionLoading, consumptionDateFrom, setConsumptionDateFrom,
    consumptionDateTo, setConsumptionDateTo, consumptionReportRows, consumptionTotals,
    exportRecipeConsumptionCsv, printRecipeConsumption, loadRecipeConsumption,
  };
}

export type InventoryWorkspace = ReturnType<typeof useInventoryWorkspace>;
