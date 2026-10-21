import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Olx from '../../src/index';
import { listingApi } from '../../src/services/api';
import { headerOf, mockAdapter, urlOf, RecordedRequest } from '../helpers/axios-mock';

/**
 * The listing of the advertisements (`GET /autoupload/v1/published`).
 *
 * The endpoint takes the access token in the `Authorization: Bearer` header, answers with
 * a page of advertisements and paginates with the `next_token` of the answer. The suite
 * asserts the method, the path, the header and the query of the request that leaves the
 * library, and the parse of the answer.
 */

const TOKEN = 'fake-token';
const URL = 'https://apps.olx.com.br/autoupload/v1/published';

describe('listarAnuncios', () => {
    const originalAdapter = listingApi.defaults.adapter;

    let requests: RecordedRequest[] = [];

    function useMock(response: { data?: unknown; status?: number; statusText?: string } = {}) {
        const mock = mockAdapter(response);
        requests = mock.requests;
        listingApi.defaults.adapter = mock.adapter;
        return mock;
    }

    beforeEach(() => {
        listingApi.defaults.adapter = originalAdapter;
    });

    afterEach(() => {
        listingApi.defaults.adapter = originalAdapter;
    });

    it('asks the listing endpoint with a GET', async () => {
        useMock({ data: { data: [], current_token: null, next_token: null } });

        await Olx.listarAnuncios(TOKEN);

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('get');
        expect(requests[0].url).toBe(URL);
    });

    it('sends the access token in the Authorization header', async () => {
        useMock({ data: { data: [], current_token: null, next_token: null } });

        await Olx.listarAnuncios(TOKEN);

        expect(headerOf(requests[0], 'Authorization')).toBe(`Bearer ${TOKEN}`);
    });

    it('does not send the access token in the query nor in the body', async () => {
        useMock({ data: { data: [], current_token: null, next_token: null } });

        await Olx.listarAnuncios(TOKEN);

        expect(urlOf(requests[0])).not.toContain('fake-token');
        expect(requests[0].body).toBeUndefined();
        expect(Object.keys(requests[0].params || {})).not.toContain('access_token');
    });

    it('sends no query when no filter is given', async () => {
        useMock({ data: { data: [], current_token: null, next_token: null } });

        await Olx.listarAnuncios(TOKEN);

        expect(urlOf(requests[0])).toBe(URL);
    });

    it('sends the page token, the status and the size of the page', async () => {
        useMock({ data: { data: [], current_token: null, next_token: null } });

        await Olx.listarAnuncios(TOKEN, {
            page_token: 'page-hash',
            ads_status: 'published',
            fetch_size: 50
        });

        expect(urlOf(requests[0])).toBe(
            `${URL}?page_token=page-hash&ads_status=published&fetch_size=50`
        );
    });

    it('sends only the filters that were given', async () => {
        useMock({ data: { data: [], current_token: null, next_token: null } });

        await Olx.listarAnuncios(TOKEN, { ads_status: 'pending_review' });

        expect(urlOf(requests[0])).toBe(`${URL}?ads_status=pending_review`);
    });

    it('sends the size of the page even when it is zero', async () => {
        useMock({ data: { data: [], current_token: null, next_token: null } });

        await Olx.listarAnuncios(TOKEN, { fetch_size: 0 });

        expect(urlOf(requests[0])).toBe(`${URL}?fetch_size=0`);
    });

    it('returns the advertisements of the page and the tokens of the pagination', async () => {
        useMock({
            data: {
                data: [{ id: '1B', list_id: '129987', status: 'pending_review' }],
                current_token: 'YUhvdTNxMHE4',
                next_token: 'YUhvdTNxMHE5'
            }
        });

        const page = await Olx.listarAnuncios(TOKEN);

        expect(page.data).toEqual([{ id: '1B', list_id: '129987', status: 'pending_review' }]);
        expect(page.current_token).toBe('YUhvdTNxMHE4');
        expect(page.next_token).toBe('YUhvdTNxMHE5');
    });

    it('ends the listing when the next token is null', async () => {
        useMock({
            data: {
                data: [{ id: '1B', list_id: '129987', status: 'published' }],
                current_token: null,
                next_token: null
            }
        });

        const page = await Olx.listarAnuncios(TOKEN);

        expect(page.next_token).toBeNull();
        expect(page.current_token).toBeNull();
    });

    it('returns an empty page when the answer has no data', async () => {
        useMock({ data: {} });

        const page = await Olx.listarAnuncios(TOKEN);

        expect(page.data).toEqual([]);
        expect(page.current_token).toBeNull();
        expect(page.next_token).toBeNull();
    });

    it('rejects with an OlxApiError that keeps the status and the body', async () => {
        useMock({
            status: 401,
            statusText: 'Unauthorized',
            data: { reason: 'ACCESS_DENIED', message: 'Check the client authentication token.' }
        });

        const error = await Olx.listarAnuncios(TOKEN).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect((error as Olx.OlxApiError).status).toBe(401);
        expect((error as Olx.OlxApiError).code).toBe('ACCESS_DENIED');
        expect((error as Olx.OlxApiError).body).toEqual({
            reason: 'ACCESS_DENIED',
            message: 'Check the client authentication token.'
        });
    });
});
