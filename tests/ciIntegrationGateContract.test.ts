import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const workflow = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

describe('CI SQL integration gate contract', () => {
    it('requires an explicit repository opt-in and dedicated test database secret', () => {
        expect(workflow).toContain('RUN_SQL_INTEGRATION == \'true\'');
        expect(workflow).toContain('TEST_DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}');
        expect(workflow).toContain('ALLOW_TEST_DATABASE: "1"');
        expect(workflow).toContain('npm run verify:test-database');
    });

    it('does not configure the SQL integration job with the runtime database URL', () => {
        const integrationSection = workflow.slice(workflow.indexOf('integration:'));
        expect(integrationSection).not.toContain('DATABASE_URL: ${{ secrets.DATABASE_URL }}');
        expect(integrationSection).toContain('npm run test:integration -- --run');
    });
});
