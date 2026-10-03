/**
 * Разбор входящих уведомлений GREEN-API в доменные события.
 * Чистые функции без побочных эффектов: всё, что не распознано, превращается в { type: 'ignored' }.
 * Формат: https://green-api.com/v3/docs/api/receiving/notifications-format/
 */

export interface IncomingTextEvent {
  type: 'incomingText'
  chatId: string
  /** Имя собеседника из уведомления (для группы название группы), может быть пустым. */
  senderName: string
  /** Номер отправителя цифрами; null, если скрыт или это группа. */
  phone: string | null
  idMessage: string
  text: string
  /** Время в миллисекундах. */
  timestamp: number
}

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface OutgoingStatusEvent {
  type: 'outgoingStatus'
  chatId: string
  idMessage: string
  status: DeliveryStatus
  description: string
}

export interface IgnoredEvent {
  type: 'ignored'
  reason: string
}

export type NotificationEvent = IncomingTextEvent | OutgoingStatusEvent | IgnoredEvent

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function ignored(reason: string): IgnoredEvent {
  return { type: 'ignored', reason }
}

/** Достаёт текст из messageData для текстовых типов сообщений. null для остальных типов. */
export function extractText(messageData: unknown): string | null {
  if (!isRecord(messageData)) return null
  switch (messageData.typeMessage) {
    case 'textMessage': {
      const data = messageData.textMessageData
      return isRecord(data) && typeof data.textMessage === 'string' ? data.textMessage : null
    }
    case 'extendedTextMessage':
    case 'quotedMessage': {
      const data = messageData.extendedTextMessageData
      return isRecord(data) && typeof data.text === 'string' ? data.text : null
    }
    default:
      return null
  }
}

function toTimestampMs(seconds: unknown, fallback: number): number {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallback
}

function phoneFrom(value: unknown): string | null {
  if (typeof value === 'number' && value > 0) return String(value)
  if (typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0) return value
  return null
}

const STATUS_MAP: Record<string, DeliveryStatus> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  noAccount: 'failed',
  notInGroup: 'failed',
}

export function parseNotification(body: unknown, now: () => number = Date.now): NotificationEvent {
  if (!isRecord(body)) return ignored('empty body')
  const typeWebhook = str(body.typeWebhook)

  if (typeWebhook === 'incomingMessageReceived') {
    const sender = body.senderData
    if (!isRecord(sender) || !str(sender.chatId)) return ignored('incoming message without senderData.chatId')
    const text = extractText(body.messageData)
    if (text === null) {
      const typeMessage = isRecord(body.messageData) ? str(body.messageData.typeMessage) : ''
      return ignored(`unsupported message type: ${typeMessage || 'unknown'}`)
    }
    const idMessage = str(body.idMessage)
    if (!idMessage) return ignored('incoming message without idMessage')
    return {
      type: 'incomingText',
      chatId: str(sender.chatId),
      senderName:
        sender.chatType === 'group'
          ? str(sender.chatName)
          : str(sender.senderContactName) || str(sender.senderName) || str(sender.chatName),
      phone: sender.chatType === 'group' ? null : phoneFrom(sender.senderPhoneNumber),
      idMessage,
      text,
      timestamp: toTimestampMs(body.timestamp, now()),
    }
  }

  if (typeWebhook === 'outgoingMessageStatus') {
    const status = STATUS_MAP[str(body.status)]
    const idMessage = str(body.idMessage)
    if (!status || !idMessage) return ignored(`unsupported status: ${str(body.status) || 'unknown'}`)
    return {
      type: 'outgoingStatus',
      chatId: str(body.chatId),
      idMessage,
      status,
      description: str(body.description) || (status === 'failed' ? str(body.status) : ''),
    }
  }

  return ignored(`typeWebhook: ${typeWebhook || 'unknown'}`)
}
