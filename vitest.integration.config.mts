import { defineConfig } from 'vitest/config';

/**
 * Configuration of the integration test suite.
 *
 * These tests talk to the live OLX API, so they are kept apart from the unit tests and are
 * only run when they are explicitly requested. They never use a real credential.
 *
 * Two flags are set, because the two integration suites use different names: `OLX_LIVE`
 * for the suite of the fork and `OLX_INTEGRATION_TESTS` for the live matrix of the QA team.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/integration/**/*.test.ts'],
        testTimeout: 30000,
        hookTimeout: 30000,
        env: {
            OLX_LIVE: '1',
            OLX_INTEGRATION_TESTS: '1'
        }
    }
});
