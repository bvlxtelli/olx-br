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

    it('keeps the query string of the published package, apart from the double slash', () => {
        const url = olx.getAuthUrl();

        expect(url).toBe(
            'https://auth.olx.com.br/oauth?response_type=code&client_id=client-id' +
            '&redirect_uri=https://example.com/callback&scope=basic_user_info%20autoupload'
        );
    });

    it('keeps the query string of the published package when the autoupload scope is off', () => {
        const url = olx.getAuthUrl(false);

        expect(url).toBe(
            'https://auth.olx.com.br/oauth?response_type=code&client_id=client-id' +
            '&redirect_uri=https://example.com/callback&scope=basic_user_info'
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

    it('sends the redirect uri verbatim, exactly as it was registered', () => {
        // The authorization server compares the redirect uri with the registered value,
        // so it is not encoded. A redirect uri that carries a query string is not
        // supported and has to be documented as such.
        const olxWithQuery = new Olx('client-id', 'client-secret', 'https://example.com/cb');

        const url = olxWithQuery.getAuthUrl();

        expect(url).toContain('&redirect_uri=https://example.com/cb&scope=');
    });

    it('appends the state when it is informed', () => {
        const params = new URL(olx.getAuthUrl(true, 'my-state')).searchParams;

        expect(params.get('state')).toBe('my-state');
    });

    it('does not append the state when it is not informed', () => {
        const params = new URL(olx.getAuthUrl()).searchParams;

        expect(params.has('state')).toBe(false);
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

    it('keeps the default base URL when the instance has none configured', () => {
        authApi.defaults.baseURL = undefined;

        const url = olx.getAuthUrl();

        expect(url.startsWith('https://auth.olx.com.br/oauth?')).toBe(true);
    });
});
