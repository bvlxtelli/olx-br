# olx-br — the contract of the fork

> **Status:** accepted by the Dev team (Hex, Dev Senior) on 2026-10-20, on top of the decisions
> taken by the Tech Lead in `COORDINATION.md`.
> **Scope:** the error contract, `getAuthUrl` / the OAuth scopes, the version, the split of the
> pull requests, the review of PR #1 and the rules the README must document.
> **Language:** this document is written in English (PR and review language). The README of the
> package stays in Brazilian Portuguese, which is the language of the upstream project and of
> its users.

Everything in this document was checked against the code of the three pull requests and against
the live API. The measurements are not repeated here: they live in the QA matrix
(`qa/assertions.json`, Deck) and in the coordination sheet of the Tech Lead. What is repeated
here is only what the *contract* depends on, and the evidence produced for the parts that the
coordination sheet did not cover.

Words in **MUST** / **MUST NOT** are blocking for the merge of the stack. Words in
**SHOULD** are recommendations. Every item has an owner and the PR where it has to land.

---

## 1. Decision summary

| # | Question | Decision | Where |
|---|----------|----------|-------|
| A | Shape of the error, the `response` alias, the extraction of `code` | §3 | PR #1 |
| B | Final `getAuthUrl` signature and the rules of the scopes | §4 | PR #2 |
| C | Split of the pull requests | §5 | — |
| D | Line by line review of PR #1 | §6 | PR #1 comment |
| E | What the README must document about the errors | §7 | PR #3 |
| F | Version of the fork | §8 | PR #1 |
| G | What still depends on the owner | §9 | — |

### 1.1 What is ratified from the lead's decisions

The five decisions of the Tech Lead are **ratified as they are**. The reasons are recorded
here so that nobody reopens them by accident.

1. **axios 1.x stays inside PR #1, together with the error contract.** The error contract is
   written against the error of axios 1.x (`err.response`, `err.response.data`,
   `err.message`, `err.cause`); splitting them would leave the fork on axios 0.21.1 — a
   dependency with open high severity advisories — while the new error shape is written for
   the other version. The audit confirms the direction: `npm audit` reports **0
   vulnerabilities** on the tree of PR #1 and reports the axios advisories on the old tree
   (§6, item 9).
2. **`"private": true` in `package.json`.** The name `olx-br` on npm belongs to the upstream
   author. The guard is the `private` flag, not a rename: the package keeps the name so it
   stays a drop-in replacement for the applications that already use it.
3. **CI with the matrix 20/22/24, always `npm ci`, with the gates `typecheck` + `build` +
   `test`.** One addition: the trigger of the workflow MUST cover every pull request, not
   only the ones that target `main` (§6, item 8) — otherwise the stacked pull requests of the
   series are not verified by the pull request that introduces the rule.
4. **The chat methods keep the Portuguese names** (`ativarWebhookChat`,
   `desativarWebhookChat`, `responderChat`), matching `getAnuncios` and `putAnuncios`.
5. **The build configuration of PR #1 is right; the description of PR #1 is wrong.** The code
   keeps `"target": "es5"` with `"lib": ["ES2020", "DOM"]`; the description claims the target
   moved to ES2020. The description has to be corrected (§6, item 1).
6. **The double slash of the authorization URL was never a defect.** Both
   `https://auth.olx.com.br/oauth?...` and `https://auth.olx.com.br//oauth?...` answer `302`
   (QA matrix `A25`). PR #1 normalizes the URL; it MUST NOT be described as a bug fix
   (§6, item 2).

### 1.2 What this document changes against the current code of PR #1

The implementation of the error contract in PR #1 is **not the final contract**. Three
defects were found and reproduced against the code of the branch:

* the code of the API is **not** extracted for the most common shape of the OLX error (§3.5);
* a body with a `__proto__` key **destroys the error** — `instanceof` stops working (§3.7);
* the `cause` **leaks the `client_secret`** of the application into the logs and into
  `JSON.stringify` (§3.4).

The three are blocking and are listed in §6 with the exact change.

---

