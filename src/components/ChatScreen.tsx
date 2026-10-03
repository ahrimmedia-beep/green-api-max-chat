import { useCallback, useMemo, useReducer, useRef } from 'react'
import { describeError } from '../api/errors'
import type { ContactInfo, Credentials, GreenApiClient } from '../api/greenApi'
import type { NotificationEvent } from '../api/notifications'
import { useContactInfo } from '../hooks/useContactInfo'
import { useNotificationPolling } from '../hooks/useNotificationPolling'
import { receiveLockName } from '../lib/instanceLock'
import { chatReducer, findChatByPhone, initialChatState, sortChats } from '../state/chatReducer'
import { ChatList } from './ChatList'
import { ChatWindow } from './ChatWindow'
import { ConnectionStatus } from './ConnectionStatus'
import { LogoutIcon } from './icons'
import { NewChatForm } from './NewChatForm'

interface ChatScreenProps {
  credentials: Credentials
  client: GreenApiClient
  onLogout: () => void
}

export function ChatScreen({ credentials, client, onLogout }: ChatScreenProps) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const localIdCounter = useRef(0)

  const handleNotification = useCallback((event: NotificationEvent) => {
    if (event.type === 'incomingText') dispatch({ type: 'incomingReceived', event })
    else if (event.type === 'outgoingStatus') dispatch({ type: 'statusReceived', event })
  }, [])

  const pollingStatus = useNotificationPolling(client, handleNotification, {
    lockName: receiveLockName(credentials.idInstance),
  })

  const handleContactInfo = useCallback((chatId: string, info: ContactInfo) => {
    dispatch({ type: 'contactInfoReceived', chatId, name: info.contactName || info.name, avatarUrl: info.avatar })
  }, [])
  useContactInfo(client, state.chats, handleContactInfo)

  const chats = useMemo(() => sortChats(state.chats), [state.chats])
  const activeChat = state.chats.find((chat) => chat.chatId === state.activeChatId) ?? null

  /** Номер → CheckAccount → chatId. По chatId приходят входящие, поэтому чат создаётся именно по нему. */
  const openChatByPhone = async (phone: string) => {
    const existing = findChatByPhone(state.chats, phone)
    if (existing) {
      dispatch({ type: 'chatSelected', chatId: existing.chatId })
      return
    }
    let result
    try {
      result = await client.checkAccount(phone)
    } catch (error) {
      throw new Error(describeError(error), { cause: error })
    }
    if (!result.exist || !result.chatId) throw new Error('На этом номере нет аккаунта MAX')
    dispatch({ type: 'chatOpened', chatId: result.chatId, phone, now: Date.now() })
  }

  const sendMessage = async (chatId: string, text: string) => {
    localIdCounter.current += 1
    const localId = `local-${Date.now()}-${localIdCounter.current}`
    dispatch({ type: 'messageQueued', chatId, localId, text, timestamp: Date.now() })
    try {
      const { idMessage } = await client.sendMessage(chatId, text)
      dispatch({ type: 'messageSent', chatId, localId, idMessage })
    } catch (error) {
      dispatch({ type: 'messageFailed', chatId, localId, error: describeError(error) })
    }
  }

  return (
    <div className={`layout${activeChat ? ' layout--chat-open' : ''}`}>
      <aside className="sidebar">
        <header className="sidebar__header">
          <h1 className="sidebar__title">Чаты</h1>
          <button className="icon-button" type="button" onClick={onLogout} aria-label="Выйти" title="Выйти">
            <LogoutIcon />
          </button>
        </header>
        <NewChatForm onCreate={openChatByPhone} />
        <nav className="sidebar__chats" aria-label="Список чатов">
          <ChatList
            chats={chats}
            activeChatId={state.activeChatId}
            onSelect={(chatId) => dispatch({ type: 'chatSelected', chatId })}
          />
        </nav>
        <footer className="sidebar__footer">
          <ConnectionStatus status={pollingStatus} />
          <p className="sidebar__instance">Инстанс {credentials.idInstance}</p>
        </footer>
      </aside>

      <main className="conversation">
        {activeChat ? (
          <ChatWindow
            chat={activeChat}
            onSend={(text) => void sendMessage(activeChat.chatId, text)}
            onBack={() => dispatch({ type: 'chatClosed' })}
          />
        ) : (
          <div className="conversation__placeholder">
            <p className="conversation__placeholder-title">Выберите чат или создайте новый</p>
            <p>
              Чтобы ответы приходили, в настройках инстанса должны быть включены уведомления о входящих сообщениях,
              а поле webhookUrl должно быть пустым.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
