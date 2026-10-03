import { useEffect, useRef, useState } from 'react'
import type { NotificationEvent } from '../api/notifications'
import { runPollingLoop, type PollingClient, type PollingStatus } from '../api/polling'
import { getLockManager, runWithLock, type LockRequester } from '../lib/instanceLock'

export interface UseNotificationPollingOptions {
  receiveTimeout?: number
  initialBackoffMs?: number
  maxBackoffMs?: number
  /** Имя блокировки Web Locks: очередь опрашивает только одна вкладка. null: без блокировки. */
  lockName?: string | null
  /** Для тестов. По умолчанию navigator.locks; без него опрос идёт без блокировки. */
  locks?: LockRequester | null
}

/**
 * Держит фоновый цикл получения уведомлений, пока компонент смонтирован и есть клиент.
 * При размонтировании или смене клиента цикл останавливается через AbortController,
 * незавершённый long-poll запрос отменяется, блокировка вкладки освобождается.
 */
export function useNotificationPolling(
  client: PollingClient | null,
  onEvent: (event: NotificationEvent) => void,
  {
    receiveTimeout,
    initialBackoffMs,
    maxBackoffMs,
    lockName = null,
    locks = getLockManager(),
  }: UseNotificationPollingOptions = {},
): PollingStatus {
  const [status, setStatus] = useState<PollingStatus>({ state: 'connecting' })

  // Свежий обработчик без перезапуска цикла при каждом рендере.
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!client) return
    const controller = new AbortController()
    const poll = () =>
      runPollingLoop({
        client,
        signal: controller.signal,
        onEvent: (event) => onEventRef.current(event),
        onStatus: setStatus,
        receiveTimeout,
        initialBackoffMs,
        maxBackoffMs,
      })

    if (lockName && locks) {
      const onWaiting = () => {
        if (!controller.signal.aborted) setStatus({ state: 'standby' })
      }
      // Если Web Locks недоступен по иной причине, опрашиваем без блокировки, как раньше.
      runWithLock(locks, lockName, controller.signal, onWaiting, poll).catch(() => {
        if (!controller.signal.aborted) void poll()
      })
    } else {
      void poll()
    }
    return () => controller.abort()
  }, [client, receiveTimeout, initialBackoffMs, maxBackoffMs, lockName, locks])

  return status
}
