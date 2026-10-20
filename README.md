# olx-br

Esse é um pacote simples de integração com a [Api Importação de Anúncios](https://github.com/olxbr/ad_integration) da OLX Brasil hospedado no [NPM](https://www.npmjs.com/package/olx-br). Eu não tenho nenhuma afiliação com a OLX.

## Instalação

```bash
npm i olx-br
```

## Inicialização no Node.js

```javascript
import Olx from 'olx-br';
const olx = new Olx(client_id, client_secret, redirect_uri);
```
Observação: só é necessário instanciar classe para os métodos 'getAuthUrl' e 'getToken', os demais são estáticos.

## Utilização

Para correta compreensão dos métodos, é necessário conhecer o funcionamento da [API da OLX](https://github.com/olxbr/ad_integration/blob/master/api/README.md).

```javascript
//obter token de acesso de usuário 
const access_token = await olx.getToken(code);

//publicar um novo anúncio
const anuncio = { "subject": "Peça de carro em ótimo estado", ... } /* veja a estrutura completa de um anuncio em https://github.com/olxbr/ad_integration/blob/master/api/import.md */
const res = await Olx.putAnuncios(access_token, [anuncio]);
if (res.statusCode == 0) { //anuncio foi importado e será processado
  const token_anuncio = res.token; //token usado para buscar o status do anuncio
}

//obter status da publicação de um anúncio
const res = await Olx.getStatusAnuncio(access_token, token_anuncio);
const status = res.status;

//obter a lista de anúncios ativos do usuário
const anuncios = await Olx.getAnuncios(access_token); 

```
A lista completa de métodos pode ser vista [aqui](https://github.com/ViniciusRossmann/olx-br/blob/main/src/index.ts).

## Tratamento de erros

Quando uma requisição falha, todos os métodos rejeitam com um `OlxApiError`, que mantém o status HTTP, o código de erro e o corpo da resposta da OLX:

```javascript
const Olx = require('olx-br');

try {
    await Olx.getAnuncios(access_token);
} catch (error) {
    console.log(error.status);   // status HTTP (401, 404, 500, ...)
    console.log(error.code);     // código informado pela OLX (ex.: ACCESS_TOKEN_NOT_FOUND)
    console.log(error.message);  // mensagem informada pela OLX
    console.log(error.body);     // corpo bruto da resposta
}
```

O código e a mensagem são lidos tanto na raiz do corpo quanto dentro do objeto `error`, que é o formato usado pelos endpoints de autoupload:

```json
{"status":"ERROR","error":{"reason":"ACCESS_TOKEN_NOT_FOUND","message":"Response code 404 (Not Found)","statusCode":404}}
```

## Ambientes suportados

O código compilado (`dist/`) continua mirando em ES5, mas a dependência `axios@1.x` é distribuída com sintaxe moderna (`arrow functions`, `class`, `const` e `async`) e deixou de suportar o Internet Explorer. Portanto o pacote exige um runtime moderno:

- **Node.js**: 18 ou superior. O CI roda em Node 20, 22 e 24.
- **Navegadores**: qualquer navegador com suporte a ES2017 ou superior (Chrome, Edge, Firefox e Safari atuais). O Internet Explorer não é suportado.

## Desenvolvimento

```bash
npm ci         # instala as dependências
npm run typecheck  # verifica os tipos do código e dos testes
npm run build      # compila em dist/
npm test           # roda a suíte de testes
```

## Contato

- Autor: Vinícius Rossmann Nunes
- Contato: viniciusrossmann@gmail.com
