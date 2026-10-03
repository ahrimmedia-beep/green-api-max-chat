import { useEffect, useRef } from 'react'
import type { ContactInfo, GreenApiClient } from '../api/greenApi'
import type { Chat } from '../state/types'

/** Групповые chatId отрицательные; GetContactInfo для групп не работает. */
function isPersonalChat(chatId: string): boolean {
  return !chatId.startsWith('-')
}

/** Нужен ли запрос: имя или аватар из GetContactInfo ещё не получены (в том числе в прошлой сессии). */
function needsContactInfo(chat: Chat): boolean {
  return isPersonalChat(chat.chatId) && chat.contactName === null && chat.avatarUrl === null
}

/**
 * Подтягивает имя и аватар собеседника через GetContactInfo для каждого нового личного чата.
 * Один запрос на chatId за сессию. Ошибки молча игнорируются: остаются имя из уведомления и номер,
 * на отправку и получение сообщений это не влияет.
 */
export function useContactInfo(
  client: Pick<GreenApiClient, 'getContactInfo'> | null,
  chats: readonly Chat[],
  onInfo: (chatId: string, info: ContactInfo) => void,
): void {
  const requested = useRef(new Set<string>())
  const controllerRef = useRef<AbortController | null>(null)
  const onInfoRef = useRef(onInfo)

  useEffect(() => {
    onInfoRef.current = onInfo
  }, [onInfo])

  // Один AbortController на клиента: новые чаты не отменяют уже идущие запросы.
  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    requested.current = new Set()
    return () => controller.abort()
  }, [client])

  const pendingKey = chats
    .filter(needsContactInfo)
    .map((chat) => chat.chatId)
    .join(',')

  useEffect(() => {
    const controller = controllerRef.current
    if (!client || !controller || !pendingKey) return
    for (const chatId of pendingKey.split(',')) {
      if (requested.current.has(chatId)) continue
      requested.current.add(chatId)
      client.getContactInfo(chatId, controller.signal).then(
        (info) => {
          if (!controller.signal.aborted) onInfoRef.current(chatId, info)
        },
        () => {
          // Имя и аватар необязательны: остаются запасные варианты.
        },
      )
    }
  }, [client, pendingKey])
}
