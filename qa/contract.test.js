/**
 * QA - OFFLINE CONTRACT SUITE of the olx-br package.
 *
 * Deterministic, no network, no secret. The axios transport is replaced by an adapter that
 * records the requests and answers with a canned response, so the whole axios pipeline
 * (URL resolution, header handling, body serialization) is exercised while nothing ever
 * leaves the machine.
 *
 * What it locks down (the contract of docs/CONTRACT.md):
 *   1. the public surface: the methods, their arity, `Olx.OlxApiError` and `Olx.SCOPES`;
 *   2. the request of every public method: verb, path, body and where the token goes;
 *   3. the error contract: `OlxApiError` with status/statusText/code/body, `data` alias,
 *      non enumerable `cause`, the nested `code`, the `__proto__` safety, the application
 *      error that RESOLVES and the HTTP error that REJECTS;
 *   4. the authorization URL: the scopes, the encoding and the legacy behaviour.
 *
 * Usage: node --test qa/contract.test.js      (from the root of the package)
 *        qa\run-contract.cmd                   (Windows, builds first when needed)
 *
 * It needs `dist/` (npm run build) and the dependencies of the package (npm ci).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'index.js');

if (!fs.existsSync(DIST)) {
    console.error('[QA] dist/index.js is missing. Run `npm run build` before the contract suite.');
    process.exit(1);
}

const axios = require('axios');
const api = require(path.join(ROOT, 'dist', 'services', 'api.js'));

/* -------------------------------------------------------------------------------------
 * The transport. One delegating adapter is installed on every axios instance used by the
 * package, so a test only has to say what the API answers.
 * ---------------------------------------------------------------------------------- */

let current = null;
let lastRequest = null;

const delegating = (config) => {
    lastRequest = config;
    return current(config);
};

for (const instance of [api.authApi, api.appApi, api.chatApi]) {
    if (instance) instance.defaults.adapter = delegating;
}

/** Builds an adapter that answers with the given payload. */
function makeAdapter(response) {
    return async (config) => {
        const status = response.status === undefined ? 200 : response.status;
        const statusText = response.statusText === undefined ? 'OK' : response.statusText;
        const data = response.data === undefined ? {} : response.data;
        const axiosResponse = { data, status, statusText, headers: {}, config };

        // The HTTP adapter of axios rejects when the status is not accepted by
        // `validateStatus`. The mock has to behave the same way, otherwise the methods of
        // the package would resolve with the error body instead of rejecting.
        const accepted = config.validateStatus
            ? config.validateStatus(status)
            : status >= 200 && status < 300;

        if (!accepted) {
            throw new axios.AxiosError(
                'Request failed with status code ' + status,
                status >= 500 ? axios.AxiosError.ERR_BAD_RESPONSE : axios.AxiosError.ERR_BAD_REQUEST,
                config,
                undefined,
                axiosResponse
            );
        }

        return axiosResponse;
    };
}

/** The API answers 200 with the given payload. */
function answer(data, statusText) {
    current = makeAdapter({ data, status: 200, statusText });
}

/** The API answers an HTTP error with the given payload. */
function answerError(status, data, statusText) {
    current = makeAdapter({ data, status, statusText: statusText || 'Bad Request' });
}

/** The transport fails, without any HTTP response. */
function answerTransportError(message) {
    current = async () => {
        throw Object.assign(new Error(message || 'Network Error'), {
            isAxiosError: true,
            request: {}
        });
    };
}

/** The request that was recorded, with its body already parsed. */
function sent() {
    assert.ok(lastRequest, 'no request was recorded');
    return {
        method: (lastRequest.method || 'get').toLowerCase(),
        url: lastRequest.url,
        baseURL: lastRequest.baseURL,
        rawBody: lastRequest.data,
        body: parseBody(lastRequest.data),
        header: (name) => headerOf(lastRequest, name)
    };
}

/** Parses the body of a request when it was serialized as JSON. */
function parseBody(data) {
    if (typeof data !== 'string') return data;
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
}

/** Reads a header of a request, ignoring the case of its name. */
function headerOf(config, name) {
    const headers = config.headers;
    if (!headers) return undefined;
    if (typeof headers.get === 'function') return headers.get(name);
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : headers[key];
}

/** Waits for a promise that has to reject, and returns the error. */
async function rejection(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    assert.fail('the promise was expected to reject');
}

// The package is loaded only after the transport was replaced.
const Olx = require(DIST);

/* =====================================================================================
 * 1. THE PUBLIC SURFACE
 * =================================================================================== */

