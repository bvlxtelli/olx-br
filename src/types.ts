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
