import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeGreenApi } from '../test/fakeGreenApi'
import { incomingImage, incomingText, outgoingStatus, stateInstanceChanged } from '../test/fixtures'
import { GreenApiError } from './greenApi'
import type { NotificationEvent } from './notifications'
import { abortableSleep, backoffDelay, runPollingLoop, type PollingStatus } from './polling'

function setup() {
  const api = new FakeGreenApi()
  const controller = new AbortController()
  const events: NotificationEvent[] = []
  const statuses: PollingStatus[] = []
  const sleep = vi.fn<(ms: number, signal: AbortSignal) => Promise<void>>(() => Promise.resolve())
  const run = (overrides: Partial<Parameters<typeof runPollingLoop>[0]> = {}) =>
    runPollingLoop({
      client: api,
      signal: controller.signal,
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
      sleep,
      ...overrides,
    })
  return { api, controller, events, statuses, sleep, run }
}

/** Ждёт, пока цикл обработает уведомления и снова встанет на ожидание. */
async function waitUntilDrained(api: FakeGreenApi) {
  await vi.waitFor(() => expect(api.queue).toHaveLength(0))
}

describe('runPollingLoop', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('handles every notification in order and deletes each one, including ignored types', async () => {
    const { api, controller, events, run } = setup()
    const r1 = api.push(incomingText('первое', { idMessage: 'a' }))
    const r2 = api.push(stateInstanceChanged)
    const r3 = api.push(incomingImage)
    const r4 = api.push(outgoingStatus('read', 'srv-1'))
    const r5 = api.push(incomingText('второе', { idMessage: 'b' }))

    const loop = run()
    await waitUntilDrained(api)
    controller.abort()
    await loop

    expect(api.deleteNotification.mock.calls.map(([id]) => id)).toEqual([r1, r2, r3, r4, r5])
    expect(events.map((e) => e.type)).toEqual(['incomingText', 'ignored', 'ignored', 'outgoingStatus', 'incomingText'])
    expect(events.filter((e) => e.type === 'incomingText').map((e) => e.text)).toEqual(['первое', 'второе'])
  })

  it('confirms the connection with a short request, then keeps a long one', async () => {
    const { api, controller, run } = setup()
    api.receiveNotification.mockResolvedValueOnce(null)
    const loop = run({ receiveTimeout: 30 })
    await vi.waitFor(() => expect(api.receiveNotification).toHaveBeenCalledTimes(2))
    controller.abort()
    await loop

    expect(api.receiveNotification.mock.calls).toEqual([
      [5, controller.signal],
      [30, controller.signal],
    ])
  })

  it('goes back to short requests after an error until the connection is confirmed', async () => {
    const { api, controller, run } = setup()
    api.receiveNotification.mockResolvedValueOnce(null)
    api.receiveNotification.mockRejectedValueOnce(new GreenApiError('network', 0, 'offline'))
    api.receiveNotification.mockResolvedValueOnce(null)
    const loop = run({ receiveTimeout: 30 })
    await vi.waitFor(() => expect(api.receiveNotification).toHaveBeenCalledTimes(4))
    controller.abort()
    await loop

    expect(api.receiveNotification.mock.calls.map(([timeout]) => timeout)).toEqual([5, 30, 5, 30])
  })

  it('reports connecting, then listening once', async () => {
    const { api, controller, statuses, run } = setup()
    api.push(stateInstanceChanged)
    api.push(stateInstanceChanged)
    const loop = run()
    await waitUntilDrained(api)
    controller.abort()
    await loop

    expect(statuses).toEqual([{ state: 'connecting' }, { state: 'listening' }])
  })

  it('stops promptly when aborted while waiting', async () => {
    const { api, controller, run } = setup()
    const loop = run()
    await vi.waitFor(() => expect(api.receiveNotification).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(loop).resolves.toBeUndefined()
    expect(api.receiveNotification).toHaveBeenCalledTimes(1)
  })

  it('retries network errors with exponential backoff and recovers', async () => {
    const { api, controller, statuses, sleep, run } = setup()
    const networkError = new GreenApiError('network', 0, 'Failed to fetch')
    api.receiveErrors.push(networkError, networkError, new GreenApiError('http', 502, 'Bad Gateway'))
    api.push(incomingText('после сбоя'))

    const loop = run({ initialBackoffMs: 1000, maxBackoffMs: 3000 })
    await waitUntilDrained(api)
    controller.abort()
    await loop

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 3000])
    expect(statuses.map((s) => s.state)).toEqual(['connecting', 'retrying', 'retrying', 'retrying', 'listening'])
    expect(statuses[1]).toMatchObject({ error: expect.stringMatching(/Нет связи/), retryInMs: 1000 })
  })

  it('stops on auth errors without retrying', async () => {
    const { api, statuses, sleep, run } = setup()
    api.receiveErrors.push(new GreenApiError('http', 401, ''))

    await run()

    expect(api.receiveNotification).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
    expect(statuses.at(-1)).toEqual({ state: 'stopped', error: 'Неверный apiTokenInstance.' })
  })

  it('still deletes the notification when the handler throws', async () => {
    const { api, controller, run } = setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const receiptId = api.push(incomingText())

    const loop = run({
      onEvent: () => {
        throw new Error('render bug')
      },
    })
    await waitUntilDrained(api)
    controller.abort()
    await loop

    expect(api.deleteNotification).toHaveBeenCalledWith(receiptId, controller.signal)
  })

  it('gets the same notification again if DeleteNotification failed', async () => {
    const { api, controller, events, run } = setup()
    api.deleteErrors.push(new GreenApiError('network', 0, 'offline'))
    const receiptId = api.push(incomingText('один раз', { idMessage: 'x' }))

    const loop = run()
    await waitUntilDrained(api)
    controller.abort()
    await loop

    // Сообщение обработано дважды; дубликат отбросит редьюсер по idMessage.
    expect(events).toHaveLength(2)
    expect(api.deleteNotification.mock.calls.map(([id]) => id)).toEqual([receiptId, receiptId])
  })

  it('treats an empty response as "no notifications" and polls again', async () => {
    const { api, controller, run } = setup()
    api.receiveNotification.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    const loop = run()
    await vi.waitFor(() => expect(api.receiveNotification).toHaveBeenCalledTimes(3))
    controller.abort()
    await loop

    expect(api.deleteNotification).not.toHaveBeenCalled()
  })
})

describe('backoffDelay', () => {
  it('doubles from the initial delay up to the maximum', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => backoffDelay(n, 1000, 30_000))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ])
  })
})

describe('abortableSleep', () => {
  it('resolves after the delay', async () => {
    vi.useFakeTimers()
    const done = vi.fn()
    void abortableSleep(500, new AbortController().signal).then(done)
    await vi.advanceTimersByTimeAsync(499)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('resolves early on abort', async () => {
    const controller = new AbortController()
    const sleeping = abortableSleep(60_000, controller.signal)
    controller.abort()
    await expect(sleeping).resolves.toBeUndefined()
    await expect(abortableSleep(60_000, controller.signal)).resolves.toBeUndefined()
  })
})
