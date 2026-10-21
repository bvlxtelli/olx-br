import { describe, it, expect, afterEach } from 'vitest';
import Olx from '../../src/index';
import { listingApi } from '../../src/services/api';
import { mockAdapter, urlOf } from '../helpers/axios-mock';

/**
 * The type of the situation of the advertisement.
 *
 * The four values of the documentation are the ones the editor suggests, but the type
 * accepts **any string**, because the package sends the value exactly as it was given: a
 * value that OLX adds later cannot be blocked by the package.
 *
 * The assignments below are the proof: they only compile with that type. The typecheck of
 * the tests is part of the gate (`npm run typecheck` covers `test/`).
 */

const SITUACOES_DOCUMENTADAS: Olx.SituacaoAnuncio[] = [
    'published',
    'pending_review',
    'deleted',
    'refused'
];

/** A value that the documentation does not list. The type has to accept it. */
const SITUACAO_NAO_DOCUMENTADA: Olx.SituacaoAnuncio = 'uma-situacao-que-a-olx-adicionar';

describe('o tipo da situação do anúncio', () => {
    const originalAdapter = listingApi.defaults.adapter;

    afterEach(() => {
        listingApi.defaults.adapter = originalAdapter;
    });

    it('aceita os quatro valores da documentação', () => {
        expect(SITUACOES_DOCUMENTADAS).toEqual([
            'published',
            'pending_review',
            'deleted',
            'refused'
        ]);
    });

    it('aceita um valor que a documentação não lista', () => {
        expect(SITUACAO_NAO_DOCUMENTADA).toBe('uma-situacao-que-a-olx-adicionar');
    });

    it('envia um valor que a documentação não lista como ele veio', async () => {
        const mock = mockAdapter({ data: { data: [], current_token: null, next_token: null } });
        listingApi.defaults.adapter = mock.adapter;

        await Olx.listarAnuncios('fake-token', { ads_status: SITUACAO_NAO_DOCUMENTADA });

        expect(urlOf(mock.requests[0])).toContain(
            'ads_status=uma-situacao-que-a-olx-adicionar'
        );
    });
});