## 2. The two kinds of failure

The OLX API fails in two different ways, and the library MUST NOT mix them.

| kind | what the API does | what the library does |
|------|-------------------|-----------------------|
| **application error** | answers `HTTP 200` with a body that carries the result of the operation, including a negative `statusCode` (for example `{"token": null, "statusCode": -6, "statusMessage": "Without permission", "errors": []}`) | the promise **RESOLVES** with the body. The caller reads `statusCode`, `statusMessage`, `token` and `errors` |
| **HTTP error** | answers `4xx` or `5xx` | the promise **REJECTS** with an `OlxApiError` that carries the raw payload |

This is the rule that the upstream README already uses for the happy path
(`if (res.statusCode == 0)`), and it is the rule that the QA matrix confirms
(`A01`, `A02`, `A04` answer `200` with a negative `statusCode`).

`getToken` is the exception that the table above does not cover: it has no application level
status field, so a `200` without an `access_token` is a failure and **MUST reject** with an
`OlxApiError` (§3.9, change 4).

---

## 3. The error contract

### 3.1 The class

Every method of the `Olx` class rejects with an `OlxApiError`, an `Error` subclass. The class
is exported as `Olx.OlxApiError` and the type as `Olx.OlxApiError` (type position).

```ts
class OlxApiError extends Error {
    readonly status?: number;        // HTTP status returned by the API
    readonly statusText?: string;    // HTTP status text returned by the API
    readonly code?: string | number;  // the error code reported by the API (§3.5)
    readonly body?: unknown;         // the raw response body, exactly as it arrived
    readonly data?: unknown;         // alias of `body`
    readonly cause?: unknown;        // the original error thrown by the transport (§3.4)
    readonly name: 'OlxApiError';
    readonly message: string;        // the message reported by the API (§3.6)
}
```

The fields of the body are **also copied onto the error**, so that the code written against
1.0.6 — which received the raw body — keeps working. The list of the fields that are not
copied is in §3.7.

### 3.2 `response` is NOT exposed — decision

**The axios `response` object is not part of the contract.** The error exposes `status`,
`statusText` and `body` (which is `response.data`), and `cause` (the axios error itself) for
the rare case where a consumer really needs `isAxiosError`, `config` or `request`.

Reasons:

1. **It would reopen the hole that the contract closes.** The axios `response` carries
   `config`, and `config.data` is the body of the request. For `getToken` the body of the
   request is the form that contains the `client_secret` of the application. Reproduced
   against the code of PR #1: `JSON.stringify(error)` contains
   `client_secret=SUPER-SECRET-VALUE` in clear text (§3.4).
2. **It would keep the public contract coupled to axios**, which is exactly what the
   `OlxApiError` abstraction is for. The `OlxApiError` is the boundary of the library: inside
   it there is axios, outside it there is a plain `Error`.
3. **Nothing is lost.** `response.data` is `body`; `response.status` is `status`;
   `response.statusText` is `statusText`; the rest is reachable through `cause`.

### 3.3 The consequence: the fork is a breaking change

Not exposing `response` is not the only break. The **rejection value itself** changed:

| what a 1.0.6 consumer could do | 1.0.6 | the fork |
|---|---|---|
| read a field of the body (`e.message`, `e.errors`) | worked | works (the fields are copied onto the error) |
| read `e.response.status` | worked **only when the body was empty** (the `\|\| err` fallback returned the axios error) | `e.response` is `undefined` → `TypeError` |
| read `e.isAxiosError` | worked only when the body was empty | `undefined`; use `e.cause.isAxiosError` |
| `e instanceof Error` | `false` (the rejection value was the plain body) | `true` |
| `Object.keys(e)` / `JSON.stringify(e)` | the body | the error envelope |
| `e.name` | the `name` field of the body, if any | `'OlxApiError'` |

The surface of the package did not change — the compat table of the description of PR #1 is
correct about the *signatures* — but the **behaviour** of the rejection did. The version of
the fork is therefore **2.0.0** (§8).

### 3.4 `cause` — kept, but not enumerable

