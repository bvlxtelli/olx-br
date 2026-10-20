import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Olx from '../../src/index';
import { appApi, authApi, chatApi } from '../../src/services/api';
import { failingAdapter, mockAdapter } from '../helpers/axios-mock';

/**
 * Every method of the package must fail in the same way: with an `OlxApiError` that keeps
 * the status, the code and the body of the failed request.
 */
describe('error consistency', () => {
    const originalAppAdapter = appApi.defaults.adapter;
    const originalAuthAdapter = authApi.defaults.adapter;
    const originalChatAdapter = chatApi.defaults.adapter;

    beforeEach(() => {
        appApi.defaults.adapter = originalAppAdapter;
        authApi.defaults.adapter = originalAuthAdapter;
        chatApi.defaults.adapter = originalChatAdapter;
    });

    afterEach(() => {
        appApi.defaults.adapter = originalAppAdapter;
        authApi.defaults.adapter = originalAuthAdapter;
        chatApi.defaults.adapter = originalChatAdapter;
    });

    // The tuple type is explicit: the array of pairs would otherwise be inferred as
    // `(string | (() => Promise<any>))[]` and the call would not be callable.
    const methods = (): [string, () => Promise<any>][] => [
        ['getAnuncios', () => Olx.getAnuncios('fake-token')],
        ['getBasicUserInfo', () => Olx.getBasicUserInfo('fake-token')],
        ['putAnuncios', () => Olx.putAnuncios('fake-token', [])],
        ['deleteAnuncios', () => Olx.deleteAnuncios('fake-token', [])],
        ['getStatusAnuncio', () => Olx.getStatusAnuncio('fake-token', 'ad-token')],
        ['getModelosCarros', () => Olx.getModelosCarros('fake-token')],
        ['getModelosMotos', () => Olx.getModelosMotos('fake-token')],
        ['getCilindradas', () => Olx.getCilindradas('fake-token')],
        ['ativarWebhookChat', () => Olx.ativarWebhookChat('fake-token', 'https://example.com/hook')],
        ['desativarWebhookChat', () => Olx.desativarWebhookChat('fake-token')],
        [
            'responderChat',
            () =>
                Olx.responderChat('fake-token', {
                    textMessage: 'Hello',
                    messageId: 'message-id',
                    chatId: 'chat-id'
                })
        ],
        [
            'getToken',
            () => new Olx('client-id', 'client-secret', 'https://example.com/callback').getToken('code')
        ]
    ];

    it('rejects every method with an OlxApiError that keeps the status and the body', async () => {
        const response = { status: 401, statusText: 'Unauthorized', data: { message: 'Unauthorized' } };
        appApi.defaults.adapter = mockAdapter(response).adapter;
        authApi.defaults.adapter = mockAdapter(response).adapter;
        chatApi.defaults.adapter = mockAdapter(response).adapter;

        for (const [name, call] of methods()) {
            const error = await call().catch((err) => err);

            expect(error, `${name} should reject with an OlxApiError`).toBeInstanceOf(Olx.OlxApiError);
            expect(error.status, `${name} should keep the status`).toBe(401);
            expect(error.statusText, `${name} should keep the status text`).toBe('Unauthorized');
            expect(error.body, `${name} should keep the body`).toEqual({ message: 'Unauthorized' });
            expect(error.message, `${name} should keep the message`).toBe('Unauthorized');
        }
    });

    it('rejects every method with an OlxApiError when the API is unreachable', async () => {
        const failure = failingAdapter(new Error('Network Error'));
        appApi.defaults.adapter = failure;
        authApi.defaults.adapter = failure;
        chatApi.defaults.adapter = failure;

        for (const [name, call] of methods()) {
            const error = await call().catch((err) => err);

            expect(error, `${name} should reject with an OlxApiError`).toBeInstanceOf(Olx.OlxApiError);
            expect(error.message, `${name} should keep the message`).toBe('Network Error');
        }
    });

    it('falls back to the status when the error has no message', async () => {
        appApi.defaults.adapter = failingAdapter({
            response: { status: 503, statusText: 'Service Unavailable', data: {} }
        } as unknown as Error);

        const error = await Olx.getAnuncios('fake-token').catch((err) => err);

        expect(error.status).toBe(503);
        expect(error.message).toBe('Request failed with status code 503');
    });

    it('falls back to a generic message when the error has no status and no message', async () => {
        appApi.defaults.adapter = failingAdapter({} as unknown as Error);

        const error = await Olx.getAnuncios('fake-token').catch((err) => err);

        expect(error.status).toBeUndefined();
        expect(error.message).toBe('Request failed');
    });
});
