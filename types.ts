
export enum OrderStatus {
  PEND = 'PENDING',
  PENDING = 'PENDING',
  PREPARING = 'PREPARING',
  READY = 'READY',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED'
}

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export enum AuditEventType {
  POS_VOID = 'POS_VOID',
  POS_DISCOUNT = 'POS_DISCOUNT',
  POS_ORDER_PLACEMENT = 'POS_ORDER_PLACEMENT',
  ORDER_STATUS_CHANGE = 'ORDER_STATUS_CHANGE',
  POS_PAYMENT = 'POS_PAYMENT',
  INVENTORY_ADJUSTMENT = 'INVENTORY_ADJUSTMENT',
  INVENTORY_TRANSFER = 'INVENTORY_TRANSFER',
  PO_STATUS_CHANGE = 'PO_STATUS_CHANGE',
  SECURITY_PERMISSION_CHANGE = 'SECURITY_PERMISSION_CHANGE',
  SECURITY_LOGIN = 'SECURITY_LOGIN',
  ACCOUNTING_ADJUSTMENT = 'ACCOUNTING_ADJUSTMENT',
  SETTINGS_CHANGE = 'SETTINGS_CHANGE',
  AI_ACTION_PREVIEW = 'AI_ACTION_PREVIEW',
  AI_ACTION_EXECUTED = 'AI_ACTION_EXECUTED',
  // AI & Intelligence
  AI_INSIGHT_GENERATED = 'AI_INSIGHT_GENERATED',
  AI_ANOMALY_DETECTED = 'AI_ANOMALY_DETECTED'
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  userId: string;
  userName: string;
  userRole: string;
  branchId: string;
  deviceId: string;
  ipAddress?: string;
  payload: {
    before?: any;
    after: any;
    reason?: string;
  };
  metadata?: Record<string, any>;
  isTampered?: boolean; // For forensic detection
  signature?: string; // Potential HMAC for verification
  signatureValid?: boolean; // Server-side verification result (no secrets on client)
}

export enum OrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
  DELIVERY = 'DELIVERY',
  PICKUP = 'PICKUP',
  KIOSK = 'KIOSK'
}

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  WAITING_FOOD = 'WAITING_FOOD',
  READY_TO_PAY = 'READY_TO_PAY',
  RESERVED = 'RESERVED',
  DIRTY = 'DIRTY'
}

export enum PaymentMethod {
  CASH = 'CASH',
  VISA = 'VISA',
  VODAFONE_CASH = 'VODAFONE_CASH',
  INSTAPAY = 'INSTAPAY',
  SPLIT = 'SPLIT'
}

export interface PaymentRecord {
  method: PaymentMethod;
  amount: number;
}

// --- Accounting & Finance ---
export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE'
}

export interface FinancialAccount {
  id: string;
  code: string; // e.g., "1101"
  name: string;
  type: AccountType;
  balance: number;
  parentId?: string;
  children?: FinancialAccount[];
}

export interface JournalEntry {
  id: string;
  date: Date;
  description: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  referenceId?: string; // Order ID or PO ID
}
// --- Inventory & Recipe ---

export interface RecipeIngredient {
  itemId: string;      // Reference to InventoryItem
  quantity: number;    // Amount needed
  unit: string;        // 'kg', 'g', 'L', 'pc', etc.
  cost?: number;       // Calculated cost (qty × unit cost)
}

export interface ModifierOption {
  id: string;
  name: string;
  nameAr?: string;
  price: number;
  recipe?: RecipeIngredient[]; // Recipe for the specific modifier option
}

export interface ModifierGroup {
  id: string;
  name: string;
  nameAr?: string;
  minSelection: number;
  maxSelection: number;
  options: ModifierOption[];
}

// --- Menu Item Extensions (Profit Control Center) ---

export interface ItemSize {
  id: string;
  name: string;       // e.g., 'Small', 'Medium', 'Large', 'Family'
  nameAr?: string;
  price: number;
  cost?: number;
  isAvailable: boolean;
}

export interface PlatformPrice {
  platformId: string;  // e.g., 'talabat', 'elmenus'
  price: number;
  commission?: number; // e.g., 0.15 = 15%
  markupPercentage?: number;
  markupFixed?: number;
}

export interface PriceBook {
  id: string;
  name: string;
  nameAr?: string;
  type: 'BRANCH' | 'PLATFORM' | 'GLOBAL' | 'CUSTOM';
  isActive: boolean;
  itemPrices: Record<string, number>;
  markupPercentage?: number;
  targetIds: string[];
}

export interface ItemVersionEntry {
  timestamp: string;
  userId: string;
  userName: string;
  field: string;
  oldValue: any;
  newValue: any;
}

export interface ScheduledWindow {
  label: string;        // e.g., 'Breakfast', 'Happy Hour'
  startTime: string;    // '08:00'
  endTime: string;      // '12:00'
  days: string[];       // ['mon','tue',...]
  priceOverride?: number;
}

export interface BundleItem {
  itemId: string;
  sizeId?: string;
  qty: number;
}

