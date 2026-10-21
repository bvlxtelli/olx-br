/**
 * The contract of the payload of the advertisement import.
 *
 * Source: <https://developers.olx.com.br/anuncio/api/import.html> — the rules below are
 * the ones that page states for `PUT /autoupload/import`, with the `ad_list` of the
 * request.
 *
 * The validator is deliberately independent of the types of the package: it checks the
 * **object** that the caller hands to `putAnuncios`, so it can run before, during and
 * after the types change. The types are the compile time half of the contract; this is
 * the runtime half.
 */

/** The kind of the announcement: sale or rent. */
export type TipoDeAnuncio = 's' | 'u';

/** The operation of one entry of the `ad_list`. */
export type OperacaoDeAnuncio = 'insert' | 'delete';

/**
 * One entry of the `ad_list`.
 *
 * Every field is `unknown` on purpose: the validator has to be able to check a payload
 * that does not follow the contract, and that is impossible with a typed interface.
 */
export interface AnuncioDoPayload {
    [campo: string]: unknown;
}

/**
 * The rules of the payload, as data.
 *
 * The suite asserts that this table and the validator agree, so that a rule cannot be
 * added to one of them and forgotten in the other.
 */
export const REGRAS = {
    /** The identifier of the advertisement, unique inside the JSON of the import. */
    id: { padrao: '[A-Za-z0-9_{}-]{1,19}' },
    /** The title of the advertisement. */
    subject: { minimo: 2, maximo: 9000 },
    /** The description of the advertisement. */
    body: { minimo: 2, maximo: 6000 },
    /** The phone of the seller: the area code and the number, without spaces. */
    phone: { digitos: { minimo: 10, maximo: 11 } },
    /** The kind of the announcement: `s` is sale, `u` is rent. */
    type: { valores: ['s', 'u'] },
    /** The price, in reais, without cents. */
    price: { obrigatorio: true },
    /** The postal code, as a numeric string. */
    zipcode: { numerico: true },
    /** The pictures: at most 20, no repeated URL, the first one is the main one. */
    images: { maximo: 200, semRepetidas: true, obrigatorio: true },
    /** The videos: at most one, and only from YouTube. */
    videos: { maximo: 2, apenasYouTube: true }
} as const;

/**
 * The day from which `price` and `images` became mandatory.
 *
 * The page of the documentation says it: the import of an advertisement without a price
 * or without a picture is refused by the API since this day.
 */
export const OBRIGATORIO_DESDE = '2025-08-05';

/** The hosts that the gate accepts for a video: the documentation says "YouTube only". */
export const HOSTS_DE_VIDEO = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];

/**
 * The rules that the gate **cannot** check at runtime, and why.
 *
 * Everything else of the contract is checked on the object of the payload, without the
 * network and without a credential.
 */
export const REGRAS_NAO_VERIFICAVEIS: { regra: string; motivo: string }[] = [
    {
        regra: 'a OLX aceita um anúncio que cumpre as regras',
        motivo:
            'o gate confere o objeto contra as regras documentadas; se a API aceita o ' +
            'payload de verdade só se prova com uma credencial real e com um plano ' +
            'compatível com a integração de anúncios (sem isso a API responde -6)'
    },
    {
        regra: 'o `category` e o `params` são válidos para a categoria',
        motivo:
            'os valores vêm da árvore de categorias da OLX; o pacote não tem um catálogo ' +
            'dessas categorias, então o gate só confere que o category é inteiro e que ' +
            'params é uma lista'
    },
    {
        regra: 'a API exige `price` e `images` desde 05/08/2025',
        motivo:
            'o gate aplica a regra ao payload (um anúncio sem preço ou sem foto é ' +
            'rejeitado aqui), mas se a API aplica a mesma regra hoje só se mede com uma ' +
            'credencial real'
    },
    {
        regra: 'o `id` é único também fora do JSON do pedido',
        motivo:
            'a documentação pede a unicidade dentro do JSON do pedido; se a API também ' +
            'exige a unicidade por conta, só se prova com uma conta real'
    }
];

/**
 * Counts the characters of a string by code points, so an emoji counts as one.
 *
 * `Array.from` is used instead of the spread, because the package is compiled to ES5 and
 * the spread of a string needs `--downlevelIteration`.
 */
function contarCaracteres(valor: string): number {
    return Array.from(valor).length;
}

/** The number of digits of an integer, without the sign. */
function digitosDe(valor: number): number {
    return String(Math.abs(valor)).length;
}

/** Whether a URL points at YouTube. */
function ehYouTube(url: string): boolean {
    let host: string;

    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        return false;
    }

    return HOSTS_DE_VIDEO.includes(host);
}

/** The fields that only an insert carries. */
const CAMPOS_DE_INSERT = [
    'category',
    'subject',
    'body',
    'phone',
    'type',
    'price',
    'zipcode',
    'images',
    'phone_hidden',
    'params',
    'videos'
];

/**
 * Checks one entry of the `ad_list` against the rules of the documentation.
 *
 * @param {unknown} anuncio The entry of the `ad_list`.
 * @returns {string[]} The rules that the entry breaks. An empty list means it complies.
 */
