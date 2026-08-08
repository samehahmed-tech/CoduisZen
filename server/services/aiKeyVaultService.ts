import crypto from 'crypto';
import { db } from '../db';
import { settings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { AI_FREE_MODELS, AI_MODEL_SETTING_KEY, DEFAULT_FREE_MODEL, normalizeModel, GROQ_MODELS, GROQ_MODEL_SETTING_KEY, DEFAULT_GROQ_MODEL, normalizeGroqModel } from './aiModelCatalog';

type AiKeySource = 'DEFAULT' | 'CUSTOM';
export type AiProvider = 'SYSTEM' | 'OPENROUTER' | 'OLLAMA' | 'GPT4JS' | 'GROQ';

const AI_KEY_SOURCE_KEY = 'aiApiKeySource';
const AI_KEY_ENCRYPTED_KEY = 'aiApiKeyEncrypted';
const AI_GROQ_KEY_ENCRYPTED_KEY = 'aiGroqKeyEncrypted';
const AI_PROVIDER_KEY = 'aiProvider';
const AI_OLLAMA_MODEL_KEY = 'aiOllamaModel';
const GPT4JS_PROVIDER = String(process.env.GPT4JS_PROVIDER || 'BlackBox').trim() || 'BlackBox';
const GPT4JS_MODEL = String(process.env.GPT4JS_MODEL || '').trim();
const CACHE_TTL_MS = 60_000;

const OLLAMA_ENABLED = String(process.env.OLLAMA_ENABLED || 'false').trim().toLowerCase() === 'true';
const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim();
const OLLAMA_MODEL_ENV = String(process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct').trim();

let cache: { at: number; source: AiKeySource; encrypted: string; groqEncrypted: string; model: string; provider: AiProvider; ollamaModel: string; groqModel: string } | null = null;

const readDefaultKey = () =>
    String(
        process.env.OPENROUTER_API_KEY ||
        process.env.VITE_OPENROUTER_API_KEY ||
        '',
    ).trim();

const readDefaultGroqKey = () =>
    String(
        process.env.GROQ_API_KEY ||
        process.env.VITE_GROQ_API_KEY ||
        '',
    ).trim();

const getEncryptionSecret = () => {
    const secret = String(process.env.AI_KEY_ENCRYPTION_SECRET || '').trim();
    if (!secret) {
        throw new Error('AI_KEY_ENCRYPTION_SECRET_MISSING');
    }
    return secret;
};

const getCipherKey = () => crypto.createHash('sha256').update(getEncryptionSecret()).digest();

const encrypt = (plain: string) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getCipherKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decrypt = (raw: string) => {
    const [ivB64, tagB64, dataB64] = String(raw || '').split(':');
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('AI_KEY_DECRYPT_FORMAT_INVALID');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getCipherKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
};

const maskKey = (key: string) => {
    const text = String(key || '').trim();
    if (!text) return '';
    if (text.length <= 12) return `${text.slice(0, 3)}***${text.slice(-2)}`;
    return `${text.slice(0, 6)}***${text.slice(-4)}`;
};

const loadRaw = async () => {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_TTL_MS) return cache;

    const [sourceRow, encRow, modelRow, providerRow, ollamaModelRow, groqEncRow, groqModelRow] = await Promise.all([
        db.select().top(1).from(settings).where(eq(settings.key, AI_KEY_SOURCE_KEY)),
        db.select().top(1).from(settings).where(eq(settings.key, AI_KEY_ENCRYPTED_KEY)),
        db.select().top(1).from(settings).where(eq(settings.key, AI_MODEL_SETTING_KEY)),
        db.select().top(1).from(settings).where(eq(settings.key, AI_PROVIDER_KEY)),
        db.select().top(1).from(settings).where(eq(settings.key, AI_OLLAMA_MODEL_KEY)),
        db.select().top(1).from(settings).where(eq(settings.key, AI_GROQ_KEY_ENCRYPTED_KEY)),
        db.select().top(1).from(settings).where(eq(settings.key, GROQ_MODEL_SETTING_KEY)),
    ]);

    const requestedSource = String(sourceRow?.[0]?.value || 'DEFAULT').toUpperCase();
    const encrypted = String(encRow?.[0]?.value || '');
    const groqEncrypted = String(groqEncRow?.[0]?.value || '');
    const model = normalizeModel(String(modelRow?.[0]?.value || DEFAULT_FREE_MODEL));
    const groqModel = normalizeGroqModel(String(groqModelRow?.[0]?.value || DEFAULT_GROQ_MODEL));

    const providerRaw = String(providerRow?.[0]?.value || '').trim().toUpperCase();
    const hasGroqKey = Boolean(groqEncrypted || readDefaultGroqKey());
    let provider: AiProvider;
    if (providerRaw === 'OPENROUTER') provider = 'OPENROUTER';
    else if (providerRaw === 'GROQ') provider = 'GROQ';
    else provider = hasGroqKey ? 'GROQ' : 'SYSTEM';
    const keyedProvider = provider === 'OPENROUTER' || provider === 'GROQ';
    const source = (keyedProvider && requestedSource === 'CUSTOM' ? 'CUSTOM' : 'DEFAULT') as AiKeySource;

    const ollamaModel = String(ollamaModelRow?.[0]?.value || OLLAMA_MODEL_ENV).trim() || OLLAMA_MODEL_ENV;

    cache = { at: now, source, encrypted, groqEncrypted, model, provider, ollamaModel, groqModel };
    return cache;
};

const upsert = async (key: string, value: any, category = 'ai_security') => {
    const existing = await db.select().top(1).from(settings).where(eq(settings.key, key));
    if (existing.length > 0) {
        await db.update(settings)
            .set({ value, category, updatedAt: new Date() })
            .where(eq(settings.key, key));
    } else {
        await db.insert(settings).values({
            key,
            value,
            category,
            updatedAt: new Date(),
        } as any);
    }
};

export const aiKeyVaultService = {
    async getConfig() {
        const raw = await loadRaw();
        const defaultKey = readDefaultKey();
        const defaultGroqKey = readDefaultGroqKey();
        const hasCustomKey = Boolean(raw.encrypted);
        const hasCustomGroqKey = Boolean(raw.groqEncrypted);
        let maskedCustomKey: string | null = null;
        let maskedCustomGroqKey: string | null = null;
        if (hasCustomKey) {
            try {
                maskedCustomKey = maskKey(decrypt(raw.encrypted));
            } catch {
                maskedCustomKey = null;
            }
        }
        if (hasCustomGroqKey) {
            try {
                maskedCustomGroqKey = maskKey(decrypt(raw.groqEncrypted));
            } catch {
                maskedCustomGroqKey = null;
            }
        }
        return {
            provider: raw.provider,
            providerOptions: [
                { id: 'SYSTEM', label: 'System Copilot (Free, No Key)' },
                { id: 'GROQ', label: 'Groq (Fast API)' },
            ],
            ollama: {
                enabled: OLLAMA_ENABLED,
                baseUrl: OLLAMA_BASE_URL,
                model: raw.ollamaModel || OLLAMA_MODEL_ENV,
                modelDefault: OLLAMA_MODEL_ENV,
            },
            groq: {
                model: raw.groqModel || DEFAULT_GROQ_MODEL,
                modelDefault: DEFAULT_GROQ_MODEL,
                usingDefaultAvailable: Boolean(defaultGroqKey),
            },
            source: raw.source,
            hasCustomKey,
            maskedCustomKey,
            usingDefaultAvailable: Boolean(defaultKey),
            model: raw.model,
            availableModels: AI_FREE_MODELS,
            defaultModel: DEFAULT_FREE_MODEL,
            availableGroqModels: GROQ_MODELS,
            defaultGroqModel: DEFAULT_GROQ_MODEL,
            hasCustomGroqKey,
            maskedCustomGroqKey,
        };
    },

    async updateConfig(input: { source: AiKeySource; customKey?: string; model?: string; provider?: AiProvider; ollamaModel?: string; groqModel?: string }) {
        const requestedSource = input.source === 'CUSTOM' ? 'CUSTOM' : 'DEFAULT';
        const current = await loadRaw();
        let encrypted = current.encrypted;
        let groqEncrypted = current.groqEncrypted;
        const model = normalizeModel(input.model || current.model || DEFAULT_FREE_MODEL);
        const providerRaw = String(input.provider || current.provider || '').toUpperCase();
        const provider: AiProvider = providerRaw === 'OPENROUTER'
            ? 'OPENROUTER'
            : providerRaw === 'GROQ'
                ? 'GROQ'
                : 'SYSTEM';
        const keyedProvider = provider === 'OPENROUTER' || provider === 'GROQ';
        const source = keyedProvider ? requestedSource : 'DEFAULT';
        const ollamaModel = String(input.ollamaModel || current.ollamaModel || OLLAMA_MODEL_ENV).trim() || OLLAMA_MODEL_ENV;
        const groqModel = normalizeGroqModel(input.groqModel || current.groqModel || DEFAULT_GROQ_MODEL);

        if (provider === 'OPENROUTER' && source === 'CUSTOM') {
            const next = String(input.customKey || '').trim();
            if (next) {
                encrypted = encrypt(next);
                await upsert(AI_KEY_ENCRYPTED_KEY, encrypted);
            } else if (!encrypted) {
                throw new Error('CUSTOM_AI_KEY_REQUIRED');
            }
        }

        if (provider === 'GROQ' && source === 'CUSTOM') {
            const next = String(input.customKey || '').trim();
            if (next) {
                groqEncrypted = encrypt(next);
                await upsert(AI_GROQ_KEY_ENCRYPTED_KEY, groqEncrypted);
            } else if (!groqEncrypted) {
                throw new Error('CUSTOM_AI_KEY_REQUIRED');
            }
        }

        await upsert(AI_KEY_SOURCE_KEY, source);
        await upsert(AI_MODEL_SETTING_KEY, model, 'ai_runtime');
        await upsert(AI_PROVIDER_KEY, provider, 'ai_runtime');
        await upsert(AI_OLLAMA_MODEL_KEY, ollamaModel, 'ai_runtime');
        await upsert(GROQ_MODEL_SETTING_KEY, groqModel, 'ai_runtime');
        cache = null;
        return this.getConfig();
    },

    async resolveActiveKey(): Promise<string> {
        const { source, encrypted } = await loadRaw();
        const defaultKey = readDefaultKey();
        if (source === 'CUSTOM' && encrypted) {
            return decrypt(encrypted);
        }
        return defaultKey;
    },

    async resolveGroqKey(): Promise<string> {
        const { source, groqEncrypted } = await loadRaw();
        const defaultGroqKey = readDefaultGroqKey();
        if (source === 'CUSTOM' && groqEncrypted) {
            return decrypt(groqEncrypted);
        }
        return defaultGroqKey;
    },

    async resolveGroqModel(): Promise<string> {
        const { groqModel } = await loadRaw();
        return groqModel || DEFAULT_GROQ_MODEL;
    },

    async resolveProvider(): Promise<AiProvider> {
        const { provider } = await loadRaw();
        return provider;
    },

    async resolveOpenRouterModel(): Promise<string> {
        const { model } = await loadRaw();
        return model;
    },

    async resolveOllamaModel(): Promise<string> {
        const { ollamaModel } = await loadRaw();
        return ollamaModel || OLLAMA_MODEL_ENV;
    },
    resolveGpt4jsConfig() {
        return { provider: GPT4JS_PROVIDER, model: GPT4JS_MODEL };
    },
};