const STATIC_METHODS = [
    'getAnuncios', 'getBasicUserInfo', 'putAnuncios', 'deleteAnuncios',
    'getStatusAnuncio', 'getModelosCarros', 'getModelosMotos', 'getCilindradas',
    'ativarWebhookChat', 'desativarWebhookChat', 'responderChat'
];

test('public surface: every method of the package exists and is static', () => {
    for (const name of STATIC_METHODS) {
        assert.strictEqual(typeof Olx[name], 'function', 'expected a static method ' + name);
        assert.ok(
            Object.prototype.hasOwnProperty.call(Olx, name),
            name + ' should be an own property of the exported class, not an inherited one'
        );
    }
});

test('public surface: getAuthUrl and getToken are instance methods', () => {
    const olx = new Olx('a', 'b', 'c');
    for (const name of ['getAuthUrl', 'getToken']) {
        assert.strictEqual(typeof olx[name], 'function', 'expected an instance method ' + name);
    }
});

test('public surface: the arity of every method is preserved', () => {
    const expected = {
        getAnuncios: 1,
        getBasicUserInfo: 1,
        putAnuncios: 2,
        deleteAnuncios: 2,
        getStatusAnuncio: 2,
        getModelosCarros: 3,
        getModelosMotos: 3,
        getCilindradas: 1,
        ativarWebhookChat: 2,
        desativarWebhookChat: 1,
        responderChat: 2
    };
    for (const [name, arity] of Object.entries(expected)) {
        assert.strictEqual(Olx[name].length, arity, name + ': the arity changed');
    }

    const olx = new Olx('a', 'b', 'c');
    // The arity of getAuthUrl is 2 in the published package (1.0.6) and has to stay 2.
    assert.strictEqual(olx.getAuthUrl.length, 2, 'getAuthUrl: the arity changed');
    assert.strictEqual(olx.getToken.length, 1, 'getToken: the arity changed');
});

test('public surface: Olx.OlxApiError is the error class of the package', () => {
    assert.strictEqual(typeof Olx.OlxApiError, 'function', 'Olx.OlxApiError is missing');
    const error = new Olx.OlxApiError('boom');
    assert.ok(error instanceof Error, 'OlxApiError has to be an Error');
    assert.ok(error instanceof Olx.OlxApiError);
    assert.strictEqual(error.name, 'OlxApiError');
});

test('public surface: Olx.SCOPES exposes the canonical scope names', () => {
    assert.strictEqual(typeof Olx.SCOPES, 'object', 'Olx.SCOPES is missing');
    assert.deepStrictEqual(
        { ...Olx.SCOPES },
        {
            basicUserInfo: 'basic_user_info',
            autoupload: 'autoupload',
            chat: 'chat',
            autoservice: 'autoservice'
        }
    );
});

/* =====================================================================================
 * 2. THE REQUEST OF EVERY PUBLIC METHOD: VERB, PATH, BODY AND AUTH
 * =================================================================================== */

