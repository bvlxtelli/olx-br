/**
 * Error returned by every method of the `Olx` class when a request to the OLX API fails.
 *
 * Previously the methods rejected with `err.response?.data || err`, which dropped the HTTP
 * status and the original error whenever the body was empty. This class keeps all of it:
 *
 *  - `status`     : HTTP status code returned by the API (401, 400, 500, ...).
 *  - `statusText` : HTTP status text returned by the API.
 *  - `code`       : error code reported by the API (`code`, `reason` or `statusCode`).
 *  - `body`       : raw response body, exactly as returned by the API.
 *  - `data`       : alias of `body`, kept for convenience.
 *  - `cause`      : the original error thrown by axios, when there is one.
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
        this.cause = init.cause;

        // Keeps `instanceof` working when the package is compiled to an older target.
        Object.setPrototypeOf(this, OlxApiError.prototype);

        this.copyBodyFields(init.body);
    }

    /**
     * Copies the fields of the response body onto the error, so that consumers that used
     * to read the raw body directly (e.g. `error.errors`) keep working.
     */
    private copyBodyFields(body: unknown): void {
        if (!body || typeof body !== 'object') return;

        const fields = body as Record<string, unknown>;
        for (const key of Object.keys(fields)) {
            if (RESERVED_ERROR_FIELDS.indexOf(key) !== -1) continue;
            (this as unknown as Record<string, unknown>)[key] = fields[key];
        }
    }
}

/**
 * Reads the error code reported by the API, accepting the field names used by the
 * different OLX endpoints (`code`, `reason` and `statusCode`).
 */
function extractCode(body: unknown): string | number | undefined {
    if (!body || typeof body !== 'object') return undefined;

    const fields = body as Record<string, unknown>;
    const candidates = [fields.code, fields.reason, fields.statusCode];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' || typeof candidate === 'number') return candidate;
    }
    return undefined;
}

/**
 * Reads the human readable message reported by the API. The `mesage` field is also
 * accepted because the OLX API misspells it on some error responses.
 */
function extractMessage(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;

    const fields = body as Record<string, unknown>;
    const candidates = [fields.message, fields.error_description, fields.error, fields.mesage];
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
