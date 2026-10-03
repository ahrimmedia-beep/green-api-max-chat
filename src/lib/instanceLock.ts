/**
 * Одна вкладка получает уведомления: у инстанса GREEN-API одна очередь, и две вкладки забирали бы
 * уведомления друг у друга. Используется Web Locks API: блокировку с именем инстанса держит вкладка,
 * которая опрашивает очередь; остальные ждут и подхватывают работу, когда эта вкладка закрывается.
 * https://developer.mozilla.org/docs/Web/API/Web_Locks_API
 */

export interface LockRequester {
  request<T>(name: string, options: LockOptions, callback: (lock: Lock | null) => T): Promise<Awaited<T>>
}

/** navigator.locks или null, если API нет (старый браузер, небезопасный контекст). */
export function getLockManager(): LockRequester | null {
  try {
    return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null
  } catch {
    return null
  }
}

export function receiveLockName(idInstance: string): string {
  return `green-api-max-chat:receive:${idInstance}`
}

/**
 * Выполняет task, удерживая блокировку. Если блокировку держит другая вкладка, вызывает onWaiting
 * и ждёт её освобождения. task должна завершиться по signal: тогда блокировка освобождается.
 * Если signal сработал во время ожидания, task не запускается.
 */
export async function runWithLock(
  locks: LockRequester,
  name: string,
  signal: AbortSignal,
  onWaiting: () => void,
  task: () => Promise<void>,
): Promise<void> {
  if (signal.aborted) return
  const acquired = await locks.request(name, { ifAvailable: true }, async (lock) => {
    if (!lock) return false
    await task()
    return true
  })
  if (acquired || signal.aborted) return

  onWaiting()
  try {
    await locks.request(name, { signal }, () => task())
  } catch (error) {
    if (signal.aborted) return
    throw error
  }
}