export interface MenuItem {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  price: number;
  image?: string;
  categoryId: string;
  // Derived UI helpers (not persisted; attached when flattening categories)
  category?: string;
  categoryAr?: string;
  isAvailable: boolean;
  preparationTime?: number;
  isPopular?: boolean;
  availableFrom?: string; // "09:00"
  availableTo?: string; // "22:00"
  availableDays?: string[]; // ["mon", "tue", ...]
  recipe?: any[]; // Link to raw materials (can be flat RecipeIngredient[] or {sizeId, ingredients}[])
  modifierGroups?: ModifierGroup[];
  printerIds?: string[]; // IDs of printers for this item
  sortOrder?: number;
  layoutType?: 'standard' | 'wide' | 'image-only';
  isWeighted?: boolean; // Support for scales
  fiscalCode?: string; // GS1 or Internal code for ETA
  priceLists?: {
    name: string; // e.g., "Delivery", "Walk-in"
    price: number;
    branchIds?: string[]; // Specific price for specific branches
  }[];
  // --- Profit Control Center Extensions ---
  sku?: string;
  barcode?: string;
  cost?: number;                      // Food cost for margin calculation
  sizes?: ItemSize[];                 // Multi-size support (S/M/L/Family)
  platformPricing?: PlatformPrice[];  // Per-delivery-platform price overrides
  tags?: string[];                    // 'best-seller','low-margin','new', etc.
  salesData?: {
    today: number;
    last30: number;
    revenue30: number;
  };
  versionHistory?: ItemVersionEntry[];
  archivedAt?: string;                // ISO date, set when soft-archived
  scheduledAvailability?: ScheduledWindow[];
  // Multi-Branch Enterprise Extensions
  branchPricing?: { branchId: string; price: number; isLocked?: boolean }[];
  branchSalesData?: { branchId: string; today: number; last30: number; revenue30: number }[];
  dietaryBadges?: string[]; // Phase 1: Dietary Badges (e.g. 'Spicy', 'Vegan', etc.)
}

export enum WarehouseType {
  MAIN = 'MAIN',
  SUB = 'SUB',
  KITCHEN = 'KITCHEN',
  POINT_OF_SALE = 'POINT_OF_SALE'
}

export enum InventoryUnit {
  COUNT = 'COUNT',
  KG = 'KG',
  GRAM = 'GRAM',
  LITER = 'LITER',
  ML = 'ML',
  PACK = 'PACK',
  BOX = 'BOX',
  BOTTLE = 'BOTTLE'
}

export interface Warehouse {
  id: string;
  name: string;
  nameAr?: string;
  branchId: string;
  type: WarehouseType;
  isActive: boolean;
  parentId?: string; // Link to central warehouse
  linkedWarehouses?: string[]; // IDs of warehouses for distribution
}


export interface InventoryItem {
  id: string;
  name: string;
  nameAr?: string;
  unit: InventoryUnit | string;
  category: string;
  threshold: number;
  costPrice: number; // Current valuation
  purchasePrice: number; // Last purchased price
  supplierId?: string;
  sku?: string;
  barcode?: string;
  isAudited: boolean;
  auditFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  isComposite: boolean;
  bom?: RecipeIngredient[]; // Bill of Materials if composite
  warehouseQuantities: {
    warehouseId: string;
    quantity: number;
  }[];
}

export interface StockMovement {
  id: string;
  itemId: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  quantity: number;
  type: 'TRANSFER' | 'ADJUSTMENT' | 'PURCHASE' | 'SALE_CONSUMPTION' | 'WASTE';
  date: Date;
  actorId: string;
  referenceId?: string; // Order ID or PO ID
}

export interface OrderItem extends MenuItem {
  cartId: string;
  quantity: number;
  notes?: string;
  seatNumber?: number;
  seat_number?: number;
  course?: 'APPETIZER' | 'MAIN' | 'DESSERT' | 'DRINKS' | string;
  selectedModifiers: {
    groupName: string;
    optionName: string;
    price: number
  }[];
  // Per-item discount
  itemDiscount?: number; // discount value
  itemDiscountType?: 'percent' | 'flat'; // percentage or fixed amount
  tax?: number;
}

export interface Order {
  id: string;
  orderNumber?: number;
  type: OrderType;
  source?: string; // pos, call_center, restaurant_delivery, or delivery platform id
  platformOrderId?: string; // External order ID from Talabat, Elmenus, etc.
  deliverySource?: string; // restaurant, talabat, elmenus, jahez, etc.
  branchId: string; // The branch handling this order
  shiftId?: string; // The active shift when the order was created
  tableId?: string;
  tableName?: string;
  businessDate?: string | null;
  customerId?: string;
  customerName?: string; // Call Center - customer name for display
  customerPhone?: string; // Call Center - customer phone for contact
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryAddressLabel?: string;
  isCallCenterOrder?: boolean;
  items: OrderItem[];
  status: OrderStatus;
  syncStatus?: SyncStatus; // Offline-first sync tracking
  subtotal: number;
  tax: number;
  total: number;
  discount?: number; // Discount percentage applied
  freeDelivery?: boolean; // Call Center - free delivery flag
  isUrgent?: boolean; // Call Center - priority order flag
  createdAt: Date;
  paymentMethod?: PaymentMethod;
  payments?: PaymentRecord[];
  notes?: string;
  tipAmount?: number;
  kitchenNotes?: string; // Notes for kitchen staff
  deliveryNotes?: string;
  driverId?: string; // Link to the assigned driver
  deliveryFee?: number;
  updatedAt?: Date;
  voidedItems?: { item: OrderItem; reason: string; voidedBy?: string; voidedAt?: Date }[];
  warnings?: { code: string; message?: string; reason?: string; menuItemId?: string; warehouseId?: string }[];
}

