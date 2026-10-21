import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Olx from '../../src/index';
import { appApi } from '../../src/services/api';
import { mockAdapter, RecordedRequest } from '../helpers/axios-mock';
import {
    AnuncioDoPayload,
    OBRIGATORIO_DESDE,
    REGRAS,
    REGRAS_NAO_VERIFICAVEIS,
    validarAnuncio,
    validarPayload
} from './payload-contract';

/**
 * The executable contract of the payload of the advertisement import.
 *
 * The rules are the ones of <https://developers.olx.com.br/anuncio/api/import.html> for
 * the `ad_list` of `PUT /autoupload/import`. The suite checks them on the object that
 * the caller hands to `putAnuncios`, and it checks that the body the library really
 * sends complies with them.
 *
 * Everything here runs offline: no network, no credential, no secret.
 */

/** An advertisement that follows every rule of the documentation. */
const ANUNCIO_VALIDO: AnuncioDoPayload = {
    id: 'anuncio-1',
    operation: 'insert',
    category: 1234,
    subject: 'Peca de carro em otimo estado',
    body: 'Carro seminovo, com pouco quilometragem e revisado.',
    phone: 11987654321,
    type: 's',
    price: 15000,
    zipcode: '01310100',
    images: ['https://img.olx.com.br/foto1.jpg'],
    phone_hidden: false,
    params: [{ name: 'marca', value: 'Chevrolet' }],
    videos: ['https://www.youtube.com/watch?v=abc123']
};

/** A copy of the valid advertisement with one field changed. */
function anuncioCom(mudanca: Record<string, unknown>): AnuncioDoPayload {
    return { ...ANUNCIO_VALIDO, ...mudanca };
}

const originalAdapter = appApi.defaults.adapter;
let requests: RecordedRequest[] = [];

function useMock() {
    const mock = mockAdapter({ data: { statusCode: 0 } });
    requests = mock.requests;
    appApi.defaults.adapter = mock.adapter;
}

function restoreAdapter() {
    appApi.defaults.adapter = originalAdapter;
}

