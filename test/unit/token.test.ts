import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Olx from '../../src/index';
import { authApi } from '../../src/services/api';
import { mockAdapter, RecordedRequest } from '../helpers/axios-mock';

describe('getToken', () => {
    const originalAdapter = authApi.defaults.adapter;
    const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');
    let requests: RecordedRequest[] = [];

    beforeEach(() => {
        authApi.defaults.adapter = originalAdapter;
    });

    afterEach(() => {
        authApi.defaults.adapter = originalAdapter;
    });

    it('posts the authorization code to the token endpoint', async () => {
        const mock = mockAdapter({ data: { access_token: 'granted-token', expires_in: 10800 } });
        requests = mock.requests;
        authApi.defaults.adapter = mock.adapter;

        const token = await olx.getToken('auth-code');

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('post');
        expect(requests[0].url).toBe('https://auth.olx.com.br/oauth/token');
        expect(token).toBe('granted-token');
    });

    it('sends the credentials as a form', async () => {
        const mock = mockAdapter({ data: { access_token: 'granted-token' } });
        requests = mock.requests;
        authApi.defaults.adapter = mock.adapter;

        await olx.getToken('auth-code');

        const form = new URLSearchParams(String(requests[0].rawBody));

        expect(form.get('code')).toBe('auth-code');
        expect(form.get('client_id')).toBe('client-id');
        expect(form.get('client_secret')).toBe('client-secret');
        expect(form.get('redirect_uri')).toBe('https://example.com/callback');
        expect(form.get('grant_type')).toBe('authorization_code');
    });

    it('sends the request as a form urlencoded', async () => {
        const mock = mockAdapter({ data: { access_token: 'granted-token' } });
        requests = mock.requests;
        authApi.defaults.adapter = mock.adapter;

        await olx.getToken('auth-code');

        expect(requests[0].headers['Content-Type']).toContain('application/x-www-form-urlencoded');
    });
});