`cause` is the escape hatch for the consumers that need the axios error. It is **NOT**
enumerable, exactly like the `cause` of the standard `Error` (ES2022).

**MUST** — the implementation has to define it with `Object.defineProperty`:

```ts
Object.defineProperty(this, 'cause', {
    value: init.cause,
    enumerable: false,   // it must not reach JSON.stringify nor the console
    writable: false,
    configurable: true
});
```

Without this, the current implementation of PR #1 leaks the secret of the application.
Reproduced against the code of the branch, with a real axios 1.20 error:

```
JSON.stringify(error)
  -> {"name":"OlxApiError","status":400,"statusText":"Bad Request",
      "body":{"error":"invalid_client"},"data":{"error":"invalid_client"},
      "cause":{ ... "config":{ ... "data":"code=fake-code&client_id=fake-id&
      client_secret=SUPER-SECRET-VALUE&redirect_uri=...&grant_type=authorization_code" ...} ...}}
      => the client_secret is in clear text
```

`console.error(error)` is worse: it prints the whole `ClientRequest`, with the socket, the
agent and the body of the request.

With `cause` non-enumerable, `console.error(error)` prints the stack and the own enumerable
fields — `status`, `statusText`, `code`, `body`, `data` and the fields of the body — and
nothing else.

### 3.5 How `code` is extracted — decision

The API uses different names in each group of endpoints, and the most common group of the API
(the `autoupload` group) nests the information inside an `error` object. The contract MUST
cover the nesting, otherwise `code` is `undefined` in the majority of the failures.

**MUST** — the candidates are read in this order, and the **first** one that is a string or a
number wins:

| order | source | example of the value |
|-------|--------|----------------------|
| 1 | `body.code` | `"E001"` |
| 2 | `body.reason` | `"ACCESS_DENIED"` |
| 3 | `body.statusCode` | `-6` |
| 4 | `body.error`, **only when it is a string** | `"invalid_grant"` |
| 5 | `body.error.code` | |
| 6 | `body.error.reason` | `"ACCESS_TOKEN_NOT_FOUND"` |
| 7 | `body.error.statusCode` | `404` |

If none of them matches, `code` is `undefined`.

**MUST** — the extraction has to look inside the nested `error` object. The current
implementation of PR #1 only reads the top level, and the consequence was reproduced against
the code of the branch:

```
body    = { status: 'ERROR', error: { reason: 'ACCESS_TOKEN_NOT_FOUND',
                                      message: 'Response code 404 (Not Found)',
                                      statusCode: 404 } }

current implementation : error.code    -> undefined      <-- the API reported a code
                        error.message -> 'Request failed with status code 404'
                        error.error   -> { reason: 'ACCESS_TOKEN_NOT_FOUND', ... }

contract               : error.code    -> 'ACCESS_TOKEN_NOT_FOUND'
                        error.message -> 'Response code 404 (Not Found)'
```

This shape is the answer of the `autoupload` group — `getAnuncios`, `getModelosCarros`,
`getModelosMotos`, `getCilindradas`, `putAnuncios`, `deleteAnuncios` and `getStatusAnuncio`,
that is, **seven of the eight** methods of the advertisement API.

### 3.6 How `message` is extracted — decision

**MUST** — the candidates are read in this order, and the first one that is a **non empty
string** wins:

| order | source | example of the value |
|-------|--------|----------------------|
| 1 | `body.message` | `"Unauthorized"` |
| 2 | `body.error_description` | `"Bad code"` (the OAuth shape, RFC 6749) |
| 3 | `body.error.message` (when `body.error` is an object) | `"Response code 404 (Not Found)"` |
| 4 | `body.error`, only when it is a **string** | `"invalid_grant"` |
| 5 | `body.mesage` — the misspelling used by the API | `"404 NOT_FOUND ..."` |
| 6 | the message of the original error | `"Network Error"` |
| 7 | `"Request failed with status code <status>"` | |
| 8 | `"Request failed"` | |

Two details of this order:

