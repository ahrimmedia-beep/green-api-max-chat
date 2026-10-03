import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GreenApiError } from '../api/greenApi'
import type { NotificationEvent } from '../api/notifications'
import { FakeGreenApi } from '../test/fakeGreenApi'
import { incomingText, stateInstanceChanged } from '../test/fixtures'
import { useNotificationPolling } from './useNotificationPolling'

describe('useNotificationPolling', () => {
  it('delivers incoming messages and deletes every notification', async () => {
    const api = new FakeGreenApi()
    const onEvent = vi.fn<(event: NotificationEvent) => void>()
    const first = api.push(incomingText('Привет'))
    const second = api.push(stateInstanceChanged)

    const { result, unmount } = renderHook(() => useNotificationPolling(api, onEvent))

    await waitFor(() => expect(api.queue).toHaveLength(0))
    expect(api.deleteNotification.mock.calls.map(([id]) => id)).toEqual([first, second])
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'incomingText', text: 'Привет' }))
    expect(result.current).toEqual({ state: 'listening' })
    unmount()
  })

  it('aborts the pending long-poll request on unmount', async () => {
    const api = new FakeGreenApi()
    const { unmount } = renderHook(() => useNotificationPolling(api, () => {}))
    await waitFor(() => expect(api.receiveNotification).toHaveBeenCalled())
    const signal = api.receiveNotification.mock.lastCall?.[1]

    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('does nothing without a client', () => {
    const { result } = renderHook(() => useNotificationPolling(null, () => {}))
    expect(result.current).toEqual({ state: 'connecting' })
  })

  it('uses the latest handler without restarting the loop', async () => {
    const api = new FakeGreenApi()
    const firstHandler = vi.fn()
    const secondHandler = vi.fn()
    const { rerender, unmount } = renderHook(({ handler }) => useNotificationPolling(api, handler), {
      initialProps: { handler: firstHandler },
    })
    await waitFor(() => expect(api.receiveNotification).toHaveBeenCalledTimes(1))

    rerender({ handler: secondHandler })
    api.push(incomingText())
    await waitFor(() => expect(secondHandler).toHaveBeenCalledTimes(1))

    expect(firstHandler).not.toHaveBeenCalled()
    expect(api.receiveNotification.mock.calls.length).toBeLessThanOrEqual(2)
    unmount()
  })

  it('reports a stopped state on auth errors', async () => {
    const api = new FakeGreenApi()
    api.receiveErrors.push(new GreenApiError('http', 403, '<html>'))
    const { result } = renderHook(() => useNotificationPolling(api, () => {}))

    await waitFor(() => expect(result.current.state).toBe('stopped'))
    expect(result.current).toEqual({ state: 'stopped', error: 'Доступ запрещён. Проверьте idInstance и API URL.' })
  })
})
