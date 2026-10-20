"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appApi = exports.authApi = void 0;
var axios_1 = require("axios");
var GET_TOKEN_URL = 'https://auth.olx.com.br/';
var API_URL = 'https://apps.olx.com.br/';
exports.authApi = axios_1.default.create({
    baseURL: GET_TOKEN_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});
exports.appApi = axios_1.default.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' }
});
