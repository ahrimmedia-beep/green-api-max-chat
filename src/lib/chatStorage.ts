import type { Chat, ChatMessage, ChatState } from '../state/types'

/**
 * История чатов в localStorage, отдельно для каждого инстанса. Хранится не больше MAX_MESSAGES_PER_CHAT
 * последних сообщений на чат. Каждое обращение в try/catch: если хранилище недоступно или переполнено,
 * приложение работает как раньше, просто без истории после перезагрузки.
 */
export interface ChatStorage {
  load(idInstance: string): ChatState | null
  save(idInstance: string, state: ChatState): void
  clear(idInstance: string): void
}

export const MAX_MESSAGES_PER_CHAT = 200
const KEY_PREFIX = 'max-chat.chats.v1.'
export const INTERRUPTED_SEND_ERROR = 'Отправка прервана: страница была закрыта до ответа сервера'

export function chatStorageKey(idInstance: string): string {
  return `${KEY_PREFIX}${idInstance}`
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const nullableString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

function restoreMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null
  const { id, direction, text, timestamp } = value
  if (typeof id !== 'string' || typeof text !== 'string' || typeof timestamp !== 'number') return null
  if (direction !== 'incoming' && direction !== 'outgoing') return null
  const message: ChatMessage = { id, direction, text, timestamp }
  if (typeof value.localId === 'string') message.localId = value.localId
  if (direction === 'outgoing') {
    const status = value.status
    if (status === 'pending') {
      // Ответа SendMessage уже не будет: честно показываем, что отправка не подтверждена.
      message.status = 'failed'
      message.error = INTERRUPTED_SEND_ERROR
    } else if (status === 'sent' || status === 'delivered' || status === 'read' || status === 'failed') {
      message.status = status
      if (typeof value.error === 'string') message.error = value.error
    }
  }
  return message
}

function restoreChat(value: unknown): Chat | null {
  if (!isRecord(value) || typeof value.chatId !== 'string' || !value.chatId || !Array.isArray(value.messages)) return null
  return {
    chatId: value.chatId,
    phone: nullableString(value.phone),
    contactName: nullableString(value.contactName),
    senderName: nullableString(value.senderName),
    avatarUrl: nullableString(value.avatarUrl),
    messages: value.messages.map(restoreMessage).filter((m): m is ChatMessage => m !== null),
    unread: typeof value.unread === 'number' && value.unread > 0 ? Math.floor(value.unread) : 0,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
  }
}

export function serializeChatState(state: ChatState): string {
  return JSON.stringify({
    activeChatId: state.activeChatId,
    chats: state.chats.map((chat) => ({ ...chat, messages: chat.messages.slice(-MAX_MESSAGES_PER_CHAT) })),
  })
}

export function deserializeChatState(raw: string): ChatState | null {
  const data: unknown = JSON.parse(raw)
  if (!isRecord(data) || !Array.isArray(data.chats)) return null
  const chats = data.chats.map(restoreChat).filter((chat): chat is Chat => chat !== null)
  const activeChatId =
    typeof data.activeChatId === 'string' && chats.some((chat) => chat.chatId === data.activeChatId)
      ? data.activeChatId
      : null
  return { chats, activeChatId }
}

export function createChatStorage(getStorage: () => Storage = () => window.localStorage): ChatStorage {
  return {
    load(idInstance) {
      try {
        const raw = getStorage().getItem(chatStorageKey(idInstance))
        return raw ? deserializeChatState(raw) : null
      } catch {
        return null
      }
    },
    save(idInstance, state) {
      try {
        getStorage().setItem(chatStorageKey(idInstance), serializeChatState(state))
      } catch {
        // Хранилище недоступно или переполнено: история просто не сохранится.
      }
    },
    clear(idInstance) {
      try {
        getStorage().removeItem(chatStorageKey(idInstance))
      } catch {
        // Нечего очищать.
      }
    },
  }
}

export const chatStorage = createChatStorage()
