import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import Olx from '../../src/index';

/**
 * Contract of the public API of the package.
 *
 * The package is published on npm and used by third party applications, so the names and
 * the signatures of the public methods must never change without a major version.
 */
describe('public API', () => {
    const statics = Object.getOwnPropertyNames(Olx)
        .filter((name) => !['length', 'name', 'prototype'].includes(name))
        .sort();

    const prototype = Object.getOwnPropertyNames(Olx.prototype)
        .filter((name) => name !== 'constructor')
        .sort();

    it('keeps the static methods of the published package', () => {
        expect(statics).toEqual(expect.arrayContaining([
            'deleteAnuncios',
            'getAnuncios',
            'getBasicUserInfo',
            'getCilindradas',
            'getModelosCarros',
            'getModelosMotos',
            'getStatusAnuncio',
            'putAnuncios'
        ]));
    });

    it('keeps the instance methods of the published package', () => {
        expect(prototype).toEqual(expect.arrayContaining(['getAuthUrl', 'getToken']));
    });

    it('keeps the signature of the constructor', () => {
        expect(Olx.length).toBe(3);
    });

    it('keeps the signature of the methods', () => {
        expect(Olx.prototype.getAuthUrl.length).toBe(2);
        expect(Olx.prototype.getToken.length).toBe(1);
        expect(Olx.getAnuncios.length).toBe(1);
        expect(Olx.getBasicUserInfo.length).toBe(1);
        expect(Olx.putAnuncios.length).toBe(2);
        expect(Olx.deleteAnuncios.length).toBe(2);
        expect(Olx.getStatusAnuncio.length).toBe(2);
        expect(Olx.getModelosCarros.length).toBe(3);
        expect(Olx.getModelosMotos.length).toBe(3);
        expect(Olx.getCilindradas.length).toBe(1);
    });

    it('exposes the error class and the known scopes', () => {
        expect(typeof Olx.OlxApiError).toBe('function');
        expect(Olx.SCOPES).toEqual({
            basicUserInfo: 'basic_user_info',
            autoupload: 'autoupload',
            chat: 'chat',
            autoservice: 'autoservice'
        });
    });

    it('exposes the chat methods', () => {
        expect(typeof Olx.ativarWebhookChat).toBe('function');
        expect(typeof Olx.desativarWebhookChat).toBe('function');
        expect(typeof Olx.responderChat).toBe('function');
    });

    it('keeps the errors of the API as instances of OlxApiError', () => {
        const error = new Olx.OlxApiError('boom', { status: 401 });

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(Olx.OlxApiError);
        expect(error.status).toBe(401);
    });

    it('keeps the export = contract of the package', () => {
        const declaration = path.resolve(__dirname, '../../dist/index.d.ts');
        const built = fs.existsSync(declaration);

        // The declaration file only exists after a build (npm run build).
        if (!built) return;

        const content = fs.readFileSync(declaration, 'utf8');

        expect(content).toMatch(/export = Olx;/);
    });
});
