import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Olx from '../../src/index';
import { authApi, appApi } from '../../src/services/api';
import { failingAdapter, mockAdapter } from '../helpers/axios-mock';

describe('error handling', () => {
    const originalAuthAdapter = authApi.defaults.adapter;
    const originalAppAdapter = appApi.defaults.adapter;

    beforeEach(() => {
        authApi.defaults.adapter = originalAuthAdapter;
        appApi.defaults.adapter = originalAppAdapter;
    });

    afterEach(() => {
        authApi.defaults.adapter = originalAuthAdapter;
        appApi.defaults.adapter = originalAppAdapter;
    });

    it('keeps the status, the code and the body of a failed request', async () => {
        appApi.defaults.adapter = mockAdapter({
            status: 401,
            statusText: 'Unauthorized',
            data: { reason: 'ACCESS_DENIED', message: 'Check the client authentication token.' }
        }).adapter;

        const error = await Olx.getAnuncios('fake-token').catch((err) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.status).toBe(401);
        expect(error.statusText).toBe('Unauthorized');
        expect(error.code).toBe('ACCESS_DENIED');
        expect(error.body).toEqual({
            reason: 'ACCESS_DENIED',
            message: 'Check the client authentication token.'
        });
        expect(error.data).toEqual(error.body);
        expect(error.message).toBe('Check the client authentication token.');
    });

    it('copies the fields of the body onto the error', async () => {
        appApi.defaults.adapter = mockAdapter({
            status: 400,
            data: { message: 'invalid request', errors: ['ad_list'] }
        }).adapter;

        const error = await Olx.putAnuncios('fake-token', []).catch((err) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.errors).toEqual(['ad_list']);
    });

    it('keeps the status and the body when the token request fails', async () => {
        authApi.defaults.adapter = mockAdapter({
            status: 400,
            statusText: 'Bad Request',
            data: { error: 'invalid_grant' }
        }).adapter;

        const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');
        const error = await olx.getToken('fake-code').catch((err) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.status).toBe(400);
        expect(error.statusText).toBe('Bad Request');
        expect(error.body).toEqual({ error: 'invalid_grant' });
        expect(error.message).toBe('invalid_grant');
    });

    it('keeps the original error when the request does not reach the API', async () => {
        const originalError = new Error('Network Error');
        appApi.defaults.adapter = failingAdapter(originalError);

        const error = await Olx.getBasicUserInfo('fake-token').catch((err) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.status).toBeUndefined();
        expect(error.body).toBeUndefined();
        expect(error.message).toBe('Network Error');
        expect(error.cause).toBe(originalError);
    });

    it('falls back to a generic message when the API sends no body', async () => {
        appApi.defaults.adapter = mockAdapter({ status: 500, statusText: 'Internal Server Error' }).adapter;

        const error = await Olx.getCilindradas('fake-token').catch((err) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.status).toBe(500);
        expect(error.message).toBe('Request failed with status code 500');
    });

    it('returns the same error instance when it is already an OlxApiError', async () => {
        const original = new Olx.OlxApiError('boom', { status: 418 });
        appApi.defaults.adapter = failingAdapter(original);

        const error = await Olx.getAnuncios('fake-token').catch((err) => err);

        expect(error).toBe(original);
    });

    describe('nested error body', () => {
        // The autoupload endpoints answer with the error nested inside an `error` object.
        const nestedBody = {
            status: 'ERROR',
            error: {
                reason: 'ACCESS_TOKEN_NOT_FOUND',
                message: 'Response code 404 (Not Found)',
                statusCode: 404
            }
        };

        const methods = [
            ['getAnuncios', () => Olx.getAnuncios('fake-token')],
            ['getModelosCarros', () => Olx.getModelosCarros('fake-token')],
            ['getModelosMotos', () => Olx.getModelosMotos('fake-token')],
            ['getCilindradas', () => Olx.getCilindradas('fake-token')]
        ] as const;

        methods.forEach(([name, call]) => {
            it(`reads the code and the message of ${name} from the nested error`, async () => {
                appApi.defaults.adapter = mockAdapter({
                    status: 404,
                    statusText: 'Not Found',
                    data: nestedBody
                }).adapter;

                const error = await call().catch((err) => err);

                expect(error).toBeInstanceOf(Olx.OlxApiError);
                expect(error.status).toBe(404);
                expect(error.code).toBe('ACCESS_TOKEN_NOT_FOUND');
                expect(error.message).toBe('Response code 404 (Not Found)');
                expect(error.body).toEqual(nestedBody);
            });
        });

        it('keeps the fields of the body available on the error', async () => {
            appApi.defaults.adapter = mockAdapter({
                status: 404,
                statusText: 'Not Found',
                data: nestedBody
            }).adapter;

            const error = await Olx.getAnuncios('fake-token').catch((err) => err);

            expect(error.status).toBe(404);
            expect(error.error).toEqual(nestedBody.error);
        });

        it('falls back to the generic message when the nested error has no message', async () => {
            appApi.defaults.adapter = mockAdapter({
                status: 404,
                statusText: 'Not Found',
                data: { status: 'ERROR', error: { reason: 'ACCESS_TOKEN_NOT_FOUND' } }
            }).adapter;

            const error = await Olx.getAnuncios('fake-token').catch((err) => err);

            expect(error.code).toBe('ACCESS_TOKEN_NOT_FOUND');
            expect(error.message).toBe('Request failed with status code 404');
        });
    });

    it('reads the description of the OAuth shape as the message', async () => {
        authApi.defaults.adapter = mockAdapter({
            status: 400,
            statusText: 'Bad Request',
            data: { error: 'invalid_grant', error_description: 'Bad code' }
        }).adapter;

        const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');
        const error = await olx.getToken('fake-code').catch((err) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.code).toBe('invalid_grant');
        expect(error.message).toBe('Bad code');
    });

    it('keeps the error an OlxApiError when the body has a __proto__ key', async () => {
        const polluted = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
        appApi.defaults.adapter = mockAdapter({ status: 400, data: polluted }).adapter;

        const error = await Olx.getAnuncios('fake-token').catch((err) => err);

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(Object.getPrototypeOf(error)).toBe(Olx.OlxApiError.prototype);
        expect(error.polluted).toBeUndefined();
        expect(error.ok).toBe(1);
    });

    it('does not expose the cause as an enumerable field', async () => {
        authApi.defaults.adapter = mockAdapter({
            status: 400,
            statusText: 'Bad Request',
            data: { error: 'invalid_client' }
        }).adapter;

        const olx = new Olx('client-id', 'SUPER-SECRET-VALUE', 'https://example.com/callback');
        const error = await olx.getToken('fake-code').catch((err) => err);

        expect(error.cause).toBeDefined();
        expect(Object.keys(error)).not.toContain('cause');
        expect(JSON.stringify(error)).not.toContain('SUPER-SECRET-VALUE');
    });

    it('rejects when the token request answers 200 without a token', async () => {
        authApi.defaults.adapter = mockAdapter({ status: 200, data: { error: 'invalid_client' } }).adapter;

        const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');
        const error = await olx.getToken('fake-code').catch((err) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.status).toBe(200);
        expect(error.body).toEqual({ error: 'invalid_client' });
        expect(error.message).toBe('The OLX authorization server did not return an access token.');
    });

    describe('the payload shapes of the API', () => {
        it('keeps a body that is an array verbatim, without copying its items', async () => {
            const body = [{ property: 'access_token', message: 'is missing and it is required' }];
            appApi.defaults.adapter = mockAdapter({ status: 400, data: body }).adapter;

            const error = await Olx.getBasicUserInfo('fake-token').catch((err) => err);

            expect(error.body).toEqual(body);
            expect(error.body[0].message).toBe('is missing and it is required');
            expect(error.message).toBe('Request failed with status code 400');
        });

        it('keeps a body that is a text verbatim', async () => {
            appApi.defaults.adapter = mockAdapter({
                status: 404,
                data: 'Cannot POST /autoupload/import'
            }).adapter;

            const error = await Olx.putAnuncios('fake-token', []).catch((err) => err);

            expect(error.body).toBe('Cannot POST /autoupload/import');
            expect(error.message).toBe('Request failed with status code 404');
        });

        it('reads the misspelled field of the paths that do not exist', async () => {
            appApi.defaults.adapter = mockAdapter({
                status: 500,
                data: { mesage: '404 NOT_FOUND /autoservice/v1/webhooks' }
            }).adapter;

            const error = await Olx.getAnuncios('fake-token').catch((err) => err);

            expect(error.code).toBeUndefined();
            expect(error.message).toBe('404 NOT_FOUND /autoservice/v1/webhooks');
        });

        it('keeps the status when the body is empty', async () => {
            appApi.defaults.adapter = mockAdapter({ status: 400, data: '' }).adapter;

            const error = await Olx.getBasicUserInfo('fake-token').catch((err) => err);

            expect(error.status).toBe(400);
            expect(error.body).toBe('');
            expect(error.message).toBe('Request failed with status code 400');
        });
    });
});
