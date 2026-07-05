export const AI_MODEL_SETTING_KEY = 'aiModel';
// Keep Gemini as preferred default when available, with automatic runtime fallback.
export const DEFAULT_FREE_MODEL = 'google/gemini-2.0-flash-exp:free';

export const AI_FREE_MODELS = [
    // Preferred/Google first
    { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)', provider: 'Google' },
    { id: 'google/gemma-3-12b-it:free', label: 'Gemma 3 12B (Free)', provider: 'Google' },
    { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (Free)', provider: 'Google' },
    { id: 'google/gemma-3-4b-it:free', label: 'Gemma 3 4B (Free)', provider: 'Google' },
    { id: 'google/gemma-3n-e4b-it:free', label: 'Gemma 3n 4B (Free)', provider: 'Google' },

    // Other currently available free models
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B Instruct (Free)', provider: 'Meta' },
    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1 24B (Free)', provider: 'Mistral' },
    { id: 'qwen/qwen3-next-80b-a3b-instruct:free', label: 'Qwen3 Next 80B A3B (Free)', provider: 'Qwen' },
    { id: 'qwen/qwen3-4b:free', label: 'Qwen3 4B (Free)', provider: 'Qwen' },
    { id: 'deepseek/deepseek-r1-0528:free', label: 'DeepSeek R1 0528 (Free)', provider: 'DeepSeek' },
    { id: 'openai/gpt-oss-120b:free', label: 'OpenAI gpt-oss-120b (Free)', provider: 'OpenAI' },
    { id: 'openai/gpt-oss-20b:free', label: 'OpenAI gpt-oss-20b (Free)', provider: 'OpenAI' },
] as const;

const FREE_MODEL_IDS: Set<string> = new Set(AI_FREE_MODELS.map((m) => m.id));

export const normalizeModel = (candidate?: string) => {
    const model = String(candidate || '').trim();
    if (!model || !FREE_MODEL_IDS.has(model)) return DEFAULT_FREE_MODEL;
    return model;
};

export const getModelCandidates = (selected: string) => {
    const preferred = normalizeModel(selected);
    return [preferred, ...AI_FREE_MODELS.map((m) => m.id).filter((id) => id !== preferred)];
};
