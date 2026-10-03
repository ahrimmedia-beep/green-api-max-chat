import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContactInfo } from '../api/greenApi'
import type { Chat } from '../state/types'
import { FakeGreenApi } from '../test/fakeGreenApi'
import { useContactInfo } from './useContactInfo'

function chat(chatId: string, overrides: Partial<Chat> = {}): Chat {
  return {
    chatId,
    phone: null,
    contactName: null,
    senderName: null,
    avatarUrl: null,
    messages: [],
    unread: 0,
    createdAt: 0,
    ...overrides,
  }
}

const info: ContactInfo = { name: 'Анна', contactName: '', avatar: 'https://i.oneme.ru/a' }

describe('useContactInfo', () => {
  it('requests contact info once per new personal chat', async () => {
    const api = new FakeGreenApi()
    api.getContactInfo.mockResolvedValue(info)
    const onInfo = vi.fn()
    const { rerender, unmount } = renderHook(({ chats }) => useContactInfo(api, chats, onInfo), {
      initialProps: { chats: [chat('1')] },
    })
    await waitFor(() => expect(onInfo).toHaveBeenCalledWith('1', info))

    rerender({ chats: [chat('1'), chat('2'), chat('-100500')] })
    await waitFor(() => expect(onInfo).toHaveBeenCalledWith('2', info))

    expect(api.getContactInfo.mock.calls.map(([id]) => id)).toEqual(['1', '2'])
    unmount()
  })

  it('skips chats that already have a name or avatar from a previous session', () => {
    const api = new FakeGreenApi()
    renderHook(() => useContactInfo(api, [chat('1', { contactName: 'Иван' }), chat('2', { avatarUrl: 'x' })], vi.fn()))
    expect(api.getContactInfo).not.toHaveBeenCalled()
  })

  it('ignores failures', async () => {
    const api = new FakeGreenApi()
    api.getContactInfo.mockRejectedValue(new Error('network'))
    const onInfo = vi.fn()
    renderHook(() => useContactInfo(api, [chat('1')], onInfo))

    await waitFor(() => expect(api.getContactInfo).toHaveBeenCalled())
    await Promise.resolve()
    expect(onInfo).not.toHaveBeenCalled()
  })

  it('does not report results after unmount', async () => {
    const api = new FakeGreenApi()
    let resolve: (value: ContactInfo) => void = () => {}
    api.getContactInfo.mockImplementation(() => new Promise((r) => (resolve = r)))
    const onInfo = vi.fn()
    const { unmount } = renderHook(() => useContactInfo(api, [chat('1')], onInfo))
    await waitFor(() => expect(api.getContactInfo).toHaveBeenCalled())
    const signal = api.getContactInfo.mock.lastCall?.[1]

    unmount()
    resolve(info)
    await Promise.resolve()

    expect(signal?.aborted).toBe(true)
    expect(onInfo).not.toHaveBeenCalled()
  })
})
