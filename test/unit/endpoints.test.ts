import { describe, it, expect, afterEach } from 'vitest';
import Olx from '../../src/index';
import { authApi, appApi } from '../../src/services/api';
import { mockAdapter, RecordedRequest } from '../helpers/axios-mock';

/**
 * Asserts the HTTP method, the path and the body of the single request that was made.
 */
function expectRequest(
    requests: RecordedRequest[],
    method: string,
    path: string,
    body?: unknown
): void {
    expect(requests).toHaveLength(1);

    const request = requests[0];
    expect(request.method).toBe(method);
    expect(new URL(request.url).pathname).toBe(path);

    if (body !== undefined) {
        expect(request.body).toEqual(body);
    }
}

describe('endpoints', () => {
    const originalAuthAdapter = authApi.defaults.adapter;
    const originalAppAdapter = appApi.defaults.adapter;

    afterEach(() => {
        authApi.defaults.adapter = originalAuthAdapter;
        appApi.defaults.adapter = originalAppAdapter;
    });

    it('posts the access token on the published ads endpoint', async () => {
        const mock = mockAdapter({ data: [] });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getAnuncios('fake-token');

        expectRequest(mock.requests, 'post', '/autoupload/published', { access_token: 'fake-token' });
    });

    it('posts the access token on the basic user info endpoint', async () => {
        const mock = mockAdapter({ data: { name: 'Fake', email: 'fake@example.com' } });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getBasicUserInfo('fake-token');

        expectRequest(mock.requests, 'post', '/oauth_api/basic_user_info', {
            access_token: 'fake-token'
        });
    });

    it('puts the ads on the import endpoint', async () => {
        const mock = mockAdapter({ data: { statusCode: 0, token: 'anuncio-token' } });
        appApi.defaults.adapter = mock.adapter;
        const anuncios = [{ subject: 'Peça de carro em ótimo estado' }];

        await Olx.putAnuncios('fake-token', anuncios);

        expectRequest(mock.requests, 'put', '/autoupload/import', {
            access_token: 'fake-token',
            ad_list: anuncios
        });
    });

    it('puts the deletion on the import endpoint', async () => {
        const mock = mockAdapter({ data: { statusCode: 0 } });
        appApi.defaults.adapter = mock.adapter;

        await Olx.deleteAnuncios('fake-token', ['id-1', 'id-2']);

        expectRequest(mock.requests, 'put', '/autoupload/import', {
            access_token: 'fake-token',
            ad_list: [
                { id: 'id-1', operation: 'delete' },
                { id: 'id-2', operation: 'delete' }
            ]
        });
    });

    it('posts the access token on the status of an imported ad', async () => {
        const mock = mockAdapter({ data: { status: 'active' } });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getStatusAnuncio('fake-token', 'anuncio-token');

        expectRequest(mock.requests, 'post', '/autoupload/import/anuncio-token', {
            access_token: 'fake-token'
        });
    });

    it('posts the access token on the car models endpoint', async () => {
        const mock = mockAdapter({ data: {} });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getModelosCarros('fake-token');

        expectRequest(mock.requests, 'post', '/autoupload/car_info', {
            access_token: 'fake-token'
        });
    });

    it('posts the access token on the models of a car brand', async () => {
        const mock = mockAdapter({ data: {} });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getModelosCarros('fake-token', 1);

        expectRequest(mock.requests, 'post', '/autoupload/car_info/1', {
            access_token: 'fake-token'
        });
    });

    it('posts the access token on the models of a car model', async () => {
        const mock = mockAdapter({ data: {} });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getModelosCarros('fake-token', 1, 2);

        expectRequest(mock.requests, 'post', '/autoupload/car_info/1/2', {
            access_token: 'fake-token'
        });
    });

    it('posts the access token on the motorcycle models endpoint', async () => {
        const mock = mockAdapter({ data: {} });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getModelosMotos('fake-token');

        expectRequest(mock.requests, 'post', '/autoupload/moto_info', {
            access_token: 'fake-token'
        });
    });

    it('posts the access token on the models of a motorcycle brand', async () => {
        const mock = mockAdapter({ data: {} });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getModelosMotos('fake-token', 3);

        expectRequest(mock.requests, 'post', '/autoupload/moto_info/3', {
            access_token: 'fake-token'
        });
    });

    it('posts the access token on the models of a motorcycle model', async () => {
        const mock = mockAdapter({ data: {} });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getModelosMotos('fake-token', 3, 4);

        expectRequest(mock.requests, 'post', '/autoupload/moto_info/3/4', {
            access_token: 'fake-token'
        });
    });

    it('posts the access token on the engine sizes endpoint', async () => {
        const mock = mockAdapter({ data: {} });
        appApi.defaults.adapter = mock.adapter;

        await Olx.getCilindradas('fake-token');

        expectRequest(mock.requests, 'post', '/autoupload/moto_cubiccms_info', {
            access_token: 'fake-token'
        });
    });

    it('posts the form encoded credentials on the token endpoint', async () => {
        const mock = mockAdapter({ data: { access_token: 'fake-access-token' } });
        authApi.defaults.adapter = mock.adapter;
        const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');

        const token = await olx.getToken('fake-code');

        expect(token).toBe('fake-access-token');
        expectRequest(mock.requests, 'post', '/oauth/token');

        const body = new URLSearchParams(String(mock.requests[0].rawBody));
        expect(body.get('code')).toBe('fake-code');
        expect(body.get('client_id')).toBe('client-id');
        expect(body.get('client_secret')).toBe('client-secret');
        expect(body.get('redirect_uri')).toBe('https://example.com/callback');
        expect(body.get('grant_type')).toBe('authorization_code');
    });
});
