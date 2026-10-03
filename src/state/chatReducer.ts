import type { IncomingTextEvent, OutgoingStatusEvent } from '../api/notifications'
import { formatPhone } from '../lib/phone'
import type { Chat, ChatMessage, ChatState, MessageStatus } from './types'

export type ChatAction =
  | { type: 'chatOpened'; chatId: string; phone: string | null; title?: string; now: number }
  | { type: 'chatSelected'; chatId: string }
  | { type: 'chatClosed' }
  | { type: 'messageQueued'; chatId: string; localId: string; text: string; timestamp: number }
  | { type: 'messageSent'; chatId: string; localId: string; idMessage: string }
  | { type: 'messageFailed'; chatId: string; localId: string; error: string }
  | { type: 'incomingReceived'; event: IncomingTextEvent }
  | { type: 'statusReceived'; event: OutgoingStatusEvent }

export const initialChatState: ChatState = { chats: [], activeChatId: null }

const STATUS_RANK: Record<MessageStatus, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 }

function createChat(chatId: string, phone: string | null, title: string | undefined, now: number): Chat {
  return {
    chatId,
    title: title || (phone ? formatPhone(phone) : chatId),
    phone,
    messages: [],
    unread: 0,
    createdAt: now,
  }
}

function updateChat(state: ChatState, chatId: string, update: (chat: Chat) => Chat): ChatState {
  let changed = false
  const chats = state.chats.map((chat) => {
    if (chat.chatId !== chatId) return chat
    const next = update(chat)
    if (next !== chat) changed = true
    return next
  })
  return changed ? { ...state, chats } : state
}

function updateMessage(chat: Chat, messageId: string, update: (message: ChatMessage) => ChatMessage): Chat {
  const index = chat.messages.findIndex((m) => m.id === messageId)
  if (index === -1) return chat
  const current = chat.messages[index]!
  const next = update(current)
  if (next === current) return chat
  const messages = chat.messages.slice()
  messages[index] = next
  return { ...chat, messages }
}

/** Новый статус применяется, только если он «дальше» текущего: read не откатывается в delivered. */
function applyStatus(message: ChatMessage, status: MessageStatus, error?: string): ChatMessage {
  const current = message.status ?? 'pending'
  if (status === 'failed') {
    return STATUS_RANK[current] >= STATUS_RANK.delivered ? message : { ...message, status, error }
  }
  if (current === 'failed' || STATUS_RANK[status] <= STATUS_RANK[current]) return message
  return { ...message, status, error: undefined }
}

function receiveIncoming(state: ChatState, event: IncomingTextEvent): ChatState {
  const message: ChatMessage = {
    id: event.idMessage,
    direction: 'incoming',
    text: event.text,
    timestamp: event.timestamp,
  }
  const existing = state.chats.find((chat) => chat.chatId === event.chatId)

  if (!existing) {
    const chat = createChat(event.chatId, event.phone, event.chatName, event.timestamp)
    return {
      ...state,
      chats: [...state.chats, { ...chat, messages: [message], unread: state.activeChatId === chat.chatId ? 0 : 1 }],
    }
  }
  // Повторная доставка того же уведомления (например, DeleteNotification не прошёл) не дублирует сообщение.
  if (existing.messages.some((m) => m.id === message.id)) return state

  return updateChat(state, event.chatId, (chat) => ({
    ...chat,
    title: event.chatName || chat.title,
    phone: chat.phone ?? event.phone,
    messages: [...chat.messages, message],
    unread: state.activeChatId === chat.chatId ? 0 : chat.unread + 1,
  }))
}

function receiveStatus(state: ChatState, event: OutgoingStatusEvent): ChatState {
  // Ищем по idMessage во всех чатах: chatId в статусе может не совпасть, если отправка шла по номеру.
  const chat = state.chats.find((c) => c.messages.some((m) => m.id === event.idMessage))
  if (!chat) return state
  const error = event.status === 'failed' ? `MAX: ${event.description || 'не удалось доставить'}` : undefined
  return updateChat(state, chat.chatId, (c) =>
    updateMessage(c, event.idMessage, (m) => applyStatus(m, event.status, error)),
  )
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'chatOpened': {
      const existing = state.chats.find((chat) => chat.chatId === action.chatId)
      const withChat = existing
        ? // Чат уже создан входящим сообщением: запоминаем номер, чтобы находить его по номеру.
          updateChat(state, action.chatId, (chat) => (chat.phone || !action.phone ? chat : { ...chat, phone: action.phone }))
        : { ...state, chats: [...state.chats, createChat(action.chatId, action.phone, action.title, action.now)] }
      return chatReducer(withChat, { type: 'chatSelected', chatId: action.chatId })
    }

    case 'chatSelected': {
      if (!state.chats.some((chat) => chat.chatId === action.chatId)) return state
      const selected = { ...state, activeChatId: action.chatId }
      return updateChat(selected, action.chatId, (chat) => (chat.unread === 0 ? chat : { ...chat, unread: 0 }))
    }

    case 'chatClosed':
      return state.activeChatId === null ? state : { ...state, activeChatId: null }

    case 'messageQueued':
      return updateChat(state, action.chatId, (chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          {
            id: action.localId,
            localId: action.localId,
            direction: 'outgoing',
            text: action.text,
            timestamp: action.timestamp,
            status: 'pending',
          },
        ],
      }))

    case 'messageSent':
      return updateChat(state, action.chatId, (chat) =>
        updateMessage(chat, action.localId, (m) => ({ ...applyStatus(m, 'sent'), id: action.idMessage })),
      )

    case 'messageFailed':
      return updateChat(state, action.chatId, (chat) =>
        updateMessage(chat, action.localId, (m) => ({ ...m, status: 'failed', error: action.error })),
      )

    case 'incomingReceived':
      return receiveIncoming(state, action.event)

    case 'statusReceived':
      return receiveStatus(state, action.event)
  }
}

export function lastActivity(chat: Chat): number {
  return chat.messages.at(-1)?.timestamp ?? chat.createdAt
}

/** Чаты по времени последней активности, новые сверху, как в мессенджерах. */
export function sortChats(chats: readonly Chat[]): Chat[] {
  return [...chats].sort((a, b) => lastActivity(b) - lastActivity(a))
}

export function findChatByPhone(chats: readonly Chat[], phone: string): Chat | undefined {
  return chats.find((chat) => chat.phone === phone)
}
