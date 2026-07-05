export {
    apiRequest,
    apiRequestBlob,
    checkHealth,
    getActionableErrorMessage,
} from './api/core';

export { setupApi } from './api/setup';
export { authApi } from './api/auth';
export { usersApi } from './api/users';
export { branchesApi } from './api/branches';
export { customersApi } from './api/customers';
export { menuApi } from './api/menu';
export { ordersApi } from './api/orders';
export { inventoryApi } from './api/inventory';
export { barcodeApi } from './api/barcode';
export { settingsApi } from './api/settings';
export { auditApi } from './api/audit';
export { shiftsApi } from './api/shifts';
export { approvalsApi, approvalApi } from './api/approval';
export { deliveryApi, callCenterSupervisorApi } from './api/delivery';
export { campaignsApi } from './api/campaigns';
export { analyticsApi } from './api/analytics';
export { hrApi, hrExtendedApi } from './api/hr';
export { financeApi } from './api/finance';
export { productionApi, suppliersApi, purchaseOrdersApi } from './api/procurement';
export { reportsApi } from './api/reports';
export { fiscalApi } from './api/fiscal';
export { dayCloseApi } from './api/dayClose';
export { wastageApi } from './api/wastage';
export { printersApi } from './api/printers';
export { tablesApi } from './api/tables';
export { platformsApi } from './api/platforms';
export { aiApi } from './api/ai';
export { printGatewayApi } from './api/printGateway';
export { whatsappApi } from './api/whatsapp';
export { inventoryIntelligenceApi } from './api/inventoryIntelligence';
export { refundApi } from './api/refunds';
export { recurringApi } from './api/recurring';

import { setupApi } from './api/setup';
import { authApi } from './api/auth';
import { usersApi } from './api/users';
import { branchesApi } from './api/branches';
import { customersApi } from './api/customers';
import { menuApi } from './api/menu';
import { ordersApi } from './api/orders';
import { inventoryApi } from './api/inventory';
import { barcodeApi } from './api/barcode';
import { settingsApi } from './api/settings';
import { auditApi } from './api/audit';
import { shiftsApi } from './api/shifts';
import { approvalsApi, approvalApi } from './api/approval';
import { deliveryApi, callCenterSupervisorApi } from './api/delivery';
import { campaignsApi } from './api/campaigns';
import { analyticsApi } from './api/analytics';
import { hrApi, hrExtendedApi } from './api/hr';
import { financeApi } from './api/finance';
import { productionApi, suppliersApi, purchaseOrdersApi } from './api/procurement';
import { reportsApi } from './api/reports';
import { fiscalApi } from './api/fiscal';
import { dayCloseApi } from './api/dayClose';
import { wastageApi } from './api/wastage';
import { printersApi } from './api/printers';
import { tablesApi } from './api/tables';
import { platformsApi } from './api/platforms';
import { aiApi } from './api/ai';
import { printGatewayApi } from './api/printGateway';
import { whatsappApi } from './api/whatsapp';
import { inventoryIntelligenceApi } from './api/inventoryIntelligence';
import { refundApi } from './api/refunds';
import { recurringApi } from './api/recurring';

export const api = {
    setup: setupApi,
    auth: authApi,
    users: usersApi,
    branches: branchesApi,
    customers: customersApi,
    menu: menuApi,
    orders: ordersApi,
    inventory: inventoryApi,
    barcode: barcodeApi,
    settings: settingsApi,
    audit: auditApi,
    shifts: shiftsApi,
    approvals: approvalsApi,
    approval: approvalApi,
    delivery: deliveryApi,
    callCenterSupervisor: callCenterSupervisorApi,
    campaigns: campaignsApi,
    analytics: analyticsApi,
    hr: hrApi,
    hrExtended: hrExtendedApi,
    financeEngine: financeApi,
    finance: financeApi,
    production: productionApi,
    suppliers: suppliersApi,
    purchaseOrders: purchaseOrdersApi,
    reports: reportsApi,
    fiscal: fiscalApi,
    dayClose: dayCloseApi,
    wastage: wastageApi,
    printers: printersApi,
    tables: tablesApi,
    platforms: platformsApi,
    ai: aiApi,
    printGateway: printGatewayApi,
    whatsapp: whatsappApi,
    inventoryIntelligence: inventoryIntelligenceApi,
    refunds: refundApi,
    recurring: recurringApi,
};