* `error_description` comes **before** the loose `error`. With the OAuth shape
  `{"error":"invalid_grant","error_description":"Bad code"}` the message is `"Bad code"` and
  the code is `"invalid_grant"`. The current implementation returns `"invalid_grant"` as the
  message and loses the description.
* the misspelled `mesage` is accepted on purpose: the API answers
  `{"mesage": "404 NOT_FOUND ..."}` on the paths that do not exist.

### 3.7 The fields of the body that are copied onto the error

**MUST** — the copy keeps working as it is today, with two corrections.

The fields that are **not** copied, because they belong to the error itself:

`name`, `message`, `stack`, `status`, `statusText`, `code`, `body`, `data`, `cause`.

The fields that are **not** copied, for security reasons:

`__proto__`, `constructor`, `prototype`.

**MUST** — the copy has to use `Object.defineProperty` and not a plain assignment:

```ts
Object.defineProperty(this, key, {
    value: fields[key],
    enumerable: true,
    writable: true,
    configurable: true
});
```

A plain assignment of `__proto__` replaces the prototype of the error, and the error stops
being an `OlxApiError`. Reproduced against the code of the branch:

```
body = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}')

current implementation : error instanceof Error        -> false
                        error instanceof Olx.OlxApiError -> false
                        Object.getPrototypeOf(error)     -> { polluted: true }

contract               : error instanceof Error        -> true
                        error instanceof Olx.OlxApiError -> true
```

The consequence is not cosmetic: a consumer that writes
`if (err instanceof Olx.OlxApiError)` silently stops recognizing the API errors, and the
consumer that uses the error as a data carrier reads the prototype of the error instead of
its own field.

### 3.8 The payload shapes of the API, and what each one produces

The API answers with several different shapes. The table is the catalogue that the README
and the tests have to cover.

| # | shape | example | `status` | `code` | `message` | `body` |
|---|-------|---------|----------|--------|-----------|--------|
| 1 | the `autoupload` group, nested | `{"status":"ERROR","error":{"reason":"ACCESS_TOKEN_NOT_FOUND","message":"Response code 404 (Not Found)","statusCode":404}}` | `404` | `"ACCESS_TOKEN_NOT_FOUND"` | `"Response code 404 (Not Found)"` | the object |
| 2 | the `autoservice` group | `{"message":"Unauthorized"}` | `401` | `undefined` | `"Unauthorized"` | the object |
| 3 | the `autoservice` group, with the camel case field | `{"message":"Bad request: accessToken is required"}` | `400` | `undefined` | `"Bad request: accessToken is required"` | the object |
| 4 | the authorization host, OAuth | `{"error":"invalid_client"}` | `400` | `"invalid_client"` | `"invalid_client"` | the object |
| 5 | the authorization host, OAuth with a description | `{"error":"invalid_grant","error_description":"..."}` | `400` | `"invalid_grant"` | `"..."` | the object |
| 6 | a body that is an **array** | `[{"property":"access_token","message":"is missing and it is required"}]` | `400` | `undefined` | `"Request failed with status code 400"` | the array |
| 7 | a body that is **text** (the wrong verb, or a path that does not exist) | `"Cannot POST /autoupload/import"` | `404` | `undefined` | `"Request failed with status code 404"` | the string |
| 8 | the misspelled field of the "path that does not exist" | `{"mesage":"404 NOT_FOUND ..."}` | `500` | `undefined` | `"404 NOT_FOUND ..."` | the object |
| 9 | an **empty** body | `""` | `400` | `undefined` | `"Request failed with status code 400"` | `""` |

The shape 9 is the one that the original bug was about: the status was lost, because
`err.response?.data || err` fell back to the axios error when the body was empty. The
regression test is `POST /oauth_api/basic_user_info` (QA matrix `A14`).

For the shape 6 the body is an array: the contract keeps it verbatim in `body`, and the
fields of the array are **not** copied onto the error — the caller reads `error.body[0]`.

### 3.9 The changes that PR #1 has to make

**MUST** — PR #1, owner Hepp, before the merge:

