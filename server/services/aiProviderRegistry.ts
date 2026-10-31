export const AI_PROVIDER_IDS = [
    'SYSTEM',
    'OLLAMA',
    'OPENROUTER',
    'GROQ',
    'GEMINI',
    'NVIDIA',
    'OPENAI_COMPATIBLE',
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export type AiProviderDefinition = {
    id: AiProviderId;
    label: string;
    requiresKey: boolean;
    defaultEndpoint?: string;
    protocol: 'system' | 'ollama' | 'openai-compatible' | 'gemini';
};

export const AI_PROVIDER_DEFINITIONS: readonly AiProviderDefinition[] = [
    { id: 'SYSTEM', label: 'RestoFlow System Copilot', requiresKey: false, protocol: 'system' },
    { id: 'OLLAMA', label: 'Ollama Local', requiresKey: false, defaultEndpoint: 'http://127.0.0.1:11434', protocol: 'ollama' },
    { id: 'OPENROUTER', label: 'OpenRouter', requiresKey: true, defaultEndpoint: 'https://openrouter.ai/api/v1', protocol: 'openai-compatible' },
    { id: 'GROQ', label: 'Groq', requiresKey: true, defaultEndpoint: 'https://api.groq.com/openai/v1', protocol: 'openai-compatible' },
    { id: 'GEMINI', label: 'Google Gemini', requiresKey: true, defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta', protocol: 'gemini' },
    { id: 'NVIDIA', label: 'NVIDIA NIM', requiresKey: true, defaultEndpoint: 'https://integrate.api.nvidia.com/v1', protocol: 'openai-compatible' },
    { id: 'OPENAI_COMPATIBLE', label: 'OpenAI-compatible endpoint', requiresKey: true, protocol: 'openai-compatible' },
];

export const getProviderDefinition = (providerId: string): AiProviderDefinition =>
    AI_PROVIDER_DEFINITIONS.find((definition) => definition.id === normalizeProviderId(providerId))
    || AI_PROVIDER_DEFINITIONS[0];

export const validateProviderEndpoint = (providerId: string, endpoint: string, allowedHosts: string[] = []): string => {
    const normalized = String(endpoint || '').trim().replace(/\/$/, '');
    if (!normalized) return '';
    let parsed: URL;
    try { parsed = new URL(normalized); } catch { throw new Error('AI_ENDPOINT_INVALID'); }
    const provider = normalizeProviderId(providerId) || 'SYSTEM';
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) throw new Error('AI_ENDPOINT_HTTPS_REQUIRED');
    if (provider === 'GEMINI' && parsed.hostname !== 'generativelanguage.googleapis.com') throw new Error('AI_ENDPOINT_PROVIDER_MISMATCH');
    if (provider === 'NVIDIA' && parsed.hostname !== 'integrate.api.nvidia.com') throw new Error('AI_ENDPOINT_PROVIDER_MISMATCH');
    if (provider === 'OPENAI_COMPATIBLE' && !isLocal && !allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean).includes(parsed.hostname.toLowerCase())) {
        throw new Error('AI_ENDPOINT_HOST_NOT_ALLOWED');
    }
    return normalized;
};

export type AiProviderCandidateConfig = {
    selected?: string;
    configured?: string[];
};

export type AiProviderError = Error & {
    code: string;
    providerId: AiProviderId;
    status?: number;
    retryable: boolean;
};

const normalizeProviderId = (value: unknown): AiProviderId | null => {
    const normalized = String(value || '').trim().toUpperCase();
    return (AI_PROVIDER_IDS as readonly string[]).includes(normalized)
        ? normalized as AiProviderId
        : null;
};

export const getProviderCandidates = (config: AiProviderCandidateConfig): AiProviderId[] => {
    const configured = (config.configured || [])
        .map(normalizeProviderId)
        .filter((provider): provider is AiProviderId => Boolean(provider));
    const selected = normalizeProviderId(config.selected);
    const usableSelected = selected && configured.includes(selected) ? selected : null;
    const candidates = usableSelected ? [usableSelected, ...configured] : configured;
    const unique = [...new Set(candidates)];
    return unique.length > 0 ? unique : ['SYSTEM'];
};

export const isRetryableProviderError = (error: any): boolean => {
    const status = Number(error?.status || error?.statusCode || 0);
    const code = String(error?.code || '').toUpperCase();
    return status === 408
        || status === 409
        || status === 425
        || status === 429
        || status >= 500
        || ['AI_TIMEOUT', 'AI_PROVIDER_KEY_MISSING', 'AI_PROVIDER_NOT_CONFIGURED', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'FETCH_FAILED'].includes(code);
};

const stableProviderMessage = (error: any): string => {
    const raw = String(error?.message || error || 'AI provider request failed');
    return raw
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
        .replace(/(?:api[-_ ]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
        .slice(0, 300);
};

export const normalizeProviderError = (error: any, providerId: string): AiProviderError => {
    const provider = normalizeProviderId(providerId) || 'SYSTEM';
    const status = Number(error?.status || error?.statusCode || 0) || undefined;
    const retryable = isRetryableProviderError(error);
    const rawCode = String(error?.code || '').toUpperCase();
    const code = rawCode === 'AI_PROVIDER_KEY_MISSING' || rawCode === 'AI_PROVIDER_NOT_CONFIGURED'
        ? 'AI_PROVIDER_NOT_CONFIGURED'
        : status === 401 || status === 403
        ? 'AI_PROVIDER_AUTH_FAILED'
        : status === 404
            ? 'AI_MODEL_UNAVAILABLE'
            : retryable
                ? 'AI_PROVIDER_RETRYABLE'
                : 'AI_PROVIDER_ERROR';
    const normalized = new Error(stableProviderMessage(error)) as AiProviderError;
    normalized.name = 'AiProviderError';
    normalized.code = code;
    normalized.providerId = provider;
    normalized.status = status;
    normalized.retryable = code === 'AI_PROVIDER_NOT_CONFIGURED' || retryable;
    return normalized;
};

export async function runWithProviderFallback<T>(
    candidates: string[],
    execute: (providerId: AiProviderId) => Promise<T>,
): Promise<T & { usedFallback: boolean }> {
    const normalizedCandidates = getProviderCandidates({ configured: candidates });
    let lastError: AiProviderError | null = null;

    for (let index = 0; index < normalizedCandidates.length; index += 1) {
        const providerId = normalizedCandidates[index];
        try {
            const result = await execute(providerId);
            if (result && typeof result === 'object') {
                return { ...result, usedFallback: index > 0 } as T & { usedFallback: boolean };
            }
            return { text: String(result ?? ''), usedFallback: index > 0 } as unknown as T & { usedFallback: boolean };
        } catch (error: any) {
            const normalized = normalizeProviderError(error, providerId);
            lastError = normalized;
            if (!normalized.retryable) throw normalized;
        }
    }

    throw lastError || normalizeProviderError(new Error('AI_UNAVAILABLE'), 'SYSTEM');
}
