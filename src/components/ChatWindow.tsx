import { useEffect, useRef } from 'react'
import { formatPhone } from '../lib/phone'
import type { Chat } from '../state/types'
import { Avatar } from './Avatar'
import { BackIcon } from './icons'
import { MessageBubble } from './MessageBubble'
import { MessageInput } from './MessageInput'

interface ChatWindowProps {
  chat: Chat
  onSend: (text: string) => void
  /** Возврат к списку на узком экране. */
  onBack: () => void
}

export function ChatWindow({ chat, onSend, onBack }: ChatWindowProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const phone = chat.phone ? formatPhone(chat.phone) : null
  const lastMessage = chat.messages.at(-1)

  // Прокрутка вниз при открытии чата и каждом новом сообщении.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [chat.chatId, chat.messages.length, lastMessage?.id])

  return (
    <section className="chat" aria-label={`Чат: ${chat.title}`}>
      <header className="chat__header">
        <button className="icon-button chat__back" type="button" onClick={onBack} aria-label="К списку чатов">
          <BackIcon />
        </button>
        <Avatar seed={chat.chatId} title={chat.title} size="lg" />
        <div className="chat__heading">
          <h2 className="chat__title">{chat.title}</h2>
          <p className="chat__subtitle">{phone && phone !== chat.title ? phone : 'MAX'}</p>
        </div>
      </header>

      <div className="chat__messages" ref={listRef}>
        {chat.messages.length === 0 && (
          <p className="chat__empty">Напишите первое сообщение. Ответ появится здесь автоматически.</p>
        )}
        {/* Live-регион рендерится всегда: экранные дикторы объявляют только изменения уже существующего региона. */}
        <ol className="chat__list" role="log" aria-live="polite" aria-label="Сообщения">
          {chat.messages.map((message) => (
            <MessageBubble key={message.localId ?? message.id} message={message} />
          ))}
        </ol>
      </div>

      <MessageInput key={chat.chatId} onSend={onSend} />
    </section>
  )
}
