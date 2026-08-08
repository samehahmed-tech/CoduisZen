import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryGroq } from '../server/services/aiService';

describe('Groq AI transport', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('uses the official chat completions endpoint and returns assistant text', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'جاهز للمساعدة' } }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(queryGroq('حلل المبيعات', 'System prompt', 'llama-3.3-70b-versatile', 'test-key'))
            .resolves.toBe('جاهز للمساعدة');

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
        expect(options.headers.Authorization).toBe('Bearer test-key');
        expect(JSON.parse(options.body).model).toBe('llama-3.3-70b-versatile');
    });

    it('surfaces Groq API errors without leaking the key', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ error: { message: 'invalid key' } }),
        }));

        await expect(queryGroq('hello', undefined, undefined, 'secret-test-key'))
            .rejects.toThrow('invalid key');
    });
});