1. **`errors.ts` — the `cause` is not enumerable** (§3.4). `Object.defineProperty` with
   `enumerable: false`, and the plain assignment is removed.
2. **`errors.ts` — the extraction of the code reads the nested `error`** (§3.5) and follows
   the order of the table.
3. **`errors.ts` — the extraction of the message follows the order of the table** (§3.6).
4. **`errors.ts` — the copy of the body uses `Object.defineProperty` and skips `__proto__`,
   `constructor` and `prototype`** (§3.7).
5. **`index.ts` — only the axios call is wrapped.** The reading of the body happens **outside**
   the `try`, so that a programming error is not disguised as an API error:

   ```ts
   let result;
   try {
       result = await authApi.post('/oauth/token', params);
   } catch (err) {
       throw toOlxApiError(err);
   }
   const token = result.data && result.data.access_token;
   if (!token) {
       throw new OlxApiError('The OLX authorization server did not return an access token.', {
           status: result.status, statusText: result.statusText, body: result.data
       });
   }
   return token;
   ```

   The same shape is applied to the other methods.
6. **`package.json` — the version becomes `2.0.0`** (§8) and `engines` is declared (§6,
   item 10).
7. **the tests** cover the new rules: the nested shape of the `autoupload` group, the OAuth
   shape with `error_description`, the body with `__proto__`, the `cause` that is not
   enumerable, and the `getToken` that answers `200` without a token.

---

## 4. `getAuthUrl` and the OAuth scopes

### 4.1 The final signature

```ts
getAuthUrl(scopes?: boolean | string | string[], state?: string): string
```

* the first parameter is **renamed** from `autoupload` to `scopes`, because it no longer
  means "autoupload". The rename only changes the generated `.d.ts`; the arity stays `2` and
  the parameter is positional, so **no consumer breaks**. The test of the public surface of
  PR #3 checks the arity, not the name, so it keeps passing.
* `boolean` is kept as the legacy form: `true` is the default and `false` asks for the
  basic scope only.
* the default of the first parameter is applied **in the body of the method**, and not in the
  signature, so that `Olx.prototype.getAuthUrl.length` stays `2` — the arity of the
  published package. PR #2 already does this (commit `0f41a53`).

### 4.2 The rules of the scopes

**MUST**:

1. `basic_user_info` is **always** requested, and it is **always the first** one.
   * It is the base scope of the application: the package exposes `getBasicUserInfo` as a
     first class method, and the published package has always requested it.
   * It keeps the default URL **byte identical** to the published package, apart from the
     double slash:
     `scope=basic_user_info%20autoupload` in 1.0.6 and in the fork. A change of the default
     would invalidate the authorization that the users of the package already granted.
2. the **order** of the other scopes does not matter to the authorization server, and the
   order of the caller is preserved.
3. a scope that appears twice is sent **once** (the first occurrence wins).
4. the names are **case sensitive**, and the library **MUST NOT** change the case of what the
   caller sent. `"CHAT"` is sent as `"CHAT"`, and the authorization server refuses it. Silently
   lowercasing would hide a typo.
5. a scope that the library does not know is sent as it is. The library cannot know which
   scopes OLX will add, and refusing an unknown name would break the day OLX adds one.
6. a string is split on **spaces**; an array is used as it is. Empty entries are ignored.

The canonical names are exposed as `Olx.SCOPES` (`basicUserInfo`, `autoupload`, `chat`,
`autoservice`).

### 4.3 The exact strings of the scopes

| constant | value | state |
|----------|-------|-------|
| `Olx.SCOPES.basicUserInfo` | `basic_user_info` | **confirmed** — the published package already uses it |
| `Olx.SCOPES.autoupload` | `autoupload` | **confirmed** — the published package already uses it |
| `Olx.SCOPES.chat` | `chat` | **pending** — the string is not confirmed by OLX; it can only be confirmed with the real `client_id` (M1) and the scopes of the application (M3) |
| `Olx.SCOPES.autoservice` | `autoservice` | **pending** — same as above |