const REQUESTS = [
    {
        id: 'getAnuncios',
        call: () => Olx.getAnuncios('AT'),
        method: 'post', path: '/autoupload/published', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT' }, auth: 'body'
    },
    {
        id: 'getBasicUserInfo',
        call: () => Olx.getBasicUserInfo('AT'),
        method: 'post', path: '/oauth_api/basic_user_info', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT' }, auth: 'body'
    },
    {
        id: 'putAnuncios',
        call: () => Olx.putAnuncios('AT', [{ s: 1 }]),
        method: 'put', path: '/autoupload/import', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT', ad_list: [{ s: 1 }] }, auth: 'body'
    },
    {
        id: 'deleteAnuncios',
        call: () => Olx.deleteAnuncios('AT', ['id1', 'id2']),
        method: 'put', path: '/autoupload/import', host: 'https://apps.olx.com.br',
        body: {
            access_token: 'AT',
            ad_list: [{ id: 'id1', operation: 'delete' }, { id: 'id2', operation: 'delete' }]
        },
        auth: 'body'
    },
    {
        id: 'getStatusAnuncio',
        call: () => Olx.getStatusAnuncio('AT', 'TOK'),
        method: 'post', path: '/autoupload/import/TOK', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT' }, auth: 'body'
    },
    {
        id: 'getModelosCarros (no brand)',
        call: () => Olx.getModelosCarros('AT'),
        method: 'post', path: '/autoupload/car_info', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT' }, auth: 'body'
    },
    {
        id: 'getModelosCarros (brand)',
        call: () => Olx.getModelosCarros('AT', 1),
        method: 'post', path: '/autoupload/car_info/1', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT' }, auth: 'body'
    },
    {
        id: 'getModelosCarros (brand and model)',
        call: () => Olx.getModelosCarros('AT', 1, 2),
        method: 'post', path: '/autoupload/car_info/1/2', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT' }, auth: 'body'
    },
    {
        id: 'getModelosMotos (no brand)',
        call: () => Olx.getModelosMotos('AT'),
        method: 'post', path: '/autoupload/moto_info', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT' }, auth: 'body'
    },
    {
        id: 'getModelosMotos (brand)',
        call: () => Olx.getModelosMotos('AT', 7),
        method: 'post', path: '/autoupload/moto_info/7', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT' }, auth: 'body'
    },
    {
        id: 'getCilindradas',
        call: () => Olx.getCilindradas('AT'),
        method: 'post', path: '/autoupload/moto_cubiccms_info', host: 'https://apps.olx.com.br',
        body: { access_token: 'AT' }, auth: 'body'
    },
    {
        id: 'ativarWebhookChat',
        call: () => Olx.ativarWebhookChat('AT', 'https://example.com/hook'),
        method: 'post', path: '/autoservice/v1/chat', host: 'https://apps.olx.com.br',
        body: { webhook: 'https://example.com/hook' }, auth: 'bearer'
    },
    {
        id: 'desativarWebhookChat',
        call: () => Olx.desativarWebhookChat('AT'),
        method: 'delete', path: '/autoservice/v1/chat', host: 'https://apps.olx.com.br',
        body: undefined, auth: 'bearer'
    },
    {
        id: 'responderChat',
        call: () => Olx.responderChat('AT', { textMessage: 'Hello', messageId: 'm', chatId: 'c' }),
        method: 'post', path: '/autoservice/v1/chat/send', host: 'https://apps.olx.com.br',
        body: { textMessage: 'Hello', messageId: 'm', chatId: 'c' }, auth: 'bearer'
    }
];

for (const expected of REQUESTS) {
    test('request of ' + expected.id + ': ' + expected.method.toUpperCase() + ' ' + expected.path, async () => {
        answer({});
        await expected.call();

        const request = sent();
        assert.strictEqual(request.method, expected.method, 'the HTTP verb changed');
        assert.strictEqual(request.url, expected.path, 'the path changed');
        assert.strictEqual(request.baseURL, expected.host, 'the host changed');

        if (expected.body === undefined) {
            assert.strictEqual(request.rawBody, undefined, 'the request should not carry a body');
        } else {
            assert.deepStrictEqual(request.body, expected.body, 'the body of the request changed');
        }

        if (expected.auth === 'body') {
            assert.match(
                String(request.header('Content-Type')),
                /^application\/json/,
                'the body has to be sent as JSON'
            );
            assert.strictEqual(
                request.header('Authorization'),
                undefined,
                'the token of the autoupload group goes in the body, never in the header'
            );
            assert.ok(
                JSON.stringify(request.body).includes('AT'),
                'the token has to be sent in the body'
            );
        } else if (expected.auth === 'bearer') {
            assert.strictEqual(
                request.header('Authorization'),
                'Bearer AT',
                'the token of the autoservice group goes in the Authorization header'
            );
            assert.ok(
                !JSON.stringify(request.body || {}).includes('AT'),
                'the token of the autoservice group must not be sent in the body'
            );
        }
    });
}

test('request of getToken: form encoded credentials on the token endpoint', async () => {
    answer({ access_token: 'TOKEN_QQ' });
    const olx = new Olx('CID', 'CSEC', 'http://localhost:3000/cb');

    const token = await olx.getToken('CODE123');

    assert.strictEqual(token, 'TOKEN_QQ');
    const request = sent();
    assert.strictEqual(request.method, 'post');
    assert.strictEqual(request.url, '/oauth/token');
    assert.strictEqual(request.baseURL, 'https://auth.olx.com.br');
    assert.match(
        String(request.header('Content-Type')),
        /^application\/x-www-form-urlencoded/,
        'the credentials have to be sent as a form'
    );
    assert.strictEqual(request.header('Authorization'), undefined);

    const form = new URLSearchParams(String(request.rawBody));
    assert.strictEqual(form.get('code'), 'CODE123');
    assert.strictEqual(form.get('client_id'), 'CID');
    assert.strictEqual(form.get('client_secret'), 'CSEC');
    assert.strictEqual(form.get('redirect_uri'), 'http://localhost:3000/cb');
    assert.strictEqual(form.get('grant_type'), 'authorization_code');
});

