const TEST_DATABASE_PATTERN = /^RestoFlow_Test$/i;
const DRILL_DATABASE_PATTERN = /^RestoFlow_DR_[A-Z0-9_]+$/i;

export const assertSafeBackupDrill = ({ sourceDatabase, targetDatabase }: { sourceDatabase: string; targetDatabase: string }) => {
    if (!TEST_DATABASE_PATTERN.test(String(sourceDatabase || '').trim())) {
        throw new Error('BACKUP_DRILL_REQUIRES_TEST_DATABASE');
    }
    if (!DRILL_DATABASE_PATTERN.test(String(targetDatabase || '').trim())) {
        throw new Error('BACKUP_DRILL_REQUIRES_DISPOSABLE_TARGET');
    }
    if (String(sourceDatabase).trim().toLowerCase() === String(targetDatabase).trim().toLowerCase()) {
        throw new Error('BACKUP_DRILL_TARGET_MUST_DIFFER');
    }
    return true;
};
