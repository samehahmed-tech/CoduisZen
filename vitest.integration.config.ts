import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.unit.config';

const unitTestFiles = Array.isArray(unitConfig.test?.include)
    ? unitConfig.test.include
    : [];

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        hookTimeout: 120000,
        // Integration tests must not start real external transports. Provider
        // contract tests live in the unit suite with mocked Baileys.
        env: { NODE_ENV: 'test', WHATSAPP_PROVIDER: 'disabled' },
        pool: 'forks',
        maxWorkers: 1,
        fileParallelism: false,
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.test.ts'],
        // Keep integration coverage broad, but do not silently rerun the curated unit suite.
        // Any remaining file is expected to prove behavior against the isolated test database.
        exclude: [...unitTestFiles, 'tests/testDatabaseGuard.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['server/**/*.ts', 'src/**/*.ts'],
            exclude: ['node_modules', 'dist', 'coverage'],
        },
    },
});
