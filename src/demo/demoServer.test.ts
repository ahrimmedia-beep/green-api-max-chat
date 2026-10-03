import { describe, expect, it } from 'vitest'
import { parseNotification } from '../api/notifications'
import { createDemoFetch, createDemoSession, DEMO_CREDENTIALS, demoChatId } from './demoServer'
import { createGreenApiClient } from '../api/greenApi'

const fast = { replyDelayMs: () => 30, deliveredDelayMs: 5, maxWaitMs: 200 }

async function receiveAll(client: ReturnType<typeof createDemoSession>['client'], count: number) {
  const events = []
  while (events.length < count) {
    const notification = await client.receiveNotification(5)
    if (!notification) continue
    events.push(parseNotification(notification.body))
    await client.deleteNotification(notification.receiptId)
  }
  return events
}

describe('demo GREEN-API', () => {
  it('works through the real client: login passes and any number is in MAX', async () => {
    const { client, credentials } = createDemoSession(fast)
    expect(credentials).toBe(DEMO_CREDENTIALS)

    await expect(client.getStateInstance()).resolves.toEqual({ stateInstance: 'authorized' })
    const account = await client.checkAccount('79991234567')
    expect(account).toEqual({ exist: true, chatId: demoChatId('79991234567') })
    expect(account.chatId).toMatch(/^\d{8}$/)
  })

  it('returns a stable chatId per phone and a contact name', async () => {
    const { client } = createDemoSession(fast)
    expect(demoChatId('79991234567')).toBe(demoChatId('79991234567'))
    expect(demoChatId('79991234567')).not.toBe(demoChatId('79991234568'))

    const { chatId } = await client.checkAccount('79991234567')
    const info = await client.getContactInfo(chatId)
    expect(info.name).not.toBe('')
    expect(info.avatar).toBe('')
  })

  it('delivers, reads and replies to a sent message', async () => {
    const { client } = createDemoSession(fast)
    const { chatId } = await client.checkAccount('79991234567')
    const { idMessage } = await client.sendMessage(chatId, 'Привет')

    const events = await receiveAll(client, 3)

    expect(events[0]).toMatchObject({ type: 'outgoingStatus', idMessage, status: 'delivered', chatId })
    expect(events[1]).toMatchObject({ type: 'outgoingStatus', idMessage, status: 'read' })
    expect(events[2]).toMatchObject({ type: 'incomingText', chatId, phone: '79991234567' })
    expect(events[2]?.type === 'incomingText' && events[2].text).toBeTruthy()
  })

  it('returns null when nothing arrives within the wait time', async () => {
    const { client } = createDemoSession(fast)
    await expect(client.receiveNotification(5)).resolves.toBeNull()
  })

  it('keeps a notification until it is deleted', async () => {
    const { client } = createDemoSession(fast)
    await client.sendMessage('10000001', 'x')
    const first = await client.receiveNotification(5)
    const again = await client.receiveNotification(5)
    expect(again?.receiptId).toBe(first?.receiptId)

    await expect(client.deleteNotification(first!.receiptId)).resolves.toBe(true)
    await expect(client.deleteNotification(first!.receiptId)).resolves.toBe(false)
  })

  it('cancels a waiting request on abort', async () => {
    const { client } = createDemoSession({ ...fast, maxWaitMs: 10_000 })
    const controller = new AbortController()
    const pending = client.receiveNotification(60, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects other instances like the real API', async () => {
    const client = createGreenApiClient({ ...DEMO_CREDENTIALS, idInstance: '1' }, { fetch: createDemoFetch(fast) })
    await expect(client.getStateInstance()).rejects.toMatchObject({ status: 403 })
  })
})
