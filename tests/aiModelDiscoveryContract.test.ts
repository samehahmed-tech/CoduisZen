import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('AI model discovery and system pulse contracts', () => {
    it('discovers provider models through a protected backend route', () => {
        const routes = read('server/routes/aiRoutes.ts');
        const controller = read('server/controllers/aiController.ts');
        const provider = read('server/services/aiProviderService.ts');
        expect(routes).toContain("router.post('/models'");
        expect(routes).toContain("router.get('/runtime-status'");
        expect(controller).toContain('discoverProviderModels');
        expect(provider).toContain("/models");
        expect(provider).toContain("/api/tags");
    });

    it('uses a model selector and a bounded proactive pulse instead of free-text model IDs', () => {
        const settings = read('components/SettingsHub.tsx');
        const pulse = read('components/common/AIAutonomyPulse.tsx');
        expect(settings).toContain('availableProviderModels');
        expect(settings).toContain('Refresh models');
        expect(pulse).toContain('PULSE_INTERVAL_MS');
        expect(pulse).toContain('proactive-pulse');
        expect(pulse).toContain('NO_ALERT');
    });

    it('passes the model discovery apiKey parameter without referencing an undefined aiKey variable', () => {
        const settings = read('components/SettingsHub.tsx');
        expect(settings).not.toContain('apiKey: aiKey');
        expect(settings).toContain("apiKey: String(apiKey || '').trim() || undefined");
    });

    it('allows slow NVIDIA cold starts without the browser aborting first', () => {
        const client = read('services/api/ai.ts');
        const core = read('services/api/core.ts');
        const provider = read('server/services/aiProviderService.ts');
        expect(core).toContain('timeoutMs?: number');
        expect(client).toContain('timeoutMs: 100_000');
        expect(provider).toContain("request.providerId === 'NVIDIA' ? 80_000 : 30_000");
    });

    it('filters NVIDIA discovery to assistant-compatible chat models', () => {
        const provider = read('server/services/aiProviderService.ts');
        expect(provider).toContain('isAssistantChatModel');
        expect(provider).toContain('NON_CHAT_MODEL_HINTS');
    });
});
