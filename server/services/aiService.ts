/**
 * AI Service - Backend Orchestration for LLM Analysis
 * Handles prompts, caching, and token control
 */

import { db } from '../db';
import { settings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import auditService from './auditService';
import { aiKeyVaultService } from './aiKeyVaultService';
import { AI_FREE_MODELS, AI_MODEL_SETTING_KEY, DEFAULT_FREE_MODEL, getModelCandidates, normalizeModel } from './aiModelCatalog';

const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim();
const OLLAMA_ENABLED = String(process.env.OLLAMA_ENABLED || 'false').trim().toLowerCase() === 'true';

const queryOllama = async (prompt: string, systemPrompt?: string, model?: string) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20_000);
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                model: String(model || process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct').trim(),
                stream: false,
                messages: [
                    { role: 'system', content: systemPrompt || 'You are an expert restaurant ERP assistant.' },
                    { role: 'user', content: prompt },
                ],
                options: {
                    temperature: 0.3,
                },
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.error || `OLLAMA_ERROR_${response.status}`);
        }
        return String(data?.message?.content || '');
    } finally {
        clearTimeout(t);
    }
};

export const aiService = {
    /**
     * Core wrapper for OpenRouter requests
     */
    async queryAI(prompt: string, systemPrompt?: string, useFallback = false) {
        const provider = await aiKeyVaultService.resolveProvider();
        const activeKey = await aiKeyVaultService.resolveActiveKey();

        // Fully free option: local Ollama (works on any client device as long as backend can reach Ollama).
        if (provider === 'OLLAMA') {
            const ollamaModel = await aiKeyVaultService.resolveOllamaModel();
            return queryOllama(prompt, systemPrompt, ollamaModel);
        }

        // If provider is OpenRouter but key is missing, allow Ollama if enabled (dev-friendly).
        if (!activeKey) {
            if (OLLAMA_ENABLED) {
                const ollamaModel = await aiKeyVaultService.resolveOllamaModel();
                return queryOllama(prompt, systemPrompt, ollamaModel);
            }
            throw new Error('AI_KEY_MISSING');
        }

        const selectedModel = normalizeModel(await aiKeyVaultService.resolveOpenRouterModel());
        const candidates = useFallback ? AI_FREE_MODELS.map((m) => m.id) : getModelCandidates(selectedModel);
        let lastError: any = null;

        for (const model of candidates) {
            const body = {
                model,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt || "You are an expert restaurant ERP assistant. Respond clearly in Arabic or English based on user language."
                    },
                    { role: "user", content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 1000,
            };

            try {
                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${activeKey}`,
                        "HTTP-Referer": "https://coduiszen.com",
                        "X-Title": "Coduis Zen Backend"
                    },
                    body: JSON.stringify(body)
                });

                const data = await response.json();
                if (!response.ok) {
                    lastError = new Error(data.error?.message || `AI_ERROR_${response.status}`);
                    if (response.status === 429) continue;
                    if (response.status === 404 || response.status === 400 || response.status === 503) continue;
                    continue;
                }

                return data.choices?.[0]?.message?.content || "";
            } catch (error: any) {
                lastError = error;
            }
        }

        if (!useFallback) {
            return this.queryAI(prompt, systemPrompt, true);
        }

        const text = String(lastError?.message || '').toLowerCase();
        const isOpenRouterFreeLimit = text.includes('free-models-per-day')
            || text.includes('free-models-per-min')
            || text.includes('rate limit');

        if (isOpenRouterFreeLimit && OLLAMA_ENABLED) {
            try {
                const ollamaModel = await aiKeyVaultService.resolveOllamaModel();
                return await queryOllama(prompt, systemPrompt, ollamaModel);
            } catch {
                // keep original error below
            }
        }
        throw lastError || new Error('AI_UNAVAILABLE');
    },

    /**
     * Get or generate an insight with caching
     */
    async getCachedInsight(cacheKey: string, generator: () => Promise<string>, ttlMinutes = 60) {
        const fullKey = `ai_insight_${cacheKey}`;

        const [cached] = await db.select().from(settings).where(eq(settings.key, fullKey));

        if (cached && cached.updatedAt) {
            const ageMs = Date.now() - new Date(cached.updatedAt).getTime();
            if (ageMs < ttlMinutes * 60 * 1000) {
                return cached.value as string;
            }
        }

        const newValue = await generator();

        const payload = {
            key: fullKey,
            value: newValue,
            category: 'ai_cache',
            updatedAt: new Date(),
        };

        if (cached) {
            await db.update(settings).set(payload).where(eq(settings.key, fullKey));
        } else {
            await db.insert(settings).values(payload as any);
        }

        return newValue;
    },

    /**
     * Log AI action to audit trail
     */
    async logAIAction(userId: string, userName: string, actionType: string, payload: any) {
        await auditService.createSignedAuditLog({
            eventType: `AI_ACTION_${actionType}`,
            userId,
            userName,
            payload,
        });
    }
};
