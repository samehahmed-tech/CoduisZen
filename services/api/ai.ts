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
            provider: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ';
            providerOptions: Array<{ id: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ'; label: string }>;
            ollama: { enabled: boolean; baseUrl: string; model: string; modelDefault: string };
            groq?: { model: string; modelDefault: string; usingDefaultAvailable: boolean };
            source: 'DEFAULT' | 'CUSTOM';
            hasCustomKey: boolean;
            maskedCustomKey: string | null;
            usingDefaultAvailable: boolean;
            model: string;
            defaultModel: string;
            availableModels: Array<{ id: string; label: string; provider: string }>;
            availableGroqModels?: Array<{ id: string; label: string; provider: string }>;
            defaultGroqModel?: string;
            hasCustomGroqKey?: boolean;
            maskedCustomGroqKey?: string | null;
        }>('/ai/key-config'),
    updateKeyConfig: (data: { source: 'DEFAULT' | 'CUSTOM'; customKey?: string; model?: string; provider?: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ'; ollamaModel?: string; groqModel?: string }) =>
        apiRequest<{
            provider: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ';
            providerOptions: Array<{ id: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ'; label: string }>;
            ollama: { enabled: boolean; baseUrl: string; model: string; modelDefault: string };
            groq?: { model: string; modelDefault: string; usingDefaultAvailable: boolean };
            source: 'DEFAULT' | 'CUSTOM';
            hasCustomKey: boolean;
            maskedCustomKey: string | null;
            usingDefaultAvailable: boolean;
            model: string;
            defaultModel: string;
            availableModels: Array<{ id: string; label: string; provider: string }>;
            availableGroqModels?: Array<{ id: string; label: string; provider: string }>;
            defaultGroqModel?: string;
            hasCustomGroqKey?: boolean;
            maskedCustomGroqKey?: string | null;
        }>('/ai/key-config', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
};
