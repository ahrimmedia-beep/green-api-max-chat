import { describe, expect, it } from 'vitest'
import {
  incomingExtendedText,
  incomingGroupText,
  incomingImage,
  incomingQuoted,
  incomingText,
  outgoingApiMessage,
  outgoingStatus,
  stateInstanceChanged,
} from '../test/fixtures'
import { extractText, parseNotification } from './notifications'

const now = () => 1_700_000_000_000

describe('parseNotification', () => {
  it('parses an incoming text message', () => {
    expect(parseNotification(incomingText('Привет'))).toEqual({
      type: 'incomingText',
      chatId: '10000000',
      senderName: 'Ходабрыш Пробешёлов',
      phone: '79876543210',
      idMessage: '126543123451133331119',
      text: 'Привет',
      timestamp: 1763115112000,
    })
  })

  it('parses an extended text message (text with a link)', () => {
    expect(parseNotification(incomingExtendedText)).toMatchObject({
      type: 'incomingText',
      text: 'Документация на сайте https://green-api.com/',
      idMessage: '1763115112345',
    })
  })

  it('parses a quoted message as plain text', () => {
    expect(parseNotification(incomingQuoted)).toMatchObject({ type: 'incomingText', text: 'Цитируем это' })
  })

  it('uses chat name and no phone for group chats', () => {
    expect(parseNotification(incomingGroupText)).toMatchObject({
      type: 'incomingText',
      chatId: '-69876543210123',
      senderName: 'Название группы',
      phone: null,
    })
  })

  it('treats a hidden phone (0) as null', () => {
    const body = incomingText('x', {
      senderData: { chatId: '5', chatName: '', senderName: 'Аня', senderPhoneNumber: 0 },
    })
    expect(parseNotification(body)).toMatchObject({ chatId: '5', senderName: 'Аня', phone: null })
  })

  it('prefers the phone book name, then the profile name, then the chat name', () => {
    const sender = (data: Record<string, unknown>) =>
      parseNotification(incomingText('x', { senderData: { chatId: '5', chatType: 'user', ...data } }))
    expect(sender({ senderContactName: 'Мама', senderName: 'Елена', chatName: 'Елена П.' })).toMatchObject({
      senderName: 'Мама',
    })
    expect(sender({ senderContactName: '', senderName: 'Елена', chatName: 'Елена П.' })).toMatchObject({
      senderName: 'Елена',
    })
    expect(sender({ chatName: 'Елена П.' })).toMatchObject({ senderName: 'Елена П.' })
  })

  it('falls back to the current time when timestamp is missing', () => {
    const body = incomingText('x', { timestamp: undefined })
    expect(parseNotification(body, now)).toMatchObject({ timestamp: now() })
  })

  it('ignores non-text messages', () => {
    expect(parseNotification(incomingImage)).toEqual({
      type: 'ignored',
      reason: 'unsupported message type: imageMessage',
    })
  })

  it('ignores other webhook types', () => {
    expect(parseNotification(stateInstanceChanged)).toMatchObject({ type: 'ignored' })
    expect(parseNotification(outgoingApiMessage)).toMatchObject({ type: 'ignored' })
  })

  it('ignores malformed bodies', () => {
    expect(parseNotification(null)).toMatchObject({ type: 'ignored' })
    expect(parseNotification('text')).toMatchObject({ type: 'ignored' })
    expect(parseNotification({})).toMatchObject({ type: 'ignored' })
    expect(parseNotification({ typeWebhook: 'incomingMessageReceived' })).toMatchObject({ type: 'ignored' })
    expect(parseNotification(incomingText('x', { idMessage: undefined }))).toMatchObject({ type: 'ignored' })
  })

  describe('outgoingMessageStatus', () => {
    it.each([
      ['delivered', 'delivered'],
      ['read', 'read'],
      ['failed', 'failed'],
      ['noAccount', 'failed'],
      ['notInGroup', 'failed'],
    ])('maps %s to %s', (raw, expected) => {
      expect(parseNotification(outgoingStatus(raw))).toMatchObject({
        type: 'outgoingStatus',
        chatId: '10000000',
        idMessage: '115054445839974415',
        status: expected,
      })
    })

    it('keeps the error description', () => {
      expect(parseNotification(outgoingStatus('failed', '1', 'server error'))).toMatchObject({
        status: 'failed',
        description: 'server error',
      })
      expect(parseNotification(outgoingStatus('noAccount', '1'))).toMatchObject({ description: 'noAccount' })
    })

    it('ignores unknown statuses', () => {
      expect(parseNotification(outgoingStatus('mystery'))).toMatchObject({ type: 'ignored' })
    })
  })
})

describe('extractText', () => {
  it('returns null for missing or broken data', () => {
    expect(extractText(undefined)).toBeNull()
    expect(extractText({ typeMessage: 'textMessage' })).toBeNull()
    expect(extractText({ typeMessage: 'extendedTextMessage', extendedTextMessageData: {} })).toBeNull()
  })
})
