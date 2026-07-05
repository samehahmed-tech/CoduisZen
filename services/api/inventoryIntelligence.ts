import { apiRequest } from './core';

export const inventoryIntelligenceApi = {
    getReorderAlerts: (warehouseId?: string) =>
        apiRequest<any[]>(`/inventory-intelligence/reorder-alerts${warehouseId ? `?warehouseId=${warehouseId}` : ''}`),
    getPurchaseSuggestions: (warehouseId?: string) =>
        apiRequest<any[]>(`/inventory-intelligence/purchase-suggestions${warehouseId ? `?warehouseId=${warehouseId}` : ''}`),
    convertUnit: (value: number, from: string, to: string) =>
        apiRequest<any>(`/inventory-intelligence/convert-unit?value=${value}&from=${from}&to=${to}`),
    getSupportedUnits: () =>
        apiRequest<string[]>('/inventory-intelligence/supported-units'),
    createStockCount: (warehouseId: string) =>
        apiRequest<any>('/inventory-intelligence/stock-count', { method: 'POST', body: JSON.stringify({ warehouseId }) }),
    updateStockCount: (sessionId: string, counts: { itemId: string; countedQty: number; notes?: string }[]) =>
        apiRequest<any>(`/inventory-intelligence/stock-count/${sessionId}`, { method: 'PUT', body: JSON.stringify({ counts }) }),
    completeStockCount: (sessionId: string, applyAdjustments?: boolean) =>
        apiRequest<any>(`/inventory-intelligence/stock-count/${sessionId}/complete`, { method: 'POST', body: JSON.stringify({ applyAdjustments }) }),
    getAIForecast: (itemId: string) =>
        apiRequest<string>(`/inventory-intelligence/forecast/${itemId}`),
};
