import { describe, expect, it } from 'vitest';
import {
    AI_PROVIDER_IDS,
    getProviderCandidates,
    isRetryableProviderError,
    normalizeProviderError,
    runWithProviderFallback,
    validateProviderEndpoint,
} from '../server/services/aiProviderRegistry';

describe('AI provider orchestration contract', () => {
    it('exposes the supported provider families', () => {
        expect(AI_PROVIDER_IDS).toEqual([
            'SYSTEM',
            'OLLAMA',
            'OPENROUTER',
            'GROQ',
            'GEMINI',
            'NVIDIA',
            'OPENAI_COMPATIBLE',
        ]);
    });

    it('puts the selected provider first and removes unavailable duplicates', () => {
        expect(getProviderCandidates({
            selected: 'GEMINI',
            configured: ['SYSTEM', 'GEMINI', 'GEMINI', 'NVIDIA'],
        })).toEqual(['GEMINI', 'SYSTEM', 'NVIDIA']);

        expect(getProviderCandidates({ selected: 'NVIDIA', configured: [] })).toEqual(['SYSTEM']);
    });

    it('retries transient provider failures but not authentication failures', () => {
        expect(isRetryableProviderError({ status: 429 })).toBe(true);
        expect(isRetryableProviderError({ status: 503 })).toBe(true);
        expect(isRetryableProviderError({ status: 401 })).toBe(false);
        expect(isRetryableProviderError({ code: 'AI_TIMEOUT' })).toBe(true);
        expect(isRetryableProviderError({ code: 'AI_PROVIDER_KEY_MISSING' })).toBe(true);
    });

    it('redacts provider keys from stable errors', () => {
        const error = normalizeProviderError(new Error('Bearer sk-super-secret-123 failed'), 'GEMINI');
        expect(error.providerId).toBe('GEMINI');
        expect(error.message).not.toContain('sk-super-secret-123');
        expect(error.code).toBe('AI_PROVIDER_ERROR');
    });

    it('uses the first successful provider and reports fallback usage', async () => {
        const attempted: string[] = [];
        const result = await runWithProviderFallback(['GEMINI', 'NVIDIA'], async (provider) => {
            attempted.push(provider);
            if (provider === 'GEMINI') throw Object.assign(new Error('busy'), { status: 503 });
            return { text: 'ok', provider };
        });

        expect(attempted).toEqual(['GEMINI', 'NVIDIA']);
        expect(result).toMatchObject({ text: 'ok', provider: 'NVIDIA', usedFallback: true });
    });

    it('requires HTTPS for remote endpoints and pins managed providers', () => {
        expect(validateProviderEndpoint('OPENAI_COMPATIBLE', 'https://ai.example.com/v1', ['ai.example.com'])).toBe('https://ai.example.com/v1');
        expect(() => validateProviderEndpoint('OPENAI_COMPATIBLE', 'http://ai.example.com/v1')).toThrow('AI_ENDPOINT_HTTPS_REQUIRED');
        expect(() => validateProviderEndpoint('OPENAI_COMPATIBLE', 'https://ai.example.com/v1')).toThrow('AI_ENDPOINT_HOST_NOT_ALLOWED');
        expect(() => validateProviderEndpoint('GEMINI', 'https://evil.example.com/v1')).toThrow('AI_ENDPOINT_PROVIDER_MISMATCH');
        expect(validateProviderEndpoint('OLLAMA', 'http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434');
    });

    it('stops after one non-retryable provider error', async () => {
        const attempted: string[] = [];
        await expect(runWithProviderFallback(['GEMINI', 'NVIDIA'], async (provider) => {
            attempted.push(provider);
            throw Object.assign(new Error('unauthorized'), { status: 401 });
        })).rejects.toMatchObject({ code: 'AI_PROVIDER_AUTH_FAILED', providerId: 'GEMINI' });
        expect(attempted).toEqual(['GEMINI']);
    });
});