The two pending strings are the ones used by PR #2. They are **not** confirmed by any
document that the team could reach, and the official documentation URL of the API answers
`404`. The library MUST keep them in a single constant (`Olx.SCOPES`) so that the correction
is one line, and the README MUST mark them as unconfirmed.

### 4.4 The query string

| parameter | rule |
|-----------|------|
| `response_type` | always `code` |
| `client_id` | sent verbatim, as registered |
| `redirect_uri` | sent **verbatim**, exactly as registered. It is **not** encoded: the authorization server compares it with the registered value, and there is no way to confirm that it decodes it. **MUST** be documented: the redirect URI must not contain `&`, `#`, `?` or spaces |
| `scope` | the scopes joined by `%20` |
| `state` | sent **encoded** with `encodeURIComponent`. For the values that make sense (a UUID, a random token) the encoding is a no-op, so the behaviour does not change; for the values that contain a reserved character the current behaviour is already broken. The application has to read it with `decodeURIComponent` |

The base URL is `https://auth.olx.com.br`, without a trailing slash, and the path is
appended by a helper that removes any trailing slash — so the URL never has a double slash,
even if the base URL is reconfigured at runtime.

### 4.5 The compatibility with 1.0.6

| call | 1.0.6 | the fork |
|------|-------|----------|
| `getAuthUrl()` | `https://auth.olx.com.br//oauth?...&scope=basic_user_info%20autoupload` | `https://auth.olx.com.br/oauth?...&scope=basic_user_info%20autoupload` |
| `getAuthUrl(false)` | `...&scope=basic_user_info` | `...&scope=basic_user_info` |
| `getAuthUrl(true, 'x')` | `...&scope=basic_user_info%20autoupload&state=x` | the same |

The only difference is the double slash, that was never a defect (both answer `302`, QA
matrix `A25`).

---

## 5. The split of the pull requests

The split proposed by the Tech Lead is **confirmed**, with one correction and one addition.

| # | branch | base | theme | status |
|---|--------|------|-------|--------|
| 1 | `fix/corrections` | `main` | the corrections, axios 1.x, the error contract, vitest, the CI, the first tests | open, draft, CI green |
| 2 | `feat/scopes-and-chat` | `fix/corrections` | the scopes and the chat client | open, CI green |
| 3 | `test/suite-and-ci` | `feat/scopes-and-chat` | the rest of the unit suite, the coverage, the live tests, the hardening of the CI | open, CI green |
| 4 | `docs/contract` | `main` | this document | this pull request |

**Correction.** The coordination sheet describes PR #3 as "live network tests + README". The
PR that is open today is much larger: it carries the **whole** remaining unit suite (62
tests), the coverage job and the integration job of the CI. That is fine — the stack stays
stacked, every diff keeps its own theme and the merge order stays #1 → #2 → #3 — but the
description of the plan has to be corrected, because a reviewer who reads "network tests"
expects a small diff.

**Addition.** The sections of the README about the error contract and about the migration
from 1.x to 2.x land in **PR #3**, together with the rest of the documentation, and not in
PR #1. The reason is mechanical: PR #2 already changed the README, so a README change in
PR #1 would force a rebase of PR #2 for no benefit. The requirement is not optional though:
**the stack is not finished until the error section and the migration section are in the
README** (§7).

**The order of the merge** is #1 → #2 → #3, and this pull request can be merged at any
moment: it is based on `main` and it only adds a file, so it does not enter the diff of the
other pull requests.

---

## 6. The review of PR #1, line by line

The full review is in the comment of PR #1. This is the list of the findings, with the
severity and the owner.

