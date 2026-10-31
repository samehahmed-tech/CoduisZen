import { apiRequest } from './core';

export const aiApi = {
    getRuntimeStatus: () => apiRequest<{ enabled: boolean; providerId: string; modelId: string | null }>('/ai/runtime-status'),
    getModels: (data: { provider: string; apiKey?: string; endpoint?: string }) =>
        apiRequest<{ provider: string; models: Array<{ id: string; label: string; provider: string }>; fetchedAt: string }>('/ai/models', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    getInsights: (branchId?: string) => {
        const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
        return apiRequest<{ insight: string; branchId: string | null; period: { from: string; to: string }; source: string; metrics: { totalRevenue: number; orderCount: number; avgTicket: number }; dataAsOf: string | null; dataFreshnessHours: number | null }>(`/ai/insights${query}`);
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
        apiRequest<{ text: string; actions: any[]; suggestion?: any | null; route?: { providerId: string; modelId: string; usedFallback: boolean; latencyMs?: number } | null }>('/ai/chat', {
            method: 'POST',
            body: JSON.stringify(data),
            timeoutMs: 100_000,
        }),
    previewAction: (data: { action: Record<string, any> } | { actionType: string; parameters?: Record<string, any> }) =>
        apiRequest<{ guarded: any; allowed: boolean; confirmationRequired?: boolean; confirmation?: string }>('/ai/action-preview', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    actionExecute: (data: { action: Record<string, any>; explanation?: string; confirmation?: string; adminPassword?: string } | { actionType: string; parameters?: Record<string, any>; explanation?: string; confirmation?: string; adminPassword?: string }) =>
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
            provider: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ' | 'GEMINI' | 'NVIDIA' | 'OPENAI_COMPATIBLE';
            providerOptions: Array<{ id: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ' | 'GEMINI' | 'NVIDIA' | 'OPENAI_COMPATIBLE'; label: string }>;
            configuredProviders: string[];
            fallbackProviders: string[];
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
            providerEndpoints?: Record<string, string>;
            providerModels?: Record<string, string>;
        }>('/ai/key-config'),
    updateKeyConfig: (data: { source: 'DEFAULT' | 'CUSTOM'; customKey?: string; model?: string; provider?: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ' | 'GEMINI' | 'NVIDIA' | 'OPENAI_COMPATIBLE'; ollamaModel?: string; groqModel?: string; endpoint?: string; providerModel?: string; fallbackProviders?: string[] }) =>
        apiRequest<{
            provider: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ' | 'GEMINI' | 'NVIDIA' | 'OPENAI_COMPATIBLE';
            providerOptions: Array<{ id: 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ' | 'GEMINI' | 'NVIDIA' | 'OPENAI_COMPATIBLE'; label: string }>;
            configuredProviders: string[];
            fallbackProviders: string[];
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
            providerEndpoints?: Record<string, string>;
            providerModels?: Record<string, string>;
        }>('/ai/key-config', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
};
