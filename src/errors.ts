/**
 * Error returned by every method of the `Olx` class when a request to the OLX API fails.
 *
 * Previously the methods rejected with `err.response?.data || err`, which dropped the HTTP
 * status and the original error whenever the body was empty. This class keeps all of it:
 *
 *  - `status`     : HTTP status code returned by the API (401, 400, 500, ...).
 *  - `statusText` : HTTP status text returned by the API.
 *  - `code`       : error code reported by the API (`code`, `reason` or `statusCode`), read
 *                   from the root of the body or from its nested `error` object.
 *  - `body`       : raw response body, exactly as returned by the API.
 *  - `data`       : alias of `body`, kept for convenience.
 *  - `cause`      : the original error thrown by axios, when there is one. It is **not
 *                   enumerable**, so it never reaches `JSON.stringify`, and the credentials
 *                   of the application are removed from it, so it never reaches the console
 *                   either (see `sanitizeCause`).
 *
 * Every field of the response body is also copied onto the error instance, so code written
 * against the old behaviour (which received the raw body) keeps working.
 */
export interface OlxApiErrorInit {
    /** HTTP status code returned by the API. */
    status?: number;
    /** HTTP status text returned by the API. */
    statusText?: string;
    /** Error code reported by the API. */
    code?: string | number;
    /** Raw response body returned by the API. */
    body?: unknown;
    /** Original error thrown by the transport layer. */
    cause?: unknown;
}

/**
 * Fields of the error that must not be overwritten by the fields copied from the
 * response body, otherwise the HTTP status would be replaced by a body field.
 */
const RESERVED_ERROR_FIELDS = [
    'name',
    'message',
    'stack',
    'status',
    'statusText',
    'code',
    'body',
    'data',
    'cause'
];

/**
 * Fields that are never copied from the body, for security reasons. A `__proto__` key
 * would replace the prototype of the error (and `instanceof` would stop working), and
 * `constructor` and `prototype` would shadow the internals of the class.
 */
const FORBIDDEN_ERROR_FIELDS = [
    '__proto__',
    'constructor',
    'prototype'
];

/**
 * Fields whose value is a credential of the application. The value of these fields is
 * replaced by `REDACTED` before the error of the transport layer is attached to the
 * `OlxApiError`.
 */
const SENSITIVE_FIELD_PATTERN = /(client_?secret|access_?token|refresh_?token|authorization|password)/i;

/**
 * Placeholder that replaces the value of a credential.
 */
const REDACTED = '[redacted]';

/**
 * Depth limit of the walk through the error of the transport layer. The error of axios
 * carries the request, the response and the configuration, and the walk stops there.
 */
const MAX_REDACTION_DEPTH = 6;

/**
 * Replaces the credentials of a string that carries them: a form encoded body
 * (`client_secret=...`) or a JSON body (`{"access_token":"..."}`).
 *
 * @param {string} value String that may carry a credential.
 * @returns {string} The same string, with the value of the credentials replaced.
 */
