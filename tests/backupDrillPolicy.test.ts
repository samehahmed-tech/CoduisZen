import { describe, expect, it } from 'vitest';
import { assertSafeBackupDrill } from '../server/utils/backupDrillPolicy';

describe('backup restore drill safety', () => {
    it('accepts only the isolated test database and a disposable drill target', () => {
        expect(assertSafeBackupDrill({ sourceDatabase: 'RestoFlow_Test', targetDatabase: 'RestoFlow_DR_20261026_101500' })).toBe(true);
    });

    it('rejects the production database as a drill source', () => {
        expect(() => assertSafeBackupDrill({ sourceDatabase: 'CoduisZen', targetDatabase: 'RestoFlow_DR_20261026_101500' }))
            .toThrow('BACKUP_DRILL_REQUIRES_TEST_DATABASE');
    });

    it('rejects arbitrary restore targets', () => {
        expect(() => assertSafeBackupDrill({ sourceDatabase: 'RestoFlow_Test', targetDatabase: 'CoduisZen' }))
            .toThrow('BACKUP_DRILL_REQUIRES_DISPOSABLE_TARGET');
    });
});
