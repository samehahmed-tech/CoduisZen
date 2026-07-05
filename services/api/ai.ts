import { apiRequest } from './core';

export const aiApi = {
    getInsights: (branchId?: string) => {
        const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
        return apiRequest<{ insight: string }>(`/ai/insights${query}`);
    },
    getForecast: (branchId?: string) => {
        const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
        return apiRequest<{
            historical: Array<{ date: string; revenue: number }>;
            forecast: Array<{ date: string; revenue: number }>;
            confidence: number;
            insight: string;
        }>(`/ai/forecast${query}`);
    },
    chat: (data: { message: string; context?: Record<string, any>; lang?: 'en' | 'ar' }) =>
        apiRequest<{ text: string; actions: any[]; suggestion?: any | null }>('/ai/chat', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    previewAction: (data: { action: Record<string, any> } | { actionType: string; parameters?: Record<string, any> }) =>
        apiRequest<{ guarded: any; allowed: boolean }>('/ai/action-preview', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    actionExecute: (data: { action: Record<string, any>; explanation?: string } | { actionType: string; parameters?: Record<string, any>; explanation?: string }) =>
        apiRequest<{ success: boolean; message: string; actionId: string; guarded?: any; result?: any }>('/ai/action-execute', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    executeAction: (data: { actionType: string; parameters?: Record<string, any>; explanation?: string }) =>
        apiRequest<{ success: boolean; message: string; actionId: string }>('/ai/execute', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    getKeyConfig: () =>
        apiRequest<{
            provider: 'OPENROUTER' | 'OLLAMA';
            providerOptions: Array<{ id: 'OPENROUTER' | 'OLLAMA'; label: string }>;
            ollama: { enabled: boolean; baseUrl: string; model: string; modelDefault: string };
            source: 'DEFAULT' | 'CUSTOM';
            hasCustomKey: boolean;
            maskedCustomKey: string | null;
            usingDefaultAvailable: boolean;
            model: string;
            defaultModel: string;
            availableModels: Array<{ id: string; label: string; provider: string }>;
        }>('/ai/key-config'),
    updateKeyConfig: (data: { source: 'DEFAULT' | 'CUSTOM'; customKey?: string; model?: string; provider?: 'OPENROUTER' | 'OLLAMA'; ollamaModel?: string }) =>
        apiRequest<{
            provider: 'OPENROUTER' | 'OLLAMA';
            providerOptions: Array<{ id: 'OPENROUTER' | 'OLLAMA'; label: string }>;
            ollama: { enabled: boolean; baseUrl: string; model: string; modelDefault: string };
            source: 'DEFAULT' | 'CUSTOM';
            hasCustomKey: boolean;
            maskedCustomKey: string | null;
            usingDefaultAvailable: boolean;
            model: string;
            defaultModel: string;
            availableModels: Array<{ id: string; label: string; provider: string }>;
        }>('/ai/key-config', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
};