export interface Supplier {
  id: string;
  name: string;
  nameAr?: string;
  contactPerson: string;
  phone: string;
  email: string;
  category: string;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: 'DRAFT' | 'ORDERED' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED' | 'CLOSED' | 'PENDING_APPROVAL';
  items: {
    itemId: string; // Link to InventoryItem
    itemName: string;
    quantity: number;
    unitPrice: number;
    receivedQuantity?: number;
  }[];
  totalCost: number;
  date: Date;
  receivedDate?: Date;
  targetWarehouseId?: string;
  approvedById?: string;
}

export interface PurchaseRequest {
  id: string;
  branchId: string;
  requesterId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONVERTED_TO_PO';
  items: {
    itemId: string;
    itemName: string;
    quantity: number;
    unit: string;
  }[];
  date: Date;
  reason?: string;
  priority: 'LOW' | 'NORMAL' | 'URGENT';
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  lat?: number;
  lng?: number;
  addressLabel?: string;
  zoneId?: string | number;
  area?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  notes?: string;
  visits: number;
  loyaltyTier?: string;
  loyaltyPoints: number;
  totalSpent: number;
  createdAt?: Date;
  updatedAt?: Date;
  lastOrderDate?: Date;
}

export interface FloorZone {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  branchId?: string;
  width?: number;
  height?: number;
}

export interface Branch {
  id: string;
  name: string;
  nameAr?: string;
  location: string;
  managerName?: string;
  phone: string;
  email?: string;
  address?: string;
  serverIp?: string;
  dayCloseEmails?: string[];
  menuId?: string; // Main menu for this branch
  isActive: boolean;
  openingHours?: string;
  taxNumber?: string;
  timezone?: string;
  currency?: string;
  taxRate?: number;
  businessDate?: string | null;
  serviceCharge?: number;
  createdAt?: string;
}

export interface DeliveryPlatform {
  id: string;
  name: string;
  icon?: string;
  isActive: boolean;
  feePercentage?: number;
  applyFeesToMenuPrice?: boolean;
  priceMarkupPercentage?: number;
  priceMarkupFixed?: number;
  integrationType?: string;
}

export interface Table {
  id: string;
  name: string;
  status: TableStatus;
  seats: number;
  currentOrderTotal?: number;
  currentOrderId?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  zoneId?: string;
  shape?: 'square' | 'round' | 'rectangle';
  discount?: number;
  minSpend?: number;
  isVIP?: boolean;
  notes?: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
  items: MenuItem[];
  menuIds: string[]; // Linked to these menu IDs
  printerIds?: string[]; // Default printers for all items in this category
  image?: string;
  targetOrderTypes?: OrderType[]; // Which modes (Dine-in, Takeaway, etc.)
  targetBranches?: string[];
  targetPlatforms?: string[];
}

export interface RestaurantMenu {
  id: string;
  name: string;
  nameAr?: string;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  targetBranches?: string[];
  targetZones?: string[];
  targetPlatforms?: string[];
}

export type PrinterType = 'LOCAL' | 'NETWORK';
export type PrinterRole = 'CASHIER' | 'KITCHEN' | 'PACKAGING' | 'SHAWARMA' | 'CREPE' | 'GRILL' | 'HOT_LINE' | 'COLD_STATION' | 'FRY' | 'BAR' | 'BAKERY' | 'DESSERT' | 'OTHER';

export interface Printer {
  id: string;
  name: string;
  code?: string;
  type: PrinterType;
  address: string; // IP or local name
  isActive: boolean;
  branchId: string;
  role?: PrinterRole;
  roles?: PrinterRole[];
  stationId?: string;
  gatewayId?: string;
  isPrimaryCashier?: boolean;
  paperWidth?: number;
  isOnline?: boolean;
  lastHeartbeatAt?: string | Date;
}

// AuditEventType AI members merged into main enum declaration above

export interface Offer {
  id: string;
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  discountType: 'PERCENTAGE' | 'FIXED' | 'BUNDLE' | 'BOGO';
  discountValue: number;
  isActive: boolean;
  image?: string;
  // Bundle / Combo support
  bundleItems?: BundleItem[];
  bundlePrice?: number;
  profitThreshold?: number; // Min margin % before auto-deactivation
  // Scheduling
  schedule?: {
    startDate: string;
    endDate: string;
    startTime?: string;
    endTime?: string;
    days?: string[];
  };
  // Platform targeting
  platformIds?: string[];
  branchIds?: string[];
  campaignTag?: string; // 'ramadan', 'summer', 'eid', 'limited'
}

export enum AppPermission {
  // --- Navigation & View Access ---
  NAV_DASHBOARD = 'NAV_DASHBOARD',
  NAV_ADMIN_DASHBOARD = 'NAV_ADMIN_DASHBOARD',
  NAV_POS = 'NAV_POS',
  NAV_KDS = 'NAV_KDS',
  NAV_PICKUP = 'NAV_PICKUP',
  NAV_CALL_CENTER = 'NAV_CALL_CENTER',
  NAV_INVENTORY = 'NAV_INVENTORY',
  NAV_FINANCE = 'NAV_FINANCE',
  NAV_REPORTS = 'NAV_REPORTS',
  NAV_CRM = 'NAV_CRM',
  NAV_MENU_MANAGER = 'NAV_MENU_MANAGER',
  NAV_ORDERS = 'NAV_ORDERS',
  NAV_RECIPES = 'NAV_RECIPES',
  NAV_FORENSICS = 'NAV_FORENSICS',
  NAV_AI_ASSISTANT = 'NAV_AI_ASSISTANT',
  NAV_SETTINGS = 'NAV_SETTINGS',
  NAV_SECURITY = 'NAV_SECURITY',
  NAV_PRINTERS = 'NAV_PRINTERS',
  NAV_PRODUCTION = 'NAV_PRODUCTION',
  NAV_PEOPLE = 'NAV_PEOPLE',
  NAV_FLOOR_PLAN = 'NAV_FLOOR_PLAN',
  NAV_DRIVER = 'NAV_DRIVER',

