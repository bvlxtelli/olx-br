/**
 * The default import contract of the package: `import Olx from 'olx-br'`.
 *
 * The package is published with `export =`, so this form only compiles with the
 * interoperability flag turned on. It is the form used in the README.
 */
import Olx from 'olx-br';

const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');

const url: string = olx.getAuthUrl();

olx.getToken('code')
    .then((token: string) => Olx.getAnuncios(token))
    .catch(() => undefined);

console.log(url);
