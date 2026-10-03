import { describe, expect, it, vi } from 'vitest'
import { describeError, describeInstanceState } from './errors'
import {
  buildMethodUrl,
  createGreenApiClient,
  GreenApiError,
  isValidApiUrl,
  normalizeApiUrl,
  suggestApiUrl,
  type Credentials,
  type FetchLike,
} from './greenApi'

const credentials: Credentials = {
  idInstance: '3100123456',
  apiTokenInstance: 'token-abc',
  apiUrl: 'https://3100.api.green-api.com/',
}

const BASE = 'https://3100.api.green-api.com/waInstance3100123456'

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(...responses: (Response | Error)[]) {
  const fn = vi.fn<FetchLike>()
  for (const response of responses) {
    if (response instanceof Error) fn.mockRejectedValueOnce(response)
    else fn.mockResolvedValueOnce(response)
  }
  return fn
}

function lastCall(fetch: ReturnType<typeof mockFetch>) {
  const call = fetch.mock.lastCall
  if (!call) throw new Error('fetch was not called')
  const [url, init] = call
  return { url, init: init ?? {} }
}

describe('url helpers', () => {
  it('builds {apiUrl}/waInstance{id}/{method}/{token}', () => {
    expect(buildMethodUrl(credentials, 'sendMessage')).toBe(`${BASE}/sendMessage/token-abc`)
  })

  it('appends extra path parts after the token', () => {
    expect(buildMethodUrl(credentials, 'deleteNotification', 42)).toBe(`${BASE}/deleteNotification/token-abc/42`)
  })

  it('keeps the optional /v3 prefix and trims whitespace and slashes', () => {
    expect(normalizeApiUrl('  https://3100.api.green-api.com/v3///  ')).toBe('https://3100.api.green-api.com/v3')
    expect(buildMethodUrl({ ...credentials, apiUrl: 'https://3100.api.green-api.com/v3' }, 'getStateInstance')).toBe(
      'https://3100.api.green-api.com/v3/waInstance3100123456/getStateInstance/token-abc',
    )
  })

  it('encodes credentials so they cannot break the path', () => {
    const url = buildMethodUrl({ ...credentials, apiTokenInstance: 'a/b?c' }, 'getStateInstance')
    expect(url).toBe(`${BASE}/getStateInstance/a%2Fb%3Fc`)
  })

  it('validates api url', () => {
    expect(isValidApiUrl('https://3100.api.green-api.com')).toBe(true)
    expect(isValidApiUrl('3100.api.green-api.com')).toBe(false)
    expect(isValidApiUrl('ftp://example.com')).toBe(false)
    expect(isValidApiUrl('')).toBe(false)
  })

  it('suggests api url from the first four digits of idInstance', () => {
    expect(suggestApiUrl('3100123456')).toBe('https://3100.api.green-api.com')
    expect(suggestApiUrl('7105')).toBe('https://7105.api.green-api.com')
    expect(suggestApiUrl('310')).toBeNull()
    expect(suggestApiUrl('abc12345')).toBeNull()
  })
})

