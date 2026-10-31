import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HOSPITALITY_BACKGROUNDS } from '../components/hospitalityBackgrounds';

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('hospitality background library', () => {
    it('keeps exactly twenty local, brand-safe media entries', () => {
        const source = read('components/hospitalityBackgrounds.ts');
        expect(HOSPITALITY_BACKGROUNDS).toHaveLength(20);
        expect(HOSPITALITY_BACKGROUNDS.filter((item) => item.type === 'video')).toHaveLength(6);
        expect(HOSPITALITY_BACKGROUNDS.filter((item) => item.type === 'image')).toHaveLength(14);
        expect(source).not.toMatch(/alcohol|beer|wine|vodka|whisky|brand/i);
    });

    it('ships every referenced local file', () => {
        for (const item of HOSPITALITY_BACKGROUNDS) {
            const file = item.src.replace('/wallpapers/', '../public/wallpapers/');
            expect(existsSync(fileURLToPath(new URL(file, import.meta.url)))).toBe(true);
            if (item.poster) {
                const poster = item.poster.replace('/wallpapers/', '../public/wallpapers/');
                expect(existsSync(fileURLToPath(new URL(poster, import.meta.url)))).toBe(true);
            }
        }
    });
});
