/*!
 * olx-br
 * Copyright(c) 2021 Vinícius Rossmann Nunes
 * MIT Licensed
 */

import { authApi, appApi, baseUrlOf, AUTH_BASE_URL } from './services/api';
import { UserInfo, ModelosResponse } from './types';
import { OlxApiError, toOlxApiError } from './errors';

class Olx {
    client_id: string;
    client_secret: string;
    redirect_uri: string;

    /**
     * Error thrown when a request to the OLX API fails. It keeps the HTTP status, the error
     * code and the response body of the failed request.
     */
    static readonly OlxApiError = OlxApiError;

    /**
     * @constructor
     *
     * @param {string} client_id
     *   A identificação do cliente que foi fornecida pelo olx.com.br através do registro da aplicação.
     * @param {string} client_secret
     *   Chave de segurança fornecida pela OLX após o registro da aplicação.
     * @param {string} redirect_uri
     *   Endpoint do cliente que será alvo de redirecionamento no processo de autenticação. Deve ter sido fornecida no registro da aplicação.
     */
    constructor(client_id: string, client_secret: string, redirect_uri: string) {
        this.client_id = client_id
        this.client_secret = client_secret;
        this.redirect_uri = redirect_uri;
    }

    /**
     * Obtém a URL de autenticação da OLX, onde será solicitada a autorização do usuário.
     *
     * Os parâmetros da URL são codificados, para que um `redirect_uri` com `&` ou `?` não
     * seja truncado pelo servidor de autorização.
     *
     * @param {boolean} [autoupload=true] Requerir acesso ao sistema de autouploads (Envio de anúncios de forma automática). Caso falso, terá apenas acesso aos dados básicos do usuário.
     * @param {string} state Fornece qualquer valor que pode ser útil a aplicação ao receber a resposta de requisição.
     * @returns {string} URL a ser usada para obter a autorização da OLX. 
     */
    getAuthUrl(autoupload: boolean = true, state?: string): string {
        const scope = autoupload ? 'basic_user_info autoupload' : 'basic_user_info';

        const params = new URLSearchParams();
        params.set('response_type', 'code');
        params.set('client_id', this.client_id);
        params.set('redirect_uri', this.redirect_uri);
        params.set('scope', scope);
        if (state) params.set('state', state);

        // `URLSearchParams` serializa um espaço como `+`, mas o escopo é enviado
        // codificado em porcentagem, como antes.
        const query = params.toString().replace(/\+/g, '%20');

        return `${baseUrlOf(authApi, AUTH_BASE_URL)}/oauth?${query}`;
    }

    /**
     * Gera um token de acesso a partir do código gerado pelo serviço de autenticação.
     * @param {string} code Código de autorização gerado pelo servidor de autenticação.
     * @returns {Promise<string>} Chave de acesso retornada pelo servidor de autenticação. 
     */
    async getToken(code: string): Promise<string> {
        const params = new URLSearchParams();
        params.append('code', code);
        params.append('client_id', this.client_id);
        params.append('client_secret', this.client_secret);
        params.append('redirect_uri', this.redirect_uri);
        params.append('grant_type', "authorization_code");
        try {
            const result = await authApi.post("/oauth/token", params);
            return result.data.access_token;
        } catch (err) {
            throw toOlxApiError(err);
        }
    }

    /**
     * Obtém a lista de anúncios ativos do usuário.
     * @param {string} access_token Chave de acesso do usuário
     * @returns {Promise<Object[]>} Lista de anuncios ativos
     */
    static async getAnuncios(access_token: string): Promise<any[]> {
        try {
            const result = await appApi.post("/autoupload/published", { access_token });
            return result.data;
        } catch (err) {
            throw toOlxApiError(err);
        }
    }

    /**
     * Obtém os dados básicos do usuário (nome e email)
     * @param {access_token Chave de acesso do usuário
     * @returns {Promise<UserInfo>} Retorna os dados do usuário
     */
    static async getBasicUserInfo(access_token: string): Promise<UserInfo> {
        try {
            const result = await appApi.post("/oauth_api/basic_user_info", { access_token });
            return result.data;
        } catch (err) {
            throw toOlxApiError(err);
        }
    }

