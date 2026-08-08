import { describe, expect, it } from 'vitest';
import {
    DEFAULT_GROQ_MODEL,
    GROQ_MODELS,
    normalizeGroqModel,
} from '../server/services/aiModelCatalog';

describe('Groq model catalog', () => {
    it('keeps only supported production model ids', () => {
        expect(GROQ_MODELS.map((model) => model.id)).toEqual([
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
            'openai/gpt-oss-120b',
            'openai/gpt-oss-20b',
        ]);
    });

    it('falls back from removed or unknown model ids', () => {
        expect(normalizeGroqModel('mixtral-8x7b-32768')).toBe(DEFAULT_GROQ_MODEL);
        expect(normalizeGroqModel('')).toBe(DEFAULT_GROQ_MODEL);
        expect(normalizeGroqModel('openai/gpt-oss-120b')).toBe('openai/gpt-oss-120b');
    });
});