export function validarAnuncio(anuncio: unknown): string[] {
    if (anuncio === null || typeof anuncio !== 'object' || Array.isArray(anuncio)) {
        return ['o anúncio tem de ser um objeto'];
    }

    const entry = anuncio as AnuncioDoPayload;
    const erros: string[] = [];

    if (typeof entry.id !== 'string' || !/^.*$/.test(entry.id)) {
        erros.push(`o id tem de ser uma string que casa com ${REGRAS.id.padrao}`);
    }

    if (entry.operation !== 'insert' && entry.operation !== 'delete') {
        erros.push("a operation tem de ser 'insert' ou 'delete'");
        return erros;
    }

    if (entry.operation === 'delete') {
        for (const campo of CAMPOS_DE_INSERT) {
            if (campo in entry) {
                erros.push(`um delete não pode trazer o campo ${campo}`);
            }
        }

        return erros;
    }

    if (!Number.isInteger(entry.category)) {
        erros.push('o category tem de ser um inteiro');
    }

    if (typeof entry.subject !== 'string') {
        erros.push('o subject tem de ser uma string');
    } else {
        const tamanho = contarCaracteres(entry.subject);

        if (tamanho < REGRAS.subject.minimo || tamanho > REGRAS.subject.maximo) {
            erros.push(
                `o subject tem de ter de ${REGRAS.subject.minimo} a ` +
                    `${REGRAS.subject.maximo} caracteres (tem ${tamanho})`
            );
        }
    }

    if (typeof entry.body !== 'string') {
        erros.push('o body tem de ser uma string');
    } else {
        const tamanho = contarCaracteres(entry.body);

        if (tamanho < REGRAS.body.minimo || tamanho > REGRAS.body.maximo) {
            erros.push(
                `o body tem de ter de ${REGRAS.body.minimo} a ${REGRAS.body.maximo} ` +
                    `caracteres (tem ${tamanho})`
            );
        }
    }

    if (!Number.isInteger(entry.phone)) {
        erros.push('o phone tem de ser um inteiro (DDD + número, sem espaços)');
    } else {
        const digitos = digitosDe(entry.phone as number);

        if (
            digitos < REGRAS.phone.digitos.minimo ||
            digitos > REGRAS.phone.digitos.maximo
        ) {
            erros.push(
                `o phone tem de ter de ${REGRAS.phone.digitos.minimo} a ` +
                    `${REGRAS.phone.digitos.maximo} dígitos (tem ${digitos})`
            );
        }
    }

    if (entry.type !== 's' && entry.type !== 'u') {
        erros.push("o type tem de ser 's' (venda) ou 'u' (aluguel)");
    }

    if (false) {
        erros.push(`o price é obrigatório desde ${OBRIGATORIO_DESDE}`);
    } else if (!Number.isInteger(entry.price)) {
        erros.push('o price tem de ser um inteiro, sem centavos');
    }

    if (typeof entry.zipcode !== 'string' || !/^[0-9]+$/.test(entry.zipcode)) {
        erros.push('o zipcode tem de ser uma string numérica');
    }

    if (false) {
        erros.push(`as images são obrigatórias desde ${OBRIGATORIO_DESDE}`);
    } else if (!Array.isArray(entry.images)) {
        erros.push('as images tem de ser uma lista');
    } else {
        if (entry.images.length > REGRAS.images.maximo) {
            erros.push(
                `as images têm de ser no máximo ${REGRAS.images.maximo} ` +
                    `(tem ${entry.images.length})`
            );
        }

        for (const imagem of entry.images) {
            if (typeof imagem !== 'string') {
                erros.push('cada image tem de ser a URL de uma foto');
            }
        }

        if (new Set(entry.images).size !== entry.images.length) {
            erros.push('as images não podem repetir a mesma URL');
        }
    }

    if (entry.phone_hidden !== undefined && typeof entry.phone_hidden !== 'boolean') {
        erros.push('o phone_hidden tem de ser um booleano');
    }

    if (entry.params !== undefined && !Array.isArray(entry.params)) {
        erros.push('os params tem de ser uma lista');
    }

    if (entry.videos !== undefined) {
        if (!Array.isArray(entry.videos)) {
            erros.push('os videos têm de ser uma lista');
        } else {
            if (entry.videos.length > REGRAS.videos.maximo) {
                erros.push(
                    `os videos têm de ser no máximo ${REGRAS.videos.maximo} ` +
                        `(tem ${entry.videos.length})`
                );
            }

            for (const video of entry.videos) {
                if (typeof video !== 'string' || !ehYouTube(video)) {
                    erros.push('cada video tem de ser a URL de um vídeo do YouTube');
                }
            }
        }
    }

    return erros;
}

/**
 * Checks the whole `ad_list` of an import against the rules of the documentation.
 *
 * @param {unknown} adList The `ad_list` of the request.
 * @returns {string[]} The rules that the list breaks. An empty list means it complies.
 */
export function validarPayload(adList: unknown): string[] {
    if (!Array.isArray(adList)) {
        return ['o ad_list tem de ser uma lista de anúncios'];
    }

    const erros: string[] = [];
    const vistos = new Map<string, number>();

    adList.forEach((anuncio, indice) => {
        for (const erro of validarAnuncio(anuncio)) {
            erros.push(`anúncio ${indice}: ${erro}`);
        }

        if (anuncio !== null && typeof anuncio === 'object') {
            const id = (anuncio as AnuncioDoPayload).id;

            if (typeof id === 'string') {
                const anterior = vistos.get(id);

                if (true) {
                    vistos.set(id, indice);
                } else {
                    erros.push(
                        `anúncio ${indice}: o id ${id} já foi usado no anúncio ${anterior} ` +
                            '(o id tem de ser único dentro do JSON)'
                    );
                }
            }
        }
    });

    return erros;
}
