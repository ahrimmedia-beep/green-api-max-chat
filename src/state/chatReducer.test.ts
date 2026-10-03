import { describe, expect, it } from 'vitest'
import type { IncomingTextEvent, OutgoingStatusEvent } from '../api/notifications'
import { chatReducer, findChatByPhone, initialChatState, sortChats, type ChatAction } from './chatReducer'
import type { ChatState } from './types'

function reduce(actions: ChatAction[], state: ChatState = initialChatState): ChatState {
  return actions.reduce(chatReducer, state)
}

const open = (chatId: string, phone: string | null = null, now = 1000): ChatAction => ({
  type: 'chatOpened',
  chatId,
  phone,
  now,
})

function incoming(overrides: Partial<IncomingTextEvent> = {}): IncomingTextEvent {
  return {
    type: 'incomingText',
    chatId: '10000000',
    chatName: 'Анна',
    phone: '79876543210',
    idMessage: 'in-1',
    text: 'Привет',
    timestamp: 5000,
    ...overrides,
  }
}

function status(idMessage: string, value: OutgoingStatusEvent['status'], description = ''): ChatAction {
  return { type: 'statusReceived', event: { type: 'outgoingStatus', chatId: '10000000', idMessage, status: value, description } }
}

const queue = (localId: string, text = 'Текст', chatId = '10000000'): ChatAction => ({
  type: 'messageQueued',
  chatId,
  localId,
  text,
  timestamp: 2000,
})

