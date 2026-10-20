# olx-br

Esse é um pacote simples de integração com a [Api Importação de Anúncios](https://github.com/olxbr/ad_integration) da OLX Brasil hospedado no [NPM](https://www.npmjs.com/package/olx-br). Eu não tenho nenhuma afiliação com a OLX.

> Este repositório é um fork de [ViniciusRossmann/olx-br](https://github.com/ViniciusRossmann/olx-br)
> (MIT, autor original **Vinícius Rossmann Nunes**). A licença MIT e a atribuição ao autor
> original foram preservadas e o nome do pacote (`olx-br`) não foi alterado. O fork é
> marcado como `private` no `package.json` e **não é publicado no npm**, porque o nome
> `olx-br` no npm pertence ao autor do projeto original.

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

## Escopos OAuth

`getAuthUrl()` aceita, além do booleano, os escopos que devem ser solicitados. As opções
disponíveis são `basic_user_info`, `autoupload`, `chat` e `autoservice`.

```javascript
//comportamento original: basic_user_info + autoupload
const url = olx.getAuthUrl();
const url = olx.getAuthUrl(true);   //basic_user_info + autoupload
const url = olx.getAuthUrl(false);  //apenas basic_user_info

//solicitando escopos adicionais
const url = olx.getAuthUrl('chat autoservice');       //vários escopos separados por espaço
const url = olx.getAuthUrl(['chat', 'autoservice']);  //ou em um array
const url = olx.getAuthUrl('chat', 'meu-state');      //o state continua funcionando
```

O escopo `basic_user_info` é sempre solicitado, por ser o escopo base da aplicação. Os
nomes dos escopos diferenciam maiúsculas de minúsculas e a ordem em que são enviados não
importa para o servidor de autorização da OLX.

**Atenção:** os escopos `chat` e `autoservice` **ainda não foram confirmados pela OLX**. Os
nomes são usados como estão, e viram uma constante só (`Olx.SCOPES`), para que a correção
seja uma linha só, caso a OLX use outro nome.

**Atenção ao `redirect_uri`:** ele é enviado exatamente como foi registrado, sem codificação,
porque o servidor de autorização o compara com o valor registrado. Por isso, o
`redirect_uri` **não pode conter `&`, `#`, `?` nem espaços**.

## Cliente de chat (API de autoservice)

As mensagens dos compradores podem ser recebidas através de um webhook. O cliente de chat
usa o token de acesso como *bearer token* e exige o escopo `chat`.

> O token de acesso só é aceito no header `Authorization: Bearer <token>`. Enviado no header
> `accessToken` ou no corpo da requisição, a API responde `400` com
> `{"message":"Bad request: accessToken is required"}`.

| Método | Requisição | Resposta |
|---|---|---|
| `Olx.ativarWebhookChat(access_token, webhook)` | `POST /autoservice/v1/chat` com `{"webhook": "url"}` | `201` na primeira ativação, `200` em atualizações, `401` com token inválido |
| `Olx.desativarWebhookChat(access_token)` | `DELETE /autoservice/v1/chat` | `200` ao desativar, `401` com token inválido, `400` quando a conta não existe |
| `Olx.responderChat(access_token, mensagem)` | `POST /autoservice/v1/chat/send` com `{"textMessage", "messageId", "chatId"}` | `200` ao enviar, `400` com corpo inválido ou sem integração, `500` em erro interno |

```javascript
//ativar o webhook que receberá as mensagens dos compradores
await Olx.ativarWebhookChat(access_token, 'https://meusite.com.br/olx/chat');

//responder uma conversa
await Olx.responderChat(access_token, {
  textMessage: 'Olá! O item ainda está disponível.',
  messageId: 'id-da-mensagem',
  chatId: 'id-da-conversa'
});

//desativar o webhook
await Olx.desativarWebhookChat(access_token);
```

### Caminhos que não existem na API

Os caminhos abaixo foram verificados contra a API da OLX e **não existem**, portanto não
são implementados por este pacote. A API responde `500` com o corpo
`{"mesage": "404 NOT_FOUND ..."}`:

```
/autoservice/v1/webhooks
/autoservice/v1/leads
/autoservice/v1/chats
/autoservice/v1/notifications
/autoservice/v1/leads/config
/autoservice/v1/webhook
```

## Erros

Existem dois tipos de erro na API da OLX e eles não devem ser misturados.

**Erro da aplicação** — a API responde `HTTP 200` e o resultado da operação vem no corpo,
inclusive quando a operação falhou. Nesse caso a promise é **resolvida** e quem chama tem
que ler o `statusCode`:

```javascript
const res = await Olx.putAnuncios(access_token, [anuncio]);
if (res.statusCode === 0) {
  // o anúncio foi importado
  const token_anuncio = res.token;
} else {
  console.log(res.statusCode, res.statusMessage, res.errors);
}
```

**Erro HTTP** — a API responde `4xx` ou `5xx`. Nesse caso a promise é **rejeitada** com um
`OlxApiError`, que preserva o corpo da resposta como ele chegou.

### O objeto de erro

Todas as requisições que falham rejeitam com um `OlxApiError`, que é um `Error` e carrega:

| campo | o que é |
|-------|---------|
| `status` | o status HTTP devolvido pela API (401, 400, 500, ...) |
| `statusText` | o texto do status HTTP devolvido pela API |
| `code` | o código do erro informado pela API (`code`, `reason` ou `statusCode`, inclusive quando estão dentro de um objeto `error`) |
| `body` | o corpo da resposta, exatamente como a API devolveu (também disponível como `data`) |
| `data` | alias de `body` |
| `cause` | o erro original lançado pelo axios, quando existe |
| `message` | a mensagem informada pela API |

```javascript
try {
  await Olx.getAnuncios(access_token);
} catch (err) {
  if (err instanceof Olx.OlxApiError) {
    console.log(err.status);    // ex: 401
    console.log(err.code);      // ex: 'ACCESS_TOKEN_NOT_FOUND'
    console.log(err.body);      // o corpo cru da resposta
    console.log(err.message);   // ex: 'Response code 404 (Not Found)'
  }
}
```

<<<<<<< HEAD
O corpo da resposta também tem os seus campos copiados para o erro, então o código que lia o
corpo diretamente (`err.message`, `err.errors`, ...) continua funcionando.
=======
<<<<<<< HEAD
O código e a mensagem são lidos tanto na raiz do corpo quanto dentro do objeto `error`, que
é o formato usado pelos endpoints de autoupload:
>>>>>>> bcfed13 (test: cover where the chat token may be sent and document the error formats)

**Atenção ao `cause`:** ele guarda o erro original do axios, que carrega a requisição
completa. As credenciais do aplicativo (`client_secret`, token de acesso e o header
`Authorization`) são **removidas** dele, então ele pode ser registrado com segurança.
Ainda assim, prefira registrar `err.status`, `err.code`, `err.body` e `err.message`: o
`cause` carrega a requisição inteira e não é informação de negócio.

### Migrando da versão 1.x para a 2.x

A versão 2.x muda **o valor que rejeita a promise**. Na 1.x a rejeitava com o corpo bruto da
resposta (e, quando o corpo vinha vazio, com o erro do axios). Na 2.x a rejeita sempre com um
`OlxApiError`.

```javascript
// 1.x
try {
  await Olx.getAnuncios(access_token);
} catch (e) {
  console.log(e.message);        // o corpo bruto
  console.log(e.response.status); // só funcionava quando o corpo vinha vazio
}

// 2.x
try {
  await Olx.getAnuncios(access_token);
} catch (e) {
  console.log(e.status);         // o status HTTP
  console.log(e.code);           // o código do erro
  console.log(e.body);           // o corpo bruto da resposta
}
```

O que **continua** funcionando: `err.message` e os campos do corpo (`err.errors`, ...).
O que **muda**: `err` passou a ser um `Error` (`err instanceof Error` era `false` e passa a
ser `true`), `err.response` e `err.isAxiosError` não existem mais (use `err.cause`), e
`Object.keys(err)` e `JSON.stringify(err)` devolvem o erro e não o corpo.

## Ambientes suportados

O código compilado (`dist/`) continua mirando em ES5, mas a dependência `axios@1.x` é distribuída com sintaxe moderna (`arrow functions`, `class`, `const` e `async`) e deixou de suportar o Internet Explorer. Portanto o pacote exige um runtime moderno:

- **Node.js**: 18 ou superior. O CI roda em Node 20, 22 e 24.
- **Navegadores**: qualquer navegador com suporte a ES2017 ou superior (Chrome, Edge, Firefox e Safari atuais). O Internet Explorer não é suportado.
=======
### Erro de aplicação e erro HTTP

A API da OLX reporta o erro de duas maneiras diferentes:

- **Erro de aplicação**: a API responde `200` e o erro vem dentro do payload, no campo
  `statusCode`. Nesse caso a promise **resolve** com esse payload.

  ```javascript
  const res = await Olx.putAnuncios(access_token, [anuncio]);
  if (res.statusCode !== 0) {
    console.log(res.statusCode);    //ex: -6
    console.log(res.statusMessage); //ex: "Without permission"
  }
  ```

- **Erro HTTP**: a API responde `4xx` ou `5xx`. Nesse caso a promise **rejeita**, e o erro
  carrega o payload cru da resposta em `err.body` (também disponível como `err.data`).

### Formatos de erro da API

Cada endpoint nomeia o erro de um jeito, e a API devolve **7 formatos diferentes** de resposta
de erro. Todos são preservados em `err.body`, e os campos do corpo também são copiados para o
erro — assim é possível ler `err.message`, `err.reason`, `err.errors` etc. direto na exceção:

| endpoint | status | corpo |
|---|---|---|
| `/autoservice/v1/chat` (sem token no header) | `400` | `{"message":"Bad request: accessToken is required"}` |
| `/autoservice/v1/chat` (token inválido) | `401` | `{"message":"Unauthorized"}` |
| `/autoservice/v1/lead` | `401` | `{"reason":"ACCESS_DENIED","message":"Check the client authentication token."}` |
| `/autoupload/import` (sem permissão) | `200` | `{"token":null,"statusCode":-6,"statusMessage":"Without permission","errors":[]}` |
| `/autoupload/published` | `404` | `{"status":"ERROR","error":{"reason":"ACCESS_TOKEN_NOT_FOUND","message":"...","statusCode":404}}` |
| `/oauth_api/basic_user_info` | `400` | corpo vazio |
| `auth.olx.com.br/oauth/token` | `400` | `{"error":"invalid_client"}` |

> **Pendente de decisão (Hex):** o alias final do corpo do erro (hoje `body` e `data`), a
> versão do pacote (`2.0.0` ou `1.0.6`) e a seção de migração ainda não foram definidos.
> Esta parte do README será completada quando o contrato for fechado.
>>>>>>> 31a8404 (test: cover where the chat token may be sent and document the error formats)

## Desenvolvimento

```bash
npm ci              # instala as dependências
npm run build       # compila o pacote em dist/
npm run typecheck   # verifica os tipos do código e dos testes
npm test            # roda a suíte de testes unitários
npm run test:integration  # roda os testes contra a API da OLX (precisa de internet)
npm run test:coverage     # roda a suíte e gera o relatório de cobertura
```

Os testes de integração são ignorados por padrão e usam credenciais falsas: eles verificam
o status HTTP e o corpo da resposta da API real, sem precisar de nenhuma credencial. Para
habilitá-los, use a variável de ambiente `OLX_LIVE=1`:

```bash
OLX_LIVE=1 npm run test:integration
```

## Contato

- Autor: Vinícius Rossmann Nunes
- Contato: viniciusrossmann@gmail.com
