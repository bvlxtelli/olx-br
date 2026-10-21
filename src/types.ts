export interface UserInfo {
    user_name: string;
    user_email: string;
}

export interface ModelosResponse {
    status: string;
    data: Object;
}

/**
 * Mensagem enviada para uma conversa de chat através da API de autoservice.
 */
export interface ChatMessage {
    /** Texto da resposta enviada ao comprador. */
    textMessage: string;
    /** Identificador da mensagem que está sendo respondida. */
    messageId: string;
    /** Identificador da conversa de chat. */
    chatId: string;
}

/**
 * Situação de um anúncio na listagem.
 *
 * Os quatro valores abaixo são os que a documentação da OLX descreve, e são os que o editor
 * de código sugere. O tipo aceita **qualquer string**, porque o valor é enviado para a API
 * exatamente como foi informado: um valor novo que a OLX adicione não pode ser barrado pelo
 * pacote (e a lista de valores aqui é a da documentação, não a da API).
 */
export type SituacaoAnuncio =
    | 'published'
    | 'pending_review'
    | 'deleted'
    | 'refused'
    | (string & NonNullable<unknown>);

/**
 * Filtros e paginação da listagem de anúncios.
 */
export interface OpcoesListagem {
    /** Token da página: o `next_token` da página anterior. */
    page_token?: string;
    /** Filtra os anúncios pela situação. O valor é enviado como está. */
    ads_status?: SituacaoAnuncio;
    /** Quantidade de anúncios por página. A API aceita no máximo 200. */
    fetch_size?: number;
}

/**
 * Anúncio de uma página da listagem.
 */
export interface AnuncioListado {
    /** Identificador do anúncio. */
    id: string;
    /** Identificador do anúncio no sistema da OLX. */
    list_id: string;
    /** Situação do anúncio. */
    status: string;
}

/**
 * Uma página da listagem de anúncios.
 */
export interface ListagemAnuncios {
    /** Os anúncios da página. */
    data: AnuncioListado[];
    /** O token da página atual. */
    current_token: string | null;
    /** O token da próxima página. `null` quando a listagem acabou. */
    next_token: string | null;
}