  // --- Data & Financial Visibility ---
  DATA_VIEW_REVENUE = 'DATA_VIEW_REVENUE',
  DATA_VIEW_COSTS = 'DATA_VIEW_COSTS',
  DATA_VIEW_PROFITS = 'DATA_VIEW_PROFITS',
  DATA_VIEW_CUSTOMER_SENSITIVE = 'DATA_VIEW_CUSTOMER_SENSITIVE', // Phone/Address
  DATA_VIEW_STOCK_LEVELS = 'DATA_VIEW_STOCK_LEVELS',
  DATA_VIEW_AUDIT_LOGS = 'DATA_VIEW_AUDIT_LOGS',

  // --- Operational Actions ---
  OP_VOID_ORDER = 'OP_VOID_ORDER',
  OP_APPLY_DISCOUNT = 'OP_APPLY_DISCOUNT',
  OP_PROCESS_REFUND = 'OP_PROCESS_REFUND',
  OP_TRANSFER_STOCK = 'OP_TRANSFER_STOCK',
  OP_ADJUST_STOCK = 'OP_ADJUST_STOCK',
  OP_PLACE_ORDER = 'OP_PLACE_ORDER',
  OP_CLOSE_DAY = 'OP_CLOSE_DAY',

  // --- Configuration ---
  CFG_MANAGE_USERS = 'CFG_MANAGE_USERS',
  CFG_MANAGE_ROLES = 'CFG_MANAGE_ROLES',
  CFG_EDIT_MENU_PRICING = 'CFG_EDIT_MENU_PRICING',
  CFG_EDIT_FLOOR_PLAN = 'CFG_EDIT_FLOOR_PLAN',
  CFG_MANAGE_BRANCHES = 'CFG_MANAGE_BRANCHES',
  CFG_OFFLINE_MODE = 'CFG_OFFLINE_MODE',

  // --- Extended Permissions (Phase 1) ---
  NAV_TREASURY = 'NAV_TREASURY',
  NAV_PAYROLL = 'NAV_PAYROLL',
  NAV_QUALITY = 'NAV_QUALITY',
  NAV_ATTENDANCE = 'NAV_ATTENDANCE',
  NAV_WASTAGE = 'NAV_WASTAGE',
  NAV_DISPATCH = 'NAV_DISPATCH',
  NAV_FRANCHISE = 'NAV_FRANCHISE',
  NAV_APPROVAL = 'NAV_APPROVAL',
  OP_CREATE_PO = 'OP_CREATE_PO',
  OP_RECEIVE_GRN = 'OP_RECEIVE_GRN',
  OP_APPROVE_PO = 'OP_APPROVE_PO',
  OP_CREATE_SUPPLIER_INVOICE = 'OP_CREATE_SUPPLIER_INVOICE',
  OP_APPROVE_SUPPLIER_INVOICE = 'OP_APPROVE_SUPPLIER_INVOICE',
  OP_PROCESS_PAYROLL = 'OP_PROCESS_PAYROLL',
  OP_MANAGE_CASH_DRAWER = 'OP_MANAGE_CASH_DRAWER',
  DATA_VIEW_SALARIES = 'DATA_VIEW_SALARIES',
  NAV_USER_MANAGEMENT = 'NAV_USER_MANAGEMENT',

  // --- Extended Permissions (Phase 2 — Guide.md) ---
  NAV_MARKETING = 'NAV_MARKETING',
  NAV_WHATSAPP = 'NAV_WHATSAPP',
  NAV_PLATFORMS = 'NAV_PLATFORMS',
  NAV_WEBHOOKS = 'NAV_WEBHOOKS',
  NAV_REFUNDS = 'NAV_REFUNDS',
  NAV_FISCAL = 'NAV_FISCAL',
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OWNER = 'OWNER',
  PARTNER = 'PARTNER',
  OWNER_VIEWER = 'OWNER_VIEWER',
  CEO = 'CEO',
  COO = 'COO',
  GENERAL_MANAGER = 'GENERAL_MANAGER',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  CASHIER = 'CASHIER',
  WAITER = 'WAITER',
  CAPTAIN = 'CAPTAIN',
  DRIVER = 'DRIVER',
  KITCHEN_STAFF = 'KITCHEN_STAFF',
  CALL_CENTER = 'CALL_CENTER',
  CALL_CENTER_MANAGER = 'CALL_CENTER_MANAGER',
  CASHIER_MANAGER = 'CASHIER_MANAGER',
  WAREHOUSE_STAFF = 'WAREHOUSE_STAFF',
  WAREHOUSE_DIRECTOR = 'WAREHOUSE_DIRECTOR',
  PRODUCTION_STAFF = 'PRODUCTION_STAFF',
  PROCUREMENT_MANAGER = 'PROCUREMENT_MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',
  COST_ACCOUNTANT = 'COST_ACCOUNTANT',
  FINANCE_DIRECTOR = 'FINANCE_DIRECTOR',
  HR_MANAGER = 'HR_MANAGER',
  PAYROLL_OFFICER = 'PAYROLL_OFFICER',
  TREASURY_OFFICER = 'TREASURY_OFFICER',
  TECH_SUPPORT = 'TECH_SUPPORT',
  QUALITY_OFFICER = 'QUALITY_OFFICER',
  CUSTOM = 'CUSTOM'
}

