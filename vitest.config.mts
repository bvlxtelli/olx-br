import { defineConfig } from 'vitest/config';

/**
 * Default configuration: the unit test suite.
 *
 * The integration tests (test/integration) are not included here, so they are skipped
 * unless they are explicitly requested with `npm run test:integration`.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/unit/**/*.test.ts'],
        testTimeout: 15000,
        hookTimeout: 15000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**/*.ts'],
            reportsDirectory: './coverage'
        }
    }
});
