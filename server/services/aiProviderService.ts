import {
    AiProviderId,
    getProviderDefinition,
    normalizeProviderError,
    runWithProviderFallback,
} from './aiProviderRegistry';

export type AiProviderRequest = {
    providerId: AiProviderId;
    apiKey?: string;
    model: string;
    endpoint?: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
};

export type AiProviderResponse = {
    text: string;
    providerId: AiProviderId;
    modelId: string;
    usedFallback?: boolean;
    latencyMs: number;
};

export type AiProviderModel = { id: string; label: string; provider: string };

const requestJson = async (url: string, init: RequestInit, timeoutMs = 30_000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw Object.assign(new Error(data?.error?.message || data?.error || `AI_PROVIDER_HTTP_${response.status}`), { status: response.status });
        }
        return data;
    } catch (error: any) {
        if (error?.name === 'AbortError') throw Object.assign(new Error('AI_TIMEOUT'), { code: 'AI_TIMEOUT' });
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const queryOpenAiCompatible = async (request: AiProviderRequest): Promise<string> => {
    const definition = getProviderDefinition(request.providerId);
    const endpoint = String(request.endpoint || definition.defaultEndpoint || '').replace(/\/$/, '');
    if (!endpoint) throw new Error('AI_ENDPOINT_REQUIRED');
    if (!request.apiKey) throw Object.assign(new Error('AI_PROVIDER_KEY_MISSING'), { status: 401, code: 'AI_PROVIDER_KEY_MISSING' });
    const data = await requestJson(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify({
            model: request.model,
            messages: [
                { role: 'system', content: request.systemPrompt || 'You are an expert restaurant ERP assistant.' },
                { role: 'user', content: request.prompt },
            ],
            temperature: request.temperature ?? 0.3,
            max_tokens: request.maxTokens ?? 1200,
        }),
    }, request.providerId === 'NVIDIA' ? 80_000 : 30_000);
    return String(data?.choices?.[0]?.message?.content || '').trim();
};

const queryGemini = async (request: AiProviderRequest): Promise<string> => {
    const endpoint = String(request.endpoint || getProviderDefinition('GEMINI').defaultEndpoint || '').replace(/\/$/, '');
    if (!request.apiKey) throw Object.assign(new Error('AI_PROVIDER_KEY_MISSING'), { status: 401, code: 'AI_PROVIDER_KEY_MISSING' });
    const data = await requestJson(`${endpoint}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: request.systemPrompt ? { parts: [{ text: request.systemPrompt }] } : undefined,
            contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
            generationConfig: { temperature: request.temperature ?? 0.3, maxOutputTokens: request.maxTokens ?? 1200 },
        }),
    });
    return String(data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('') || '').trim();
};

const queryOllama = async (request: AiProviderRequest): Promise<string> => {
    const endpoint = String(request.endpoint || getProviderDefinition('OLLAMA').defaultEndpoint || '').replace(/\/$/, '');
    const data = await requestJson(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: request.model,
            stream: false,
            messages: [
                { role: 'system', content: request.systemPrompt || 'You are an expert restaurant ERP assistant.' },
                { role: 'user', content: request.prompt },
            ],
            options: { temperature: request.temperature ?? 0.3 },
        }),
    });
    return String(data?.message?.content || '').trim();
};

const executeProvider = async (request: AiProviderRequest): Promise<string> => {
    const protocol = getProviderDefinition(request.providerId).protocol;
    if (protocol === 'gemini') return queryGemini(request);
    if (protocol === 'ollama') return queryOllama(request);
    if (protocol === 'openai-compatible') return queryOpenAiCompatible(request);
    throw new Error('AI_PROVIDER_NOT_NETWORKED');
};

const modelLabel = (id: unknown) => String(id || '').replace(/^models\//, '').trim();

const NON_CHAT_MODEL_HINTS = /(embed|rerank|retriev|parse|detect|guard|safety|clip|translat|riva|reward|diffusion|deplot|calibration)/i;

const isAssistantChatModel = (model: AiProviderModel, provider: AiProviderId) => (
    provider !== 'NVIDIA' || !NON_CHAT_MODEL_HINTS.test(model.id)
);

const normalizeModels = (items: unknown, provider: AiProviderId): AiProviderModel[] => {
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    return items.map((item: any) => {
        const id = modelLabel(typeof item === 'string' ? item : item?.id || item?.name || item?.model);
        const label = String(typeof item === 'object' ? item?.displayName || item?.label || id : id).trim() || id;
        return { id, label, provider };
    }).filter((item) => item.id && !seen.has(item.id) && (seen.add(item.id), true)).slice(0, 250);
};

export const discoverProviderModels = async (request: Pick<AiProviderRequest, 'providerId' | 'apiKey' | 'endpoint'>): Promise<AiProviderModel[]> => {
    const definition = getProviderDefinition(request.providerId);
    const endpoint = String(request.endpoint || definition.defaultEndpoint || '').replace(/\/$/, '');
    if (request.providerId !== 'OLLAMA' && !request.apiKey) {
        throw Object.assign(new Error('AI_PROVIDER_KEY_MISSING'), { status: 401, code: 'AI_PROVIDER_KEY_MISSING' });
    }
    if (!endpoint && request.providerId !== 'SYSTEM') throw new Error('AI_ENDPOINT_REQUIRED');
    if (request.providerId === 'SYSTEM') return [];
    if (definition.protocol === 'gemini') {
        const data = await requestJson(`${endpoint}/models?key=${encodeURIComponent(request.apiKey || '')}`, { headers: { Accept: 'application/json' } });
        return normalizeModels(data?.models, request.providerId);
    }
    if (definition.protocol === 'ollama') {
        const data = await requestJson(`${endpoint}/api/tags`, { headers: { Accept: 'application/json' } });
        return normalizeModels(data?.models, request.providerId);
    }
    const data = await requestJson(`${endpoint}/models`, {
        headers: { Accept: 'application/json', ...(request.apiKey ? { Authorization: `Bearer ${request.apiKey}` } : {}) },
    });
    return normalizeModels(data?.data, request.providerId)
        .filter((model) => isAssistantChatModel(model, request.providerId));
};

export const queryProviderWithFallback = async (
    requests: AiProviderRequest[],
): Promise<AiProviderResponse> => {
    if (!requests.length) throw new Error('AI_PROVIDER_PLAN_EMPTY');
    const started = Date.now();
    const result = await runWithProviderFallback(requests.map((request) => request.providerId), async (providerId) => {
        const request = requests.find((candidate) => candidate.providerId === providerId) || requests[0];
        const text = await executeProvider(request);
        if (!text) throw normalizeProviderError(new Error('AI_EMPTY_RESPONSE'), providerId);
        return { text, providerId, modelId: request.model, latencyMs: Date.now() - started };
    });
    return result;
};
