import { describe, expect, it } from 'vitest'
import type { Chat, ChatState } from '../state/types'
import {
  chatStorageKey,
  createChatStorage,
  deserializeChatState,
  INTERRUPTED_SEND_ERROR,
  MAX_MESSAGES_PER_CHAT,
} from './chatStorage'

function chat(chatId: string, overrides: Partial<Chat> = {}): Chat {
  return {
    chatId,
    phone: '79991234567',
    contactName: 'Анна',
    senderName: null,
    avatarUrl: null,
    messages: [],
    unread: 0,
    createdAt: 1,
    ...overrides,
  }
}

const state: ChatState = {
  activeChatId: '1',
  chats: [
    chat('1', {
      unread: 2,
      messages: [
        { id: 'a', direction: 'incoming', text: 'Привет', timestamp: 10 },
        { id: 'b', localId: 'local-1', direction: 'outgoing', text: 'Ответ', timestamp: 20, status: 'read' },
      ],
    }),
  ],
}

describe('chatStorage', () => {
  it('saves and loads chats per instance', () => {
    const storage = createChatStorage()
    storage.save('3100000001', state)

    expect(storage.load('3100000001')).toEqual(state)
    expect(storage.load('3100000002')).toBeNull()
  })

  it('clears only the given instance', () => {
    const storage = createChatStorage()
    storage.save('1', state)
    storage.save('2', state)
    storage.clear('1')

    expect(storage.load('1')).toBeNull()
    expect(storage.load('2')).toEqual(state)
    expect(window.localStorage.getItem(chatStorageKey('1'))).toBeNull()
  })

  it(`keeps only the last ${MAX_MESSAGES_PER_CHAT} messages per chat`, () => {
    const storage = createChatStorage()
    const messages = Array.from({ length: MAX_MESSAGES_PER_CHAT + 50 }, (_, i) => ({
      id: `m${i}`,
      direction: 'incoming' as const,
      text: `#${i}`,
      timestamp: i,
    }))
    storage.save('1', { activeChatId: null, chats: [chat('1', { messages })] })

    const loaded = storage.load('1')?.chats[0]?.messages
    expect(loaded).toHaveLength(MAX_MESSAGES_PER_CHAT)
    expect(loaded?.[0]?.id).toBe('m50')
    expect(loaded?.at(-1)?.id).toBe(`m${MAX_MESSAGES_PER_CHAT + 49}`)
  })

  it('marks messages that were still sending as failed', () => {
    const storage = createChatStorage()
    storage.save('1', {
      activeChatId: null,
      chats: [chat('1', { messages: [{ id: 'l', direction: 'outgoing', text: 'x', timestamp: 1, status: 'pending' }] })],
    })
    expect(storage.load('1')?.chats[0]?.messages[0]).toMatchObject({ status: 'failed', error: INTERRUPTED_SEND_ERROR })
  })

  it('returns null for broken JSON and skips malformed entries', () => {
    const storage = createChatStorage()
    window.localStorage.setItem(chatStorageKey('1'), '{oops')
    expect(storage.load('1')).toBeNull()

    const raw = JSON.stringify({
      activeChatId: 'gone',
      chats: [
        { chatId: '1', messages: [{ id: 'ok', direction: 'incoming', text: 't', timestamp: 1 }, { id: 2 }] },
        { chatId: '', messages: [] },
        'junk',
      ],
    })
    expect(deserializeChatState(raw)).toEqual({
      activeChatId: null,
      chats: [
        {
          chatId: '1',
          phone: null,
          contactName: null,
          senderName: null,
          avatarUrl: null,
          messages: [{ id: 'ok', direction: 'incoming', text: 't', timestamp: 1 }],
          unread: 0,
          createdAt: 0,
        },
      ],
    })
    expect(deserializeChatState('[]')).toBeNull()
  })

  it('does not throw when storage is unavailable or full', () => {
    const storage = createChatStorage(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => storage.save('1', state)).not.toThrow()
    expect(storage.load('1')).toBeNull()
    expect(() => storage.clear('1')).not.toThrow()
  })
})
