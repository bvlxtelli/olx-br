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
 *                   enumerable**, so it never reaches `JSON.stringify` nor the console
 *                   (it carries the whole request, with the `client_secret` of the
 *                   application in the case of the token request).
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
        // that it never reaches `JSON.stringify` nor the console.
        Object.defineProperty(this, 'cause', {
            value: init.cause,
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
