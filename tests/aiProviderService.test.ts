import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverProviderModels, queryProviderWithFallback } from '../server/services/aiProviderService';

describe('AI provider adapters', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('calls Gemini using its native generateContent contract', async () => {
        const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
            expect(url).toContain('/models/gemini-2.0-flash:generateContent?key=AIza-test');
            const body = JSON.parse(String(init.body));
            expect(body.contents[0].parts[0].text).toBe('Analyze sales');
            return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Sales are stable.' }] } }] }), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await queryProviderWithFallback([{
            providerId: 'GEMINI', apiKey: 'AIza-test', model: 'gemini-2.0-flash', prompt: 'Analyze sales',
        }]);

        expect(result.text).toBe('Sales are stable.');
        expect(result.providerId).toBe('GEMINI');
        expect(result.usedFallback).toBe(false);
    });

    it('falls back from NVIDIA to an OpenAI-compatible endpoint after a transient error', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes('integrate.api.nvidia.com')) return new Response(JSON.stringify({ error: 'busy' }), { status: 503 });
            return new Response(JSON.stringify({ choices: [{ message: { content: 'Fallback answer.' } }] }), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await queryProviderWithFallback([
            { providerId: 'NVIDIA', apiKey: 'nvapi-test', model: 'meta/llama-3.1-70b-instruct', prompt: 'Analyze stock' },
            { providerId: 'OPENAI_COMPATIBLE', apiKey: 'compat-test', model: 'backup-model', endpoint: 'https://backup.example.com/v1', prompt: 'Analyze stock' },
        ]);

        expect(result.text).toBe('Fallback answer.');
        expect(result.providerId).toBe('OPENAI_COMPATIBLE');
        expect(result.usedFallback).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('skips an unconfigured fallback provider instead of stopping the chain', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes('integrate.api.nvidia.com')) return new Response(JSON.stringify({ choices: [{ message: { content: 'NVIDIA answer.' } }] }), { status: 200 });
            throw new Error('unexpected provider call');
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await queryProviderWithFallback([
            { providerId: 'GEMINI', model: 'gemini-2.0-flash', prompt: 'Analyze', endpoint: 'https://generativelanguage.googleapis.com/v1beta' },
            { providerId: 'NVIDIA', apiKey: 'nvapi-test', model: 'meta/llama-3.1-70b-instruct', prompt: 'Analyze' },
        ]);

        expect(result.providerId).toBe('NVIDIA');
        expect(result.usedFallback).toBe(true);
    });

    it('hides NVIDIA utility models that cannot power the assistant chat', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            data: [
                { id: 'z-ai/glm-5.3-flash' },
                { id: 'nvidia/llama-3.2-nv-embedqa-1b-v1' },
                { id: 'nvidia/llama-3.1-nemoguard-8b-topic-control' },
                { id: 'nvidia/nvclip' },
                { id: 'google/diffusiongemma-26b-a4b-it' },
            ],
        }), { status: 200 })));

        const models = await discoverProviderModels({
            providerId: 'NVIDIA',
            apiKey: 'nvapi-test',
            endpoint: 'https://integrate.api.nvidia.com/v1',
        });

        expect(models.map((model) => model.id)).toEqual(['z-ai/glm-5.3-flash']);
    });
});
