/**
 * POS - Main Point of Sale Orchestrator
 * State management + layout composition only.
 * UI is delegated to: POSToolbar, POSItemsPanel, POSCartSidebar
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, X, LogOut, SlidersHorizontal, ArrowUpDown, LayoutGrid, Grid2x2, Plus, UtensilsCrossed, Truck, MapPin, Keyboard, UserPlus, Phone, Smartphone } from 'lucide-react';
import {
   Order, OrderItem, OrderStatus, Table, PaymentMethod,
   OrderType, Customer, PaymentRecord, RestaurantMenu,
   MenuCategory, AppPermission, RecipeIngredient, WarehouseType, JournalEntry, TableStatus, MenuItem
} from '@/types';
import { parseScaleBarcode } from '@/src/utils/barcodeParser';

import TableMap from '@/components/TableMap';
import POSHeader from './components/POSHeader';
import CategoryTabs from './components/CategoryTabs';
import ItemGrid from './components/ItemGrid';
import CartItem from './components/CartItem';
import PaymentSummary from './components/PaymentSummary';
import SplitBillModal from './components/SplitBillModal';
import NoteModal from './components/NoteModal';
import CustomerSelectView from './components/CustomerSelectView';
import CalculatorWidget from '@/components/common/CalculatorWidget';
import AddressMapPicker from '@/components/common/AddressMapPicker';
import { ShiftOverlays } from './components/ShiftOverlays';
import { ManagerApprovalModal } from './components/ManagerApprovalModal';
import TableManagementModal from './components/TableManagementModal';
import ItemOptionsModal from './components/ItemOptionsModal';
import HeldOrdersModal from './components/HeldOrdersModal';
import TakeawayNameModal from './components/TakeawayNameModal';
import POSToolbar from './components/POSToolbar';
import POSItemsPanel from './components/POSItemsPanel';
import RetailModePanel from './components/RetailModePanel';
import CategorySidebar from './components/CategorySidebar';
import SeatModal from './components/SeatModal';
import CourseModal from './components/CourseModal';
import POSCartSidebar from './components/POSCartSidebar';
import { printService } from '@/src/services/printService';
import { hasCashierPrinterConfigured, POS_PRINT_STATION_KEY, printKitchenTicketsByRouting, printOrderReceipt } from '@/services/posPrintOrchestrator';
import { useToast } from '@/components/Toast';
import { useModal } from '@/components/Modal';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { usePOSCatalog } from '@/hooks/usePOSCatalog';
import { usePOSKeyboardShortcuts } from '@/hooks/usePOSKeyboardShortcuts';

// Services
import { translations } from '@/services/translations';
import { getActionableErrorMessage, shiftsApi } from '@/services/api';
import { kdsApi } from '@/services/api/kds';

// Stores
import { useAuthStore } from '@/stores/useAuthStore';
import { useOrderStore } from '@/stores/useOrderStore';
import { useMenuStore } from '@/stores/useMenuStore';
import { useCRMStore } from '@/stores/useCRMStore';
import { useInventoryStore } from '@/stores/useInventoryStore';
import { useFinanceStore } from '@/stores/useFinanceStore';

import { generateOrderId, generateInternalId } from '@/src/utils/idGenerator';

const createCartId = () => generateInternalId();

const hasSameSelectedModifiers = (
   left: { selectedModifiers?: { groupName: string; optionName: string; price: number }[] },
   right: { groupName: string; optionName: string; price: number }[] = []
) => JSON.stringify(left.selectedModifiers || []) === JSON.stringify(right);

const POS: React.FC = () => {
   const POS_UI_PREFS_KEY = 'coduiszen_pos_ui_prefs_v1';
   const POS_ITEM_USAGE_KEY = 'coduiszen_pos_item_usage_v1';
   const POS_PAYMENT_PREFS_KEY = 'coduiszen_pos_payment_prefs_v1';
   const POS_CART_LAYOUT_KEY = 'coduiszen_pos_cart_layout_v1';
   // --- Global State (Selective Picking for Performance) ---
   const settings = useAuthStore(state => state.settings);
   const branches = useAuthStore(state => state.branches);
   const printers = useAuthStore(state => state.printers);
   const hasPermission = useAuthStore(state => state.hasPermission);
   const updateSettings = useAuthStore(state => state.updateSettings);

   const orders = useOrderStore(state => state.orders);
   const activeCart = useOrderStore(state => state.activeCart);
   const addToCart = useOrderStore(state => state.addToCart);
   const removeFromCart = useOrderStore(state => state.removeFromCart);
   const updateCartItemQuantity = useOrderStore(state => state.updateCartItemQuantity);
   const updateCartItemNotes = useOrderStore(state => state.updateCartItemNotes);
   const updateCartItemSeat = useOrderStore(state => state.updateCartItemSeat);
   const updateCartItemCourse = useOrderStore(state => state.updateCartItemCourse);
   const clearCart = useOrderStore(state => state.clearCart);
   const placeOrder = useOrderStore(state => state.placeOrder);
   const activeOrderType = useOrderStore(state => state.activeOrderType);
   const setOrderMode = useOrderStore(state => state.setOrderMode);
   const discount = useOrderStore(state => state.discount);
   const setDiscount = useOrderStore(state => state.setDiscount);
   const tipAmount = useOrderStore(state => state.tipAmount) || 0;
   const setTipAmount = useOrderStore(state => state.setTipAmount);
   const activeCoupon = useOrderStore(state => state.activeCoupon);
   const applyCoupon = useOrderStore(state => state.applyCoupon);
   const clearCoupon = useOrderStore(state => state.clearCoupon);
   const holdOrder = useOrderStore(state => state.holdOrder);
   const heldOrders = useOrderStore(state => state.heldOrders);
   const recallOrder = useOrderStore(state => state.recallOrder);
   const recalledOrder = useOrderStore(state => state.recalledOrder);
   const clearRecalledOrder = useOrderStore(state => state.clearRecalledOrder);
   const tables = useOrderStore(state => state.tables);
   const zones = useOrderStore(state => state.zones);
   const transferTable = useOrderStore(state => state.transferTable);
   const transferItems = useOrderStore(state => state.transferItems);
   const splitTable = useOrderStore(state => state.splitTable);
   const loadTableOrder = useOrderStore(state => state.loadTableOrder);
   const fetchTables = useOrderStore(state => state.fetchTables);
   const updateTableStatus = useOrderStore(state => state.updateTableStatus);
   const updateOrderStatus = useOrderStore(state => state.updateOrderStatus);
   const tableDrafts = useOrderStore(state => state.tableDrafts);
   const saveTableDraft = useOrderStore(state => state.saveTableDraft);
   const loadTableDraft = useOrderStore(state => state.loadTableDraft);
   const clearTableDraft = useOrderStore(state => state.clearTableDraft);

   const menus = useMenuStore(state => state.menus);
   const categories = useMenuStore(state => state.categories);
   const deliveryPlatforms = useMenuStore(state => state.platforms);
   const activePriceListId = useMenuStore(state => state.activePriceListId);
   const setPriceList = useMenuStore(state => state.setPriceList);
   const fetchMenu = useMenuStore(state => state.fetchMenu);
   const fetchPlatforms = useMenuStore(state => state.fetchPlatforms);
   const customers = useCRMStore(state => state.customers);
   const inventory = useInventoryStore(state => state.inventory);
   const updateStock = useInventoryStore(state => state.updateStock);
   const warehouses = useInventoryStore(state => state.warehouses);
   const recordTransaction = useFinanceStore(state => state.recordTransaction);

   const branchId = settings.activeBranchId || branches.find(b => b.isActive !== false)?.id || branches[0]?.id || 'b1';
   const activeBranch = branches.find(b => b.id === branchId);
   const lang = settings.language;
   const t = translations[lang];
   const isDarkMode = settings.isDarkMode;
   const isTouchMode = settings.isTouchMode;
   const currencySymbol = settings.currencySymbol;
   const safeActiveCart = activeCart || [];
   const previousBranchIdRef = useRef(branchId);
   const [currentPrintStationId, setCurrentPrintStationId] = useState(() => {
      try { return localStorage.getItem(POS_PRINT_STATION_KEY) || ''; } catch { return ''; }
   });

   // --- Local State ---
   const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
   const [managedTableId, setManagedTableId] = useState<string | null>(null);
   const [deliveryCustomer, setDeliveryCustomer] = useState<Customer | null>(null);
   // cart is now activeCart from store
   const [activeCategory, setActiveCategory] = useState<string>('all');
   const [searchQuery, setSearchQuery] = useState('');
   const [editingSeatItemId, setEditingSeatItemId] = useState<string | null>(null);
   const [seatInput, setSeatInput] = useState<number | undefined>(undefined);

   const [editingCourseItemId, setEditingCourseItemId] = useState<string | null>(null);
   const [courseInput, setCourseInput] = useState<string | undefined>(undefined);

   const [categorySidebarCollapsed, setCategorySidebarCollapsed] = useState(() => false);
   const [itemFilter, setItemFilter] = useState<'all' | 'available' | 'popular'>('all');
   const [itemSort, setItemSort] = useState<'smart' | 'name' | 'price_asc' | 'price_desc'>('smart');
   const [itemDensity, setItemDensity] = useState<'comfortable' | 'compact' | 'ultra' | 'buttons'>('compact');
   const [posMode, setPosMode] = useState<'grid' | 'retail'>('grid');
   const [editingItemId, setEditingItemId] = useState<string | null>(null);
   const [noteInput, setNoteInput] = useState('');
   const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
   const [splitPayments, setSplitPayments] = useState<PaymentRecord[]>([]);
   const [showSplitModal, setShowSplitModal] = useState(false);
   const [showCalculator, setShowCalculator] = useState(false);
   const [showApprovalModal, setShowApprovalModal] = useState(false);
   const [showHeldOrdersModal, setShowHeldOrdersModal] = useState(false);
   const [showOrderNameModal, setShowOrderNameModal] = useState(false);
   const [orderName, setOrderName] = useState('');
   const [isCartOpenMobile, setIsCartOpenMobile] = useState(false);
   const [showMobileFilters, setShowMobileFilters] = useState(false);
   const [isTabletViewport, setIsTabletViewport] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 1180 : false);
   const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
   const [showCategoryStrip, setShowCategoryStrip] = useState(true);
   const [cartPanelWidth, setCartPanelWidth] = useState<'compact' | 'normal' | 'wide'>('normal');
   const [isPaymentPanelCollapsed, setIsPaymentPanelCollapsed] = useState(false);
   const [cartSearchQuery, setCartSearchQuery] = useState('');
   const [couponCode, setCouponCode] = useState('');
   const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
   const [approvalCallback, setApprovalCallback] = useState<{ fn: () => void; action: string } | null>(null);
   const [showCustomerModal, setShowCustomerModal] = useState(false);
   const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string; address: string; lat?: number; lng?: number; addressLabel?: string }>({ name: '', phone: '', address: '' });
   const [deliverySource, setDeliverySource] = useState('restaurant');
   const [externalOrderNumber, setExternalOrderNumber] = useState('');
   const [platformDeliveryDraft, setPlatformDeliveryDraft] = useState({
      customerName: '',
      customerPhone: '',
      address: '',
      notes: '',
      paymentStatus: 'UNKNOWN',
   });
   const [orderNote, setOrderNote] = useState('');
   const addCustomer = useCRMStore(state => state.addCustomer);


   // --- Item Options / Discount / Void Reason State ---
   const [selectedItemForOptions, setSelectedItemForOptions] = useState<MenuItem | null>(null);
   const [editingDiscountItemId, setEditingDiscountItemId] = useState<string | null>(null);
   const [itemDiscountType, setItemDiscountType] = useState<'percent' | 'flat'>('percent');
   const [itemDiscountValue, setItemDiscountValue] = useState('');

   // --- Audio Feedback Refs ---
   const scanSuccessAudioRef = useRef<HTMLAudioElement | null>(null);
   const scanErrorAudioRef = useRef<HTMLAudioElement | null>(null);
   const activeShift = useFinanceStore(state => state.activeShift);
   const setShift = useFinanceStore(state => state.setShift);
   const isShiftDrawerOpen = useFinanceStore(state => state.isShiftDrawerOpen);
   const setIsShiftDrawerOpen = useFinanceStore(state => state.setIsShiftDrawerOpen);

   const [isOnline, setIsOnline] = useState(navigator.onLine);
   const [nowTick, setNowTick] = useState(Date.now());
   const [itemUsageMap, setItemUsageMap] = useState<Record<string, number>>({});
   const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
   const { showToast } = useToast();
   const { showModal } = useModal();
   const navigate = useNavigate();

   const requestManagerApproval = useCallback((action: string, fn: () => void | Promise<void>) => {
      setApprovalCallback({
         action,
         fn: async () => {
            try {
               await fn();
            } catch (error: any) {
               showToast(
                  getActionableErrorMessage(error, (settings.language || 'en') as 'en' | 'ar'),
                  'error'
               );
            } finally {
               setApprovalCallback(null);
            }
         }
      });
      setShowApprovalModal(true);
   }, [showToast, settings.language]);

   const handleExitToDashboard = useCallback(() => {
        if (hasPermission(AppPermission.NAV_DASHBOARD) || hasPermission(AppPermission.NAV_ADMIN_DASHBOARD)) {
            navigate('/');
        } else {
            requestManagerApproval(settings.language === 'ar' ? 'الخروج للوحة التحكم' : 'Exit to Dashboard', () => { navigate('/'); });
        }
   }, [hasPermission, navigate, requestManagerApproval, settings.language]);

   useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
                e.preventDefault();
                handleExitToDashboard();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
   }, [handleExitToDashboard]);

   // ?? Fetch menu data from database on POS mount
   useEffect(() => {
      fetchMenu(true);
      fetchPlatforms();
      if (branchId) fetchTables(branchId);
   }, [fetchMenu, fetchPlatforms, fetchTables, branchId]);

   useEffect(() => {
      const previousBranchId = previousBranchIdRef.current;
      if (previousBranchId === branchId) return;

      previousBranchIdRef.current = branchId;
      setSelectedTableId(null);
      setManagedTableId(null);
      setDeliveryCustomer(null);
      setDeliverySource('restaurant');
      setExternalOrderNumber('');
      setOrderNote('');
      setSplitPayments([]);
      setPaymentMethod(PaymentMethod.CASH);
      setCouponCode('');
      clearCoupon();
      setActiveCategory('all');

      if (safeActiveCart.length > 0) {
         clearCart();
         showToast(
            lang === 'ar'
               ? 'تم تغيير الفرع وتفريغ السلة لتجنب تسجيل البيع على فرع خطأ'
               : 'Branch changed. Cart cleared to avoid posting the sale to the wrong branch.',
            'success'
         );
      } else {
         showToast(
            lang === 'ar'
               ? `تم التحويل إلى ${activeBranch?.nameAr || activeBranch?.name || 'الفرع المختار'}`
               : `Switched to ${activeBranch?.name || 'selected branch'}`,
            'success'
         );
      }
   }, [activeBranch?.name, activeBranch?.nameAr, branchId, clearCart, clearCoupon, lang, safeActiveCart.length, showToast]);

   useEffect(() => {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
         window.removeEventListener('online', handleOnline);
         window.removeEventListener('offline', handleOffline);
      };
   }, []);

   useEffect(() => {
      const timer = setInterval(() => setNowTick(Date.now()), 60000);
      return () => clearInterval(timer);
   }, []);

   useEffect(() => {
      const updateViewport = () => {
         const isTablet = window.innerWidth <= 1180;
         setIsTabletViewport(isTablet);
         setIsMobileViewport(window.innerWidth < 768);
         if (!isTablet) {
            setShowCategoryStrip(true);
         }
      };
      updateViewport();
      window.addEventListener('resize', updateViewport);
      return () => window.removeEventListener('resize', updateViewport);
   }, []);

   useEffect(() => {
      try {
         const raw = localStorage.getItem(POS_UI_PREFS_KEY);
         if (!raw) return;
         const parsed = JSON.parse(raw);
         if (parsed?.itemFilter && ['all', 'available', 'popular'].includes(parsed.itemFilter)) {
            setItemFilter(parsed.itemFilter);
         }
         if (parsed?.itemSort && ['smart', 'name', 'price_asc', 'price_desc'].includes(parsed.itemSort)) {
            setItemSort(parsed.itemSort);
         }
         if (parsed?.itemDensity && ['comfortable', 'compact', 'ultra', 'buttons'].includes(parsed.itemDensity)) {
            setItemDensity(parsed.itemDensity);
         }
         if (parsed?.posMode && ['grid', 'retail'].includes(parsed.posMode)) {
            setPosMode(parsed.posMode);
         }
      } catch {
         // ignore malformed local prefs
      }
   }, []);

   useEffect(() => {
      try {
         localStorage.setItem(POS_UI_PREFS_KEY, JSON.stringify({
            itemFilter,
            itemSort,
            itemDensity,
            posMode
         }));
      } catch {
         // ignore storage errors
      }
   }, [itemFilter, itemSort, itemDensity, posMode]);

   useEffect(() => {
      try {
         const raw = localStorage.getItem(POS_ITEM_USAGE_KEY);
         if (!raw) return;
         const parsed = JSON.parse(raw);
         if (parsed && typeof parsed === 'object') setItemUsageMap(parsed);
      } catch {
         // ignore malformed usage data
      }
   }, []);

   useEffect(() => {
      try {
         localStorage.setItem(POS_ITEM_USAGE_KEY, JSON.stringify(itemUsageMap));
      } catch {
         // ignore storage errors
      }
   }, [itemUsageMap]);

   useEffect(() => {
      try {
         const raw = localStorage.getItem(POS_CART_LAYOUT_KEY);
         if (!raw) return;
         const parsed = JSON.parse(raw);
         if (parsed?.cartPanelWidth && ['compact', 'normal', 'wide'].includes(parsed.cartPanelWidth)) {
            setCartPanelWidth(parsed.cartPanelWidth);
         }
         if (typeof parsed?.isPaymentPanelCollapsed === 'boolean') {
            setIsPaymentPanelCollapsed(parsed.isPaymentPanelCollapsed);
         }
      } catch {
         // ignore malformed layout prefs
      }
   }, []);

   useEffect(() => {
      try {
         localStorage.setItem(POS_CART_LAYOUT_KEY, JSON.stringify({
            cartPanelWidth,
            isPaymentPanelCollapsed,
         }));
      } catch {
         // ignore storage errors
      }
   }, [cartPanelWidth, isPaymentPanelCollapsed]);

   useEffect(() => {
      try {
         const raw = localStorage.getItem(POS_PAYMENT_PREFS_KEY);
         if (!raw) return;
         const parsed = JSON.parse(raw);
         if (parsed && typeof parsed === 'object') {
            paymentPrefsRef.current = parsed;
         }
      } catch {
         // ignore malformed payment prefs
      }
   }, []);

   useEffect(() => {
      const preferred = paymentPrefsRef.current[activeOrderType];
      if (preferred) {
         setPaymentMethod(preferred);
      } else {
         setPaymentMethod(PaymentMethod.CASH);
      }
   }, [activeOrderType]);

   useEffect(() => {
      if (!lastAddedItemId) return;
      const timer = window.setTimeout(() => setLastAddedItemId(null), 700);
      return () => window.clearTimeout(timer);
   }, [lastAddedItemId]);

   // Default menu
   const activeMenuId = (menus || []).find(m => m.isDefault)?.id || (menus || [])[0]?.id;

   const searchInputRef = useRef<HTMLInputElement>(null);
   const tableNumberBufferRef = useRef('');
   const tableNumberTimerRef = useRef<number | null>(null);
   const paymentPrefsRef = useRef<Partial<Record<OrderType, PaymentMethod>>>({});
   // --- Derived Data ---
   const {
      categoryHotkeys,
      categoryResultCounts,
      currentCategories,
      indexedItems,
      normalizedSearchQuery,
      pricedItems,
      quickCategoryNav,
      quickPickItems,
      totalMatchedAcrossCategories,
      upsellSuggestions,
   } = usePOSCatalog({
      activeCategory,
      activeOrderType,
      activePriceListId,
      branchId,
      categories,
      itemFilter,
      itemSort,
      itemUsageMap,
      lang,
      nowTick,
      searchQuery,
      safeActiveCart,
   });

   useEffect(() => {
      if (activeCategory === 'all') return;
      const currentCount = categoryResultCounts[activeCategory] || 0;
      if (currentCount > 0) return;

      const firstAvailableCategory = currentCategories.find(c => (categoryResultCounts[c.id] || 0) > 0);
      setActiveCategory(firstAvailableCategory?.id || 'all');
   }, [activeCategory, categoryResultCounts, currentCategories]);

   const itemDiscountTotal = useMemo(() =>
      safeActiveCart.reduce((sum, item) => sum + ((item as any).discountAmount || 0) * item.quantity, 0),
      [safeActiveCart]
   );

   const { cartSubtotal, cartTotal, cartTax, orderDiscountAmount } = useMemo(() => {
      const subtotal = safeActiveCart.reduce((acc, item) => {
         const modsPrice = (item.selectedModifiers || []).reduce((sum, mod) => sum + (mod.price || 0), 0);
         return acc + (((item.price || 0) + modsPrice) * (item.quantity || 0));
      }, 0);
      const safeDiscount = Number(discount) || 0;
      const orderDiscountAmount = subtotal * (safeDiscount / 100);
      const afterDiscount = Math.max(0, subtotal - orderDiscountAmount - (itemDiscountTotal || 0));
      const configuredTaxRate = Math.max(0, Number(settings.taxRate ?? activeBranch?.taxRate ?? 14)) / 100;
      const tax = afterDiscount * configuredTaxRate;
      const total = afterDiscount + tax + (tipAmount || 0);
      return { cartSubtotal: subtotal, cartTotal: total, cartTax: tax, orderDiscountAmount };
   }, [safeActiveCart, discount, tipAmount, itemDiscountTotal, settings.taxRate, activeBranch?.taxRate]);

   const cartQuery = useMemo(() => cartSearchQuery.trim().toLowerCase(), [cartSearchQuery]);
   const filteredCartItems = useMemo(() => {
      if (!cartQuery) return safeActiveCart;
      return safeActiveCart.filter((item) => {
         const name = String(lang === 'ar' ? (item.nameAr || item.name) : item.name).toLowerCase();
         const note = String(item.notes || '').toLowerCase();
         return name.includes(cartQuery) || note.includes(cartQuery);
      });
   }, [safeActiveCart, cartQuery, lang]);

   const cartStats = useMemo(() => {
      const totalQty = safeActiveCart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      return {
         lines: safeActiveCart.length,
         qty: totalQty,
      };
   }, [safeActiveCart]);

   const currentOrderPreview = useMemo(() => {
      if (safeActiveCart.length === 0) return [];
      return safeActiveCart.slice(0, 3).map((item) => ({
         id: item.cartId,
         name: lang === 'ar' ? (item.nameAr || item.name) : item.name,
         quantity: Number(item.quantity || 0),
      }));
   }, [safeActiveCart, lang]);

   // --- Shift Sync ---
   useEffect(() => {
      let cancelled = false;
      const syncShift = async () => {
         const activeBranchId = settings.activeBranchId;
         if (!activeBranchId) {
            if (!cancelled && activeShift) setShift(null);
            return;
         }
         if (activeShift?.branchId === activeBranchId) return;
         if (activeShift && !cancelled) setShift(null);
         try {
            const shift = await shiftsApi.getActive(activeBranchId);
            if (!cancelled) setShift(shift);
         } catch (e) {
            if (!cancelled) {
               setShift(null);
            }
         }
      };
      syncShift();
      return () => { cancelled = true; };
   }, [activeShift, settings.activeBranchId, setShift]);

   // --- Effects ---
   useEffect(() => {
      if (recalledOrder) {
         // Active cart is already set by store recallOrder action
         if (recalledOrder.tableId) setSelectedTableId(recalledOrder.tableId);
         if (recalledOrder.customerId) {
            const customer = customers.find(c => c.id === recalledOrder.customerId);
            if (customer) setDeliveryCustomer(customer);
         }
         clearRecalledOrder(); // Clear the "signal"
      }
   }, [recalledOrder, customers, clearRecalledOrder]);

   const sortedTables = useMemo(() => {
      const normalize = (value?: string) => {
         if (!value) return { num: Number.MAX_SAFE_INTEGER, text: '' };
         const match = value.match(/\d+/);
         const num = match ? parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
         return { num, text: value.toLowerCase() };
      };
      return [...tables].sort((a, b) => {
         const aKey = normalize(a.name || a.id);
         const bKey = normalize(b.name || b.id);
         if (aKey.num !== bKey.num) return aKey.num - bKey.num;
         return aKey.text.localeCompare(bKey.text);
      });
   }, [tables]);

   const cashierPrintStations = useMemo(() => {
      return (printers || [])
         .filter((printer: any) => {
            const roles = Array.isArray(printer.roles) && printer.roles.length > 0 ? printer.roles : (printer.role ? [printer.role] : []);
            return printer.isActive
               && (!printer.branchId || printer.branchId === branchId)
               && roles.map((role: string) => String(role).toUpperCase()).includes('CASHIER')
               && (printer.gatewayId || printer.stationId || printer.code || printer.id);
         })
         .map((printer: any) => ({
            id: String(printer.gatewayId || printer.stationId || printer.code || printer.id),
            label: printer.name || printer.code || printer.id,
         }));
   }, [printers, branchId]);

   const handlePrintStationChange = useCallback((stationId: string) => {
      setCurrentPrintStationId(stationId);
      try {
         if (stationId) localStorage.setItem(POS_PRINT_STATION_KEY, stationId);
         else localStorage.removeItem(POS_PRINT_STATION_KEY);
      } catch {
         // ignore storage errors
      }
   }, []);

   const currentTableIndex = useMemo(() => {
      if (!selectedTableId) return -1;
      return sortedTables.findIndex(t => t.id === selectedTableId);
   }, [sortedTables, selectedTableId]);

   const saveCurrentTableDraft = useCallback(() => {
      if (!selectedTableId) return;
      if (safeActiveCart.length > 0 || discount > 0) {
         saveTableDraft(selectedTableId, safeActiveCart, discount);
      } else {
         clearTableDraft(selectedTableId);
      }
   }, [safeActiveCart, discount, selectedTableId, saveTableDraft, clearTableDraft]);

   const switchToTable = useCallback((tableId: string) => {
      if (!tableId) return;
      if (tableId === selectedTableId && activeOrderType === OrderType.DINE_IN) return;

      if (activeOrderType === OrderType.DINE_IN) {
         saveCurrentTableDraft();
      }

      const activeOrder = orders.find(o => o.tableId === tableId && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status as string));
      if (activeOrder) {
         loadTableOrder(tableId);
         clearTableDraft(tableId);
      } else if (tableDrafts[tableId]) {
         loadTableDraft(tableId);
      } else {
         clearCart();
         setDiscount(0);
      }

      setSelectedTableId(tableId);
   }, [
      activeOrderType,
      selectedTableId,
      orders,
      tableDrafts,
      saveCurrentTableDraft,
      loadTableOrder,
      loadTableDraft,
      clearTableDraft,
      clearCart,
      setDiscount
   ]);

   const leaveTable = useCallback(() => {
      if (!selectedTableId) return;
      saveCurrentTableDraft();
      clearCart();
      setSelectedTableId(null);
      setIsCartOpenMobile(false);
   }, [selectedTableId, saveCurrentTableDraft, clearCart]);

   const findTableByNumber = useCallback((value: string) => {
      const normalized = value.replace(/^0+/, '');
      return tables.find((table) => {
         const label = table.name || table.id || '';
         const match = label.match(/\d+/);
         if (!match) return false;
         const tableNumber = match[0].replace(/^0+/, '');
         return tableNumber === normalized;
      });
   }, [tables]);

   const showMap = activeOrderType === OrderType.DINE_IN && !selectedTableId;
   const showCustomerSelect = activeOrderType === OrderType.DELIVERY && !deliveryCustomer;

   const handleSetPaymentMethod = useCallback((method: PaymentMethod) => {
      setPaymentMethod(method);
      const nextPrefs: Partial<Record<OrderType, PaymentMethod>> = {
         ...paymentPrefsRef.current,
         [activeOrderType]: method,
      };
      paymentPrefsRef.current = nextPrefs;
      try {
         localStorage.setItem(POS_PAYMENT_PREFS_KEY, JSON.stringify(nextPrefs));
      } catch {
         // ignore storage errors
      }
   }, [activeOrderType]);

   const handleHoldOrder = useCallback(() => {
      if (safeActiveCart.length === 0) return;
      holdOrder({
         id: generateInternalId(),
         cart: [...safeActiveCart],
         customerId: deliveryCustomer?.id,
         customerName: orderName || deliveryCustomer?.name,
         timestamp: new Date(),
         tableId: selectedTableId || undefined,
         notes: `Saved at ${new Date().toLocaleTimeString()}`
      });
      setOrderName('');
      setDeliveryCustomer(null);
      setDeliverySource('restaurant');
      setExternalOrderNumber('');
      setOrderNote('');
      if (activeOrderType === OrderType.DINE_IN && selectedTableId) {
         leaveTable();
      } else {
         clearCart();
      }
      showToast(lang === 'ar' ? 'تم تعليق الفاتورة' : 'Order Put on Hold', 'success');
   }, [safeActiveCart, deliveryCustomer, orderName, selectedTableId, holdOrder, clearCart, leaveTable, activeOrderType, lang, showToast]);

   const handleRecallOrder = useCallback((index: number) => {
      recallOrder(index);
      const recalled = heldOrders[index];
      if (recalled) {
          if (recalled.customerName) setOrderName(recalled.customerName);
          if (recalled.tableId) {
               setOrderMode(OrderType.DINE_IN);
               switchToTable(recalled.tableId);
          } else if (recalled.customerId) {
               setOrderMode(OrderType.DELIVERY);
               const customer = customers.find(c => c.id === recalled.customerId);
               if (customer) setDeliveryCustomer(customer);
          } else {
               setOrderMode(OrderType.TAKEAWAY);
          }
      }
      showToast(lang === 'ar' ? 'تم استدعاء الفاتورة بنجاح' : 'Order Recalled Successfully', 'success');
   }, [recallOrder, heldOrders, customers, setOrderMode, switchToTable, lang, showToast]);


   // --- Audio Feedback ---
   const playAudioFeedback = useCallback((type: 'success' | 'error') => {
      try {
         const audio = type === 'success' ? scanSuccessAudioRef.current : scanErrorAudioRef.current;
         if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
         }
      } catch {
         // Audio playback is non-critical
      }
   }, []);

   const trackItemUsage = useCallback((itemId: string, quantity = 1) => {
      setItemUsageMap((prev) => ({
         ...prev,
         [itemId]: (prev[itemId] || 0) + quantity,
      }));
   }, []);

   const appendItemToCart = useCallback((
      item: MenuItem,
      selectedModifiers: { groupName: string; optionName: string; price: number }[] = [],
      quantity = 1,
   ) => {
      const existingItem = safeActiveCart.find((cartItem) =>
         cartItem.id === item.id && hasSameSelectedModifiers(cartItem, selectedModifiers)
      );

      if (existingItem && selectedModifiers.length === 0 && quantity === 1) {
         updateCartItemQuantity(existingItem.cartId, 1);
      } else {
         for (let index = 0; index < quantity; index += 1) {
            addToCart({
               ...item,
               cartId: createCartId(),
               quantity: 1,
               selectedModifiers,
            });
         }
      }

      setLastAddedItemId(item.id);
      trackItemUsage(item.id, quantity);

      // Provide subtle audio feedback instead of abruptly opening the cart
      playAudioFeedback('success');

      // Auto-clear highlight after a highly responsive delay
      setTimeout(() => {
          setLastAddedItemId(prev => prev === item.id ? null : prev);
      }, 400);

   }, [addToCart, safeActiveCart, trackItemUsage, updateCartItemQuantity, playAudioFeedback]);

   // --- Barcode Scanner Integration ---
   useBarcodeScanner({
      enabled: true,
      onScan: (code) => {
         const scaleInfo = parseScaleBarcode(code);
         const matched = indexedItems.find((item) => {
            const barcode = String((item as any).barcode || '').toLowerCase();
            const sku = String((item as any).sku || '').toLowerCase();
            if (scaleInfo) {
               const coreCode = scaleInfo.itemCode.replace(/^0+/, '');
               return sku.replace(/^0+/, '') === coreCode || barcode.replace(/^0+/, '') === coreCode;
            }
            return barcode === code.toLowerCase() || sku === code.toLowerCase();
         });

         if (matched) {
            if (scaleInfo && matched.isWeighted) {
               // Calculate quantity from embedded weight/price and bypass options modal
               appendItemToCart(matched, [], scaleInfo.weightOrPrice);
            } else {
               // Use standard handleAddItem for regular scanning
               handleAddItem(matched);
            }
            playAudioFeedback('success');
            showToast(
               lang === 'ar'
                  ? `تمت إضافة ${matched.nameAr || matched.name}`
                  : `${matched.name} added`,
               'success'
            );
         } else {
            playAudioFeedback('error');
            showToast(
               lang === 'ar'
                  ? `لم يتم العثور على منتج للكود: ${code}`
                  : `No product found for code: ${code}`,
               'error'
            );
         }
      }
   });

   // --- Handlers (Memoized to prevent child re-renders) ---
   const handleAddItem = useCallback((item: any) => {
      // If item has sizes or modifierGroups, show options modal
      if ((item.sizes && item.sizes.length > 0) || (item.modifierGroups && item.modifierGroups.length > 0) || item.price === 0 || item.isWeighted) {
         setSelectedItemForOptions(item);
         return;
      }

      appendItemToCart(item);
      playAudioFeedback('success');
   }, [appendItemToCart, playAudioFeedback]);

   const handleConfirmItemOptions = useCallback((item: MenuItem, selectedModifiers: { groupName: string; optionName: string; price: number }[], quantity: number) => {
      appendItemToCart(item, selectedModifiers, quantity);
      setSelectedItemForOptions(null);
      playAudioFeedback('success');
   }, [appendItemToCart, playAudioFeedback]);

   const handleEditItemDiscount = useCallback((cartId: string) => {
      setEditingDiscountItemId(cartId);
      const item = safeActiveCart.find(i => i.cartId === cartId);
      const existingDiscount = (item as any)?.discountPercent;
      if (existingDiscount) {
         setItemDiscountType('percent');
         setItemDiscountValue(String(existingDiscount));
      } else {
         setItemDiscountValue('');
      }
   }, [safeActiveCart]);

   const handleApplyItemDiscount = useCallback(() => {
      if (!editingDiscountItemId) return;
      const val = parseFloat(itemDiscountValue) || 0;
      const item = safeActiveCart.find(i => i.cartId === editingDiscountItemId);
      if (!item) { setEditingDiscountItemId(null); return; }
      const modsPrice = (item.selectedModifiers || []).reduce((s, m) => s + m.price, 0);
      const basePrice = item.price + modsPrice;
      const discountAmount = itemDiscountType === 'percent'
         ? (basePrice * Math.min(val, 100)) / 100
         : Math.min(val, basePrice);
      const updatedItem = { ...item, discountPercent: itemDiscountType === 'percent' ? val : undefined, discountAmount } as any;
      removeFromCart(editingDiscountItemId);
      addToCart(updatedItem);
      setEditingDiscountItemId(null);
   }, [editingDiscountItemId, itemDiscountValue, itemDiscountType, safeActiveCart, removeFromCart, addToCart]);

   const handleRemoveWithReason = useCallback((cartId: string) => {
      const item = safeActiveCart.find(i => i.cartId === cartId);
      if (item && item.quantity > 1) {
         updateCartItemQuantity(cartId, -1);
         return;
      }
      removeFromCart(cartId);
      showToast(
         lang === 'ar' ? 'تم حذف الصنف' : 'Item removed',
         'success'
      );
   }, [safeActiveCart, updateCartItemQuantity, removeFromCart, showToast, lang]);


   const handleSetActiveCategory = useCallback((catId: string) => {
      setActiveCategory(catId);
   }, []);

   const handleUpdateQuantity = useCallback((cartId: string, delta: number) => {
      updateCartItemQuantity(cartId, delta);
   }, [updateCartItemQuantity]);

   const handleRemoveOneFromCart = useCallback((itemId: string) => {
      const itemsOfThisType = safeActiveCart.filter(ci => ci.id === itemId);
      if (itemsOfThisType.length > 0) {
         const itemToUpdate = itemsOfThisType[itemsOfThisType.length - 1];
         handleUpdateQuantity(itemToUpdate.cartId, -1);
      }
   }, [safeActiveCart, handleUpdateQuantity]);

   const handleQuickPay = useCallback(async () => {
      handleSetPaymentMethod(PaymentMethod.CASH);
      setTimeout(() => handleSubmitOrder(), 0);
   }, [handleSetPaymentMethod]);

   const performCloseTable = async (tableId: string) => {
       const activeOrder = orders.find(o => o.tableId === tableId && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status as string));
       try {
          if (activeOrder) {
             await updateOrderStatus(activeOrder.id, OrderStatus.COMPLETED);
          } else {
             await updateTableStatus(tableId, TableStatus.AVAILABLE);
          }
          clearTableDraft(tableId);
          setManagedTableId(null);
          showToast(t.table_closed || (lang === 'ar' ? 'تم إغلاق الترابيزة' : 'Table closed'), 'success');
       } catch {
          showToast(lang === 'ar' ? 'تعذر إغلاق الترابيزة' : 'Failed to close table', 'error');
       }
   };

   const handleCloseTable = async (tableId: string) => {
      await performCloseTable(tableId);
   };

   const handleMergeTables = async (sourceTableId: string, targetTableId: string, itemCartIds: string[]) => {
      if (!sourceTableId || !targetTableId || sourceTableId === targetTableId) return;

      const sourceOrder = orders.find(o => o.tableId === sourceTableId && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status as string));
      if (!sourceOrder) {
         showToast(lang === 'ar' ? 'لا يوجد طلب على الطاولة المصدر' : 'No active order on source table', 'error');
         return;
      }

      const sourceItemIds = (sourceOrder.items || []).map(i => i.cartId);
      const idsToMove = (itemCartIds && itemCartIds.length > 0) ? itemCartIds : sourceItemIds;
      if (idsToMove.length === 0) {
         showToast(lang === 'ar' ? 'اختر أصناف للدمج' : 'Select items to merge', 'error');
         return;
      }

      const movingAll = idsToMove.length === sourceItemIds.length;
      if (movingAll) {
         await transferTable(sourceTableId, targetTableId);
         clearTableDraft(sourceTableId);
         setManagedTableId(null);
         showToast(t.tables_merged || (lang === 'ar' ? 'تم دمج الترابيزات' : 'Tables merged'), 'success');
         return;
      }

      await transferItems(sourceTableId, targetTableId, idsToMove);
      await updateTableStatus(targetTableId, TableStatus.OCCUPIED);

      const remainingCount = (sourceOrder.items || []).filter(i => !idsToMove.includes(i.cartId)).length;
      if (remainingCount === 0) {
         await updateTableStatus(sourceTableId, TableStatus.AVAILABLE);
         clearTableDraft(sourceTableId);
      }

      setManagedTableId(null);
      showToast(t.tables_merged || (lang === 'ar' ? 'تم دمج الترابيزات' : 'Tables merged'), 'success');
   };

   const handleTempBill = async (tableId: string) => {
      const activeOrder = orders.find(o => o.tableId === tableId && o.status !== OrderStatus.DELIVERED);
      if (!activeOrder) return;
      try {
         await printOrderReceipt({
            order: activeOrder,
            printers,
            title: t.temp_bill || 'Temporary Bill',
            settings,
            currencySymbol,
            lang,
            t,
            branch: activeBranch
         });
         showToast(t.temp_bill_printed || (lang === 'ar' ? 'تم إرسال الشيك المؤقت للطباعة' : 'Temporary bill queued for printing'), 'success');
      } catch {
         showToast(lang === 'ar' ? 'تعذرت طباعة الشيك المؤقت. راجع إعدادات الطابعة والـBridge.' : 'Temporary bill print failed. Check printer and bridge settings.', 'error');
      }
   };

   const buildOrderNotes = () => {
      const notes: string[] = [];
      const cleanOrderNote = orderNote.trim();
      const cleanExternalOrder = externalOrderNumber.trim();
      if (cleanOrderNote) notes.push(cleanOrderNote);
      if (activeOrderType === OrderType.DELIVERY && deliverySource !== 'restaurant' && cleanExternalOrder) {
         notes.push(`Platform order: ${cleanExternalOrder}`);
      }
      if (activeOrderType === OrderType.DELIVERY && deliverySource !== 'restaurant' && platformDeliveryDraft.paymentStatus !== 'UNKNOWN') {
         notes.push(`Platform payment: ${platformDeliveryDraft.paymentStatus}`);
      }
      if (activeOrderType === OrderType.DELIVERY && deliverySource !== 'restaurant' && platformDeliveryDraft.notes.trim()) {
         notes.push(`Platform notes: ${platformDeliveryDraft.notes.trim()}`);
      }
      return notes.length > 0 ? notes.join('\n') : undefined;
   };

   const buildDraftOrder = (withPayment: boolean): Order => ({
      id: generateOrderId(),
      type: activeOrderType,
      branchId: branchId,
      shiftId: activeShift?.id,
      tableId: selectedTableId || undefined,
      customerId: activeOrderType === OrderType.DELIVERY && deliverySource === 'restaurant' ? deliveryCustomer?.id : undefined,
      customerName: activeOrderType === OrderType.DELIVERY ? (orderName || deliveryCustomer?.name) : orderName || undefined,
      customerPhone: activeOrderType === OrderType.DELIVERY ? deliveryCustomer?.phone : undefined,
      deliveryAddress: activeOrderType === OrderType.DELIVERY ? deliveryCustomer?.address : undefined,
      deliveryLat: activeOrderType === OrderType.DELIVERY ? deliveryCustomer?.lat : undefined,
      deliveryLng: activeOrderType === OrderType.DELIVERY ? deliveryCustomer?.lng : undefined,
      deliveryAddressLabel: activeOrderType === OrderType.DELIVERY ? deliveryCustomer?.addressLabel : undefined,
      source: 'pos',
      platformOrderId: activeOrderType === OrderType.DELIVERY && deliverySource !== 'restaurant' ? externalOrderNumber.trim() || undefined : undefined,
      deliverySource: activeOrderType === OrderType.DELIVERY ? deliverySource : undefined,
      items: [...safeActiveCart],
      // New orders always start from PENDING; kitchen fire moves to PREPARING.
      status: OrderStatus.PENDING,
      subtotal: cartSubtotal,
      discount: orderDiscountAmount,
      discountType: activeCoupon ? 'COUPON' : undefined,
      discountReason: activeCoupon ? `Coupon: ${activeCoupon}` : undefined,
      couponCode: activeCoupon || undefined,
      tax: cartTax,
      total: cartTotal,
      createdAt: new Date(),
      paymentMethod: withPayment ? paymentMethod : undefined,
      notes: buildOrderNotes(),
      payments: withPayment
         ? (paymentMethod === PaymentMethod.SPLIT ? splitPayments : [{ method: paymentMethod, amount: cartTotal }])
         : [],
      syncStatus: 'PENDING'
   });

   const resetAfterOrderCommit = () => {
      setDeliveryCustomer(null);
      setDeliverySource('restaurant');
      setExternalOrderNumber('');
      setPlatformDeliveryDraft({ customerName: '', customerPhone: '', address: '', notes: '', paymentStatus: 'UNKNOWN' });
      setOrderNote('');
      setSplitPayments([]);
      setPaymentMethod(PaymentMethod.CASH);
      setCouponCode('');
      clearCoupon();
   };

   const fireOrderToKitchen = async (order: Order) => {
      await kdsApi.dispatchOrder(order.id, branchId, true);
      try {
         await printKitchenTicketsByRouting({
            order,
            categories,
            printers,
            branchId,
            maxKitchenPrinters: settings.maxKitchenPrinters,
            settings,
            currencySymbol,
            lang,
            t,
            branch: activeBranch
         });
      } catch {
         showToast(lang === 'ar' ? 'تم إرسال الطلب، لكن طابعة المطبخ غير متاحة' : 'Order sent, but kitchen printer is unavailable', 'warning');
      }
      await updateOrderStatus(order.id, OrderStatus.PREPARING, undefined, undefined, { skipVersionCheck: true });
   };

   const [submittingOrderKey, setSubmittingOrderKey] = useState<string | null>(null);
   const submittingOrderKeyRef = useRef<string | null>(null);

   const beginOrderSubmit = (prefix: string) => {
      if (submittingOrderKeyRef.current) return null;
      const key = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      submittingOrderKeyRef.current = key;
      setSubmittingOrderKey(key);
      return key;
   };

   const endOrderSubmit = () => {
      submittingOrderKeyRef.current = null;
      setSubmittingOrderKey(null);
   };

   const shouldAutoCompleteDirectOrder = () =>
      settings.autoCompleteDirectOrders === true && [OrderType.TAKEAWAY, OrderType.PICKUP].includes(activeOrderType);

   const handleSendKitchen = async () => {
      if (safeActiveCart.length === 0) return;
      const submitKey = beginOrderSubmit('send');
      if (!submitKey) return;
      try {
         const draftOrder = buildDraftOrder(false);
         (draftOrder as any).clientSubmitKey = submitKey;
         const savedOrder = await placeOrder(draftOrder);

         if (activeOrderType === OrderType.DINE_IN && selectedTableId) {
            updateTableStatus(selectedTableId, TableStatus.OCCUPIED);
            clearTableDraft(selectedTableId);
         }

         // Run kitchen printing asynchronously
         fireOrderToKitchen(savedOrder)
            .catch(() => showToast(lang === 'ar' ? 'تم حفظ الطلب، لكن تعذر إرساله للمطبخ' : 'Order saved, but kitchen dispatch failed', 'error'));
         resetAfterOrderCommit();
         showToast(
            lang === 'ar'
               ? 'تم إرسال الطلب للمطبخ بنجاح'
               : 'Kitchen ticket sent successfully',
            'success'
         );
      } catch (error: any) {
         showToast(getActionableErrorMessage(error, lang), 'error');
      } finally {
         endOrderSubmit();
      }
   };



   const handleSubmitOrder = async () => {
      if (safeActiveCart.length === 0) return;
      const submitKey = beginOrderSubmit('pay');
      if (!submitKey) return;
      if (paymentMethod === PaymentMethod.SPLIT) {
         const splitTotal = splitPayments.reduce((sum, p) => sum + p.amount, 0);
         if (Math.abs(splitTotal - cartTotal) > 0.01) {
            showToast(t.split_total_error, 'error');
            endOrderSubmit();
            return;
         }
      }
      try {
         const draftOrder = buildDraftOrder(true);
         (draftOrder as any).clientSubmitKey = submitKey;

         // 1. Place Order in Store (Syncs with server which now handles inventory)
         const savedOrder = await placeOrder(draftOrder);
         if (savedOrder.warnings?.some(warning => warning.code === 'INSUFFICIENT_INVENTORY')) {
            showToast(lang === 'ar'
               ? 'تم حفظ البيع، لكن مخزون بعض المكونات غير كاف.'
               : 'Sale saved, but some ingredient stock is insufficient.',
               'warning');
         }

         // Update Table Status to OCCUPIED if Dine-In
         if (activeOrderType === OrderType.DINE_IN && selectedTableId) {
            updateTableStatus(selectedTableId, TableStatus.OCCUPIED);
            clearTableDraft(selectedTableId);
            setSelectedTableId(null);
         } else if (activeOrderType === OrderType.DINE_IN) {
            setSelectedTableId(null);
         }

         // 2. Record Finance Transactions (Keeping for now although this belongs to an event listener too)
         recordTransaction({
            date: new Date(),
            description: `Sale - Order #${savedOrder.id}`,
            debitAccountId: '1-1-1',
            creditAccountId: '4-1',
            amount: savedOrder.total,
            referenceId: savedOrder.id
         });

         if (shouldAutoCompleteDirectOrder()) {
            await updateOrderStatus(savedOrder.id, OrderStatus.COMPLETED, undefined, 'Auto-completed direct order', { skipVersionCheck: true, skipPrint: true });
         } else if (settings.orderManualKitchenFlow !== true) {
            fireOrderToKitchen(savedOrder)
               .catch(() => showToast(lang === 'ar' ? 'تم حفظ الطلب، لكن تعذر إرساله للمطبخ' : 'Order saved, but kitchen dispatch failed', 'error'));
         }

         // 4. Trigger customer receipts in background to avoid blocking UI animations
         const shouldPrintOnSubmit = (settings.autoPrintReceiptOnSubmit ?? settings.autoPrintReceipt ?? false) === true
            || hasCashierPrinterConfigured(printers, savedOrder.branchId, settings);
         if (shouldPrintOnSubmit) {
            printOrderReceipt({
               order: savedOrder,
               printers,
               settings,
               currencySymbol,
               lang,
               t,
               branch: activeBranch
            }).catch(() => showToast(lang === 'ar' ? 'تم حفظ الطلب، لكن تعذرت طباعة الإيصال' : 'Order saved, but receipt print failed', 'warning'));
          }
          if (paymentMethod === PaymentMethod.CASH) {
             await printService.triggerCashDrawer(branchId);
          }
         resetAfterOrderCommit();
      } catch (error: any) {
         showToast(getActionableErrorMessage(error, lang), 'error');
      } finally {
         endOrderSubmit();
      }
   };

   const handleClearCart = () => {
      if (safeActiveCart.length === 0) return;

      clearCart();
      setDeliveryCustomer(null);
      setDeliverySource('restaurant');
      setExternalOrderNumber('');
      setOrderNote('');
      setSplitPayments([]);
      setPaymentMethod(PaymentMethod.CASH);
      setCouponCode('');
      clearCoupon();
      if (selectedTableId) clearTableDraft(selectedTableId);
      showToast(lang === 'ar' ? 'تم تفريغ الطلب' : 'Cart cleared', 'success');
   };

   const handleVoidOrder = () => {
      if (safeActiveCart.length === 0) return;

      showModal({
         title: t.confirm,
         message: t.void_confirm,
         type: 'danger',
         confirmText: t.confirm,
         cancelText: t.cancel,
         onConfirm: () => {
            requestManagerApproval('VOID_ORDER', () => {
               clearCart();
               setDeliveryCustomer(null);
               setSplitPayments([]);
               setPaymentMethod(PaymentMethod.CASH);
               setCouponCode('');
               clearCoupon();
               setSelectedTableId(null);
            });
         }
      });
   };

   const handleRecallShortcut = useCallback(() => {
      if (heldOrders.length > 0) {
         handleRecallOrder(heldOrders.length - 1);
         return;
      }

      if (orders.length > 0) {
         const lastOrder = orders[0];
         clearCart();
         lastOrder.items.forEach((item) => {
            addToCart({
               ...item,
               cartId: createCartId(),
            });
         });
         if (lastOrder.tableId) setSelectedTableId(lastOrder.tableId);
         if (lastOrder.type) setOrderMode(lastOrder.type);
         showToast(
            lang === 'ar' ? 'تم استرجاع آخر طلب' : 'Last order recalled',
            'success'
         );
         return;
      }

      showToast(
         lang === 'ar' ? 'لا توجد طلبات للاسترجاع' : 'No orders available to recall',
         'error'
      );
   }, [heldOrders.length, handleRecallOrder, orders, clearCart, addToCart, setOrderMode, lang, showToast]);

   usePOSKeyboardShortcuts({
      searchInputRef,
      tableNumberBufferRef,
      tableNumberTimerRef,
      cartHasItems: safeActiveCart.length > 0,
      selectedTableId,
      showSplitModal,
      editingItemId,
      activeOrderType,
      showMap,
      categoryHotkeys,
      sortedTables,
      currentTableIndex,
      onDismissSplitModal: () => setShowSplitModal(false),
      onClearEditingItem: () => setEditingItemId(null),
      onClearCart: clearCart,
      onShowTableMap: () => setSelectedTableId(null),
      onSetActiveCategory: setActiveCategory,
      onSwitchToTable: switchToTable,
      onLeaveTable: leaveTable,
      onFindTableByNumber: findTableByNumber,
      onQuickPay: handleQuickPay,
      onSendKitchen: handleSendKitchen,
      onSubmitOrder: handleSubmitOrder,
      onVoidOrder: handleVoidOrder,
      onSetOrderMode: setOrderMode,
      onRecallShortcut: handleRecallShortcut,
   });

   const handleApplyCoupon = async () => {
      const code = couponCode.trim();
      if (!code) return;
      if (cartSubtotal <= 0) {
         showToast(lang === 'ar' ? 'أضف أصناف أولاً' : 'Add items first', 'error');
         return;
      }
      requestManagerApproval('APPLY_DISCOUNT', async () => {
         try {
            setIsApplyingCoupon(true);
            await applyCoupon({
               code,
               branchId,
               orderType: activeOrderType,
               subtotal: cartSubtotal,
               customerId: deliveryCustomer?.id,
            });
            showToast(lang === 'ar' ? 'تم تطبيق الكوبون' : 'Coupon applied', 'success');
         } catch (error: any) {
            showToast(getActionableErrorMessage(error, lang), 'error');
         } finally {
            setIsApplyingCoupon(false);
         }
      });
   };

   const modeShortcuts = useMemo(() => ([
      { mode: OrderType.DINE_IN, icon: UtensilsCrossed, label: t.dine_in, keyHint: 'Alt+1', activeClass: 'bg-primary text-white border-primary' },
      { mode: OrderType.TAKEAWAY, icon: ShoppingBag, label: t.takeaway, keyHint: 'Alt+2', activeClass: 'bg-emerald-600 text-white border-emerald-600' },
      { mode: OrderType.PICKUP, icon: MapPin, label: t.pickup || (lang === 'ar' ? 'استلام عميل' : 'Pickup'), keyHint: 'Alt+3', activeClass: 'bg-teal-600 text-white border-teal-600' },
      { mode: OrderType.DELIVERY, icon: Truck, label: t.delivery, keyHint: 'Alt+4', activeClass: 'bg-orange-600 text-white border-orange-600' },
   ]), [t, lang]);

   const handleSaveCustomer = async () => {
      if (!newCustomer.name || !newCustomer.phone) {
         showToast(lang === 'ar' ? 'يرجى إدخال الاسم ورقم الهاتف' : 'Name and Phone required', 'error');
         return;
      }
      try {
         const created = await addCustomer({
             ...newCustomer,
             id: `c_${Date.now()}`,
         });
         setDeliveryCustomer(created);
         setShowCustomerModal(false);
         setNewCustomer({ name: '', phone: '', address: '' });
         showToast(lang === 'ar' ? 'تم إضافة العميل بنجاح' : 'Customer created successfully', 'success');
      } catch (error: any) {
         showToast(error.message, 'error');
      }
   };

   const handleDeliverySourceChange = (source: string) => {
      const nextSource = source || 'restaurant';
      setDeliverySource(nextSource);
      setDeliveryCustomer(null);
      setExternalOrderNumber('');
      setPlatformDeliveryDraft({ customerName: '', customerPhone: '', address: '', notes: '', paymentStatus: 'UNKNOWN' });
      if (nextSource === 'restaurant') setOrderName('');
   };

   const handleUsePlatformDelivery = () => {
      const platformOrderNo = externalOrderNumber.trim();
      if (!platformOrderNo) {
         showToast(lang === 'ar' ? 'اكتب رقم أوردر المنصة الأول' : 'Enter the platform order number first', 'error');
         return;
      }
      const platformLabel = deliveryPlatforms.find((platform: any) => String(platform.id) === deliverySource)?.name
         || (deliverySource === 'talabat' ? 'Talabat' : deliverySource);
      const syntheticCustomer = {
         id: '',
         name: platformDeliveryDraft.customerName.trim() || `${platformLabel} #${platformOrderNo}`,
         phone: platformDeliveryDraft.customerPhone.trim(),
         address: platformDeliveryDraft.address.trim(),
      } as Customer;
      setDeliveryCustomer(syntheticCustomer);
      setOrderName(syntheticCustomer.name);
      setIsCartOpenMobile(true);
   };

   const orderTypeLabel =
      activeOrderType === OrderType.DINE_IN
         ? t.dine_in
         : activeOrderType === OrderType.DELIVERY
            ? t.delivery
            : activeOrderType === OrderType.PICKUP
               ? (t.pickup || 'Pickup')
               : t.takeaway;
   const orderTypeSubLabel =
      activeOrderType === OrderType.DINE_IN
         ? `${t.table} ${tables.find(tb => tb.id === selectedTableId)?.name || selectedTableId || '-'}`.trim()
         : activeOrderType === OrderType.DELIVERY
            ? (deliveryCustomer?.name || t.select_customer)
            : activeOrderType === OrderType.PICKUP
               ? (t.pickup || 'Pickup')
               : t.quick_order;
   const shouldShowCart = (safeActiveCart.length > 0 || selectedTableId) && !showMap && !showCustomerSelect;
   const shouldRenderCartPanel = !showMap && !showCustomerSelect;
   const hasCartItems = safeActiveCart.length > 0;
   const cartPanelWidthClass =
      cartPanelWidth === 'compact'
         ? 'pos-cart-compact'
         : cartPanelWidth === 'wide'
            ? 'pos-cart-wide'
            : 'pos-cart-normal';
   const desktopWorkspaceClass = shouldRenderCartPanel
      ? `has-cart cart-${cartPanelWidth}`
      : '';

   useEffect(() => {
      if (showMap || showCustomerSelect) setIsCartOpenMobile(false);
   }, [showMap, showCustomerSelect]);

   useEffect(() => {
      if (safeActiveCart.length === 0 && !selectedTableId) setIsCartOpenMobile(false);
   }, [safeActiveCart.length, selectedTableId]);

   return (
      <div className="flex h-full app-viewport pos-shell bg-app text-main transition-colors overflow-hidden min-h-0">
         {/* Hidden audio elements for scanner feedback */}
         <audio ref={scanSuccessAudioRef} preload="auto" src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJN3aGd3aJV7iYB0bHJ/o5aJgXR0fIiUh4R/dnl7j5CDgXl2eYqXioR8dnd+ipKEfnp0eH6WkYV+eHZ5g5OPgoB3d3d/k5GCfnp2d3+UkYJ+e3V3fpORgn56dnd/k5GCfnt1d36TkYJ+enZ3f5ORgn57dQ==" />
         <audio ref={scanErrorAudioRef} preload="auto" src="data:audio/wav;base64,UklGRrQEAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZAEAACAf3+AgIGAgIGBgYKCgoODg4SEhIWFhYaGhoeHh4iIiImIiIeHh4aGhoWFhISEg4OCgoGBgYCAgIB/f39+fn59fX18fHx7e3t6enp5eXl4eHh4d3d3d3d3eHh4eHl5eXp6ent7e3x8fH19fn5+f3+AgICBgYGCgoKDg4OEhA==" />
         <ShiftOverlays onOpen={() => undefined} />



         <ManagerApprovalModal
            isOpen={showApprovalModal}
            onClose={() => { setShowApprovalModal(false); setApprovalCallback(null); }}
            onApproved={() => approvalCallback?.fn()}
            actionName={approvalCallback?.action || 'Operation Authorization'}
         />

         <HeldOrdersModal
            isOpen={showHeldOrdersModal}
            onClose={() => setShowHeldOrdersModal(false)}
            heldOrders={heldOrders}
            onRecall={handleRecallOrder}
            currencySymbol={currencySymbol}
            lang={lang}
         />

         <TakeawayNameModal
            isOpen={showOrderNameModal}
            onClose={() => setShowOrderNameModal(false)}
            initialName={orderName}
            onSave={setOrderName}
            lang={lang}
         />

         {showCalculator && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-20">
               <div className="absolute inset-0 bg-black/60 " onClick={() => setShowCalculator(false)} />
               <div className="relative w-full max-w-md">
                  <CalculatorWidget onClose={() => setShowCalculator(false)} />
               </div>
            </div>
         )}

         <div className="flex-1 flex flex-col min-w-0 overflow-hidden min-h-0">
            <POSHeader
               activeMode={activeOrderType}
               lang={lang}
               t={t}
               selectedTableId={selectedTableId}
               onClearTable={leaveTable}
               onHomeClick={handleExitToDashboard}
               deliveryCustomer={deliveryCustomer}
               onClearCustomer={() => setDeliveryCustomer(null)}
               isTouchMode={isTouchMode}
               onRecall={() => setShowHeldOrdersModal(true)}
               activePriceListId={activePriceListId}
               onSetPriceList={setPriceList}
               isOnline={isOnline}
               activeShift={activeShift}
               onCloseShift={() => setIsShiftDrawerOpen(true)}
            />

            {cashierPrintStations.length > 0 && (
               <div className="flex items-center gap-2 border-b border-border/40 bg-elevated/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted">
                  <span>{lang === 'ar' ? 'نقطة الطباعة' : 'Print Station'}</span>
                  <select
                     value={currentPrintStationId}
                     onChange={(event) => handlePrintStationChange(event.target.value)}
                     className="h-8 rounded-xl border border-border bg-card px-3 text-[10px] font-black text-main outline-none focus:border-emerald-500"
                  >
                     <option value="">{lang === 'ar' ? 'تلقائي' : 'Auto'}</option>
                     {cashierPrintStations.map((station) => (
                        <option key={station.id} value={station.id}>{station.label} ({station.id})</option>
                     ))}
                  </select>
               </div>
            )}

            {/* ??? Compact Toolbar ??? */}
            <POSToolbar
               activeOrderType={activeOrderType}
               onSetOrderMode={setOrderMode}
               lang={lang}
               t={t}
               cartCount={safeActiveCart.length}
               onToggleCart={() => setIsCartOpenMobile(!isCartOpenMobile)}
               onShowTables={() => { setOrderMode(OrderType.DINE_IN); setSelectedTableId(null); }}
               onShowCustomers={() => { setOrderMode(OrderType.DELIVERY); setDeliveryCustomer(null); setSearchQuery(''); }}
               onNewCustomer={() => { setOrderMode(OrderType.DELIVERY); setShowCustomerModal(true); }}
               onQuickPay={handleQuickPay}
               onFocusSearch={() => searchInputRef.current?.focus()}
               onHoldOrder={handleHoldOrder}
               onRecallOrders={() => setShowHeldOrdersModal(true)}
               heldOrdersCount={heldOrders.length}
               onSetOrderName={() => setShowOrderNameModal(true)}
               orderName={orderName}
               hasCartItems={hasCartItems}
               cartTotal={cartTotal}
               currencySymbol={currencySymbol}
               posMode={posMode}
               onTogglePosMode={() => setPosMode(prev => prev === 'grid' ? 'retail' : 'grid')}
            />

            <NoteModal
               isOpen={!!editingItemId}
               onClose={() => setEditingItemId(null)}
               note={noteInput}
               onNoteChange={setNoteInput}
               onSave={() => {
                  if (editingItemId) updateCartItemNotes(editingItemId, noteInput);
                  setEditingItemId(null);
               }}
               lang={lang}
               t={t}
            />

            <SeatModal
               isOpen={!!editingSeatItemId}
               onClose={() => setEditingSeatItemId(null)}
               seatNumber={seatInput}
               onSeatChange={setSeatInput}
               onSave={() => {
                  if (editingSeatItemId && seatInput !== undefined) {
                     updateCartItemSeat(editingSeatItemId, seatInput);
                  }
                  setEditingSeatItemId(null);
               }}
               lang={lang}
            />

            <CourseModal
               isOpen={!!editingCourseItemId}
               onClose={() => setEditingCourseItemId(null)}
               currentCourse={courseInput}
               onSave={(courseVal) => {
                  if (editingCourseItemId) {
                     updateCartItemCourse(editingCourseItemId, courseVal || '');
                     // using '' to clear it if undefined, or keep as string
                  }
                  setEditingCourseItemId(null);
               }}
               lang={lang}
            />

            <div className="flex-1 flex overflow-hidden relative min-h-0 bg-app">
               {/* Cart Mobile Overlay */}
               {shouldShowCart && isCartOpenMobile && (
                  <div className="pos-cart-overlay fixed inset-0 bg-black/30 z-30 animate-in fade-in" onClick={() => setIsCartOpenMobile(false)} />
               )}

               {showMap ? (
                  <div className="flex-1 p-3 md:p-5 lg:p-8 bg-app overflow-y-auto min-h-0">
                     <TableMap
                        tables={tables}
                        zones={zones}
                        orders={orders}
                        onSelectTable={(table) => {
                           if (table.status === TableStatus.DIRTY) {
                              showModal({
                                 title: t.confirm,
                                 message: t.mark_table_clean,
                                 type: 'confirm',
                                 confirmText: t.confirm,
                                 cancelText: t.cancel,
                                 onConfirm: () => updateTableStatus(table.id, TableStatus.AVAILABLE)
                              });
                              return;
                           }
                           if (
                              table.status === TableStatus.OCCUPIED ||
                              table.status === TableStatus.WAITING_FOOD ||
                              table.status === TableStatus.READY_TO_PAY
                           ) {
                              setManagedTableId(table.id);
                           } else {
                              switchToTable(table.id);
                           }
                        }}
                        onResumeTable={(table) => {
                           switchToTable(table.id);
                        }}
                        onTempBill={(table) => handleTempBill(table.id)}
                        onCloseTable={(table) => handleCloseTable(table.id)}
                        onMergeTable={(table) => setManagedTableId(table.id)}
                        onUpdateOrderStatus={(orderId, status) => updateOrderStatus(orderId, status)}
                        lang={lang}
                        t={t}
                        isDarkMode={isDarkMode}
                     />
                  </div>
               ) : showCustomerSelect ? (
                  <CustomerSelectView
                     customers={customers}
                     onSelectCustomer={(c) => { setDeliveryCustomer(c); setIsCartOpenMobile(true); }}
                     onCreateCustomer={() => setShowCustomerModal(true)}
                     deliveryPlatforms={deliveryPlatforms}
                     deliverySource={deliverySource}
                     onDeliverySourceChange={handleDeliverySourceChange}
                     externalOrderNumber={externalOrderNumber}
                     onExternalOrderNumberChange={setExternalOrderNumber}
                     platformDeliveryDraft={platformDeliveryDraft}
                     onPlatformDeliveryDraftChange={setPlatformDeliveryDraft}
                     onUsePlatformDelivery={handleUsePlatformDelivery}
                     lang={lang}
                     t={t}
                  />
               ) : (
                  <div className={`pos-workspace-grid flex-1 min-h-0 h-full overflow-hidden ${desktopWorkspaceClass}`}>
                     <div className="pos-main-workspace flex h-full overflow-hidden min-h-0 min-w-0">
                        {/* ??? Items Panel (Left) ??? */}
                        {posMode === 'retail' ? (
                           <RetailModePanel
                              cartItems={safeActiveCart}
                              searchQuery={searchQuery}
                              onSearchChange={setSearchQuery}
                              lang={lang}
                              t={t}
                              currencySymbol={currencySymbol}
                              onAddItem={handleAddItem}
                              pricedItems={pricedItems}
                           />
                        ) : (
                           <POSItemsPanel
                              categories={currentCategories}
                              activeCategory={activeCategory}
                              onSetCategory={handleSetActiveCategory}
                              categoryResultCounts={categoryResultCounts}
                              totalMatchedCount={totalMatchedAcrossCategories}
                              hasActiveFiltering={Boolean(normalizedSearchQuery || itemFilter !== 'all')}
                              pricedItems={pricedItems}
                              cartItems={safeActiveCart}
                              onAddItem={handleAddItem}
                              onRemoveItem={handleRemoveOneFromCart}
                              highlightedItemId={lastAddedItemId}
                           searchQuery={searchQuery}
                           onSearchChange={setSearchQuery}
                           searchInputRef={searchInputRef}
                           itemFilter={itemFilter}
                           onSetFilter={setItemFilter}
                           itemSort={itemSort}
                           onSetSort={setItemSort}
                           itemDensity={itemDensity as any}
                           onSetDensity={setItemDensity as any}
                           showMobileFilters={showMobileFilters}
                           onToggleFilters={() => setShowMobileFilters(prev => !prev)}
                           onResetFilters={() => { setSearchQuery(''); setItemFilter('all'); setItemSort('smart'); }}
                           quickPickItems={quickPickItems}
                           upsellSuggestions={upsellSuggestions}
                           showCategoryStrip={showCategoryStrip}
                           onToggleCategoryStrip={() => setShowCategoryStrip(prev => !prev)}
                           isTabletViewport={isTabletViewport}
                           quickCategoryNav={quickCategoryNav}
                           isTouchMode={isTouchMode}
                           lang={lang}
                           t={t}
                           currencySymbol={currencySymbol}
                           isCartVisible={shouldRenderCartPanel}
                           cartStats={cartStats}
                           currentOrderPreview={currentOrderPreview}
                           isCartOpenMobile={isCartOpenMobile}
                           onOpenCart={() => setIsCartOpenMobile(true)}
                           selectedTableId={selectedTableId}
                           hasCartItems={hasCartItems}
                           cartTotal={cartTotal}
                        />
                        )}
                     </div>

                     {/* ??? Mobile FAB (fixed bottom cart button) ??? */}
                     {isMobileViewport && shouldRenderCartPanel && !isCartOpenMobile && !showMap && !showCustomerSelect && hasCartItems && (
                        <div className={`pos-mobile-fab fixed bottom-[max(1rem,var(--safe-bottom))] ${lang === 'ar' ? 'right-4 left-4' : 'left-4 right-4'} z-40`}>
                           <button
                              onClick={() => setIsCartOpenMobile(true)}
                              className="w-full h-12 px-4 rounded-2xl bg-card/90  border border-border/40 shadow-[0_6px_24px_rgb(0,0,0,0.1)] flex items-center justify-between active:scale-[0.98] transition-all overflow-hidden relative group"
                           >
                              <div className="absolute inset-0 bg-gradient-to-r from-primary/8 to-primary/3 pointer-events-none" />
                              <div className="min-w-0 flex items-center gap-2.5 relative z-10">
                                 <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
                                    <ShoppingBag size={14} className="text-white" />
                                 </div>
                                 <div className="text-left min-w-0">
                                    <p className="text-[10px] font-bold text-primary leading-none">
                                       {safeActiveCart.length} {lang === 'ar' ? 'بنود' : 'items'}
                                    </p>
                                    <p className="text-xs font-extrabold text-main tabular-nums">
                                       {currencySymbol}{(cartTotal || 0).toFixed(2)}
                                    </p>
                                 </div>
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/8 px-3 py-1.5 rounded-lg relative z-10">
                                 {lang === 'ar' ? 'فتح السلة' : 'Open Cart'}
                              </span>
                           </button>
                        </div>
                     )}

                     {/* ??? Cart Sidebar (Right) ??? */}
                     {shouldRenderCartPanel && (
                        <POSCartSidebar
                           activeCart={safeActiveCart}
                           filteredCartItems={filteredCartItems}
                           cartSubtotal={cartSubtotal}
                           cartTotal={cartTotal}
                           cartTax={cartTax}
                           cartStats={cartStats}
                           discount={discount}
                           orderDiscountAmount={orderDiscountAmount}
                           itemDiscountTotal={itemDiscountTotal}
                           orderTypeLabel={orderTypeLabel}
                           orderTypeSubLabel={orderTypeSubLabel}
                           activeOrderType={activeOrderType}
                           selectedTableId={selectedTableId}
                           cartSearchQuery={cartSearchQuery}
                           onCartSearchChange={setCartSearchQuery}
                           cartPanelWidth={cartPanelWidth}
                           onSetCartWidth={setCartPanelWidth}
                           paymentMethod={paymentMethod}
                           onSetPaymentMethod={handleSetPaymentMethod}
                           isPaymentPanelCollapsed={isPaymentPanelCollapsed}
                           onTogglePaymentCollapsed={() => setIsPaymentPanelCollapsed(prev => !prev)}
                           tipAmount={tipAmount}
                           onSetTipAmount={setTipAmount}
                           couponCode={couponCode}
                           activeCoupon={activeCoupon}
                           isApplyingCoupon={isApplyingCoupon}
                           onCouponCodeChange={setCouponCode}
                           onApplyCoupon={handleApplyCoupon}
                           onClearCoupon={() => { setCouponCode(''); clearCoupon(); }}
                           onEditNote={(cartId, note) => { setEditingItemId(cartId); setNoteInput(note); }}
                           onEditSeat={(cartId, curSeat) => { setEditingSeatItemId(cartId); setSeatInput(curSeat); }}
                           onEditCourse={(cartId, curCourse) => { setEditingCourseItemId(cartId); setCourseInput(curCourse); }}
                           onUpdateQuantity={handleUpdateQuantity}
                           onRemoveItem={handleRemoveWithReason}
                           onEditItemDiscount={handleEditItemDiscount}
                           onVoid={handleVoidOrder}
                           onClear={handleClearCart}
                           onSendKitchen={handleSendKitchen}
                           onSubmit={handleSubmitOrder}
                           onQuickPay={handleQuickPay}
                           isSubmitting={Boolean(submittingOrderKey)}
                           onShowSplitModal={() => setShowSplitModal(true)}
                           onLeaveTable={leaveTable}
                           onCloseCart={() => { if (activeOrderType === OrderType.DINE_IN) leaveTable(); setIsCartOpenMobile(false); }}
                           onFocusSearch={() => searchInputRef.current?.focus()}
                           currencySymbol={currencySymbol}
                           isTouchMode={isTouchMode}
                           lang={lang}
                           t={t}
                           isCartOpenMobile={isCartOpenMobile}
                           shouldShowCart={shouldShowCart}
                           cartPanelWidthClass={cartPanelWidthClass}
                           splitPayments={splitPayments}
                           deliveryPlatforms={deliveryPlatforms}
                           deliverySource={deliverySource}
                           onDeliverySourceChange={handleDeliverySourceChange}
                           externalOrderNumber={externalOrderNumber}
                           onExternalOrderNumberChange={setExternalOrderNumber}
                           orderNote={orderNote}
                           onOrderNoteChange={setOrderNote}
                        />
                     )}
                  </div>
               )}
            </div>

            <React.Suspense fallback={null}>
            <SplitBillModal
               isOpen={showSplitModal}
               onClose={() => setShowSplitModal(false)}
               total={cartTotal}
               currencySymbol={currencySymbol}
               lang={lang}
               t={t}
               splitPayments={splitPayments}
               onSetPayments={setSplitPayments}
               onAddPayment={(method) => {
                  const currentSplitSum = splitPayments.reduce((s, p) => s + p.amount, 0);
                  const remaining = Math.max(0, cartTotal - currentSplitSum);
                  if (remaining > 0) setSplitPayments(prev => [...prev, { method, amount: remaining }]);
               }}
               onRemovePayment={(idx) => setSplitPayments(prev => prev.filter((_, i) => i !== idx))}
               onUpdateAmount={(idx, val) => setSplitPayments(prev => prev.map((p, i) => i === idx ? { ...p, amount: val } : p))}
            />
            </React.Suspense>

            {managedTableId && (
               <React.Suspense fallback={null}>
               <TableManagementModal
                  sourceTable={tables.find(t => t.id === managedTableId)!}
                  allTables={tables}
                  orders={orders}
                  lang={lang}
                  onClose={() => setManagedTableId(null)}
                  onCloseTable={handleCloseTable}
                  onMergeTables={(targetId, itemIds) => handleMergeTables(managedTableId, targetId, itemIds)}
                  onEditOrder={() => {
                     switchToTable(managedTableId);
                     setManagedTableId(null);
                  }}
                  onTransferTable={(targetId) => {
                     transferTable(managedTableId, targetId);
                     setManagedTableId(null);
                  }}
                  onTransferItems={async (targetId, itemIds) => {
                     await transferItems(managedTableId, targetId, itemIds);
                     setManagedTableId(null);
                  }}
                  onSplitTable={async (targetId, itemIds) => {
                     await splitTable(managedTableId, targetId, itemIds);
                     setManagedTableId(null);
                  }}
               />
               </React.Suspense>
            )}
         </div>

         <ItemOptionsModal
            isOpen={!!selectedItemForOptions}
            item={selectedItemForOptions}
            onClose={() => setSelectedItemForOptions(null)}
            onConfirm={handleConfirmItemOptions}
            currencySymbol={currencySymbol}
            lang={lang as any}
         />

         {/* ??? Item Discount Modal ??? */}
         {editingDiscountItemId && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-in fade-in duration-200" onClick={() => setEditingDiscountItemId(null)}>
               <div className="bg-card rounded-2xl shadow-2xl w-[360px] max-w-[90vw] p-6 animate-in zoom-in-95 duration-200 border border-border/30" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-black text-main mb-4 text-center">
                     {lang === 'ar' ? 'خصم على الصنف' : 'Item Discount'}
                  </h3>
                  <div className="flex gap-2 mb-4">
                     {[5, 10, 15, 20, 50].map(pct => (
                        <button
                           key={pct}
                           onClick={() => { setItemDiscountValue(String(pct)); setItemDiscountType('percent'); }}
                           className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 ${itemDiscountType === 'percent' && itemDiscountValue === String(pct)
                              ? 'bg-success text-white shadow-lg shadow-success/30'
                              : 'bg-elevated text-muted hover:bg-success/10'
                              }`}
                        >
                           {pct}%
                        </button>
                     ))}
                  </div>
                  <div className="flex bg-elevated rounded-xl p-1 mb-3">
                     <button onClick={() => setItemDiscountType('percent')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${itemDiscountType === 'percent' ? 'bg-card shadow text-success' : 'text-muted'}`}>
                        {lang === 'ar' ? 'نسبة %' : 'Percent %'}
                     </button>
                     <button onClick={() => setItemDiscountType('flat')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${itemDiscountType === 'flat' ? 'bg-card shadow text-success' : 'text-muted'}`}>
                        {lang === 'ar' ? `مبلغ ثابت ${currencySymbol}` : `Fixed ${currencySymbol}`}
                     </button>
                  </div>
                  <input
                     type="number" value={itemDiscountValue} onChange={e => setItemDiscountValue(e.target.value)}
                     placeholder={itemDiscountType === 'percent' ? '0 - 100' : '0.00'}
                     className="w-full px-4 py-3 bg-elevated border border-border rounded-xl text-center text-lg font-black text-main outline-none focus:ring-2 focus:ring-success/50 mb-4" autoFocus
                     onKeyDown={e => e.key === 'Enter' && handleApplyItemDiscount()}
                  />
                  <div className="flex gap-3">
                     <button onClick={() => { setItemDiscountValue('0'); handleApplyItemDiscount(); }} className="flex-1 py-3 bg-elevated rounded-xl text-xs font-black uppercase tracking-widest text-muted hover:bg-border transition-colors">
                        {lang === 'ar' ? 'إزالة الخصم' : 'Remove'}
                     </button>
                     <button onClick={handleApplyItemDiscount} className="flex-1 py-3 bg-success text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-success/30 hover:opacity-90 active:scale-95 transition-all">
                        {lang === 'ar' ? 'تطبيق' : 'Apply'}
                     </button>
                  </div>
               </div>
            </div>
         )}


         {/* ??? Customer Registration Modal ??? */}
         {showCustomerModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60  animate-in fade-in duration-150 p-6">
                <div
                    className="w-full max-w-4xl bg-card border border-border/30 rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 relative"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header Strip */}
                    <div className="h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500" />

                    <div className="p-10 md:p-12">
                        <div className="flex items-center justify-between mb-10">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-500">
                                    <UserPlus size={28} strokeWidth={2.5} />
                                </div>
                                <h3 className="text-3xl font-black text-main tracking-tighter uppercase leading-none">
                                    {lang === 'ar' ? 'إضافة عميل جديد' : 'New Customer'}
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowCustomerModal(false)}
                                className="w-12 h-12 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 flex items-center justify-center transition-all text-muted/30"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Name Entry */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-[0.1em] text-muted pl-1">{lang === 'ar' ? 'اسم العميل' : 'Full Name'}</label>
                                <div className="relative">
                                    <Smartphone className="absolute left-5 top-1/2 -translate-y-1/2 text-muted/20 w-5 h-5 pointer-events-none" />
                                    <input
                                        className="w-full pl-14 pr-6 py-5 bg-elevated/20 border border-border/30 rounded-xl text-main font-black text-sm outline-none focus:border-primary/50 transition-all shadow-inner"
                                        value={newCustomer.name}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                        placeholder={lang === 'ar' ? 'مثال: محمد أحمد...' : 'e.g. John Doe...'}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Phone Entry */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-[0.1em] text-muted pl-1">{lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}</label>
                                <div className="relative">
                                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-muted/20 w-5 h-5 pointer-events-none" />
                                    <input
                                        className="w-full pl-14 pr-6 py-5 bg-elevated/20 border border-border/30 rounded-xl text-main font-black text-sm outline-none focus:border-primary/50 transition-all shadow-inner tabular-nums"
                                        value={newCustomer.phone}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                        placeholder={lang === 'ar' ? '010...' : 'Mobile number...'}
                                    />
                                </div>
                            </div>

                            {/* Address Entry */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-[0.1em] text-muted pl-1">{lang === 'ar' ? 'العنوان' : 'Address'}</label>
                                <div className="relative">
                                    <MapPin className="absolute left-5 top-6 text-muted/20 w-5 h-5 pointer-events-none" />
                                    <textarea
                                        className="w-full pl-14 pr-6 py-5 bg-elevated/20 border border-border/30 rounded-xl text-main font-black text-sm outline-none focus:border-primary/50 transition-all resize-none shadow-inner h-32 no-scrollbar"
                                        value={newCustomer.address}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                        placeholder={lang === 'ar' ? 'تفاصيل العنوان...' : 'Full address details...'}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-6">
                            <AddressMapPicker
                                lang={lang as 'ar' | 'en'}
                                value={{ address: newCustomer.address, lat: newCustomer.lat, lng: newCustomer.lng, label: newCustomer.addressLabel }}
                                onChange={(pin) => setNewCustomer({ ...newCustomer, address: pin.address, lat: pin.lat, lng: pin.lng, addressLabel: pin.label })}
                            />
                        </div>

                        <div className="flex gap-4 mt-12 bg-app/20 -mx-10 md:-mx-12 -mb-10 md:-mb-12 p-8 md:p-10 border-t border-border/10">
                            <button
                                onClick={() => setShowCustomerModal(false)}
                                className="flex-1 h-16 text-sm font-black uppercase tracking-wider text-muted hover:bg-elevated/60 rounded-xl transition-all"
                            >
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSaveCustomer}
                                className="flex-[2] h-16 bg-primary text-white rounded-xl font-black uppercase text-sm tracking-widest hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95 border-b-4 border-primary-hover"
                            >
                                {lang === 'ar' ? 'حفظ البيانات' : 'Save Customer'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
         )}
      </div>
   );
};

export default POS;
