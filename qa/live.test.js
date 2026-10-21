/**
 * QA - LIVE SUITE against the real OLX API (apps.olx.com.br / auth.olx.com.br).
 *
 * The matrix of qa/assertions.json is the single source of truth of this suite: 26
 * assertions, measured on 2026-10-20 with dummy credentials.
 *
 * NETWORK RULES (the rules of the project):
 *   - it NEVER runs by default. Without OLX_LIVE=1 every test is SKIP;
 *   - it NEVER touches www.olx.com.br (403 Cloudflare). That host is out of the contract
 *     and a test against it is a false negative;
 *   - without a secret it only runs with a FAKE token, so it exercises the authentication
 *     and the shape of the error, never a real permission;
 *   - a network failure NEVER turns the CI red: a transport error becomes a SKIP.
 *
 * Env:
 *   OLX_LIVE=1             turns the live suite on
 *   OLX_ACCESS_TOKEN=...   real token (optional; a fake one is used when it is absent)
 *   OLX_FAIL_ON_LIVE=1     turns a network failure into a FAIL instead of a SKIP
 *
 * Usage: qa\run-live.cmd   (or: OLX_LIVE=1 node --test qa/live.test.js)
 *
 * The live suite is NEVER a merge blocker.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const MATRIX = require('./assertions.json');

const LIVE = process.env.OLX_LIVE === '1';
const FAIL_ON_LIVE = process.env.OLX_FAIL_ON_LIVE === '1';
const TOKEN = process.env.OLX_ACCESS_TOKEN ||
    'faiafake0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const HOSTS = {
    apps: 'https://apps.olx.com.br',
    auth: 'https://auth.olx.com.br'
};

/** The hosts that are forbidden, whatever the matrix says. */
const FORBIDDEN_HOSTS = ['www.olx.com.br', 'olx.com.br'];

const isTransport = (e) =>
    e && (e.name === 'AbortError' || e.name === 'TypeError' ||
        /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|fetch failed/i.test(e.message || ''));

/** Replaces the $TOKEN placeholder of the matrix by the token of the run. */
const subst = (value) => {
    if (value === '$TOKEN') return TOKEN;
    if (Array.isArray(value)) return value.map(subst);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, subst(v)]));
    }
    return value;
};

/** Performs the call of a row of the matrix. */
async function call(row) {
    const base = HOSTS[row.host];
    const path = row.endpoint
        .replace('{token}', 'abc123')
        .replace('{marca}', '1')
        .replace('{modelo}', '2')
        .replace('{id}', '600');

    const headers = { 'User-Agent': 'olx-br-qa/1.0', Accept: '*/*' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    let res;
    try {
        if (row.auth === 'bearer') {
            headers.Authorization = 'Bearer ' + TOKEN;
            res = await fetch(base + path, { method: row.method, headers, signal: controller.signal, redirect: 'manual' });
        } else if (row.auth === 'form') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            res = await fetch(base + path, {
                method: row.method,
                headers,
                body: new URLSearchParams(subst(row.request)).toString(),
                signal: controller.signal,
                redirect: 'manual'
            });
        } else if (row.auth === 'query') {
            const url = new URL(base + path);
            for (const [key, value] of Object.entries(subst(row.request))) url.searchParams.set(key, value);
            res = await fetch(url.toString(), { method: row.method, headers, signal: controller.signal, redirect: 'manual' });
        } else if (row.auth === 'body') {
            headers['Content-Type'] = 'application/json';
            res = await fetch(base + path, {
                method: row.method,
                headers,
                body: JSON.stringify(subst(row.request)),
                signal: controller.signal,
                redirect: 'manual'
            });
        } else {
            res = await fetch(base + path, { method: row.method, headers, signal: controller.signal, redirect: 'manual' });
        }
    } finally {
        clearTimeout(timer);
    }

    const text = await res.text();
    let json = null;
    if (text) {
        try {
            json = JSON.parse(text);
        } catch {
            json = null;
        }
    }

    return { status: res.status, text, json, location: res.headers.get('location') };
}

/**
 * The options of the test that talks to the network.
 *
 * `skip` has to be absent (and not `null`) when the suite is on: node treats a `skip`
 * that is present, even when it is null, as a skipped test.
 */