/* =====================================================================================
 * 3. THE ERROR CONTRACT
 * =================================================================================== */

test('contract: an application error (HTTP 200 with a negative statusCode) RESOLVES', async () => {
    answer({ token: null, statusCode: -6, statusMessage: 'Without permission', errors: [] });

    const result = await Olx.putAnuncios('AT', [{ s: 1 }]);

    assert.strictEqual(result.statusCode, -6);
    assert.strictEqual(result.statusMessage, 'Without permission');
    assert.strictEqual(result.token, null);
    assert.deepStrictEqual(result.errors, []);
});

test('contract: an HTTP error REJECTS with an OlxApiError that carries status, code and body', async () => {
    const body = {
        status: 'ERROR',
        error: {
            reason: 'ACCESS_TOKEN_NOT_FOUND',
            message: 'Response code 404 (Not Found)',
            statusCode: 404
        }
    };
    answerError(404, body, 'Not Found');

    const error = await rejection(Olx.getAnuncios('AT'));

    assert.ok(error instanceof Olx.OlxApiError, 'the rejection has to be an OlxApiError');
    assert.ok(error instanceof Error, 'the rejection has to be an Error');
    assert.strictEqual(error.name, 'OlxApiError');
    assert.strictEqual(error.status, 404);
    assert.strictEqual(error.statusText, 'Not Found');
    assert.strictEqual(error.code, 'ACCESS_TOKEN_NOT_FOUND', 'the code has to be read from the nested error');
    assert.deepStrictEqual(error.body, body, 'the body has to be kept verbatim');
    assert.strictEqual(error.data, error.body, 'data is an alias of body');
    assert.strictEqual(error.message, 'Response code 404 (Not Found)');

    // The fields of the body are copied onto the error, except the reserved ones.
    assert.deepStrictEqual(error.error, body.error);
    assert.strictEqual(error.status, 404, 'the "status" of the body must not overwrite the HTTP status');
});

test('contract: the cause is not enumerable and never reaches JSON.stringify', async () => {
    answerError(400, { error: 'invalid_client' });
    const olx = new Olx('CID', 'SECRET-VALUE', 'http://localhost:3000/cb');

    const error = await rejection(olx.getToken('CODE'));

    assert.ok(!Object.keys(error).includes('cause'), 'the cause must not be enumerable');
    assert.ok(!Object.prototype.propertyIsEnumerable.call(error, 'cause'));

    const serialized = JSON.stringify(error);
    assert.ok(!serialized.includes('cause'), 'the cause must not reach JSON.stringify');
    assert.ok(!serialized.includes('SECRET-VALUE'), 'the client_secret must not reach JSON.stringify');
    assert.ok(!serialized.includes('client_secret'), 'the client_secret must not reach JSON.stringify');

    // The cause is the escape hatch: it carries the original error of axios.
    assert.ok(error.cause, 'the cause has to carry the original error');
    assert.strictEqual(error.cause.isAxiosError, true);
});

test('contract: the client_secret is redacted inside the cause', async () => {
    answerError(400, { error: 'invalid_client' });
    const olx = new Olx('CID', 'SUPER-SECRET-VALUE', 'http://localhost:3000/cb');

    const error = await rejection(olx.getToken('CODE'));

    const raw = String(error.cause.config.data);
    assert.ok(!raw.includes('SUPER-SECRET-VALUE'), 'the client_secret reached the cause');
    assert.ok(raw.includes('[redacted]'), 'the client_secret was not redacted');
});

test('contract: the code is read in the order of the contract', async () => {
    const cases = [
        [{ code: 'E001', reason: 'R', statusCode: -6, error: 'STR' }, 'E001'],
        [{ reason: 'ACCESS_DENIED', statusCode: -6 }, 'ACCESS_DENIED'],
        [{ statusCode: -6 }, -6],
        [{ error: 'invalid_grant' }, 'invalid_grant'],
        [{ error: { code: 'ECODE' } }, 'ECODE'],
        [{ error: { reason: 'EREASON' } }, 'EREASON'],
        [{ error: { statusCode: 404 } }, 404],
        [{ status: 'ERROR' }, undefined]
    ];

    for (const [body, expected] of cases) {
        answerError(400, body);
        const error = await rejection(Olx.getAnuncios('AT'));
        assert.strictEqual(error.code, expected, 'wrong code for the body ' + JSON.stringify(body));
    }
});

