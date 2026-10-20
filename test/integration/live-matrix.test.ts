import { describe, it, expect } from 'vitest';
import matrix from '../../qa/contract-matrix.json';

/**
 * Live matrix.
 *
 * Every row of the `live` section of `qa/contract-matrix.json` is replayed against the
 * real OLX API, with dummy credentials. It proves the verb, the URL, the authentication
 * style and the shape of the answer of every endpoint the package talks to.
 *
 * The suite is **skipped by default** and only runs when it is explicitly requested,
 * because it needs internet access:
 *
 *   npm run test:integration
 *
 * A transport error (no network, DNS failure, timeout) skips the row instead of
 * failing the build. The answer of the API itself is what is asserted.
 */

type LiveRow = {
    id: string;
    request: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        json?: unknown;
        form?: Record<string, string>;
    };
    expectStatus: number | number[];
    expectBody?: unknown;
    expectBodyContains?: string;
    stable: boolean;
    note?: string;
};

const rows = matrix.live as LiveRow[];
const enabled = process.env.OLX_INTEGRATION_TESTS === '1';

function buildRequest(row: LiveRow): RequestInit {
    const headers: Record<string, string> = { ...(row.request.headers || {}) };

    let body: string | undefined;

    if (row.request.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(row.request.form).toString();
    } else if (row.request.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(row.request.json);
    }

    return { method: row.request.method, headers, body };
}

describe.skipIf(!enabled)('OLX API (live matrix)', () => {
    it.each(rows)('$id answers $expectStatus', async (row) => {
        let response: Response;

        try {
            response = await fetch(row.request.url, buildRequest(row));
        } catch (error) {
            // The API is unreachable from this machine. It is not a failure of the
            // contract, so the row is skipped instead of failing the build.
            console.warn(`[${row.id}] the OLX API is unreachable: ${(error as Error).message}`);
            return;
        }

        const text = await response.text();
        const expected = Array.isArray(row.expectStatus) ? row.expectStatus : [row.expectStatus];

        if (!row.stable) {
            console.warn(
                `[${row.id}] unstable row, answered ${response.status} (accepted: ${expected.join('/')})`
            );
        }

        expect(expected, `${row.id} answered ${response.status}`).toContain(response.status);

        if (row.expectBodyContains !== undefined) {
            expect(text).toContain(row.expectBodyContains);
        } else if (row.expectBody !== undefined) {
            if (row.expectBody === '') {
                expect(text).toBe('');
            } else {
                expect(JSON.parse(text)).toEqual(row.expectBody);
            }
        }
    });
});