describe('createGreenApiClient', () => {
  it('getStateInstance sends GET and returns the state', async () => {
    const fetch = mockFetch(jsonResponse({ stateInstance: 'authorized' }))
    const client = createGreenApiClient(credentials, { fetch })

    await expect(client.getStateInstance()).resolves.toEqual({ stateInstance: 'authorized' })
    const { url, init } = lastCall(fetch)
    expect(url).toBe(`${BASE}/getStateInstance/token-abc`)
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
  })

  it('sendMessage posts chatId and message as JSON', async () => {
    const fetch = mockFetch(jsonResponse({ idMessage: '1763115112345' }))
    const client = createGreenApiClient(credentials, { fetch })

    await expect(client.sendMessage('10000000', 'Привет')).resolves.toEqual({ idMessage: '1763115112345' })
    const { url, init } = lastCall(fetch)
    expect(url).toBe(`${BASE}/sendMessage/token-abc`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({ chatId: '10000000', message: 'Привет' })
  })

  it('checkAccount sends phoneNumber as a number and returns chatId', async () => {
    const fetch = mockFetch(jsonResponse({ exist: true, chatId: '10000000', fromCache: true }))
    const client = createGreenApiClient(credentials, { fetch })

    await expect(client.checkAccount('79991234567')).resolves.toEqual({ exist: true, chatId: '10000000' })
    const { url, init } = lastCall(fetch)
    expect(url).toBe(`${BASE}/checkAccount/token-abc`)
    expect(JSON.parse(String(init.body))).toEqual({ phoneNumber: 79991234567 })
  })

  it('checkAccount reports { status: false, reason } as an error', async () => {
    const fetch = mockFetch(jsonResponse({ status: false, reason: 'instance is starting or not authorized' }))
    const client = createGreenApiClient(credentials, { fetch })

    const error = await client.checkAccount('79991234567').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GreenApiError)
    expect(describeError(error)).toMatch(/не авторизован/)
  })

  it('receiveNotification passes receiveTimeout and returns the notification', async () => {
    const body = { typeWebhook: 'incomingMessageReceived' }
    const fetch = mockFetch(jsonResponse({ receiptId: 7, body }))
    const client = createGreenApiClient(credentials, { fetch })

    await expect(client.receiveNotification(20)).resolves.toEqual({ receiptId: 7, body })
    const { url, init } = lastCall(fetch)
    expect(url).toBe(`${BASE}/receiveNotification/token-abc?receiveTimeout=20`)
    expect(init.method).toBe('GET')
  })

  it('receiveNotification clamps receiveTimeout to 5..60 seconds', async () => {
    const fetch = mockFetch(jsonResponse(null), jsonResponse(null))
    const client = createGreenApiClient(credentials, { fetch })

    await client.receiveNotification(1)
    expect(lastCall(fetch).url).toMatch(/receiveTimeout=5$/)
    await client.receiveNotification(600)
    expect(lastCall(fetch).url).toMatch(/receiveTimeout=60$/)
  })

  it('receiveNotification returns null for an empty queue (null or empty body)', async () => {
    const fetch = mockFetch(jsonResponse(null), new Response('', { status: 200 }))
    const client = createGreenApiClient(credentials, { fetch })

    await expect(client.receiveNotification(5)).resolves.toBeNull()
    await expect(client.receiveNotification(5)).resolves.toBeNull()
  })

  it('deleteNotification sends DELETE with receiptId in the path', async () => {
    const fetch = mockFetch(jsonResponse({ result: true, reason: '' }), jsonResponse({ result: false }))
    const client = createGreenApiClient(credentials, { fetch })

    await expect(client.deleteNotification(1234567)).resolves.toBe(true)
    const { url, init } = lastCall(fetch)
    expect(url).toBe(`${BASE}/deleteNotification/token-abc/1234567`)
    expect(init.method).toBe('DELETE')
    await expect(client.deleteNotification(1)).resolves.toBe(false)
  })

  describe('errors', () => {
    it('401 with an empty body is an auth error', async () => {
      const client = createGreenApiClient(credentials, { fetch: mockFetch(new Response('', { status: 401 })) })
      const error = await client.getStateInstance().catch((e: unknown) => e)

      expect(error).toBeInstanceOf(GreenApiError)
      expect(error).toMatchObject({ kind: 'http', status: 401, isAuthError: true })
      expect(describeError(error)).toBe('Неверный apiTokenInstance.')
    })

    it('403 with an HTML body is an auth error and the HTML is not shown', async () => {
      const html = '<html><head><title>403 Forbidden</title></head></html>'
      const client = createGreenApiClient(credentials, { fetch: mockFetch(new Response(html, { status: 403 })) })
      const error = await client.getStateInstance().catch((e: unknown) => e)

      expect(error).toMatchObject({ status: 403, isAuthError: true })
      expect(describeError(error)).toBe('Доступ запрещён. Проверьте idInstance и API URL.')
    })

    it('400 keeps the server message', async () => {
      const client = createGreenApiClient(credentials, {
        fetch: mockFetch(new Response('Validation failed', { status: 400 })),
      })
      const error = await client.sendMessage('1', 'x').catch((e: unknown) => e)

      expect(error).toMatchObject({ kind: 'http', status: 400, isAuthError: false })
      expect(describeError(error)).toBe('Ошибка GREEN-API (400): Validation failed')
    })

    it('explains the webhookUrl conflict', async () => {
      const message =
        'Message cannot be received because custom webhook url is set. Go to cabinet, clear webhook url for instance'
      const client = createGreenApiClient(credentials, { fetch: mockFetch(new Response(message, { status: 400 })) })
      const error = await client.receiveNotification(5).catch((e: unknown) => e)

      expect(describeError(error)).toMatch(/webhookUrl/)
    })

    it('wraps network failures', async () => {
      const client = createGreenApiClient(credentials, { fetch: mockFetch(new TypeError('Failed to fetch')) })
      const error = await client.getStateInstance().catch((e: unknown) => e)

      expect(error).toMatchObject({ kind: 'network', status: 0, isAuthError: false })
      expect(describeError(error)).toMatch(/Нет связи/)
    })

    it('rejects a 200 response without the expected fields', async () => {
      const client = createGreenApiClient(credentials, { fetch: mockFetch(jsonResponse({ foo: 1 })) })
      await expect(client.sendMessage('1', 'x')).rejects.toMatchObject({ kind: 'response' })
    })

    it('rejects invalid JSON', async () => {
      const client = createGreenApiClient(credentials, { fetch: mockFetch(new Response('not json', { status: 200 })) })
      await expect(client.getStateInstance()).rejects.toMatchObject({ kind: 'response' })
    })

    it('times out a hanging request', async () => {
      vi.useFakeTimers()
      try {
        const fetch = vi.fn<FetchLike>(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
            }),
        )
        const client = createGreenApiClient(credentials, { fetch, requestTimeoutMs: 1000 })
        const result = client.getStateInstance().catch((e: unknown) => e)
        await vi.advanceTimersByTimeAsync(1000)

        const error = await result
        expect(error).toMatchObject({ kind: 'timeout' })
        expect(describeError(error)).toMatch(/не ответил/)
      } finally {
        vi.useRealTimers()
      }
    })

    it('rethrows the abort when the caller cancels', async () => {
      const controller = new AbortController()
      const fetch = vi.fn<FetchLike>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      )
      const client = createGreenApiClient(credentials, { fetch })
      const result = client.receiveNotification(20, controller.signal).catch((e: unknown) => e)
      controller.abort()

      const error = await result
      expect(error).not.toBeInstanceOf(GreenApiError)
      expect(error).toMatchObject({ name: 'AbortError' })
    })
  })
})

describe('describeError', () => {
  it('handles unknown values', () => {
    expect(describeError(new Error('x'))).toMatch(/Неизвестная ошибка/)
  })
})

describe('describeInstanceState', () => {
  it('returns null only for authorized', () => {
    expect(describeInstanceState('authorized')).toBeNull()
    expect(describeInstanceState('notAuthorized')).toMatch(/QR-код/)
    expect(describeInstanceState('starting')).toMatch(/запускается/)
    expect(describeInstanceState('somethingNew')).toMatch(/somethingNew/)
  })
})
