/**
 * Демо-режим: GREEN-API, имитированный в браузере.
 *
 * Подменяется только fetch, поэтому весь остальной код (клиент API, разбор уведомлений, цикл получения,
 * интерфейс) работает так же, как с настоящим сервисом. Модуль подгружается динамическим import()
 * по кнопке «Попробовать без аккаунта» и в основной бандл не попадает.
 *
 * Поведение «сервера»: инстанс авторизован, любой номер РФ или РБ есть в MAX, отправленное сообщение
 * получает статусы «доставлено» и «прочитано», а собеседник отвечает через 1–3 секунды.
 */
import { createGreenApiClient, type Credentials, type FetchLike, type GreenApiClient } from '../api/greenApi'

export interface DemoOptions {
  /** Задержка ответа собеседника, мс. По умолчанию случайная от 1000 до 3000. */
  replyDelayMs?: () => number
  /** Через сколько после отправки приходит статус «доставлено», мс. */
  deliveredDelayMs?: number
  /** Максимальное ожидание в ReceiveNotification, мс. По умолчанию receiveTimeout из запроса. */
  maxWaitMs?: number
  now?: () => number
}

export const DEMO_CREDENTIALS: Credentials = {
  idInstance: '1000000000',
  apiTokenInstance: 'demo',
  // Домен .invalid зарезервирован и никогда не резолвится: настоящих запросов в демо-режиме нет.
  apiUrl: 'https://demo.green-api.invalid',
}

const DEMO_NAMES = ['Анна Смирнова', 'Иван Петров', 'Мария Козлова', 'Дмитрий Орлов', 'Елена Волкова', 'Сергей Морозов']

const REPLIES = [
  'Привет! Сообщение дошло.',
  'Да, вижу. Всё работает.',
  'Хорошо, договорились.',
  'Спасибо, ответ пришёл через GREEN-API.',
  'Принято. Напишу позже.',
  'Отлично!',
]

interface QueuedNotification {
  receiptId: number
  body: Record<string, unknown>
}

function hash(value: string): number {
  let h = 0
  for (const char of value) h = (h * 31 + char.charCodeAt(0)) >>> 0
  return h
}

/** Детерминированный числовой chatId для номера, как у настоящих чатов MAX. */
export function demoChatId(phone: string): string {
  return String(10_000_000 + (hash(phone) % 89_999_999))
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

export function createDemoFetch(options: DemoOptions = {}): FetchLike {
  const {
    replyDelayMs = () => 1000 + Math.round(Math.random() * 2000),
    deliveredDelayMs = 400,
    maxWaitMs,
    now = Date.now,
  } = options

  const queue: QueuedNotification[] = []
  const waiters = new Set<() => void>()
  const contacts = new Map<string, { phone: string; name: string }>()
  let nextReceiptId = 1
  let nextMessageId = 1
  let repliesSent = 0

  const instanceData = { idInstance: Number(DEMO_CREDENTIALS.idInstance), wid: '79990000000@c.us', typeInstance: 'v3' }

  function push(body: Record<string, unknown>) {
    queue.push({ receiptId: nextReceiptId++, body: { instanceData, timestamp: Math.floor(now() / 1000), ...body } })
    waiters.forEach((wake) => wake())
  }

  function contactFor(chatId: string) {
    return contacts.get(chatId) ?? { phone: '', name: DEMO_NAMES[hash(chatId) % DEMO_NAMES.length]! }
  }

  function scheduleConversation(chatId: string, idMessage: string) {
    const replyAfter = Math.max(deliveredDelayMs + 1, replyDelayMs())
    setTimeout(() => push({ typeWebhook: 'outgoingMessageStatus', chatId, idMessage, status: 'delivered' }), deliveredDelayMs)
    // Собеседник читает сообщение и отвечает.
    setTimeout(
      () => push({ typeWebhook: 'outgoingMessageStatus', chatId, idMessage, status: 'read' }),
      Math.round((deliveredDelayMs + replyAfter) / 2),
    )
    setTimeout(() => {
      const contact = contactFor(chatId)
      push({
        typeWebhook: 'incomingMessageReceived',
        idMessage: `demo-in-${nextMessageId++}`,
        senderData: {
          chatId,
          chatName: contact.name,
          chatType: 'user',
          sender: chatId,
          senderName: contact.name,
          senderType: 'user',
          senderContactName: '',
          senderPhoneNumber: contact.phone ? Number(contact.phone) : 0,
        },
        messageData: {
          typeMessage: 'textMessage',
          textMessageData: { textMessage: REPLIES[repliesSent++ % REPLIES.length] },
        },
      })
    }, replyAfter)
  }

  /** Long polling: ждём уведомление до receiveTimeout секунд или до отмены запроса. */
  function waitForNotification(timeoutMs: number, signal?: AbortSignal | null): Promise<QueuedNotification | null> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError())
        return
      }
      const finish = () => {
        clearTimeout(timer)
        waiters.delete(check)
        signal?.removeEventListener('abort', onAbort)
      }
      const check = () => {
        if (queue.length === 0) return
        finish()
        resolve(queue[0]!)
      }
      const onAbort = () => {
        finish()
        reject(abortError())
      }
      const timer = setTimeout(() => {
        finish()
        resolve(null)
      }, timeoutMs)
      signal?.addEventListener('abort', onAbort, { once: true })
      waiters.add(check)
      check()
    })
  }

  return async (input, init = {}) => {
    const url = new URL(input)
    const [, instance, method, , extra] = url.pathname.split('/')
    if (instance !== `waInstance${DEMO_CREDENTIALS.idInstance}`) return new Response('', { status: 403 })
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}

    switch (method) {
      case 'getStateInstance':
        return json({ stateInstance: 'authorized' })

      case 'checkAccount': {
        const phone = String(body.phoneNumber ?? '')
        const chatId = demoChatId(phone)
        if (!contacts.has(chatId)) contacts.set(chatId, { phone, name: DEMO_NAMES[hash(phone) % DEMO_NAMES.length]! })
        return json({ exist: true, chatId, fromCache: false })
      }

      case 'getContactInfo': {
        const chatId = String(body.chatId ?? '')
        const contact = contactFor(chatId)
        return json({ avatar: '', name: contact.name, contactName: '', chatId, chatType: 'user', phoneNumber: Number(contact.phone) || 0 })
      }

      case 'sendMessage': {
        const chatId = String(body.chatId ?? '')
        const idMessage = `demo-out-${nextMessageId++}`
        scheduleConversation(chatId, idMessage)
        return json({ idMessage })
      }

      case 'receiveNotification': {
        const seconds = Number(url.searchParams.get('receiveTimeout') ?? 5)
        const timeoutMs = Math.min(seconds * 1000, maxWaitMs ?? Number.POSITIVE_INFINITY)
        const notification = await waitForNotification(timeoutMs, init.signal)
        return notification ? json(notification) : json(null)
      }

      case 'deleteNotification': {
        const index = queue.findIndex((n) => n.receiptId === Number(extra))
        if (index !== -1) queue.splice(index, 1)
        return json({ result: index !== -1, reason: index === -1 ? 'not found' : '' })
      }

      default:
        return new Response('', { status: 404 })
    }
  }
}

export interface DemoSession {
  credentials: Credentials
  client: GreenApiClient
}

export function createDemoSession(options?: DemoOptions): DemoSession {
  return {
    credentials: DEMO_CREDENTIALS,
    client: createGreenApiClient(DEMO_CREDENTIALS, { fetch: createDemoFetch(options) }),
  }
}