export const CORPORATE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.PARTNER,
  UserRole.OWNER_VIEWER,
  UserRole.CEO,
  UserRole.COO,
  UserRole.GENERAL_MANAGER,
  UserRole.CALL_CENTER_MANAGER,
  UserRole.WAREHOUSE_DIRECTOR,
  UserRole.PROCUREMENT_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.COST_ACCOUNTANT,
  UserRole.FINANCE_DIRECTOR,
  UserRole.HR_MANAGER,
  UserRole.TECH_SUPPORT,
];

export const BRANCH_ROLES: UserRole[] = Object.values(UserRole).filter(
  (role) => role !== UserRole.CUSTOM && !CORPORATE_ROLES.includes(role),
);

export const isCorporateRole = (role: UserRole | string) =>
  CORPORATE_ROLES.includes(role as UserRole);

export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: UserRole | string;
  password?: string;
  pin?: string;
  assignedBranchId?: string;
  assignedBranchIds?: string[];
  allowedBranches?: string[];
  branchAccessMode?: 'ALL' | 'MULTI' | 'SINGLE';
  isActive: boolean;
  mfaEnabled?: boolean;
  permissions: AppPermission[];
  customOverrides?: {
    added: AppPermission[];
    removed: AppPermission[];
  };
  phone?: string;
  nationalId?: string;
  employeeCode?: string;
  attendanceCode?: string;
  employmentDate?: string;
  salary?: SalaryInfo;
  avatar?: string;
  defaultPage?: string;
}

export interface SalaryInfo {
  baseSalary: number;
  allowances: number;
  deductions: number;
  payFrequency: 'monthly' | 'bi-weekly' | 'weekly';
  currency?: string;
}

export interface CustomRole {
  id: string;
  name: string;
  nameAr?: string;
  permissions: AppPermission[];
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave' | 'day-off';
export type AttendanceMethod = 'fingerprint' | 'pin' | 'manual' | 'face-id';

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName?: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  branchId?: string;
  notes?: string;
}

export interface UserRoleDefinition {
  role: UserRole;
  name: string;
  defaultPermissions: AppPermission[];
}

