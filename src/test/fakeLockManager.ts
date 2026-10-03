import type { LockRequester } from '../lib/instanceLock'

/**
 * Упрощённый Web Locks для тестов: эксклюзивные блокировки, ifAvailable, очередь ожидания и отмена через signal.
 * Одна копия на тест играет роль браузера, общего для нескольких «вкладок».
 */
export class FakeLockManager implements LockRequester {
  private readonly held = new Set<string>()
  private readonly waiters = new Map<string, Array<() => void>>()

  isHeld(name: string): boolean {
    return this.held.has(name)
  }

  async request<T>(name: string, options: LockOptions, callback: (lock: Lock | null) => T): Promise<Awaited<T>> {
    if (this.held.has(name)) {
      if (options.ifAvailable) return await callback(null)
      await this.wait(name, options.signal)
    } else {
      this.held.add(name)
    }
    try {
      return await callback({ name, mode: 'exclusive' } as Lock)
    } finally {
      this.release(name)
    }
  }

  private wait(name: string, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      const queue = this.waiters.get(name) ?? []
      this.waiters.set(name, queue)
      const grant = () => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      const onAbort = () => {
        queue.splice(queue.indexOf(grant), 1)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      queue.push(grant)
    })
  }

  /** Передаёт блокировку следующему в очереди, не отпуская её между ними. */
  private release(name: string) {
    const next = this.waiters.get(name)?.shift()
    if (next) next()
    else this.held.delete(name)
  }
}