test('contract: the message is read in the order of the contract', async () => {
    const cases = [
        [{ message: 'Unauthorized' }, 'Unauthorized'],
        [{ error: 'invalid_grant', error_description: 'Bad code' }, 'Bad code'],
        [{ error: { message: 'Response code 404 (Not Found)' } }, 'Response code 404 (Not Found)'],
        [{ error: 'invalid_client' }, 'invalid_client'],
        [{ mesage: '404 NOT_FOUND ...' }, '404 NOT_FOUND ...'],
        [{}, 'Request failed with status code 400']
    ];

    for (const [body, expected] of cases) {
        answerError(400, body);
        const error = await rejection(Olx.getAnuncios('AT'));
        assert.strictEqual(error.message, expected, 'wrong message for the body ' + JSON.stringify(body));
    }
});

test('contract: a body with __proto__ keeps the error usable (the prototype is not replaced)', async () => {
    const body = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
    answerError(400, body);

    const error = await rejection(Olx.getBasicUserInfo('AT'));

    assert.ok(error instanceof Error, 'the error has to stay an Error');
    assert.ok(error instanceof Olx.OlxApiError, 'the error has to stay an OlxApiError');
    assert.strictEqual(Object.getPrototypeOf(error), Olx.OlxApiError.prototype);
    assert.strictEqual(error.ok, 1, 'the fields of the body are copied');
    assert.strictEqual({}.polluted, undefined, 'the prototype of Object was polluted');
});

test('contract: an empty body keeps the HTTP status (regression of D1)', async () => {
    answerError(400, '');

    const error = await rejection(Olx.getBasicUserInfo('AT'));

    assert.strictEqual(error.status, 400, 'the status was lost');
    assert.strictEqual(error.body, '');
    assert.strictEqual(error.code, undefined);
    assert.strictEqual(error.message, 'Request failed with status code 400');
});

test('contract: a text body is kept verbatim (regression of D2)', async () => {
    answerError(404, '<!DOCTYPE html><html><pre>Cannot POST /autoupload/import</pre></html>');

    const error = await rejection(Olx.getAnuncios('AT'));

    assert.strictEqual(typeof error.body, 'string', 'the body has to stay a string');
    assert.ok(error.body.includes('Cannot POST'));
    assert.strictEqual(error.status, 404);
    assert.strictEqual(error.message, 'Request failed with status code 404');
});

test('contract: an array body is kept verbatim and is not copied onto the error', async () => {
    const body = [{ property: 'access_token', message: 'is missing and it is required' }];
    answerError(400, body);

    const error = await rejection(Olx.getBasicUserInfo('AT'));

    assert.ok(Array.isArray(error.body), 'the body has to stay an array');
    assert.strictEqual(error.status, 400);
    assert.strictEqual(error.property, undefined, 'the fields of an array are not copied');
});

test('contract: getToken rejects when the answer of the server has no access token', async () => {
    answer({});

    const olx = new Olx('CID', 'CSEC', 'http://localhost:3000/cb');
    const error = await rejection(olx.getToken('CODE'));

    assert.ok(error instanceof Olx.OlxApiError);
    assert.strictEqual(error.message, 'The OLX authorization server did not return an access token.');
});

test('contract: the OAuth shape reads the code and the description', async () => {
    answerError(400, { error: 'invalid_grant', error_description: 'Bad code' });
    const olx = new Olx('CID', 'CSEC', 'http://localhost:3000/cb');

    const error = await rejection(olx.getToken('CODE'));

    assert.strictEqual(error.status, 400);
    assert.strictEqual(error.code, 'invalid_grant');
    assert.strictEqual(error.message, 'Bad code');
});

test('contract: a transport error (no HTTP response) is propagated as an OlxApiError', async () => {
    answerTransportError('getaddrinfo ENOTFOUND apps.olx.com.br');

    const error = await rejection(Olx.getAnuncios('AT'));

    assert.ok(error instanceof Olx.OlxApiError);
    assert.strictEqual(error.status, undefined);
    assert.strictEqual(error.code, undefined);
    assert.strictEqual(error.message, 'getaddrinfo ENOTFOUND apps.olx.com.br');
    assert.strictEqual(error.cause.isAxiosError, true);
});

/* =====================================================================================
 * 4. THE AUTHORIZATION URL
 * =================================================================================== */

const olx = new Olx('CID', 'CSEC', 'http://localhost:3000/cb');

