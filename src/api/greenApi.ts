/**
 * Минимальный типизированный клиент GREEN-API (v3, MAX).
 * Формат адреса: {apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}
 * Подробности и ссылки на документацию: docs/API-NOTES.md
 */

export interface Credentials {
  idInstance: string
  apiTokenInstance: string
  apiUrl: string
}

export type InstanceState =
  | 'authorized'
  | 'notAuthorized'
  | 'blocked'
  | 'starting'
  | 'suspended'
  | 'pendingPassword'

export interface StateInstanceResponse {
  stateInstance: InstanceState | (string & {})
}

export interface CheckAccountResponse {
  exist: boolean
  chatId: string
}

export interface SendMessageResponse {
  idMessage: string
}

export interface ContactInfo {
  /** Имя из профиля MAX; пустая строка, если аккаунта нет. */
  name: string
  /** Имя из контактной книги телефона инстанса; пустая строка, если номера там нет. */
  contactName: string
  /** Ссылка на аватар; пустая строка, если его нет или он скрыт настройками приватности. */
  avatar: string
}

export interface ReceivedNotification {
  receiptId: number
  body: unknown
}

export interface GreenApiClient {
  getStateInstance(signal?: AbortSignal): Promise<StateInstanceResponse>
  checkAccount(phoneNumber: string, signal?: AbortSignal): Promise<CheckAccountResponse>
  sendMessage(chatId: string, message: string, signal?: AbortSignal): Promise<SendMessageResponse>
  /** Имя и аватар собеседника. Только для личных чатов. */
  getContactInfo(chatId: string, signal?: AbortSignal): Promise<ContactInfo>
  /** Возвращает null, если за receiveTimeout секунд уведомлений не было. */
  receiveNotification(receiveTimeout: number, signal?: AbortSignal): Promise<ReceivedNotification | null>
  deleteNotification(receiptId: number, signal?: AbortSignal): Promise<boolean>
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ClientOptions {
  /** Для тестов: подменяемая реализация fetch. */
  fetch?: FetchLike
  /** Таймаут обычного запроса, мс. */
  requestTimeoutMs?: number
}

export type GreenApiErrorKind = 'http' | 'network' | 'timeout' | 'response'

export class GreenApiError extends Error {
  readonly kind: GreenApiErrorKind
  /** HTTP-статус; 0, если ответа не было. */
  readonly status: number
  /** Текст ответа сервера или исходная ошибка, для диагностики. */
  readonly details: string

  constructor(kind: GreenApiErrorKind, status: number, details: string) {
    super(`GREEN-API ${kind} error${status ? ` ${status}` : ''}: ${details}`)
    this.name = 'GreenApiError'
    this.kind = kind
    this.status = status
    this.details = details
  }

