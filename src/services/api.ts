import axios, { AxiosInstance } from 'axios';

/**
 * Base URL of the OLX authentication service.
 *
 * It is kept without a trailing slash so that the paths appended to it never produce a
 * double slash (the previous implementation produced `https://auth.olx.com.br//oauth`).
 */
export const AUTH_BASE_URL = 'https://auth.olx.com.br';

/** Base URL of the OLX application API (`autoupload`, `oauth_api` and `autoservice`). */
export const APP_BASE_URL = 'https://apps.olx.com.br';

export const authApi = axios.create({
  baseURL: AUTH_BASE_URL,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});

export const appApi = axios.create({
    baseURL: APP_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

/**
 * Client of the autoservice API (chat and automatic service).
 *
 * It uses the same host as the application API, but it is kept as a separate instance so
 * that the automatic service can be configured (timeout, headers, ...) on its own.
 */
export const chatApi = axios.create({
    baseURL: APP_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

/**
 * Client of the listing API of the advertisements (`autoupload/v1`).
 *
 * It is a group of its own: the listing takes the access token in the
 * `Authorization: Bearer` header and answers with the pages of the listing, so it is
 * kept as a separate instance, like the client of the automatic service.
 */
export const listingApi = axios.create({
    baseURL: APP_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

/**
 * Returns the base URL of an axios instance without trailing slashes, so that a path can
 * be safely appended to it.
 *
 * @param {AxiosInstance} instance Axios instance used to perform the request.
 * @param {string} fallback Base URL used when the instance has none configured.
 * @returns {string} Base URL without trailing slashes.
 */
export function baseUrlOf(instance: AxiosInstance, fallback: string): string {
    const base = instance.defaults.baseURL || fallback;
    return base.replace(/\/+$/, '');
}
