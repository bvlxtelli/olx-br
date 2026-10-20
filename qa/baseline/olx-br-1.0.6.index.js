"use strict";
/*!
 * olx-br
 * Copyright(c) 2021 Vinícius Rossmann Nunes
 * MIT Licensed
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var api_1 = require("./services/api");
var Olx = /** @class */ (function () {
    /**
     * @constructor
     *
     * @param {string} client_id
     *   A identificação do cliente que foi fornecida pelo olx.com.br através do registro da aplicação.
     * @param {string} client_secret
     *   Chave de segurança fornecida pela OLX após o registro da aplicação.
     * @param {string} redirect_uri
     *   Endpoint do cliente que será alvo de redirecionamento no processo de autenticação. Deve ter sido fornecida no registro da aplicação.
     */
    function Olx(client_id, client_secret, redirect_uri) {
        this.client_id = client_id;
        this.client_secret = client_secret;
        this.redirect_uri = redirect_uri;
    }
    /**
     * Obtém a URL de autenticação da OLX, onde será solicitada a autorização do usuário.
     * @param {boolean} [autoupload=true] Requerir acesso ao sistema de autouploads (Envio de anúncios de forma automática). Caso falso, terá apenas acesso aos dados básicos do usuário.
     * @param {string} state Fornece qualquer valor que pode ser útil a aplicação ao receber a resposta de requisição.
     * @returns {string} URL a ser usada para obter a autorização da OLX.
     */
    Olx.prototype.getAuthUrl = function (autoupload, state) {
        if (autoupload === void 0) { autoupload = true; }
        var scope = 'basic_user_info';
        if (autoupload)
            scope += '%20autoupload';
        var query = "response_type=code&client_id=" + this.client_id + "&redirect_uri=" + this.redirect_uri + "&scope=" + scope;
        if (state)
            query += "&state=" + state;
        return api_1.authApi.defaults.baseURL + '/oauth?' + query;
    };
    /**
     * Gera um token de acesso a partir do código gerado pelo serviço de autenticação.
     * @param {string} code Código de autorização gerado pelo servidor de autenticação.
     * @returns {Promise<string>} Chave de acesso retornada pelo servidor de autenticação.
     */
    Olx.prototype.getToken = function (code) {
        return __awaiter(this, void 0, void 0, function () {
            var params;
            return __generator(this, function (_a) {
                params = new URLSearchParams();
                params.append('code', code);
                params.append('client_id', this.client_id);
                params.append('client_secret', this.client_secret);
                params.append('redirect_uri', this.redirect_uri);
                params.append('grant_type', "authorization_code");
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        api_1.authApi.post("/oauth/token", params)
                            .then(function (result) {
                            resolve(result.data.access_token);
                        })
                            .catch(function (err) {
                            var _a;
                            reject(((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err);
                        });
                    })];
            });
        });
    };
    /**
     * Obtém a lista de anúncios ativos do usuário.
     * @param {string} access_token Chave de acesso do usuário
     * @returns {Promise<Object[]>} Lista de anuncios ativos
     */
    Olx.getAnuncios = function (access_token) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        api_1.appApi.post("/autoupload/published", { access_token: access_token })
                            .then(function (result) {
                            resolve(result.data);
                        })
                            .catch(function (err) {
                            var _a;
                            reject(((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err);
                        });
                    })];
            });
        });
    };
    /**
     * Obtém os dados básicos do usuário (nome e email)
     * @param access_token Chave de acesso do usuário
     * @returns {Promise<UserInfo>} Retorna os dados do usuário
     */
    Olx.getBasicUserInfo = function (access_token) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        api_1.appApi.post("/oauth_api/basic_user_info", { access_token: access_token })
                            .then(function (result) {
                            resolve(result.data);
                        })
                            .catch(function (err) {
                            var _a;
                            reject(((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err);
                        });
                    })];
            });
        });
    };
    /**
     * Faz upload de uma lista de anúncios a serem publicados
     * @param {string} access_token Chave de acesso do usuário
     * @param {Object[]} anuncios Array com os anúncios a serem publicados
     * @returns {Promise<any>} Retorno da requisição
     */
    Olx.putAnuncios = function (access_token, anuncios) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                data = { access_token: access_token, "ad_list": anuncios };
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        api_1.appApi.put("/autoupload/import", data)
                            .then(function (result) {
                            resolve(result.data);
                        })
                            .catch(function (err) {
                            var _a;
                            reject(((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err);
                        });
                    })];
            });
        });
    };
    /**
     * Apaga uma lista de anúncios publicados
     * @param {string} access_token Chave de acesso do usuário
     * @param {string[]} id_anuncios Array com ids doa anúncios a serem excluidos
     * @returns {Promise<any>} Retorno da requisição
     */
    Olx.deleteAnuncios = function (access_token, id_anuncios) {
        return __awaiter(this, void 0, void 0, function () {
            var anuncios, data;
            return __generator(this, function (_a) {
                anuncios = [];
                id_anuncios.forEach(function (id) {
                    anuncios.push({
                        id: id,
                        operation: "delete"
                    });
                });
                data = { access_token: access_token, "ad_list": anuncios };
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        api_1.appApi.put("/autoupload/import", data)
                            .then(function (result) {
                            resolve(result.data);
                        })
                            .catch(function (err) {
                            var _a;
                            reject(((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err);
                        });
                    })];
            });
        });
    };
    /**
     * Obtém o status da publicação de um anúncio que foi importado
     * @param {string} access_token Chave de acesso do usuário
     * @param {string} token_anuncio Identificação do anúncio. Obtido após a importação pelo método putAnuncios()
     * @returns {Promise<any>} Retorno da requisição
     */
    Olx.getStatusAnuncio = function (access_token, token_anuncio) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        api_1.appApi.post("/autoupload/import/" + token_anuncio, { access_token: access_token })
                            .then(function (result) {
                            resolve(result.data);
                        })
                            .catch(function (err) {
                            var _a;
                            reject(((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err);
                        });
                    })];
            });
        });
    };
    /**
     * Obtem o catálogo de marcas e modelos de carros que podem ser publicados na OLX
     * @param {string} access_token Chave de acesso do usuário
     * @param {number=} id_marca id da marca a ser consultada. Caso nulo, retorna a lista de todas as marcas.
     * @param {number=} id_modelo id do modelo a ser consultado. Caso nulo, retorna a lista de todos os modelos da marca.
     * @returns {Promise<ModelosResponse>} Retorno da requisição
    */
    Olx.getModelosCarros = function (access_token, id_marca, id_modelo) {
        return __awaiter(this, void 0, void 0, function () {
            var uri;
            return __generator(this, function (_a) {
                uri = '/autoupload/car_info';
                if (id_marca) {
                    uri += "/" + id_marca;
                    if (id_modelo)
                        uri += "/" + id_modelo;
                }
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        api_1.appApi.post(uri, { access_token: access_token })
                            .then(function (result) {
                            resolve(result.data);
                        })
                            .catch(function (err) {
                            var _a;
                            reject(((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err);
                        });
                    })];
            });
        });
    };
    /**
     * Obtem o catálogo de marcas e modelos de motos que podem ser publicados na OLX
     * @param {string} access_token Chave de acesso do usuário
     * @param {number=} id_marca id da marca a ser consultada. Caso nulo, retorna a lista de todas as marcas.
     * @param {number=} id_modelo id do modelo a ser consultado. Caso nulo, retorna a lista de todos os modelos da marca.
     * @returns {Promise<ModelosResponse>} Retorno da requisição
    */
    Olx.getModelosMotos = function (access_token, id_marca, id_modelo) {
        return __awaiter(this, void 0, void 0, function () {
            var uri;
            return __generator(this, function (_a) {
                uri = '/autoupload/moto_info';
                if (id_marca) {
                    uri += "/" + id_marca;
                    if (id_modelo)
                        uri += "/" + id_modelo;
                }
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        api_1.appApi.post(uri, { access_token: access_token })
                            .then(function (result) {
                            resolve(result.data);
                        })
                            .catch(function (err) {
                            var _a;
                            reject(((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err);
                        });
                    })];
            });
        });
    };
    /**
     * Obtém a lista de cilindradas disponíveis para motos
     * @param {string} access_token Chave de acesso do usuário
     * @returns {Promise<ModelosResponse>} Retorno da requisição
     */
    Olx.getCilindradas = function (access_token) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        api_1.appApi.post('/autoupload/moto_cubiccms_info', { access_token: access_token })
                            .then(function (result) {
                            resolve(result.data);
                        })
                            .catch(function (err) {
                            var _a;
                            reject(((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err);
                        });
                    })];
            });
        });
    };
    return Olx;
}());
module.exports = Olx;