    /**
     * Faz upload de uma lista de anúncios a serem publicados 
     * @param {string} access_token Chave de acesso do usuário
     * @param {Object[]} anuncios Array com os anúncios a serem publicados
     * @returns {Promise<any>} Retorno da requisição
     */
    static async putAnuncios(access_token: string, anuncios: Object[]): Promise<any> {
        var data = { access_token, "ad_list": anuncios };
        try {
            const result = await appApi.put("/autoupload/import", data);
            return result.data;
        } catch (err) {
            throw toOlxApiError(err);
        }
    }

    /**
     * Apaga uma lista de anúncios publicados
     * @param {string} access_token Chave de acesso do usuário
     * @param {string[]} id_anuncios Array com ids doa anúncios a serem excluidos
     * @returns {Promise<any>} Retorno da requisição
     */
    static async deleteAnuncios(access_token: string, id_anuncios: string[]): Promise<any> {
        let anuncios: Object[] = [];
        id_anuncios.forEach((id: string) => {
            anuncios.push({
                id,
                operation: "delete"
            });
        });
        var data = { access_token, "ad_list": anuncios };
        try {
            const result = await appApi.put("/autoupload/import", data);
            return result.data;
        } catch (err) {
            throw toOlxApiError(err);
        }
    }

    /**
     * Obtém o status da publicação de um anúncio que foi importado
     * @param {string} access_token Chave de acesso do usuário
     * @param {string} token_anuncio Identificação do anúncio. Obtido após a importação pelo método putAnuncios()
     * @returns {Promise<any>} Retorno da requisição
     */
    static async getStatusAnuncio(access_token: string, token_anuncio: string): Promise<any> {
        try {
            const result = await appApi.post(`/autoupload/import/${token_anuncio}`, { access_token });
            return result.data;
        } catch (err) {
            throw toOlxApiError(err);
        }
    }

    /**
     * Obtem o catálogo de marcas e modelos de carros que podem ser publicados na OLX
     * @param {string} access_token Chave de acesso do usuário
     * @param {number=} id_marca id da marca a ser consultada. Caso nulo, retorna a lista de todas as marcas.
     * @param {number=} id_modelo id do modelo a ser consultado. Caso nulo, retorna a lista de todos os modelos da marca.
     * @returns {Promise<ModelosResponse>} Retorno da requisição
    */
    static async getModelosCarros(access_token: string, id_marca?: number, id_modelo?: number): Promise<ModelosResponse> {
        var uri = '/autoupload/car_info';
        if (id_marca) {
            uri += `/${id_marca}`;
            if (id_modelo) uri += `/${id_modelo}`;
        }
        try {
            const result = await appApi.post(uri, { access_token });
            return result.data;
        } catch (err) {
            throw toOlxApiError(err);
        }
    }

    /**
     * Obtem o catálogo de marcas e modelos de motos que podem ser publicados na OLX
     * @param {string} access_token Chave de acesso do usuário
     * @param {number=} id_marca id da marca a ser consultada. Caso nulo, retorna a lista de todas as marcas.
     * @param {number=} id_modelo id do modelo a ser consultado. Caso nulo, retorna a lista de todos os modelos da marca.
     * @returns {Promise<ModelosResponse>} Retorno da requisição
    */
     static async getModelosMotos(access_token: string, id_marca?: number, id_modelo?: number): Promise<ModelosResponse> {
        var uri = '/autoupload/moto_info';
        if (id_marca) {
            uri += `/${id_marca}`;
            if (id_modelo) uri += `/${id_modelo}`;
        }
        try {
            const result = await appApi.post(uri, { access_token });
            return result.data;
        } catch (err) {
            throw toOlxApiError(err);
        }
    }

    /**
     * Obtém a lista de cilindradas disponíveis para motos
     * @param {string} access_token Chave de acesso do usuário
     * @returns {Promise<ModelosResponse>} Retorno da requisição
     */
    static async getCilindradas(access_token: string): Promise<ModelosResponse> {
        try {
            const result = await appApi.post('/autoupload/moto_cubiccms_info', { access_token });
            return result.data;
        } catch (err) {
            throw toOlxApiError(err);
        }
    }
}

/**
 * Public helper types, exposed through the exported class so that the `export =` contract
 * of the package (`const Olx = require('olx-br')`) is preserved.
 */
namespace Olx {
    export type UserInfo = import('./types').UserInfo;
    export type ModelosResponse = import('./types').ModelosResponse;
    export type OlxApiError = import('./errors').OlxApiError;
}

export = Olx;
