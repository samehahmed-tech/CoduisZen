import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        hookTimeout: 120000,
        env: {
            NODE_ENV: 'test',
        },
        fileParallelism: false,
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['server/**/*.ts', 'src/**/*.ts'],
            exclude: ['node_modules', 'dist', 'coverage'],
        },
    },
});
