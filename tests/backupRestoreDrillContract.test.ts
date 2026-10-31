import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('backup restore drill contract', () => {
    it('validates critical tables and reports restore timing', () => {
        const source = fs.readFileSync('scripts/backup-restore-drill.ts', 'utf8');
        expect(source).toContain("'branches', 'users', 'menu_items', 'orders', 'payments', 'audit_logs'");
        expect(source).toContain('missingTables');
        expect(source).toContain('restoreDurationMs');
        expect(source).toContain('totalDurationMs');
    });
});
