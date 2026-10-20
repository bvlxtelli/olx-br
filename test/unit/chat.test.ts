import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Olx from '../../src/index';
import { chatApi } from '../../src/services/api';
import { headerOf, mockAdapter, RecordedRequest } from '../helpers/axios-mock';

describe('chat client', () => {
    const originalAdapter = chatApi.defaults.adapter;
    let requests: RecordedRequest[] = [];

    const useMock = (response: { data?: unknown; status?: number; statusText?: string } = {}) => {
        const mock = mockAdapter(response);
        requests = mock.requests;
        chatApi.defaults.adapter = mock.adapter;
        return mock;
    };

    beforeEach(() => {
        chatApi.defaults.adapter = originalAdapter;
    });

    afterEach(() => {
        chatApi.defaults.adapter = originalAdapter;
    });

    describe('ativarWebhookChat', () => {
        it('posts the webhook to the chat endpoint', async () => {
            useMock({ status: 201, data: { ok: true } });

            const result = await Olx.ativarWebhookChat('fake-token', 'https://example.com/hook');

            expect(requests).toHaveLength(1);
            expect(requests[0].method).toBe('post');
            expect(requests[0].url).toBe('https://apps.olx.com.br/autoservice/v1/chat');
            expect(requests[0].body).toEqual({ webhook: 'https://example.com/hook' });
            expect(result).toEqual({ ok: true });
        });

        it('sends the access token as a bearer token', async () => {
            useMock({ status: 201 });

            await Olx.ativarWebhookChat('fake-token', 'https://example.com/hook');

            expect(headerOf(requests[0], 'Authorization')).toBe('Bearer fake-token');
        });

        it('reports the error of an invalid token', async () => {
            useMock({ status: 401, statusText: 'Unauthorized', data: { message: 'Unauthorized' } });

            const error = await Olx.ativarWebhookChat('fake-token', 'https://example.com/hook')
                .catch((err) => err);

            expect(error).toBeInstanceOf(Olx.OlxApiError);
            expect(error.status).toBe(401);
            expect(error.body).toEqual({ message: 'Unauthorized' });
        });
    });

    describe('desativarWebhookChat', () => {
        it('deletes the chat webhook', async () => {
            useMock({ status: 200, data: { ok: true } });

            const result = await Olx.desativarWebhookChat('fake-token');

            expect(requests).toHaveLength(1);
            expect(requests[0].method).toBe('delete');
            expect(requests[0].url).toBe('https://apps.olx.com.br/autoservice/v1/chat');
            expect(headerOf(requests[0], 'Authorization')).toBe('Bearer fake-token');
            expect(result).toEqual({ ok: true });
        });

        it('reports the error of an account that does not exist', async () => {
            useMock({ status: 400, data: { message: 'account not found' } });

            const error = await Olx.desativarWebhookChat('fake-token').catch((err) => err);

            expect(error).toBeInstanceOf(Olx.OlxApiError);
            expect(error.status).toBe(400);
            expect(error.message).toBe('account not found');
        });
    });

    describe('responderChat', () => {
        const mensagem = {
            textMessage: 'Olá! O item ainda está disponível.',
            messageId: 'message-id',
            chatId: 'chat-id'
        };

        it('posts the answer to the chat send endpoint', async () => {
            useMock({ status: 200, data: { sent: true } });

            const result = await Olx.responderChat('fake-token', mensagem);

            expect(requests).toHaveLength(1);
            expect(requests[0].method).toBe('post');
            expect(requests[0].url).toBe('https://apps.olx.com.br/autoservice/v1/chat/send');
            expect(requests[0].body).toEqual(mensagem);
            expect(headerOf(requests[0], 'Authorization')).toBe('Bearer fake-token');
            expect(result).toEqual({ sent: true });
        });

        it('reports an invalid body', async () => {
            useMock({ status: 400, data: { message: 'invalid body' } });

            const error = await Olx.responderChat('fake-token', mensagem).catch((err) => err);

            expect(error).toBeInstanceOf(Olx.OlxApiError);
            expect(error.status).toBe(400);
            expect(error.message).toBe('invalid body');
        });

        it('reports an internal error of the API', async () => {
            useMock({ status: 500, statusText: 'Internal Server Error', data: { message: 'boom' } });

            const error = await Olx.responderChat('fake-token', mensagem).catch((err) => err);

            expect(error).toBeInstanceOf(Olx.OlxApiError);
            expect(error.status).toBe(500);
            expect(error.message).toBe('boom');
        });
    });
});
