import axios from 'axios';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/** Request recorded by the mock adapter. */
export interface RecordedRequest {
    /** Full URL of the request, as resolved by axios. */
    url: string;
    /** HTTP method, lowercased. */
    method: string;
    /** Request body, parsed when it was sent as JSON. */
    body: any;
    /** Request headers. */
    headers: Record<string, string>;
    /** Raw request body, exactly as it was handed over to axios. */
    rawBody: unknown;
}

/** Response returned by the mock adapter. */
export interface MockResponse {
    data?: unknown;
    status?: number;
    statusText?: string;
}

/** Mock adapter and the requests it recorded. */
export interface AxiosMock {
    adapter: AxiosAdapter;
    requests: RecordedRequest[];
}

/**
 * Creates an axios adapter that records every request and always answers with the given
 * response. It replaces the real transport, so the whole axios pipeline (URL resolution,
 * header handling and body serialization) is still exercised.
 */
export function mockAdapter(response: MockResponse = {}): AxiosMock {
    const requests: RecordedRequest[] = [];

    const adapter: AxiosAdapter = async (
        config: InternalAxiosRequestConfig
    ): Promise<AxiosResponse> => {
        requests.push({
            url: resolveUrl(config),
            method: (config.method || 'get').toLowerCase(),
            body: parseBody(config.data),
            headers: { ...(config.headers as unknown as Record<string, string>) },
            rawBody: config.data
        });

        const status = response.status === undefined ? 200 : response.status;
        const statusText = response.statusText === undefined ? 'OK' : response.statusText;

        const axiosResponse = {
            data: response.data === undefined ? {} : response.data,
            status,
            statusText,
            headers: {},
            config
        } as AxiosResponse;

        // The HTTP adapter of axios rejects the promise when the status is not accepted by
        // `validateStatus`. The mock has to behave the same way, otherwise the methods of the
        // class would resolve with the error body instead of rejecting.
        const isValid = config.validateStatus
            ? config.validateStatus(status)
            : status >= 200 && status < 300;

        if (!isValid) {
            throw new axios.AxiosError(
                `Request failed with status code ${status}`,
                status >= 500
                    ? axios.AxiosError.ERR_BAD_RESPONSE
                    : axios.AxiosError.ERR_BAD_REQUEST,
                config,
                undefined,
                axiosResponse
            );
        }

        return axiosResponse;
    };

    return { adapter, requests };
}

/**
 * Creates an axios adapter that always fails, simulating a transport error (no HTTP
 * response is available in that case).
 */
export function failingAdapter(error: Error): AxiosAdapter {
    return async () => {
        throw error;
    };
}

/**
 * Reads a header of a recorded request, ignoring the case of its name.
 */
export function headerOf(request: RecordedRequest, name: string): string | undefined {
    const wanted = name.toLowerCase();
    const found = Object.keys(request.headers).find((key) => key.toLowerCase() === wanted);
    return found === undefined ? undefined : request.headers[found];
}

/**
 * Resolves the full URL of a request the same way axios does.
 */
function resolveUrl(config: InternalAxiosRequestConfig): string {
    const url = config.url || '';
    if (/^https?:\/\//i.test(url)) return url;

    const base = (config.baseURL || '').replace(/\/+$/, '');
    return `${base}${url}`;
}

/**
 * Parses the body of a request when it was serialized as JSON.
 */
function parseBody(data: unknown): any {
    if (typeof data !== 'string') return data;

    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
}