export const INITIAL_ROLE_PERMISSIONS: Record<UserRole, AppPermission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(AppPermission),

  [UserRole.OWNER]: [
    AppPermission.NAV_DASHBOARD, AppPermission.NAV_ADMIN_DASHBOARD,
    AppPermission.NAV_POS, AppPermission.NAV_KDS, AppPermission.NAV_PICKUP,
    AppPermission.NAV_ORDERS, AppPermission.NAV_CALL_CENTER,
    AppPermission.NAV_INVENTORY, AppPermission.NAV_FINANCE,
    AppPermission.NAV_REPORTS, AppPermission.NAV_CRM,
    AppPermission.NAV_MENU_MANAGER, AppPermission.NAV_RECIPES,
    AppPermission.NAV_PRINTERS, AppPermission.NAV_PRODUCTION,
    AppPermission.NAV_WASTAGE, AppPermission.NAV_FLOOR_PLAN,
    AppPermission.NAV_DISPATCH, AppPermission.NAV_DRIVER,
    AppPermission.NAV_FRANCHISE, AppPermission.NAV_PEOPLE,
    AppPermission.NAV_ATTENDANCE, AppPermission.NAV_PAYROLL,
    AppPermission.NAV_AI_ASSISTANT, AppPermission.NAV_FORENSICS,
    AppPermission.NAV_SETTINGS, AppPermission.NAV_SECURITY,
    AppPermission.NAV_APPROVAL, AppPermission.NAV_TREASURY,
    AppPermission.NAV_MARKETING, AppPermission.NAV_WHATSAPP,
    AppPermission.NAV_PLATFORMS, AppPermission.NAV_REFUNDS,
    AppPermission.NAV_FISCAL,
    AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS,
    AppPermission.DATA_VIEW_PROFITS, AppPermission.DATA_VIEW_AUDIT_LOGS,
    AppPermission.DATA_VIEW_SALARIES,
    AppPermission.CFG_MANAGE_BRANCHES, AppPermission.CFG_MANAGE_USERS,
    AppPermission.CFG_MANAGE_ROLES, AppPermission.NAV_USER_MANAGEMENT,
    AppPermission.OP_CLOSE_DAY, AppPermission.OP_CREATE_PO,
    AppPermission.OP_RECEIVE_GRN, AppPermission.OP_APPROVE_PO,
    AppPermission.OP_CREATE_SUPPLIER_INVOICE, AppPermission.OP_APPROVE_SUPPLIER_INVOICE,
  ],

  [UserRole.PARTNER]: [
    AppPermission.NAV_DASHBOARD, AppPermission.NAV_ADMIN_DASHBOARD,
    AppPermission.NAV_REPORTS, AppPermission.NAV_FINANCE,
    AppPermission.NAV_CRM, AppPermission.NAV_ORDERS,
    AppPermission.NAV_INVENTORY, AppPermission.NAV_PEOPLE,
    AppPermission.NAV_APPROVAL, AppPermission.NAV_FORENSICS,
    AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS,
    AppPermission.DATA_VIEW_PROFITS, AppPermission.DATA_VIEW_AUDIT_LOGS,
    AppPermission.DATA_VIEW_SALARIES,
    AppPermission.CFG_MANAGE_BRANCHES,
  ],

  [UserRole.OWNER_VIEWER]: [
    AppPermission.NAV_DASHBOARD, AppPermission.NAV_ADMIN_DASHBOARD,
    AppPermission.NAV_REPORTS, AppPermission.NAV_FINANCE,
    AppPermission.NAV_CRM, AppPermission.NAV_ORDERS,
    AppPermission.NAV_INVENTORY,
    AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS,
    AppPermission.DATA_VIEW_PROFITS,
  ],

  [UserRole.CEO]: [
    AppPermission.NAV_DASHBOARD, AppPermission.NAV_ADMIN_DASHBOARD,
    AppPermission.NAV_REPORTS, AppPermission.NAV_FINANCE,
    AppPermission.NAV_CRM, AppPermission.NAV_ORDERS,
    AppPermission.NAV_INVENTORY, AppPermission.NAV_PEOPLE,
    AppPermission.NAV_APPROVAL, AppPermission.NAV_FORENSICS,
    AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS,
    AppPermission.DATA_VIEW_PROFITS, AppPermission.DATA_VIEW_AUDIT_LOGS,
    AppPermission.DATA_VIEW_SALARIES,
  ],

  [UserRole.COO]: [
    AppPermission.NAV_DASHBOARD, AppPermission.NAV_POS,
    AppPermission.NAV_KDS, AppPermission.NAV_PICKUP, AppPermission.NAV_ORDERS,
    AppPermission.NAV_INVENTORY, AppPermission.NAV_REPORTS,
    AppPermission.NAV_DISPATCH, AppPermission.NAV_PRODUCTION,
    AppPermission.NAV_WASTAGE, AppPermission.NAV_FLOOR_PLAN,
    AppPermission.NAV_CRM, AppPermission.NAV_MENU_MANAGER,
    AppPermission.NAV_RECIPES, AppPermission.NAV_PRINTERS,
    AppPermission.NAV_REFUNDS, AppPermission.NAV_PLATFORMS,
    AppPermission.NAV_APPROVAL,
    AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS,
    AppPermission.DATA_VIEW_STOCK_LEVELS,
    AppPermission.OP_PLACE_ORDER, AppPermission.OP_TRANSFER_STOCK,
    AppPermission.OP_ADJUST_STOCK, AppPermission.OP_CLOSE_DAY,
  ],

  [UserRole.GENERAL_MANAGER]: [
    AppPermission.NAV_DASHBOARD, AppPermission.NAV_POS,
    AppPermission.NAV_KDS, AppPermission.NAV_PICKUP, AppPermission.NAV_ORDERS,
    AppPermission.NAV_INVENTORY, AppPermission.NAV_FINANCE,
    AppPermission.NAV_REPORTS, AppPermission.NAV_CRM,
    AppPermission.NAV_MENU_MANAGER, AppPermission.NAV_PEOPLE,
    AppPermission.NAV_DISPATCH, AppPermission.NAV_APPROVAL,
    AppPermission.NAV_RECIPES, AppPermission.NAV_PRINTERS,
    AppPermission.NAV_FLOOR_PLAN, AppPermission.NAV_REFUNDS,
    AppPermission.NAV_MARKETING, AppPermission.NAV_WHATSAPP,
    AppPermission.NAV_PLATFORMS,
    AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS,
    AppPermission.DATA_VIEW_PROFITS, AppPermission.DATA_VIEW_STOCK_LEVELS,
    AppPermission.OP_PLACE_ORDER, AppPermission.OP_APPLY_DISCOUNT,
    AppPermission.OP_TRANSFER_STOCK, AppPermission.OP_ADJUST_STOCK,
    AppPermission.OP_CREATE_PO, AppPermission.OP_RECEIVE_GRN,
    AppPermission.OP_VOID_ORDER, AppPermission.OP_CLOSE_DAY,
  ],

  [UserRole.BRANCH_MANAGER]: [
    AppPermission.NAV_DASHBOARD, AppPermission.NAV_POS,
    AppPermission.NAV_KDS, AppPermission.NAV_PICKUP, AppPermission.NAV_INVENTORY,
    AppPermission.NAV_ORDERS,
    AppPermission.NAV_REPORTS, AppPermission.NAV_MENU_MANAGER,
    AppPermission.NAV_CRM, AppPermission.NAV_FINANCE,
    AppPermission.NAV_PEOPLE, AppPermission.NAV_PRODUCTION,
    AppPermission.NAV_WASTAGE, AppPermission.NAV_FLOOR_PLAN,
    AppPermission.NAV_AI_ASSISTANT, AppPermission.NAV_USER_MANAGEMENT,
    AppPermission.NAV_RECIPES, AppPermission.NAV_PRINTERS,
    AppPermission.NAV_DISPATCH, AppPermission.NAV_REFUNDS,
    AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS,
    AppPermission.DATA_VIEW_STOCK_LEVELS,
    AppPermission.OP_PLACE_ORDER, AppPermission.OP_APPLY_DISCOUNT,
    AppPermission.OP_TRANSFER_STOCK, AppPermission.OP_ADJUST_STOCK,
    AppPermission.OP_VOID_ORDER, AppPermission.OP_CLOSE_DAY,
    AppPermission.CFG_MANAGE_USERS, AppPermission.CFG_MANAGE_ROLES,
  ],

  [UserRole.CASHIER]: [
    AppPermission.NAV_POS, AppPermission.NAV_DASHBOARD,
    AppPermission.OP_PLACE_ORDER, AppPermission.OP_MANAGE_CASH_DRAWER,
    AppPermission.OP_CLOSE_DAY,
  ],

  [UserRole.WAITER]: [
    AppPermission.NAV_POS, AppPermission.NAV_KDS,
    AppPermission.NAV_FLOOR_PLAN,
    AppPermission.OP_PLACE_ORDER,
  ],

  [UserRole.CAPTAIN]: [
    AppPermission.NAV_POS, AppPermission.NAV_KDS,
    AppPermission.NAV_FLOOR_PLAN,
    AppPermission.OP_PLACE_ORDER, AppPermission.OP_VOID_ORDER,
  ],

  [UserRole.DRIVER]: [
    AppPermission.NAV_DRIVER,
  ],

  [UserRole.KITCHEN_STAFF]: [
    AppPermission.NAV_KDS,
  ],

  [UserRole.CALL_CENTER]: [
    AppPermission.NAV_CALL_CENTER, AppPermission.NAV_CRM,
    AppPermission.NAV_DISPATCH,
    AppPermission.OP_PLACE_ORDER,
    AppPermission.DATA_VIEW_CUSTOMER_SENSITIVE,
    AppPermission.NAV_AI_ASSISTANT,
  ],

  [UserRole.CALL_CENTER_MANAGER]: [
    AppPermission.NAV_CALL_CENTER, AppPermission.NAV_CRM,
    AppPermission.NAV_DISPATCH, AppPermission.NAV_REPORTS,
    AppPermission.NAV_WHATSAPP, AppPermission.NAV_PLATFORMS,
    AppPermission.OP_PLACE_ORDER, AppPermission.OP_VOID_ORDER,
    AppPermission.DATA_VIEW_CUSTOMER_SENSITIVE,
    AppPermission.NAV_AI_ASSISTANT, AppPermission.DATA_VIEW_REVENUE,
  ],

  [UserRole.CASHIER_MANAGER]: [
    AppPermission.NAV_POS, AppPermission.NAV_DASHBOARD,
    AppPermission.OP_PLACE_ORDER, AppPermission.OP_MANAGE_CASH_DRAWER,
    AppPermission.OP_CLOSE_DAY, AppPermission.OP_PROCESS_REFUND,
    AppPermission.OP_VOID_ORDER, AppPermission.NAV_REPORTS,
    AppPermission.NAV_REFUNDS, AppPermission.NAV_PICKUP, AppPermission.NAV_ORDERS,
    AppPermission.DATA_VIEW_REVENUE,
  ],

  [UserRole.WAREHOUSE_STAFF]: [
    AppPermission.NAV_INVENTORY,
    AppPermission.DATA_VIEW_STOCK_LEVELS,
    AppPermission.OP_TRANSFER_STOCK, AppPermission.OP_ADJUST_STOCK,
    AppPermission.OP_RECEIVE_GRN,
  ],

  [UserRole.WAREHOUSE_DIRECTOR]: [
    AppPermission.NAV_INVENTORY, AppPermission.NAV_PRODUCTION,
    AppPermission.NAV_WASTAGE, AppPermission.NAV_REPORTS,
    AppPermission.NAV_APPROVAL,
    AppPermission.DATA_VIEW_STOCK_LEVELS, AppPermission.DATA_VIEW_COSTS,
    AppPermission.OP_TRANSFER_STOCK, AppPermission.OP_ADJUST_STOCK,
    AppPermission.OP_RECEIVE_GRN, AppPermission.OP_APPROVE_PO,
  ],

  [UserRole.PRODUCTION_STAFF]: [
    AppPermission.NAV_PRODUCTION, AppPermission.NAV_RECIPES,
    AppPermission.DATA_VIEW_STOCK_LEVELS,
  ],

  [UserRole.PROCUREMENT_MANAGER]: [
    AppPermission.NAV_INVENTORY, AppPermission.NAV_REPORTS,
    AppPermission.NAV_APPROVAL,
    AppPermission.DATA_VIEW_COSTS, AppPermission.DATA_VIEW_STOCK_LEVELS,
    AppPermission.OP_CREATE_PO, AppPermission.OP_RECEIVE_GRN,
    AppPermission.OP_APPROVE_PO, AppPermission.OP_CREATE_SUPPLIER_INVOICE,
  ],

  [UserRole.ACCOUNTANT]: [
    AppPermission.NAV_FINANCE, AppPermission.NAV_REPORTS,
    AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS,
    AppPermission.DATA_VIEW_PROFITS,
  ],

  [UserRole.COST_ACCOUNTANT]: [
    AppPermission.NAV_RECIPES, AppPermission.NAV_MENU_MANAGER,
    AppPermission.NAV_INVENTORY, AppPermission.NAV_REPORTS,
    AppPermission.NAV_WASTAGE,
    AppPermission.DATA_VIEW_COSTS, AppPermission.DATA_VIEW_STOCK_LEVELS,
  ],

  [UserRole.FINANCE_DIRECTOR]: [
    AppPermission.NAV_FINANCE, AppPermission.NAV_REPORTS,
    AppPermission.NAV_FORENSICS, AppPermission.NAV_APPROVAL,
    AppPermission.NAV_TREASURY, AppPermission.NAV_DASHBOARD,
    AppPermission.DATA_VIEW_REVENUE, AppPermission.DATA_VIEW_COSTS,
    AppPermission.DATA_VIEW_PROFITS, AppPermission.DATA_VIEW_AUDIT_LOGS,
    AppPermission.OP_CLOSE_DAY,
  ],

  [UserRole.HR_MANAGER]: [
    AppPermission.NAV_PEOPLE, AppPermission.NAV_REPORTS,
    AppPermission.NAV_ATTENDANCE, AppPermission.NAV_PAYROLL,
    AppPermission.DATA_VIEW_SALARIES,
  ],

  [UserRole.PAYROLL_OFFICER]: [
    AppPermission.NAV_PAYROLL, AppPermission.NAV_PEOPLE,
    AppPermission.OP_PROCESS_PAYROLL,
    AppPermission.DATA_VIEW_SALARIES,
  ],

  [UserRole.TREASURY_OFFICER]: [
    AppPermission.NAV_TREASURY, AppPermission.NAV_FINANCE,
    AppPermission.NAV_DASHBOARD,
    AppPermission.OP_MANAGE_CASH_DRAWER, AppPermission.OP_CLOSE_DAY,
    AppPermission.DATA_VIEW_REVENUE,
  ],

  [UserRole.TECH_SUPPORT]: [
    AppPermission.NAV_SETTINGS, AppPermission.NAV_PRINTERS,
    AppPermission.NAV_FORENSICS,
    AppPermission.CFG_OFFLINE_MODE,
  ],

  [UserRole.QUALITY_OFFICER]: [
    AppPermission.NAV_INVENTORY, AppPermission.NAV_PRODUCTION,
    AppPermission.NAV_WASTAGE, AppPermission.NAV_QUALITY,
    AppPermission.DATA_VIEW_STOCK_LEVELS,
  ],

  [UserRole.CUSTOM]: [],
};

