import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Olx from '../../src/index';
import { appApi } from '../../src/services/api';
import { mockAdapter, RecordedRequest } from '../helpers/axios-mock';

describe('advertisement API', () => {
    const originalAdapter = appApi.defaults.adapter;
    let requests: RecordedRequest[] = [];

    const useMock = (response: { data?: unknown; status?: number; statusText?: string } = {}) => {
        const mock = mockAdapter(response);
        requests = mock.requests;
        appApi.defaults.adapter = mock.adapter;
        return mock;
    };

    beforeEach(() => {
        appApi.defaults.adapter = originalAdapter;
    });

    afterEach(() => {
        appApi.defaults.adapter = originalAdapter;
    });

    describe('getAnuncios', () => {
        it('posts the access token to the published advertisements endpoint', async () => {
            useMock({ data: [{ id: '1' }] });

            const result = await Olx.getAnuncios('fake-token');

            expect(requests).toHaveLength(1);
            expect(requests[0].method).toBe('post');
            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/published');
            expect(requests[0].body).toEqual({ access_token: 'fake-token' });
            expect(result).toEqual([{ id: '1' }]);
        });
    });

    describe('getBasicUserInfo', () => {
        it('posts the access token to the basic user info endpoint', async () => {
            useMock({ data: { user_name: 'Buyer', user_email: 'buyer@example.com' } });

            const result = await Olx.getBasicUserInfo('fake-token');

            expect(requests[0].method).toBe('post');
            expect(requests[0].url).toBe('https://apps.olx.com.br/oauth_api/basic_user_info');
            expect(requests[0].body).toEqual({ access_token: 'fake-token' });
            expect(result).toEqual({ user_name: 'Buyer', user_email: 'buyer@example.com' });
        });
    });

    describe('putAnuncios', () => {
        it('puts the advertisements to the import endpoint', async () => {
            useMock({ data: { token: 'ad-token', statusCode: 0 } });

            const anuncio = { subject: 'A very nice part' };
            const result = await Olx.putAnuncios('fake-token', [anuncio]);

            expect(requests[0].method).toBe('put');
            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/import');
            expect(requests[0].body).toEqual({
                access_token: 'fake-token',
                ad_list: [anuncio]
            });
            expect(result).toEqual({ token: 'ad-token', statusCode: 0 });
        });
    });

    describe('deleteAnuncios', () => {
        it('puts a delete operation for each advertisement', async () => {
            useMock({ data: { statusCode: 0 } });

            const result = await Olx.deleteAnuncios('fake-token', ['ad-1', 'ad-2']);

            expect(requests[0].method).toBe('put');
            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/import');
            expect(requests[0].body).toEqual({
                access_token: 'fake-token',
                ad_list: [
                    { id: 'ad-1', operation: 'delete' },
                    { id: 'ad-2', operation: 'delete' }
                ]
            });
            expect(result).toEqual({ statusCode: 0 });
        });

        it('accepts an empty list of advertisements', async () => {
            useMock({ data: { statusCode: 0 } });

            await Olx.deleteAnuncios('fake-token', []);

            expect(requests[0].body).toEqual({ access_token: 'fake-token', ad_list: [] });
        });
    });

    describe('getStatusAnuncio', () => {
        it('posts the access token to the status endpoint of the advertisement', async () => {
            useMock({ data: { status: 'success' } });

            const result = await Olx.getStatusAnuncio('fake-token', 'ad-token');

            expect(requests[0].method).toBe('post');
            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/import/ad-token');
            expect(requests[0].body).toEqual({ access_token: 'fake-token' });
            expect(result).toEqual({ status: 'success' });
        });
    });

    describe('getModelosCarros', () => {
        it('posts the access token to the car information endpoint', async () => {
            useMock({ data: { status: 'success', data: [] } });

            const result = await Olx.getModelosCarros('fake-token');

            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/car_info');
            expect(requests[0].body).toEqual({ access_token: 'fake-token' });
            expect(result).toEqual({ status: 'success', data: [] });
        });

        it('adds the brand to the path', async () => {
            useMock({ data: { status: 'success', data: [] } });

            await Olx.getModelosCarros('fake-token', 1);

            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/car_info/1');
        });

        it('adds the brand and the model to the path', async () => {
            useMock({ data: { status: 'success', data: [] } });

            await Olx.getModelosCarros('fake-token', 1, 2);

            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/car_info/1/2');
        });
    });

    describe('getModelosMotos', () => {
        it('posts the access token to the moto information endpoint', async () => {
            useMock({ data: { status: 'success', data: [] } });

            const result = await Olx.getModelosMotos('fake-token');

            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/moto_info');
            expect(requests[0].body).toEqual({ access_token: 'fake-token' });
            expect(result).toEqual({ status: 'success', data: [] });
        });

        it('adds the brand and the model to the path', async () => {
            useMock({ data: { status: 'success', data: [] } });

            await Olx.getModelosMotos('fake-token', 1, 2);

            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/moto_info/1/2');
        });
    });

    describe('getCilindradas', () => {
        it('posts the access token to the cubic centimeters endpoint', async () => {
            useMock({ data: { status: 'success', data: [] } });

            const result = await Olx.getCilindradas('fake-token');

            expect(requests[0].method).toBe('post');
            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/moto_cubiccms_info');
            expect(requests[0].body).toEqual({ access_token: 'fake-token' });
            expect(result).toEqual({ status: 'success', data: [] });
        });
    });

    it('sends the requests as JSON', async () => {
        useMock({ data: [] });

        await Olx.getAnuncios('fake-token');

        expect(requests[0].headers['Content-Type']).toContain('application/json');
    });
});
