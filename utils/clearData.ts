import { setupApi } from '../services/api/setup';
import { localDb } from '../src/db/localDb';
import { useCRMStore } from '../stores/useCRMStore';
import { useFinanceStore } from '../stores/useFinanceStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useMenuStore } from '../stores/useMenuStore';
import { useOrderStore } from '../stores/useOrderStore';

const STORE_KEYS_TO_REMOVE = [
  'menu-storage',
  'order-storage',
  'crm-storage',
  'cc_held_orders',
];

const SESSION_KEY_PREFIXES_TO_REMOVE = [
  'restoflow_completion_receipt_',
];

const clearIndexedDbCaches = async () => {
  try {
    await localDb.menuCategories.clear();
    await localDb.menuItems.clear();
    await localDb.orders.clear();
    await localDb.customers.clear();
    await localDb.inventoryItems.clear();
    await localDb.auditLogs.clear();
    await localDb.syncQueue.clear();
  } catch (e) {
    console.warn('Error clearing IndexedDB caches', e);
  }
};

const clearPersistedUiState = () => {
  try {
    for (const key of STORE_KEYS_TO_REMOVE) {
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('Error clearing local persisted state', e);
  }

  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (SESSION_KEY_PREFIXES_TO_REMOVE.some((prefix) => key.startsWith(prefix))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch (e) {
    console.warn('Error clearing session persisted state', e);
  }
};

const resetClientStores = () => {
  useMenuStore.setState({
    menus: [{ id: 'menu-1', name: 'Main Menu', isDefault: true, status: 'ACTIVE', targetBranches: ['b1'] }],
    categories: [],
    platforms: [],
    printers: [],
    isLoading: false,
    error: null,
    lastSynced: null,
    activePriceListId: null,
  });

  useOrderStore.setState({
    orders: [],
    heldOrders: [],
    activeCart: [],
    tableDrafts: {},
    discount: 0,
    activeCoupon: null,
    recalledOrder: null,
    isLoading: false,
    isApplyingCoupon: false,
    error: null,
    tipAmount: 0,
  });

  useCRMStore.setState({
    customers: [],
    isLoading: false,
    error: null,
  });

  useInventoryStore.setState({
    inventory: [],
    suppliers: [],
    purchaseOrders: [],
    productionOrders: [],
    purchaseRequests: [],
    transferMovements: [],
    isLoading: false,
    error: null,
  });

  useFinanceStore.setState({
    activeShift: null,
    isShiftDrawerOpen: false,
    error: null,
  });
};

export async function clearAllData(): Promise<void> {
  if (navigator.onLine) {
    await setupApi.resetTestData();
  }

  await clearIndexedDbCaches();
  clearPersistedUiState();
  resetClientStores();
}
