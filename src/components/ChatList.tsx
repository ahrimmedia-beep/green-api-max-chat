import { formatListTime } from '../lib/format'
import { chatTitle } from '../state/chatReducer'
import type { Chat } from '../state/types'
import { Avatar } from './Avatar'

interface ChatListProps {
  chats: Chat[]
  activeChatId: string | null
  onSelect: (chatId: string) => void
}

function preview(chat: Chat): string {
  const last = chat.messages.at(-1)
  if (!last) return chat.phone ? 'Новый чат' : ''
  return last.direction === 'outgoing' ? `Вы: ${last.text}` : last.text
}

export function ChatList({ chats, activeChatId, onSelect }: ChatListProps) {
  if (chats.length === 0) {
    return <p className="chat-list__empty">Чатов пока нет. Введите номер получателя, чтобы начать переписку.</p>
  }

  return (
    <ul className="chat-list" aria-label="Чаты">
      {chats.map((chat) => {
        const last = chat.messages.at(-1)
        const active = chat.chatId === activeChatId
        const title = chatTitle(chat)
        return (
          <li key={chat.chatId}>
            <button
              type="button"
              className={`chat-item${active ? ' chat-item--active' : ''}`}
              onClick={() => onSelect(chat.chatId)}
              aria-current={active ? 'true' : undefined}
            >
              <Avatar seed={chat.chatId} title={title} url={chat.avatarUrl} />
              <span className="chat-item__body">
                <span className="chat-item__top">
                  <span className="chat-item__title">{title}</span>
                  {last && <span className="chat-item__time">{formatListTime(last.timestamp)}</span>}
                </span>
                <span className="chat-item__bottom">
                  <span className="chat-item__preview">{preview(chat)}</span>
                  {chat.unread > 0 && (
                    <span className="chat-item__badge" aria-label={`Непрочитанных: ${chat.unread}`}>
                      {chat.unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