const liveOptions = LIVE
    ? {}
    : { skip: 'the live suite is off (set OLX_LIVE=1 to run it). The default is the offline CI.' };

/** The rows that are accepted as unstable. */
const unstable = MATRIX.matriz.filter((row) => row.estavel === false).map((row) => row.id);

test('live: the matrix against the real API', liveOptions, async (t) => {
    let green = 0;

    for (const row of MATRIX.matriz) {
        await t.test(row.id + ' ' + row.method + ' ' + row.endpoint, async (st) => {
            let res;
            try {
                res = await call(row);
            } catch (e) {
                if (isTransport(e)) {
                    if (FAIL_ON_LIVE) throw e;
                    st.skip('the network is unavailable (becomes a SKIP, not a FAIL): ' + e.message);
                    return;
                }
                throw e;
            }

            if (row.estavel === false) {
                assert.ok(
                    row.aceita.includes(res.status),
                    row.id + ': the status ' + res.status + ' is out of the accepted list ' + JSON.stringify(row.aceita)
                );
                console.log('    [unstable] ' + row.id + ' -> ' + res.status + ' (accepted: ' + row.aceita.join('/') + ')');
                green++;
                return;
            }

            assert.strictEqual(
                res.status,
                row.status,
                row.id + ': the expected status is ' + row.status + ', it came ' + res.status +
                ' (body=' + String(res.text).slice(0, 200) + ')'
            );

            if (typeof row.body === 'string') {
                if (row.body === '<EMPTY>') {
                    assert.strictEqual(res.text, '', row.id + ': the body was expected to be empty');
                } else if (row.body.startsWith('Location:')) {
                    assert.ok(
                        (res.location || '').startsWith(row.body.replace('Location: ', '')),
                        row.id + ': unexpected Location: ' + res.location
                    );
                } else {
                    assert.ok(
                        res.text.includes(row.body),
                        row.id + ': the body does not contain ' + row.body +
                        ' (it came: ' + String(res.text).slice(0, 200) + ')'
                    );
                }
            } else if (Array.isArray(row.body)) {
                assert.deepStrictEqual(res.json, row.body, row.id + ': the body changed');
            } else if (row.body && typeof row.body === 'object') {
                for (const [key, value] of Object.entries(row.body)) {
                    assert.deepStrictEqual(res.json?.[key], value, row.id + ': the field ' + key + ' changed');
                }
            }

            green++;
        });
    }

    console.log(
        '    [live] ' + green + '/' + MATRIX.matriz.length + ' assertions green' +
        (unstable.length ? ' (' + unstable.length + ' accepted as unstable: ' + unstable.join(', ') + ')' : '')
    );
});

test('live: www.olx.com.br is forbidden (403 Cloudflare, out of the contract)', () => {
    assert.ok(
        MATRIX.fora_do_escopo.some((row) => row.endpoint.includes('www.olx.com.br')),
        'the forbidden host has to be registered in fora_do_escopo'
    );
    for (const row of MATRIX.matriz) {
        for (const forbidden of FORBIDDEN_HOSTS) {
            assert.ok(
                !row.endpoint.includes(forbidden),
                row.id + ': the row aims at the forbidden host ' + forbidden
            );
            assert.notStrictEqual(row.host, forbidden, row.id + ': the row aims at the forbidden host ' + forbidden);
        }
    }
});

test('live: every row of the matrix declares a known host and a stable status', () => {
    for (const row of MATRIX.matriz) {
        assert.ok(HOSTS[row.host], row.id + ': unknown host: ' + row.host);
        assert.ok(row.estavel !== false || Array.isArray(row.aceita), row.id + ': an unstable row needs an accepted list');
        assert.ok(row.estavel !== false || row.aceita.length > 0, row.id + ': the accepted list is empty');
    }
});

test('live: the matrix has the 26 assertions of the contract', () => {
    assert.strictEqual(MATRIX.matriz.length, 26, 'the matrix changed its size');
    assert.deepStrictEqual(
        MATRIX.matriz.map((row) => row.id),
        Array.from({ length: 26 }, (_, i) => 'A' + String(i + 1).padStart(2, '0')),
        'the identifiers of the matrix changed'
    );
});
