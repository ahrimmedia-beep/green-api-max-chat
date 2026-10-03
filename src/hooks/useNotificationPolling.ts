import { useEffect, useRef, useState } from 'react'
import type { NotificationEvent } from '../api/notifications'
import { runPollingLoop, type PollingClient, type PollingStatus } from '../api/polling'

export interface UseNotificationPollingOptions {
  receiveTimeout?: number
  initialBackoffMs?: number
  maxBackoffMs?: number
}

/**
 * Держит фоновый цикл получения уведомлений, пока компонент смонтирован и есть клиент.
 * При размонтировании или смене клиента цикл останавливается через AbortController,
 * незавершённый long-poll запрос отменяется.
 */
export function useNotificationPolling(
  client: PollingClient | null,
  onEvent: (event: NotificationEvent) => void,
  { receiveTimeout, initialBackoffMs, maxBackoffMs }: UseNotificationPollingOptions = {},
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
    void runPollingLoop({
      client,
      signal: controller.signal,
      onEvent: (event) => onEventRef.current(event),
      onStatus: setStatus,
      receiveTimeout,
      initialBackoffMs,
      maxBackoffMs,
    })
    return () => controller.abort()
  }, [client, receiveTimeout, initialBackoffMs, maxBackoffMs])

  return status
}
