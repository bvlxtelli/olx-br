import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Olx from '../../src/index';
import { appApi, authApi, chatApi } from '../../src/services/api';
import { headerOf, mockAdapter, RecordedRequest } from '../helpers/axios-mock';
import matrix from '../../qa/contract-matrix.json';

/**
 * Executable contract matrix.
 *
 * Every row of `qa/contract-matrix.json` states the verb, the URL, the authentication
 * style and the body of one public method of the package. This suite turns those rows
 * into assertions: it calls the method with a mocked transport and checks the request
 * that leaves the library.
 *
 * The matrix is also a coverage gate. The set of public methods of the class is compared
 * with the set of the methods of the matrix, in both directions, so a method that is
 * added without a row (or a row for a method that does not exist) fails the build.
 */

type MatrixRow = {
    id: string;
    name: string;
    kind: 'static' | 'instance';
    noHttp?: boolean;
    verb?: string;
    url?: string;
    auth?: string;
    contentType?: string;
    args?: unknown[];
    mockResponse?: unknown;
    expectBody?: { json?: unknown; form?: Record<string, string> };
    expectHeaders?: Record<string, string | null>;
    expectUrl?: {
        prefix: string;
        params: Record<string, string>;
        noDoubleSlash?: boolean;
    };
};

type LiveRow = {
    id: string;
    method?: string;
    outcome?: 'resolve' | 'reject';
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

const rows = matrix.methods as MatrixRow[];
const liveRows = matrix.live as LiveRow[];

const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');

const originalAdapters = {
    app: appApi.defaults.adapter,
    auth: authApi.defaults.adapter,
    chat: chatApi.defaults.adapter
};

let requests: RecordedRequest[] = [];

function useMock(response: { data?: unknown; status?: number; statusText?: string } = {}) {
    const mock = mockAdapter(response);
    requests = mock.requests;
    appApi.defaults.adapter = mock.adapter;
    authApi.defaults.adapter = mock.adapter;
    chatApi.defaults.adapter = mock.adapter;
    return mock;
}

function restoreAdapters() {
    appApi.defaults.adapter = originalAdapters.app;
    authApi.defaults.adapter = originalAdapters.auth;
    chatApi.defaults.adapter = originalAdapters.chat;
}

function invoke(row: MatrixRow): Promise<unknown> {
    const target = row.kind === 'static' ? (Olx as never) : (olx as never);
    const method = (target as Record<string, (...args: unknown[]) => Promise<unknown>>)[row.name];
    return method.apply(target, row.args || []);
}

describe('contract matrix', () => {
    beforeEach(() => {
        restoreAdapters();
    });

    afterEach(() => {
        restoreAdapters();
    });

    describe('coverage of the public API', () => {
        const publicStatics = Object.getOwnPropertyNames(Olx)
            .filter((name) => !['length', 'name', 'prototype'].includes(name))
            .filter((name) => typeof (Olx as never as Record<string, unknown>)[name] === 'function');

        const publicPrototype = Object.getOwnPropertyNames(Olx.prototype)
            .filter((name) => name !== 'constructor')
            .filter((name) => typeof (Olx.prototype as never as Record<string, unknown>)[name] === 'function');

        /** Statics that are values of the class and not calls to the OLX API. */
        const notApiMethods = ['OlxApiError'];

        const matrixStatics = Array.from(
            new Set(rows.filter((row) => row.kind === 'static').map((row) => row.name))
        )
            .filter((name) => !notApiMethods.includes(name))
            .sort();

        const matrixPrototype = Array.from(
            new Set(rows.filter((row) => row.kind === 'instance').map((row) => row.name))
        ).sort();

        it('has a row for every public static method', () => {
            const actual = publicStatics.filter((name) => !notApiMethods.includes(name)).sort();

            expect(actual).toEqual(matrixStatics);
        });

        it('has a row for every public instance method', () => {
            expect(publicPrototype.sort()).toEqual(matrixPrototype);
        });

        it('has no row for a method that does not exist', () => {
            const known = new Set([...publicStatics, ...publicPrototype, ...notApiMethods]);

            for (const row of rows) {
                expect(known.has(row.name), `${row.id} (${row.name}) is not a public method`).toBe(true);
            }
        });

        it('never points at the public website of the OLX', () => {
            const forbidden = matrix.forbiddenHosts as string[];

            const hosts = [
                ...rows.filter((row) => row.url).map((row) => row.url as string),
                ...liveRows.map((row) => row.request.url)
            ];

            for (const url of hosts) {
                const host = new URL(url).hostname;

                for (const blocked of forbidden) {
                    expect(host, `${url} points at ${blocked}`).not.toBe(blocked);
                }
            }
        });
    });

    describe.each(rows.filter((row) => !row.noHttp))('row $id ($name)', (row) => {
        it('sends the request described in the matrix', async () => {
            useMock({ data: row.mockResponse === undefined ? { ok: true } : row.mockResponse });

            await invoke(row);

            expect(requests).toHaveLength(1);
            expect(requests[0].method).toBe(row.verb);
            expect(requests[0].url).toBe(row.url);

            const contentType = headerOf(requests[0], 'Content-Type');
            expect(contentType).toContain(row.contentType);

            if (row.expectHeaders && 'Authorization' in row.expectHeaders) {
                const expected = row.expectHeaders.Authorization;
                const actual = headerOf(requests[0], 'Authorization');

                if (expected === null) {
                    expect(actual).toBeUndefined();
                } else {
                    expect(actual).toBe(expected);
                }
            }

            if (row.expectBody && row.expectBody.form) {
                const form = new URLSearchParams(String(requests[0].rawBody));

                for (const [field, value] of Object.entries(row.expectBody.form)) {
                    expect(form.get(field)).toBe(value);
                }
            } else if (row.expectBody && 'json' in row.expectBody) {
                if (row.expectBody.json === null) {
                    expect(requests[0].body).toBeUndefined();
                } else {
                    expect(requests[0].body).toEqual(row.expectBody.json);
                }
            }
        });
    });

    describe.each(rows.filter((row) => row.noHttp))('row $id ($name)', (row) => {
        it('builds the URL described in the matrix', () => {
            useMock({ data: {} });

            const target = row.kind === 'static' ? (Olx as never) : (olx as never);
            const method = (target as Record<string, (...args: unknown[]) => unknown>)[row.name];
            const url = String(method.apply(target, row.args || []));

            expect(url.startsWith(row.expectUrl!.prefix)).toBe(true);

            if (row.expectUrl!.noDoubleSlash) {
                expect(url).not.toContain('.br//');
            }

            const params = new URL(url).searchParams;
            for (const [name, value] of Object.entries(row.expectUrl!.params)) {
                expect(params.get(name)).toBe(value);
            }

            expect(requests).toHaveLength(0);
        });
    });

    describe('the answer of every endpoint keeps the status and the body', () => {
        it.each(
            liveRows
                .filter((row) => row.method)
                .map((row) => ({ row, method: rows.find((candidate) => candidate.id === row.method!) }))
        )('$row.id keeps the status and the body', async ({ row, method }) => {
            const status = Array.isArray(row.expectStatus) ? row.expectStatus[0] : row.expectStatus;
            const body =
                row.expectBodyContains !== undefined
                    ? `<html><pre>${row.expectBodyContains}</pre></html>`
                    : row.expectBody !== undefined
                      ? row.expectBody
                      : {};

            useMock({ status, statusText: 'Error', data: body });

            const result: any = await invoke(method!).catch((err: unknown) => err);

            if (row.outcome === 'resolve') {
                // The application error of the API arrives with HTTP 200. The method has to
                // resolve with the body, so that the caller can read the statusCode.
                expect(result).toEqual(body);
                return;
            }

            expect(result).toBeInstanceOf(Olx.OlxApiError);
            expect(result.status).toBe(status);

            if (row.expectBodyContains !== undefined) {
                expect(String(result.body)).toContain(row.expectBodyContains);
            } else if (row.expectBody !== undefined) {
                expect(result.body).toEqual(body);
            }
        });
    });
});