export type AppTheme =
  | 'mica-glass'
  | 'fluent-clean'
  | 'material-soft'
  | 'neumorphism-soft'
  | 'flat-minimal'
  | 'fintech-sharp'
  | 'cupertino-light'
  | 'monochrome-pro'
  | 'warm-beige'
  | 'dark-elegant';

export interface AppSettings {
  restaurantName: string;
  restaurantNameAr?: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
  serviceCharge: number;
  language: 'en' | 'ar';
  timezone?: string;
  isDarkMode: boolean;
  isTouchMode: boolean;
  theme: AppTheme;
  accentColor?: string;
  branchAddress: string;
  phone: string;
  receiptLogoUrl?: string;
  receiptQrUrl?: string;
  receiptBrandingByOrderType?: Partial<Record<OrderType, { logoUrl?: string; qrUrl?: string }>>;
  receiptTemplates?: Array<Record<string, any>>;
  primaryCashierPrinterId?: string;
  cashierReceiptCopies?: number;
  autoPrintReceipt?: boolean;
  autoPrintReceiptOnSubmit?: boolean;
  autoPrintCompletionReceipt?: boolean;
  orderManualKitchenFlow?: boolean;
  autoCompleteDirectOrders?: boolean;
  autoPrintReports?: boolean;
  endOfDayEmailEnabled?: boolean;
  endOfDayEmailRecipients?: string[];
  dayCloseRequireStockCount?: boolean;
  dayCloseWhatsappRecipients?: string[];
  blindShiftReconciliation?: boolean;
  maxKitchenPrinters?: number;
  activeBranchId?: string; // Current operating branch context
  currentUser?: User;
  geminiApiKey?: string;
  priceListId?: string; // Currently active price list
  syncAuthority: 'SERVER' | 'LOCAL'; // For conflict resolution
  branchHierarchy: {
    id: string;
    level: 'MASTER' | 'REGIONAL' | 'BRANCH';
    parentId?: string;
  };
  wallpaper?: string;           // Wallpaper key, 'custom', or 'none'
  wallpaperOpacity?: number;    // 0.05–0.35 typical range
  customWallpaperUrl?: string;  // Data URL for user-uploaded wallpaper
  rolePermissionOverrides?: Record<string, AppPermission[]>;
  customRoles?: CustomRole[];
}

