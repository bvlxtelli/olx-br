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
});