describe('chatReducer', () => {
  describe('chats', () => {
    it('opens a new chat, titles it with the formatted phone and makes it active', () => {
      const state = reduce([open('10000000', '79991234567')])
      expect(state.activeChatId).toBe('10000000')
      expect(state.chats).toEqual([
        { chatId: '10000000', title: '+7 999 123-45-67', phone: '79991234567', messages: [], unread: 0, createdAt: 1000 },
      ])
    })

    it('does not duplicate an existing chat', () => {
      const state = reduce([open('1'), open('2'), open('1')])
      expect(state.chats.map((c) => c.chatId)).toEqual(['1', '2'])
      expect(state.activeChatId).toBe('1')
    })

    it('selecting a chat resets its unread counter', () => {
      const state = reduce([open('1'), { type: 'incomingReceived', event: incoming({ chatId: '2' }) }])
      expect(state.chats.find((c) => c.chatId === '2')?.unread).toBe(1)

      const selected = chatReducer(state, { type: 'chatSelected', chatId: '2' })
      expect(selected.activeChatId).toBe('2')
      expect(selected.chats.find((c) => c.chatId === '2')?.unread).toBe(0)
    })

    it('ignores selection of an unknown chat', () => {
      const state = reduce([open('1')])
      expect(chatReducer(state, { type: 'chatSelected', chatId: 'nope' })).toBe(state)
    })

    it('closes the active chat', () => {
      const state = reduce([open('1'), { type: 'chatClosed' }])
      expect(state.activeChatId).toBeNull()
      expect(chatReducer(state, { type: 'chatClosed' })).toBe(state)
    })
  })

  describe('outgoing messages', () => {
    it('adds a pending message, then marks it sent with the server id', () => {
      const queued = reduce([open('10000000'), queue('local-1')])
      expect(queued.chats[0]?.messages).toEqual([
        { id: 'local-1', direction: 'outgoing', text: 'Текст', timestamp: 2000, status: 'pending' },
      ])

      const sent = chatReducer(queued, { type: 'messageSent', chatId: '10000000', localId: 'local-1', idMessage: 'srv-1' })
      expect(sent.chats[0]?.messages[0]).toMatchObject({ id: 'srv-1', status: 'sent' })
    })

    it('marks a message failed with the error text', () => {
      const state = reduce([
        open('10000000'),
        queue('local-1'),
        { type: 'messageFailed', chatId: '10000000', localId: 'local-1', error: 'Нет связи' },
      ])
      expect(state.chats[0]?.messages[0]).toMatchObject({ id: 'local-1', status: 'failed', error: 'Нет связи' })
    })

    it('ignores actions for unknown chats or messages', () => {
      const state = reduce([open('10000000')])
      expect(chatReducer(state, queue('x', 'y', 'unknown'))).toBe(state)
      expect(chatReducer(state, { type: 'messageSent', chatId: '10000000', localId: 'none', idMessage: 'a' })).toBe(state)
    })

    it('applies delivery statuses in order and never goes back', () => {
      const sent = reduce([
        open('10000000'),
        queue('local-1'),
        { type: 'messageSent', chatId: '10000000', localId: 'local-1', idMessage: 'srv-1' },
      ])
      const delivered = chatReducer(sent, status('srv-1', 'delivered'))
      expect(delivered.chats[0]?.messages[0]?.status).toBe('delivered')

      const read = chatReducer(delivered, status('srv-1', 'read'))
      expect(read.chats[0]?.messages[0]?.status).toBe('read')

      expect(chatReducer(read, status('srv-1', 'delivered'))).toBe(read)
      expect(chatReducer(read, status('srv-1', 'failed'))).toBe(read)
    })

    it('marks a sent message failed when MAX reports noAccount or failed', () => {
      const state = reduce([
        open('10000000'),
        queue('local-1'),
        { type: 'messageSent', chatId: '10000000', localId: 'local-1', idMessage: 'srv-1' },
        status('srv-1', 'failed', 'noAccount'),
      ])
      expect(state.chats[0]?.messages[0]).toMatchObject({ status: 'failed', error: 'MAX: noAccount' })
    })

    it('ignores a status for an unknown message', () => {
      const state = reduce([open('10000000')])
      expect(chatReducer(state, status('unknown', 'read'))).toBe(state)
    })
  })

  describe('incoming messages', () => {
    it('creates a chat for a new sender with the contact name', () => {
      const state = reduce([{ type: 'incomingReceived', event: incoming() }])
      expect(state.chats).toEqual([
        {
          chatId: '10000000',
          title: 'Анна',
          phone: '79876543210',
          messages: [{ id: 'in-1', direction: 'incoming', text: 'Привет', timestamp: 5000 }],
          unread: 1,
          createdAt: 5000,
        },
      ])
      expect(state.activeChatId).toBeNull()
    })

    it('falls back to the phone, then the chat id, for the title', () => {
      const byPhone = reduce([{ type: 'incomingReceived', event: incoming({ chatName: '' }) }])
      expect(byPhone.chats[0]?.title).toBe('+7 987 654-32-10')
      const byId = reduce([{ type: 'incomingReceived', event: incoming({ chatName: '', phone: null }) }])
      expect(byId.chats[0]?.title).toBe('10000000')
    })

    it('appends to the matching chat and updates its name', () => {
      const state = reduce([
        open('10000000', '79876543210'),
        queue('local-1'),
        { type: 'incomingReceived', event: incoming() },
      ])
      const chat = state.chats[0]
      expect(chat?.title).toBe('Анна')
      expect(chat?.messages.map((m) => m.direction)).toEqual(['outgoing', 'incoming'])
      expect(chat?.unread).toBe(0)
    })

    it('counts unread messages in inactive chats', () => {
      const state = reduce([
        open('other'),
        { type: 'incomingReceived', event: incoming({ idMessage: 'a' }) },
        { type: 'incomingReceived', event: incoming({ idMessage: 'b' }) },
      ])
      expect(state.chats.find((c) => c.chatId === '10000000')?.unread).toBe(2)
    })

    it('does not duplicate a redelivered notification', () => {
      const once = reduce([{ type: 'incomingReceived', event: incoming() }])
      expect(chatReducer(once, { type: 'incomingReceived', event: incoming() })).toBe(once)
    })
  })
})

describe('selectors', () => {
  it('sorts chats by last activity, newest first', () => {
    const state = reduce([
      open('a', null, 1),
      open('b', null, 2),
      open('c', null, 3),
      { type: 'incomingReceived', event: incoming({ chatId: 'a', timestamp: 10 }) },
    ])
    expect(sortChats(state.chats).map((c) => c.chatId)).toEqual(['a', 'c', 'b'])
  })

  it('finds a chat by phone', () => {
    const state = reduce([open('1', '79991234567')])
    expect(findChatByPhone(state.chats, '79991234567')?.chatId).toBe('1')
    expect(findChatByPhone(state.chats, '70000000000')).toBeUndefined()
  })
})
