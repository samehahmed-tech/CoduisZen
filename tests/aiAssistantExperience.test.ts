import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('AI copilot visual experience', () => {
    it('uses the original 3D copilot asset with stateful, accessible presentation', () => {
        const avatar = read('components/ai/RestoFlowCopilotAvatar.tsx');
        expect(avatar).toContain('/assets/ai/restoflow-copilot-3d-v1.png');
        expect(avatar).toContain('data-avatar-state={state}');
        expect(avatar).toContain('rf-copilot-character');
        expect(avatar).toContain('aria-label={label}');
    });

    it('provides a theme-aware command deck with meaningful motion and a responsive layout', () => {
        const assistant = read('components/AIAssistant.tsx');
        const styles = read('styles/layout/ai-copilot.css');
        expect(assistant).toContain('rf-copilot-hero');
        expect(assistant).toContain('rf-copilot-signal-rail');
        expect(assistant).toContain('rf-copilot-send');
        expect(styles).toContain('.rf-copilot-character');
        expect(styles).toContain('.rf-copilot-prompt::after');
        expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
        expect(styles).toContain('@media (max-width: 640px)');
        expect(styles).toContain('rgb(var(--bg-card))');
        expect(styles).toContain('rgb(var(--text-main))');
    });
});