| # | severity | finding | where | action |
|---|----------|---------|-------|--------|
| 1 | **blocking** | the description says that the build target moved from ES5 to ES2020. The code keeps `"target": "es5"` with `"lib": ["ES2020","DOM"]` | the description of PR #1 | correct the description: the target did not move; `esModuleInterop` was added, and it is what the typings of axios 1.x require |
| 2 | **blocking** | the description presents the double slash as a defect that was "reproduced against the live API before the fix". Both forms answer `302` | the description of PR #1 | rewrite the item: the change normalizes the URL, it does not fix a defect. The item 3 of the same description ("the query string must not change") is the real invariant, and it is the one the tests have to guard |
| 3 | **blocking** | `code` is not extracted from the nested `error` object, so it is `undefined` in the shape that the `autoupload` group — seven of the eight methods — uses | `src/errors.ts` | §3.5 |
| 4 | **blocking** | a body with a `__proto__` key replaces the prototype of the error and `instanceof` stops working | `src/errors.ts` | §3.7 |
| 5 | **blocking** | `cause` is enumerable: the `client_secret` leaks into `JSON.stringify(error)` and into `console.error(error)` | `src/errors.ts` | §3.4 |
| 6 | **blocking** | the message of the OAuth shape is wrong: `error_description` is ignored because the loose `error` comes first | `src/errors.ts` | §3.6 |
| 7 | **blocking** | the version is still `1.0.6`, and the change of the rejection value is breaking | `package.json` | `2.0.0` (§8) |
| 8 | **blocking** | the workflow only runs for the pull requests that target `main`, so the stacked pull requests of the series are not verified by the rule that introduces the CI. PR #2 already carries the fix (commit `34c2874`) | `.github/workflows/ci.yml` | fold the fix of PR #2 into PR #1, so that PR #1 is self contained |
| 9 | advisory | the description says that `npm audit` reported "2 high severity vulnerabilities" before the change. The number depends on the advisory database of the day: on 2026-10-20 the old tree reports one dependency with high severity and twenty advisories, and the new tree reports `found 0 vulnerabilities` | the description of PR #1 | keep the direction, soften the number |
| 10 | advisory | the package has no `engines`, and it is not an ES5 runtime package: the emitted code is ES5, but it uses `Promise` (already in 1.0.6), `URLSearchParams` (already in 1.0.6) and, **new in this PR**, `Object.setPrototypeOf` | `package.json` | `"engines": { "node": ">=18" }`, and the requirement in the README |
| 11 | advisory | the `try` block also covers the reading of the body, so a programming error is disguised as an API error | `src/index.ts` | §3.9, change 5 |
| 12 | advisory | `data` is an alias of `body`, and a body that has a field of its own called `data` would not be copied onto the error | `src/errors.ts` | it is the documented behaviour (§3.7); the value stays reachable in `error.body.data` |
| 13 | nit | the actions of the workflow are not pinned by commit | `.github/workflows/ci.yml` | optional for an internal fork |
| 14 | nit | `prepublishOnly` is dead code while the package is `private: true` | `package.json` | harmless; it becomes live if the package is ever un-privated |

### 6.1 What is right in PR #1 and has to be kept

* the base URL without a trailing slash, and the helper that removes it — the URL is correct
  even if the base URL is reconfigured at runtime;
* the axios 1.x upgrade, and the removal of the `@types/axios` stub;
* the `esModuleInterop`, the `lib` and the `skipLibCheck` of the `tsconfig.json`;
* the vitest runner, the `typecheck` script and the separation between the `tsconfig.json`
  (the build) and the `tsconfig.test.json` (the type check of the sources and of the tests);
* the mock of the axios adapter: it exercises the real pipeline of axios, it honours the
  `validateStatus` and it records the requests — it is the reason the tests are worth
  something;
* the `export =` contract of the package and the public types exposed through the namespace;
* the `private: true` and the metadata that points to the fork.

The gates were executed on Node 22.15.0 against the branch: `npm ci`, `npm run typecheck`,
`npm run build` and `npm test` — **14 tests, 2 files, all green**.

---

## 7. What the README has to document about the errors

The README of the package is in Brazilian Portuguese, like the upstream one. The sections
below are the ones that the error contract requires. The English rules are the ones of §2
and §3; the text below is the Portuguese version, ready to be pasted.

### 7.1 The two kinds of failure

````markdown
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
````

### 7.2 The error object

````markdown
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

O corpo da resposta também tem os seus campos copiados para o erro, então o código que lia o
corpo diretamente (`err.message`, `err.errors`, ...) continua funcionando.

