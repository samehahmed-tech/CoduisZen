import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('public status privacy contract', () => {
    it('returns only coarse component state and short cache headers', () => {
        const source = fs.readFileSync('server/app.ts', 'utf8');
        expect(source).toContain("app.get('/api/status'");
        expect(source).toContain("public, max-age=30, stale-while-revalidate=60");
        expect(source).toContain('components: {');
        const statusBlock = source.slice(source.indexOf("app.get('/api/status'"), source.indexOf('// Client-RUM ingest'));
        expect(statusBlock).not.toContain('getRecentErrors');
        expect(statusBlock).not.toContain('getRequestTiming');
    });
});
