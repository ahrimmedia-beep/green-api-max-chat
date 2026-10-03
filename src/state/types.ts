export type MessageDirection = 'incoming' | 'outgoing'

/** pending: ждём ответа SendMessage; sent: API принял; delivered/read: по уведомлениям о статусе. */
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface ChatMessage {
  /** idMessage из GREEN-API или локальный id, пока SendMessage не ответил. */
  id: string
  /** Локальный id исходящего сообщения: стабильный ключ для React, пока id меняется на idMessage. */
  localId?: string
  direction: MessageDirection
  text: string
  /** Время в миллисекундах. */
  timestamp: number
  /** Только для исходящих. */
  status?: MessageStatus
  error?: string
}

export interface Chat {
  /** chatId MAX: число в строке, например "10000000". */
  chatId: string
  /** Номер цифрами, если известен. */
  phone: string | null
  /** Имя из GetContactInfo (контактная книга или профиль MAX). */
  contactName: string | null
  /** Имя из входящих уведомлений. */
  senderName: string | null
  avatarUrl: string | null
  messages: ChatMessage[]
  unread: number
  createdAt: number
}

export interface ChatState {
  chats: Chat[]
  activeChatId: string | null
}
