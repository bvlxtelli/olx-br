import { describe, it, expect, afterEach } from 'vitest';
import Olx from '../../src/index';
import { authApi, AUTH_BASE_URL } from '../../src/services/api';

describe('getAuthUrl', () => {
    const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');
    const originalBaseUrl = authApi.defaults.baseURL;

    afterEach(() => {
        authApi.defaults.baseURL = originalBaseUrl;
    });

    it('builds the authorization URL on the authentication host', () => {
        const url = olx.getAuthUrl();

        expect(url.startsWith(`${AUTH_BASE_URL}/oauth?`)).toBe(true);
    });

    it('does not generate a double slash', () => {
        const url = olx.getAuthUrl();

        expect(url).not.toContain('.br//');
        expect(url.startsWith('https://auth.olx.com.br/oauth?')).toBe(true);
    });

    it('keeps the parameters in the same order as before', () => {
        const url = olx.getAuthUrl();

        expect(url).toBe(
            'https://auth.olx.com.br/oauth?response_type=code&client_id=client-id' +
            '&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback' +
            '&scope=basic_user_info%20autoupload'
        );
    });

    it('keeps working when the base URL has a trailing slash', () => {
        authApi.defaults.baseURL = `${AUTH_BASE_URL}/`;

        const url = olx.getAuthUrl();

        expect(url).not.toContain('.br//');
        expect(url.startsWith('https://auth.olx.com.br/oauth?')).toBe(true);
    });

    it('requests the autoupload scope by default', () => {
        const scope = new URL(olx.getAuthUrl()).searchParams.get('scope');

        expect(scope).toBe('basic_user_info autoupload');
    });

    it('requests only the basic user info scope when autoupload is disabled', () => {
        const scope = new URL(olx.getAuthUrl(false)).searchParams.get('scope');

        expect(scope).toBe('basic_user_info');
    });

    it('sends the client id and the redirect uri', () => {
        const params = new URL(olx.getAuthUrl()).searchParams;

        expect(params.get('response_type')).toBe('code');
        expect(params.get('client_id')).toBe('client-id');
        expect(params.get('redirect_uri')).toBe('https://example.com/callback');
    });

    it('appends the state when it is informed', () => {
        const params = new URL(olx.getAuthUrl(true, 'my-state')).searchParams;

        expect(params.get('state')).toBe('my-state');
    });

    it('does not append the state when it is not informed', () => {
        const params = new URL(olx.getAuthUrl()).searchParams;

        expect(params.has('state')).toBe(false);
    });

    it('encodes the redirect uri so that it is not truncated by the server', () => {
        const olxWithQuery = new Olx('client-id', 'client-secret', 'https://example.com/cb?x=1&y=2');

        const url = olxWithQuery.getAuthUrl();
        const params = new URL(url).searchParams;

        expect(params.get('redirect_uri')).toBe('https://example.com/cb?x=1&y=2');
        expect(params.get('y')).toBe(null);
    });

    it('encodes the client id', () => {
        const olxWithSpecialId = new Olx('client id&other', 'client-secret', 'https://example.com/cb');

        const url = olxWithSpecialId.getAuthUrl();
        const params = new URL(url).searchParams;

        expect(params.get('client_id')).toBe('client id&other');
        expect(params.get('other')).toBe(null);
    });

    it('encodes the state', () => {
        const url = olx.getAuthUrl(true, 'a b&c');
        const params = new URL(url).searchParams;

        expect(params.get('state')).toBe('a b&c');
        expect(params.get('c')).toBe(null);
    });

    it('keeps the scope percent encoded instead of using a plus sign', () => {
        const url = olx.getAuthUrl();

        expect(url).toContain('scope=basic_user_info%20autoupload');
        expect(url).not.toContain('scope=basic_user_info+autoupload');
    });
});
