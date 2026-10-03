import { vi } from 'vitest'
import type { GreenApiClient, ReceivedNotification } from '../api/greenApi'

/**
 * Поддельный GREEN-API для тестов. Очередь уведомлений ведёт себя как настоящая:
 * ReceiveNotification отдаёт первое неудалённое уведомление (FIFO) или ждёт нового,
 * DeleteNotification убирает его по receiptId. Ожидание прерывается через AbortSignal.
 */
export class FakeGreenApi implements GreenApiClient {
  readonly queue: ReceivedNotification[] = []
  /** Ошибки, которые по очереди выбросит ReceiveNotification до обращения к очереди. */
  readonly receiveErrors: unknown[] = []
  readonly deleteErrors: unknown[] = []
  private nextReceiptId = 1
  private nextMessageId = 1
  private waiters: Array<() => void> = []

  getStateInstance = vi.fn<GreenApiClient['getStateInstance']>(async () => ({ stateInstance: 'authorized' }))

  checkAccount = vi.fn<GreenApiClient['checkAccount']>(async (phone) => ({ exist: true, chatId: `chat-${phone}` }))

  sendMessage = vi.fn<GreenApiClient['sendMessage']>(async () => ({ idMessage: `msg-${this.nextMessageId++}` }))

  getContactInfo = vi.fn<GreenApiClient['getContactInfo']>(async () => ({ name: '', contactName: '', avatar: '' }))

  receiveNotification = vi.fn<GreenApiClient['receiveNotification']>(async (_timeout, signal) => {
    const error = this.receiveErrors.shift()
    if (error !== undefined) throw error
    while (this.queue.length === 0) {
      await this.waitForPush(signal)
    }
    return this.queue[0]!
  })

  deleteNotification = vi.fn<GreenApiClient['deleteNotification']>(async (receiptId) => {
    const error = this.deleteErrors.shift()
    if (error !== undefined) throw error
    const index = this.queue.findIndex((n) => n.receiptId === receiptId)
    if (index === -1) return false
    this.queue.splice(index, 1)
    return true
  })

  /** Кладёт уведомление в очередь и возвращает его receiptId. */
  push(body: unknown): number {
    const receiptId = this.nextReceiptId++
    this.queue.push({ receiptId, body })
    const waiters = this.waiters
    this.waiters = []
    waiters.forEach((wake) => wake())
    return receiptId
  }

  private waitForPush(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
      signal?.addEventListener('abort', onAbort, { once: true })
      this.waiters.push(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      })
    })
  }
}