**Atenção ao `cause`:** ele guarda o erro original do axios, que carrega a requisição
completa. Não registre o erro inteiro no log (`console.error(err)`) nem o transforme em JSON
(`JSON.stringify(err)`) em uma aplicação que tem segredos: o `client_secret` do aplicativo
aparece no `cause`. Registre `err.status`, `err.code`, `err.body` e `err.message`.
````

### 7.3 The migration from 1.x to 2.x

````markdown
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
````

### 7.4 The other sections that the contract requires

* the requirement of the runtime (§6, item 10): Node 18 or newer;
* that the token of the `autoservice` (the chat) goes **only** in the `Authorization: Bearer`
  header — the API answers `400 accessToken is required` when it is sent in the body;
* that the scopes `chat` and `autoservice` are **not confirmed** by OLX yet;
* that the paths that do not exist in the API are not implemented (the answer is `500` with
  `{"mesage": "404 NOT_FOUND ..."}`) — PR #2 already documents this.

---

## 8. The version — decision

**The version of the fork is `2.0.0`.**

* the change of the rejection value is breaking for the consumers of 1.0.6 (§3.3);
* the package is `private: true` and will not be published while the name of the fork is not
  decided (M7), so the version is documentary — but it has to tell the truth, because the
  README of the migration refers to it.

The name stays `olx-br`, the author stays **Vinícius Rossmann Nunes** and the license stays
**MIT**. The attribution is not removed by the fork: the `LICENSE`, the `author` of the
`package.json` and the header of `src/index.ts` keep the original author.

---

## 9. What still depends on the owner

| # | item | blocks |
|---|------|--------|
| M1 | `client_id`, `client_secret` and `redirect_uri` of the application | the confirmation of the scope strings and of the encoding of the `state` |
| M2 | an `access_token` with the `autoupload` scope | the happy path of the import |
| M3 | the scopes granted to the application (`chat`, `autoservice`) | the confirmation of the strings of §4.3 |
| M4 | a valid test advertisement | the happy path of the import |
| M5 | the official format of the advertisement payload (the official URL answers `404`) | the documentation of the payload |
| M6 | a secret `OLX_ACCESS_TOKEN` on the GitHub Actions | the live job with a real token |
| M7 | the name of the package on npm | the publication — blocked by `private: true` until it is decided |

None of them blocks the merge of the stack. They block the **confirmation against the live
API** of the parts that are marked as pending in this document.

---

## Appendix A — the evidence

Everything below was produced against the code of the branch `fix/corrections` of
`bvlxtelli/olx-br`, on Node 22.15.0, with the axios 1.20.0 of the lockfile.

| what | how | result |
|------|-----|--------|
| the gates of PR #1 | `npm ci`, `npm run typecheck`, `npm run build`, `npm test` | 14 tests, 2 files, all green |
| the audit of the new tree | `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| the audit of the old tree | `npm audit` on `axios@^0.21.1` | one dependency with high severity, twenty advisories (the "2 high severity" of the description was correct on the day it was written) |
| the missing `code` | `new OlxApiError('x', { body: { status: 'ERROR', error: { reason: 'ACCESS_TOKEN_NOT_FOUND', message: '...', statusCode: 404 } } })` | `code` is `undefined` |
| the broken prototype | `new OlxApiError('x', { body: JSON.parse('{"__proto__":{"polluted":true}}') })` | `instanceof Error` is `false`, `instanceof OlxApiError` is `false` |
| the leak of the secret | a local HTTP server that answers `400`, a real axios error, `JSON.stringify(error)` | `client_secret=SUPER-SECRET-VALUE` in clear text; `console.error(error)` prints the whole `ClientRequest` |
| the shape of the body | the matrix of the QA (`qa/assertions.json`), 26 assertions | the catalogue of §3.8 |
| the authorization URL | the matrix of the QA (`A25`) | the double slash and the single slash both answer `302` |
| the published surface | `olx-br-1.0.6` extracted from the npm registry by the QA | the compat table of §3.3 and of §4.5 |