function redactString(value: string): string {
    // Form encoded body: `client_secret=SUPER-SECRET&grant_type=authorization_code`.
    const form = value.replace(
        /([?&#;]|^)((?:client_?secret|access_?token|refresh_?token|password)=)([^&#;]*)/gi,
        '$1$2' + REDACTED
    );

    // JSON body: `{"access_token":"fake-token"}`.
    return form.replace(
        /("(?:client_?secret|access_?token|refresh_?token|authorization|password)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi,
        '$1"' + REDACTED + '"'
    );
}

/**
 * Replaces the credentials of a value, in place. The value is walked as it is, so the
 * type of every object of the error of the transport layer is preserved.
 *
 * @param {unknown} value Value that may carry a credential.
 * @param {number} depth Current depth of the walk.
 */
function redactInPlace(value: unknown, depth = 0): void {
    if (!value || typeof value !== 'object' || depth > MAX_REDACTION_DEPTH) return;

    const container = value as Record<string, unknown>;

    for (const key of Object.keys(container)) {
        const current = container[key];

        if (SENSITIVE_FIELD_PATTERN.test(key)) {
            container[key] = typeof current === 'string' ? REDACTED : current;
            continue;
        }

        if (typeof current === 'string') {
            container[key] = redactString(current);
            continue;
        }

        redactInPlace(current, depth + 1);
    }
}

/**
 * Replaces the credentials of the headers of a request. The headers of axios are an
 * `AxiosHeaders`, whose header names are own properties of the instance.
 *
 * @param {unknown} headers Headers of the request.
 */
function redactHeaders(headers: unknown): void {
    if (!headers || typeof headers !== 'object') return;

    const container = headers as Record<string, unknown>;

    for (const key of Object.keys(container)) {
        if (!SENSITIVE_FIELD_PATTERN.test(key)) continue;

        const value = container[key];
        if (typeof value !== 'string') continue;

        // `AxiosHeaders` has a `set` that keeps the header name normalized.
        if (typeof (container as { set?: unknown }).set === 'function') {
            (container as unknown as { set: (name: string, value: string) => void }).set(
                key,
                REDACTED
            );
            continue;
        }

        container[key] = REDACTED;
    }
}

/**
 * Removes the credentials of the application from the configuration of a request.
 *
 * The configuration of axios carries the body that was sent (`config.data`, the form
 * with the `client_secret` in the case of the token request) and the headers of the
 * request (the `Authorization` header of the chat).
 *
 * @param {unknown} config Configuration of the request.
 */
function sanitizeConfig(config: unknown): void {
    if (!config || typeof config !== 'object') return;

    const fields = config as {
        data?: unknown;
        headers?: unknown;
        params?: unknown;
        auth?: unknown;
        url?: unknown;
    };

    if (typeof fields.data === 'string') fields.data = redactString(fields.data);
    else redactInPlace(fields.data);

    redactHeaders(fields.headers);

    if (fields.params) {
        if (typeof fields.params === 'string') fields.params = redactString(fields.params);
        else redactInPlace(fields.params);
    }

    if (fields.auth) redactInPlace(fields.auth);

    if (typeof fields.url === 'string') fields.url = redactString(fields.url);
}

/**
 * Removes the credentials of the application from the error thrown by the transport
 * layer, so that the error can be logged without leaking the `client_secret` nor the
 * access token of the user.
 *
 * The error of axios carries the whole request: `config.data` is the body that was sent
 * (the form with the `client_secret` in the case of the token request) and `request` is
 * the `ClientRequest`, with the socket and the agent. The `response` of axios carries
 * the same `config` again, so it is cleaned too.
 *
 * The `cause` is the escape hatch for the consumers that need the error of axios
 * (`isAxiosError`, the configuration, the stack), so the error is kept — only the
 * credentials are removed from it.
 *
 * @param {unknown} cause Error thrown by the transport layer.
 * @returns {unknown} The same error, without the credentials of the application.
 */
function sanitizeCause(cause: unknown): unknown {
    if (!cause || typeof cause !== 'object') return cause;

    const error = cause as {
        isAxiosError?: boolean;
        config?: unknown;
        request?: unknown;
        response?: { config?: unknown; request?: unknown };
    };

    sanitizeConfig(error.config);
    if (error.response) sanitizeConfig(error.response.config);

    // The `ClientRequest` carries the socket, the agent and the body of the request: it
    // is noise in a log, and it is a second copy of the body of the request. It is only
    // removed from the errors of axios, so that an error of the caller is never touched.
    if (error.isAxiosError === true) {
        delete error.request;
        if (error.response) delete error.response.request;
    }

    return cause;
}

/**
 * Error thrown by the `Olx` class when the OLX API answers with an error.
 */
export class OlxApiError extends Error {
    /** HTTP status code returned by the API. */
    public readonly status?: number;
    /** HTTP status text returned by the API. */
    public readonly statusText?: string;
    /** Error code reported by the API (`code`, `reason` or `statusCode`). */
    public readonly code?: string | number;
    /** Raw response body returned by the API. */
    public readonly body?: unknown;
    /** Alias of `body`. */
    public readonly data?: unknown;
    /** Original error thrown by the transport layer, when there is one. */
    public readonly cause?: unknown;

    constructor(message: string, init: OlxApiErrorInit = {}) {
        super(message);

        this.name = 'OlxApiError';
        this.status = init.status;
        this.statusText = init.statusText;
        this.code = init.code;
        this.body = init.body;
        this.data = init.body;

        // The `cause` holds the error thrown by axios, which carries the whole request
        // (and, for the token request, the `client_secret` of the application). It is
        // defined as non enumerable, exactly like the `cause` of the standard `Error`, so
        // that it never reaches `JSON.stringify`.
        //
        // The console is a second vector: `console.error(error)` prints the chain of the
        // `cause` of an error, even when the `cause` is not enumerable. The credentials
        // are therefore removed from the error of the transport layer before it is
        // attached, so that `console.error(error)` cannot print the `client_secret` of
        // the application nor the access token of the user.
        Object.defineProperty(this, 'cause', {
            value: sanitizeCause(init.cause),
            enumerable: false,
            writable: false,
            configurable: true
        });

        // Keeps `instanceof` working when the package is compiled to an older target.
        Object.setPrototypeOf(this, OlxApiError.prototype);

        this.copyBodyFields(init.body);
    }

    /**
     * Copies the fields of the response body onto the error, so that consumers that used
     * to read the raw body directly (e.g. `error.errors`) keep working.
     */
    private copyBodyFields(body: unknown): void {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return;

        const fields = body as Record<string, unknown>;
        for (const key of Object.keys(fields)) {
            if (RESERVED_ERROR_FIELDS.indexOf(key) !== -1) continue;
            if (FORBIDDEN_ERROR_FIELDS.indexOf(key) !== -1) continue;

            // `Object.defineProperty` is used instead of a plain assignment: a plain
            // assignment of `__proto__` replaces the prototype of the error and the
            // error stops being an `OlxApiError`.
            Object.defineProperty(this, key, {
                value: fields[key],
                enumerable: true,
                writable: true,
                configurable: true
            });
        }
    }
}

/**
 * Returns the nested `error` object of a response body, when the API answers with the
 * nested shape used by the autoupload endpoints:
 *
 * ```json
 * {"status":"ERROR","error":{"reason":"ACCESS_TOKEN_NOT_FOUND","message":"...","statusCode":404}}
 * ```
 *
 * @param {unknown} body Raw response body returned by the API.
 * @returns {Record<string, unknown>|undefined} The nested error object, when there is one.
 */
function nestedErrorOf(body: unknown): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object') return undefined;

    const nested = (body as Record<string, unknown>).error;
    if (!nested || typeof nested !== 'object') return undefined;

    return nested as Record<string, unknown>;
}

/**
 * Returns the first candidate that is a usable error code.
 */
function firstCode(candidates: unknown[]): string | number | undefined {
    for (const candidate of candidates) {
        if (typeof candidate === 'string' || typeof candidate === 'number') return candidate;
    }
    return undefined;
}

/**
 * Reads the error code reported by the API. The candidates are read in the order of the
 * contract and the first one that is a string or a number wins:
 *
 * `body.code` → `body.reason` → `body.statusCode` → `body.error` (when it is a string) →
 * `body.error.code` → `body.error.reason` → `body.error.statusCode`.
 *
 * The nested `error` object is the shape of the `autoupload` group, which answers with
 * `{"status":"ERROR","error":{"reason":"ACCESS_TOKEN_NOT_FOUND",...}}`.
 */
function extractCode(body: unknown): string | number | undefined {
    if (!body || typeof body !== 'object') return undefined;

    const fields = body as Record<string, unknown>;
    const nested = nestedErrorOf(body);

    return firstCode([
        fields.code,
        fields.reason,
        fields.statusCode,
        typeof fields.error === 'string' ? fields.error : undefined,
        nested && nested.code,
        nested && nested.reason,
        nested && nested.statusCode
    ]);
}

/**
 * Reads the human readable message reported by the API. The candidates are read in the
 * order of the contract and the first one that is a non empty string wins:
 *
 * `body.message` → `body.error_description` → `body.error.message` (when `body.error` is
 * an object) → `body.error` (when it is a string) → `body.mesage` (the misspelling used
 * by the API) → the message of the original error → the generic fallback.
 */
function extractMessage(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;

    const fields = body as Record<string, unknown>;
    const nested = nestedErrorOf(body);

    const candidates = [
        fields.message,
        fields.error_description,
        nested && nested.message,
        typeof fields.error === 'string' ? fields.error : undefined,
        fields.mesage
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    }
    return undefined;
}

/**
 * Builds the error message, preferring the message reported by the API.
 */
function buildMessage(body: unknown, status?: number, originalMessage?: string): string {
    const bodyMessage = extractMessage(body);
    if (bodyMessage) return bodyMessage;
    if (originalMessage) return originalMessage;
    if (status !== undefined) return `Request failed with status code ${status}`;
    return 'Request failed';
}

/**
 * Converts any error thrown by the transport layer into an `OlxApiError`, preserving the
 * HTTP status, the error code and the response body.
 *
 * @param {unknown} error Error thrown by axios (or by the caller).
 * @returns {OlxApiError} Error with the status, code and body of the failed request.
 */
export function toOlxApiError(error: unknown): OlxApiError {
    if (error instanceof OlxApiError) return error;

    const original = (error || {}) as {
        message?: string;
        response?: { status?: number; statusText?: string; data?: unknown };
    };
    const response = original.response;
    const body = response ? response.data : undefined;
    const status = response && typeof response.status === 'number' ? response.status : undefined;
    const statusText =
        response && typeof response.statusText === 'string' ? response.statusText : undefined;

    return new OlxApiError(buildMessage(body, status, original.message), {
        status,
        statusText,
        code: extractCode(body),
        body,
        cause: error
    });
}