/** Reads the query of the authorization URL. */
function authQuery(scopes, state) {
    const url = new URL(olx.getAuthUrl(scopes, state));
    return { url, params: url.searchParams, raw: url.search };
}

test('getAuthUrl: the default URL asks for basic_user_info and autoupload', () => {
    const { url, params } = authQuery();

    assert.strictEqual(url.origin + url.pathname, 'https://auth.olx.com.br/oauth', 'the URL changed');
    assert.strictEqual(params.get('response_type'), 'code');
    assert.strictEqual(params.get('client_id'), 'CID');
    assert.strictEqual(params.get('redirect_uri'), 'http://localhost:3000/cb');
    assert.strictEqual(params.get('scope'), 'basic_user_info autoupload');
    assert.strictEqual(params.get('state'), null, 'the state must not appear when it is not given');
});

test('getAuthUrl: the scopes are joined with %20 and the query is not rewritten', () => {
    const { raw } = authQuery();
    assert.ok(raw.includes('scope=basic_user_info%20autoupload'), 'the scopes have to be joined with %20');
});

test('getAuthUrl: the legacy boolean keeps the behaviour of 1.0.6', () => {
    assert.strictEqual(authQuery(true).params.get('scope'), 'basic_user_info autoupload');
    assert.strictEqual(authQuery(false).params.get('scope'), 'basic_user_info');
    assert.strictEqual(authQuery(undefined).params.get('scope'), 'basic_user_info autoupload');
});

test('getAuthUrl: a legacy truthy value never throws (the drop-in guarantee)', () => {
    assert.strictEqual(authQuery(1).params.get('scope'), 'basic_user_info autoupload');
    assert.strictEqual(authQuery('yes').params.get('scope'), 'basic_user_info yes');
    assert.strictEqual(authQuery([]).params.get('scope'), 'basic_user_info');
});

test('getAuthUrl: basic_user_info is always requested and always comes first', () => {
    assert.strictEqual(authQuery(['chat', 'autoservice']).params.get('scope'), 'basic_user_info chat autoservice');
    assert.strictEqual(authQuery('chat autoservice').params.get('scope'), 'basic_user_info chat autoservice');
    assert.strictEqual(authQuery(['basic_user_info', 'chat']).params.get('scope'), 'basic_user_info chat');
    assert.strictEqual(authQuery('basic_user_info').params.get('scope'), 'basic_user_info');
});

test('getAuthUrl: the order of the caller is preserved and a repeated scope is sent once', () => {
    assert.strictEqual(authQuery(['chat', 'autoupload']).params.get('scope'), 'basic_user_info chat autoupload');
    assert.strictEqual(authQuery('chat chat autoupload').params.get('scope'), 'basic_user_info chat autoupload');
});

test('getAuthUrl: the names are case sensitive and an unknown scope is sent as it is', () => {
    assert.strictEqual(authQuery(['CHAT']).params.get('scope'), 'basic_user_info CHAT');
    assert.strictEqual(authQuery('whatever').params.get('scope'), 'basic_user_info whatever');
});

test('getAuthUrl: a string is split on any whitespace and empty entries are ignored', () => {
    assert.strictEqual(authQuery('chat   autoservice').params.get('scope'), 'basic_user_info chat autoservice');
    assert.strictEqual(authQuery('chat\tautoservice').params.get('scope'), 'basic_user_info chat autoservice');
    assert.strictEqual(authQuery('  chat  ').params.get('scope'), 'basic_user_info chat');
});

test('getAuthUrl: the client_id and the state are encoded, the redirect_uri is sent verbatim', () => {
    const encoded = new Olx('CID WITH SPACE', 'CSEC', 'http://localhost:3000/cb');
    const url = new URL(encoded.getAuthUrl(true, 'a b&c'));
    assert.strictEqual(url.searchParams.get('client_id'), 'CID WITH SPACE');
    assert.ok(url.search.includes('client_id=CID%20WITH%20SPACE'), 'the client_id has to be encoded');
    assert.ok(url.search.includes('state=a%20b%26c'), 'the state has to be encoded');
    assert.ok(url.search.includes('redirect_uri=http://localhost:3000/cb'), 'the redirect_uri is sent verbatim');
});

test('getAuthUrl: the URL never has a double slash', () => {
    const raw = olx.getAuthUrl();
    assert.ok(raw.startsWith('https://auth.olx.com.br/oauth?'), 'unexpected URL: ' + raw);
    assert.ok(!raw.includes('//oauth'), 'the URL has a double slash');
});
