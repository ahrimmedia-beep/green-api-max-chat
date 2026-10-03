import { describeError } from './errors'
import { GreenApiError, MIN_RECEIVE_TIMEOUT, type GreenApiClient } from './greenApi'
import { parseNotification, type NotificationEvent } from './notifications'

export type PollingClient = Pick<GreenApiClient, 'receiveNotification' | 'deleteNotification'>

export type PollingStatus =
  | { state: 'connecting' }
  | { state: 'listening' }
  | { state: 'retrying'; error: string; retryInMs: number }
  | { state: 'stopped'; error: string }

export interface PollingOptions {
  client: PollingClient
  signal: AbortSignal
  onEvent: (event: NotificationEvent) => void
  onStatus?: (status: PollingStatus) => void
  /** Сколько секунд сервер держит запрос, если очередь пуста (5–60). */
  receiveTimeout?: number
  initialBackoffMs?: number
  maxBackoffMs?: number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

export const DEFAULT_RECEIVE_TIMEOUT = 20
export const DEFAULT_INITIAL_BACKOFF_MS = 1_000
export const DEFAULT_MAX_BACKOFF_MS = 30_000

/** Пауза, которая заканчивается раньше при отмене. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

export function backoffDelay(failures: number, initialMs: number, maxMs: number): number {
  return Math.min(maxMs, initialMs * 2 ** Math.max(0, failures - 1))
}

/**
 * Цикл получения уведомлений через HTTP API:
 * ReceiveNotification (long polling) → обработка → DeleteNotification.
 *
 * Удаляем каждое полученное уведомление, даже если тип не поддерживается или обработчик упал:
 * пока уведомление не удалено, очередь отдаёт его снова и до следующих дело не доходит.
 * Если удаление не прошло, уведомление придёт повторно; редьюсер отбрасывает дубликаты по idMessage.
 *
 * Сетевые ошибки и 5xx: повтор с растущей паузой. 401/403: остановка, повтор не поможет.
 * Завершается, когда сработал signal.
 */
export async function runPollingLoop(options: PollingOptions): Promise<void> {
  const {
    client,
    signal,
    onEvent,
    onStatus = () => {},
    receiveTimeout = DEFAULT_RECEIVE_TIMEOUT,
    initialBackoffMs = DEFAULT_INITIAL_BACKOFF_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    sleep = abortableSleep,
  } = options

  let failures = 0
  let current: PollingStatus['state'] | null = null
  const report = (status: PollingStatus) => {
    if (signal.aborted) return
    // «Слушаем» сообщаем один раз, а не после каждого пустого ответа.
    if (status.state === 'listening' && current === 'listening') return
    current = status.state
    onStatus(status)
  }

  report({ state: 'connecting' })

  while (!signal.aborted) {
    try {
      // Пока связь не подтверждена (старт, восстановление после ошибки), ждём минимальные 5 с,
      // чтобы быстро показать статус. Дальше держим длинный запрос.
      const timeout = current === 'listening' ? receiveTimeout : MIN_RECEIVE_TIMEOUT
      const notification = await client.receiveNotification(timeout, signal)
      failures = 0
      report({ state: 'listening' })
      if (!notification) continue

      try {
        onEvent(parseNotification(notification.body))
      } catch (error) {
        console.error('Notification handler failed', error)
      }
      await client.deleteNotification(notification.receiptId, signal)
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof GreenApiError && error.isAuthError) {
        report({ state: 'stopped', error: describeError(error) })
        return
      }
      failures += 1
      const retryInMs = backoffDelay(failures, initialBackoffMs, maxBackoffMs)
      report({ state: 'retrying', error: describeError(error), retryInMs })
      await sleep(retryInMs, signal)
    }
  }
}
