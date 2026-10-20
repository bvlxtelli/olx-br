import { describe, it, expect } from 'vitest';
import axios from 'axios';
import Olx from '../../src/index';

/**
 * Integration tests against the live OLX API.
 *
 * They are **skipped by default** and only run when they are explicitly requested, because
 * they need internet access. They never use a real credential: fake credentials are sent and
 * the answers of the API (status code and body) are asserted.
 *
 * Run them with:
 *
 *   npm run test:integration
 *
 * The answers asserted here were measured against the live API. They may change when OLX
 * changes its API, in which case the test that fails is the one pointing the change.
 */
const enabled = process.env.OLX_INTEGRATION_TESTS === '1';

const AUTH_BASE_URL = 'https://auth.olx.com.br';
const APP_BASE_URL = 'https://apps.olx.com.br';
const FAKE_TOKEN = 'fake-access-token';

describe.skipIf(!enabled)('OLX API (integration)', () => {
    it('answers 401 when the chat webhook is activated with an invalid token', async () => {
        const response = await axios.post(
            `${APP_BASE_URL}/autoservice/v1/chat`,
            { webhook: 'https://example.com/hook' },
            { headers: { Authorization: `Bearer ${FAKE_TOKEN}` }, validateStatus: () => true }
        );

        expect(response.status).toBe(401);
        expect(response.data.message).toBe('Unauthorized');
    });

    it('answers 401 when the chat webhook is deactivated with an invalid token', async () => {
        const response = await axios.delete(`${APP_BASE_URL}/autoservice/v1/chat`, {
            headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
            validateStatus: () => true
        });

        // The "account does not exist" answer (400) needs a valid token, so it cannot be
        // reached without a real credential.
        expect(response.status).toBe(401);
        expect(response.data.message).toBe('Unauthorized');
    });

    it('answers 401 when a chat message is sent with an invalid token', async () => {
        const response = await axios.post(
            `${APP_BASE_URL}/autoservice/v1/chat/send`,
            { textMessage: 'Hello', messageId: 'message-id', chatId: 'chat-id' },
            { headers: { Authorization: `Bearer ${FAKE_TOKEN}` }, validateStatus: () => true }
        );

        expect(response.status).toBe(401);
        expect(response.data.message).toBe('Unauthorized');
    });

    it('answers 401 when the leads are read with an invalid token', async () => {
        const response = await axios.get(`${APP_BASE_URL}/autoservice/v1/lead`, {
            headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
            validateStatus: () => true
        });

        expect(response.status).toBe(401);
        expect(response.data.reason).toBe('ACCESS_DENIED');
        expect(response.data.message).toBe('Check the client authentication token.');
    });

    it('answers 200 without permission when an advertisement is imported', async () => {
        const response = await axios.put(
            `${APP_BASE_URL}/autoupload/import`,
            {
                access_token: FAKE_TOKEN,
                ad_list: [{ subject: 'A very nice part', body: 'Text', price: 100 }]
            },
            { validateStatus: () => true }
        );

        expect(response.status).toBe(200);
        expect(response.data.statusCode).toBe(-6);
        expect(response.data.statusMessage).toBe('Without permission');
    });

    it('answers 400 when the authorization code is invalid', async () => {
        const params = new URLSearchParams();
        params.append('code', 'fake-code');
        params.append('client_id', 'fake-client-id');
        params.append('client_secret', 'fake-client-secret');
        params.append('redirect_uri', 'https://example.com/callback');
        params.append('grant_type', 'authorization_code');

        const response = await axios.post(`${AUTH_BASE_URL}/oauth/token`, params, {
            validateStatus: () => true
        });

        expect(response.status).toBe(400);
        expect(response.data.error).toBe('invalid_client');
    });

    it('does not implement the paths that do not exist in the API', async () => {
        const paths = [
            '/autoservice/v1/webhooks',
            '/autoservice/v1/leads',
            '/autoservice/v1/chats',
            '/autoservice/v1/notifications',
            '/autoservice/v1/leads/config',
            '/autoservice/v1/webhook'
        ];

        for (const path of paths) {
            const response = await axios.get(`${APP_BASE_URL}${path}`, {
                headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
                validateStatus: () => true
            });

            expect(response.status).toBe(500);
            expect(String(response.data.mesage || '')).toContain('NOT_FOUND');
        }
    });

    it('rejects with an OlxApiError that keeps the status and the body', async () => {
        const error = await Olx.ativarWebhookChat(FAKE_TOKEN, 'https://example.com/hook')
            .catch((err) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.status).toBe(401);
        expect(error.body.message).toBe('Unauthorized');
    });

    it('keeps the status even when the API answers with an empty body', async () => {
        const error = await Olx.getBasicUserInfo(FAKE_TOKEN).catch((err) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.status).toBe(400);
        expect(error.body).toBe('');
    });
});