  /** 401 и 403: неверный токен, idInstance или адрес. Повтор запроса не поможет. */
  get isAuthError(): boolean {
    return this.kind === 'http' && (this.status === 401 || this.status === 403)
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000
/** Запас сверх receiveTimeout на сетевую задержку. */
const LONG_POLL_GRACE_MS = 15_000
export const MIN_RECEIVE_TIMEOUT = 5
export const MAX_RECEIVE_TIMEOUT = 60

/** Убирает пробелы и завершающие слэши. Префикс /v3 оставляем: API его поддерживает. */
export function normalizeApiUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

export function isValidApiUrl(raw: string): boolean {
  try {
    const url = new URL(normalizeApiUrl(raw))
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Предлагает apiUrl по первым четырём цифрам idInstance, как это выглядит в консоли
 * (3100xxxxxx → https://3100.api.green-api.com). Это подсказка, а не правило документации.
 */
export function suggestApiUrl(idInstance: string): string | null {
  const digits = idInstance.trim()
  return /^\d{4,}$/.test(digits) ? `https://${digits.slice(0, 4)}.api.green-api.com` : null
}

export function buildMethodUrl(credentials: Credentials, method: string, ...pathParts: (string | number)[]): string {
  const base = normalizeApiUrl(credentials.apiUrl)
  const id = encodeURIComponent(credentials.idInstance.trim())
  const token = encodeURIComponent(credentials.apiTokenInstance.trim())
  const tail = pathParts.map((part) => `/${encodeURIComponent(String(part))}`).join('')
  return `${base}/waInstance${id}/${method}/${token}${tail}`
}

/** Объединяет внешний сигнал отмены с таймаутом. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    isTimedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createGreenApiClient(credentials: Credentials, options: ClientOptions = {}): GreenApiClient {
  // Обёртка, а не ссылка на fetch: так fetch вызывается с правильным this и подменяется в тестах.
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS

  async function request(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    { body, signal, timeoutMs = requestTimeoutMs }: { body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const timeout = withTimeout(signal, timeoutMs)
    let response: Response
    let text: string
    try {
      response = await doFetch(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeout.signal,
      })
      text = await response.text()
    } catch (error) {
      if (signal?.aborted) throw error
      if (timeout.isTimedOut()) throw new GreenApiError('timeout', 0, `no response in ${timeoutMs} ms`)
      throw new GreenApiError('network', 0, error instanceof Error ? error.message : String(error))
    } finally {
      timeout.dispose()
    }

    if (!response.ok) {
      throw new GreenApiError('http', response.status, text.trim() || response.statusText)
    }
    if (text.trim() === '') return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new GreenApiError('response', response.status, `invalid JSON: ${text.slice(0, 200)}`)
    }
  }

  const url = (method: string, ...parts: (string | number)[]) => buildMethodUrl(credentials, method, ...parts)

  return {
    async getStateInstance(signal) {
      const data = await request('GET', url('getStateInstance'), { signal })
      if (!isRecord(data) || typeof data.stateInstance !== 'string') {
        throw new GreenApiError('response', 200, 'getStateInstance: stateInstance is missing')
      }
      return { stateInstance: data.stateInstance }
    },

    async checkAccount(phoneNumber, signal) {
      // phoneNumber по документации integer: 11–12 цифр помещаются в Number без потерь.
      const data = await request('POST', url('checkAccount'), { body: { phoneNumber: Number(phoneNumber) }, signal })
      if (!isRecord(data)) throw new GreenApiError('response', 200, 'checkAccount: empty response')
      if (typeof data.exist !== 'boolean') {
        // Например, { status: false, reason: "instance is starting or not authorized" }
        const reason = typeof data.reason === 'string' ? data.reason : JSON.stringify(data)
        throw new GreenApiError('response', 200, reason)
      }
      return { exist: data.exist, chatId: typeof data.chatId === 'string' ? data.chatId : '' }
    },

    async sendMessage(chatId, message, signal) {
      const data = await request('POST', url('sendMessage'), { body: { chatId, message }, signal })
      if (!isRecord(data) || typeof data.idMessage !== 'string') {
        throw new GreenApiError('response', 200, 'sendMessage: idMessage is missing')
      }
      return { idMessage: data.idMessage }
    },

    async getContactInfo(chatId, signal) {
      const data = await request('POST', url('getContactInfo'), { body: { chatId }, signal })
      if (!isRecord(data)) throw new GreenApiError('response', 200, 'getContactInfo: empty response')
      const text = (value: unknown) => (typeof value === 'string' ? value : '')
      return { name: text(data.name), contactName: text(data.contactName), avatar: text(data.avatar) }
    },

    async receiveNotification(receiveTimeout, signal) {
      const seconds = Math.min(MAX_RECEIVE_TIMEOUT, Math.max(MIN_RECEIVE_TIMEOUT, Math.round(receiveTimeout)))
      const data = await request('GET', `${url('receiveNotification')}?receiveTimeout=${seconds}`, {
        signal,
        timeoutMs: seconds * 1000 + LONG_POLL_GRACE_MS,
      })
      if (data === null) return null
      if (!isRecord(data) || typeof data.receiptId !== 'number') {
        throw new GreenApiError('response', 200, 'receiveNotification: receiptId is missing')
      }
      return { receiptId: data.receiptId, body: data.body }
    },

    async deleteNotification(receiptId, signal) {
      const data = await request('DELETE', url('deleteNotification', receiptId), { signal })
      return isRecord(data) && data.result === true
    },
  }
}
