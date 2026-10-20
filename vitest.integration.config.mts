import { defineConfig } from 'vitest/config';

/**
 * Configuration of the integration test suite.
 *
 * These tests talk to the live OLX API, so they are kept apart from the unit tests and are
 * only run when they are explicitly requested. They never use a real credential.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/integration/**/*.test.ts'],
        testTimeout: 30000,
        hookTimeout: 30000,
        env: {
            OLX_INTEGRATION_TESTS: '1'
        }
    }
});
