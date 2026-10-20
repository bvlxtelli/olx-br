/**
 * The CommonJS contract of the package: `const Olx = require('olx-br')`.
 *
 * The package is published with `export =`, so this import form has to keep compiling
 * and has to keep delivering the class itself.
 */
import Olx = require('olx-br');

const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');

const url: string = olx.getAuthUrl();

olx.getToken('code')
    .then((token: string) => Olx.getAnuncios(token))
    .catch(() => undefined);

console.log(url);