export enum ProductionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface ProductionOrder {
  id: string;
  targetItemId: string; // The composite item to produce
  quantityRequested: number;
  quantityProduced: number;
  warehouseId: string; // The production warehouse/kitchen
  status: ProductionStatus;
  batchNumber: string;
  createdAt: Date;
  completedAt?: Date;
  actorId: string;
  ingredientsConsumed: {
    itemId: string;
    quantity: number;
  }[];
}

export interface Employee {
  id: string;
  userId: string;
  nationalId?: string;
  joinDate: Date;
  salary: number;
  salaryType: 'MONTHLY' | 'HOURLY';
  emergencyContact: string;
  activeShiftId?: string;
  bankAccount?: string;
  departmentId?: string;
  jobTitleId?: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  status: 'AVAILABLE' | 'ON_DELIVERY' | 'BUSY' | 'BREAK' | 'OFFLINE' | 'RETURNING';
  vehicleType: 'BIKE' | 'CAR' | 'SCOOTER';
  currentOrderId?: string;
  branchId?: string;
  isActive?: boolean;
}

export type ViewState = 'DASHBOARD' | 'POS' | 'KDS' | 'INVENTORY' | 'FINANCE' | 'CRM' | 'REPORTS' | 'MENU_MANAGER' | 'AI_ASSISTANT' | 'AI_INSIGHTS' | 'SETTINGS' | 'CALL_CENTER' | 'FORENSICS' | 'SECURITY' | 'RECIPES' | 'PRINTERS' | 'PRODUCTION' | 'PEOPLE' | 'DISPATCH';