describe('the contract of the payload of the advertisement import', () => {
    beforeEach(() => {
        restoreAdapter();
    });

    afterEach(() => {
        restoreAdapter();
    });

    describe('a payload that follows the documentation', () => {
        it('is accepted', () => {
            expect(validarAnuncio(ANUNCIO_VALIDO)).toEqual([]);
            expect(validarPayload([ANUNCIO_VALIDO])).toEqual([]);
        });

        it('accepts a delete, which only carries the id and the operation', () => {
            expect(validarAnuncio({ id: 'anuncio-1', operation: 'delete' })).toEqual([]);
        });

        it('accepts an announcement without the optional fields', () => {
            const semOpcionais = {
                id: 'anuncio-1',
                operation: 'insert',
                category: 1234,
                subject: 'Peca de carro em otimo estado',
                body: 'Carro seminovo, com pouco quilometragem e revisado.',
                phone: 11987654321,
                type: 's',
                price: 15000,
                zipcode: '01310100',
                images: ['https://img.olx.com.br/foto1.jpg']
            };

            expect(validarAnuncio(semOpcionais)).toEqual([]);
        });
    });

    describe('the id', () => {
        it('has to match the pattern of the documentation', () => {
            expect(validarAnuncio(anuncioCom({ id: 'com espaco' }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ id: 'a'.repeat(20) }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ id: '' }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ id: 12345 }))).not.toEqual([]);
        });

        it('accepts the characters that the pattern allows', () => {
            expect(validarAnuncio(anuncioCom({ id: 'aA9_-{}' }))).toEqual([]);
            expect(validarAnuncio(anuncioCom({ id: 'a'.repeat(19) }))).toEqual([]);
        });

        it('has to be unique inside the JSON of the import', () => {
            const erros = validarPayload([ANUNCIO_VALIDO, { ...ANUNCIO_VALIDO }]);

            expect(erros.join('\n')).toContain('único dentro do JSON');
        });
    });

    describe('the subject', () => {
        it('has to have from 2 to 90 characters', () => {
            expect(validarAnuncio(anuncioCom({ subject: 'x' }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ subject: 'x'.repeat(91) }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ subject: 'xx' }))).toEqual([]);
            expect(validarAnuncio(anuncioCom({ subject: 'x'.repeat(90) }))).toEqual([]);
        });

        it('counts the characters, not the bytes', () => {
            expect(validarAnuncio(anuncioCom({ subject: '😀😀' }))).toEqual([]);
        });
    });

    describe('the body', () => {
        it('has to have from 2 to 6000 characters', () => {
            expect(validarAnuncio(anuncioCom({ body: 'x' }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ body: 'x'.repeat(6001) }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ body: 'x'.repeat(6000) }))).toEqual([]);
        });
    });

    describe('the phone', () => {
        it('has to be an integer with 10 or 11 digits', () => {
            expect(validarAnuncio(anuncioCom({ phone: 119876543 }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ phone: 119876543210 }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ phone: 1198765432 }))).toEqual([]);
            expect(validarAnuncio(anuncioCom({ phone: 11987654321 }))).toEqual([]);
        });

        it('cannot carry spaces', () => {
            expect(validarAnuncio(anuncioCom({ phone: '11 98765 4321' }))).not.toEqual([]);
        });
    });

    describe('the type', () => {
        it('has to be s or u', () => {
            expect(validarAnuncio(anuncioCom({ type: 'x' }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ type: 'S' }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ type: 's' }))).toEqual([]);
            expect(validarAnuncio(anuncioCom({ type: 'u' }))).toEqual([]);
        });
    });

    describe('the price', () => {
        it('cannot carry cents', () => {
            expect(validarAnuncio(anuncioCom({ price: 15000.5 }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ price: 15000 }))).toEqual([]);
        });

        it(`is mandatory since ${OBRIGATORIO_DESDE}`, () => {
            const semPreco = { ...ANUNCIO_VALIDO };
            delete semPreco.price;

            expect(validarAnuncio(semPreco).join('\n')).toContain('price');
        });
    });

    describe('the zipcode', () => {
        it('has to be a numeric string', () => {
            expect(validarAnuncio(anuncioCom({ zipcode: '01310-100' }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ zipcode: 1310100 }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ zipcode: '' }))).not.toEqual([]);
            expect(validarAnuncio(anuncioCom({ zipcode: '01310100' }))).toEqual([]);
        });
    });

    describe('the images', () => {
        it('cannot be more than 20', () => {
            const muitas = Array.from({ length: 21 }, (_, indice) => `https://img.olx.com.br/${indice}.jpg`);

            expect(validarAnuncio(anuncioCom({ images: muitas })).join('\n')).toContain('20');
        });

        it('cannot repeat the same URL', () => {
            const repetidas = [
                'https://img.olx.com.br/foto1.jpg',
                'https://img.olx.com.br/foto1.jpg'
            ];

            expect(validarAnuncio(anuncioCom({ images: repetidas })).join('\n')).toContain('repetir');
        });

        it(`are mandatory since ${OBRIGATORIO_DESDE}`, () => {
            const semImagens = { ...ANUNCIO_VALIDO };
            delete semImagens.images;

            expect(validarAnuncio(semImagens).join('\n')).toContain('images');
        });
    });

    describe('the videos', () => {
        it('cannot be more than one', () => {
            const dois = [
                'https://www.youtube.com/watch?v=abc123',
                'https://www.youtube.com/watch?v=def456'
            ];

            expect(validarAnuncio(anuncioCom({ videos: dois })).join('\n')).toContain('no máximo 1');
        });

        it('can only be from YouTube', () => {
            expect(
                validarAnuncio(anuncioCom({ videos: ['https://vimeo.com/12345'] })).join('\n')
            ).toContain('YouTube');
            expect(validarAnuncio(anuncioCom({ videos: ['https://youtu.be/abc123'] }))).toEqual([]);
        });
    });

    describe('the operation', () => {
        it('has to be insert or delete', () => {
            expect(validarAnuncio(anuncioCom({ operation: 'update' })).join('\n')).toContain(
                'operation'
            );
        });

        it('does not let a delete carry the fields of an insert', () => {
            expect(validarAnuncio({ ...ANUNCIO_VALIDO, operation: 'delete' }).join('\n')).toContain(
                'delete'
            );
        });
    });

    describe('the payload that the library really sends', () => {
        it('complies with the contract of the documentation', async () => {
            useMock();

            await Olx.putAnuncios('fake-token', [ANUNCIO_VALIDO]);

            expect(requests).toHaveLength(1);
            expect(requests[0].method).toBe('put');
            expect(requests[0].url).toBe('https://apps.olx.com.br/autoupload/import');

            const body = requests[0].body;

            expect(body.access_token).toBe('fake-token');
            expect(validarPayload(body.ad_list)).toEqual([]);
        });

        it('complies with the contract when the announcements are deleted', async () => {
            useMock();

            await Olx.deleteAnuncios('fake-token', ['anuncio-1', 'anuncio-2']);

            expect(requests).toHaveLength(1);

            const body = requests[0].body;

            expect(validarPayload(body.ad_list)).toEqual([]);
        });
    });

    describe('the rules that cannot be checked at runtime', () => {
        it('are declared, each one with the reason', () => {
            expect(REGRAS_NAO_VERIFICAVEIS.length).toBeGreaterThan(0);

            for (const regra of REGRAS_NAO_VERIFICAVEIS) {
                expect(regra.regra.length).toBeGreaterThan(0);
                expect(regra.motivo.length).toBeGreaterThan(0);
            }
        });

        it('says that the acceptance of the API needs a real credential', () => {
            const texto = REGRAS_NAO_VERIFICAVEIS.map((regra) => `${regra.regra} ${regra.motivo}`).join(
                '\n'
            );

            expect(texto).toContain('credencial real');
        });
    });

    describe('the table of the rules', () => {
        it('is the one the validator applies', () => {
            expect(REGRAS.id.padrao).toBe('[A-Za-z0-9_{}-]{1,19}');
            expect(REGRAS.subject.minimo).toBe(2);
            expect(REGRAS.subject.maximo).toBe(90);
            expect(REGRAS.body.minimo).toBe(2);
            expect(REGRAS.body.maximo).toBe(6000);
            expect(REGRAS.phone.digitos.minimo).toBe(10);
            expect(REGRAS.phone.digitos.maximo).toBe(11);
            expect(REGRAS.type.valores).toEqual(['s', 'u']);
            expect(REGRAS.price.obrigatorio).toBe(true);
            expect(REGRAS.zipcode.numerico).toBe(true);
            expect(REGRAS.images.maximo).toBe(20);
            expect(REGRAS.images.semRepetidas).toBe(true);
            expect(REGRAS.images.obrigatorio).toBe(true);
            expect(REGRAS.videos.maximo).toBe(1);
            expect(REGRAS.videos.apenasYouTube).toBe(true);
        });
    });
});
