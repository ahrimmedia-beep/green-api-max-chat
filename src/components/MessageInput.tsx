import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { SendIcon } from './icons'

/** Ограничение SendMessage: https://green-api.com/v3/docs/api/sending/SendMessage/ */
export const MAX_MESSAGE_LENGTH = 4000

interface MessageInputProps {
  onSend: (text: string) => void
}

export function MessageInput({ onSend }: MessageInputProps) {
  const id = useId()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim().length > 0

  const submit = () => {
    const value = text.trim()
    if (!value) return
    onSend(value)
    setText('')
    textareaRef.current?.focus()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submit()
  }

  // Enter отправляет, Shift+Enter переносит строку. Во время набора через IME Enter не перехватываем.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <label className="visually-hidden" htmlFor={`${id}-text`}>
        Сообщение
      </label>
      <textarea
        ref={textareaRef}
        id={`${id}-text`}
        className="composer__input"
        rows={1}
        placeholder="Сообщение"
        maxLength={MAX_MESSAGE_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <button className="composer__send" type="submit" disabled={!canSend} aria-label="Отправить" title="Отправить">
        <SendIcon />
      </button>
    </form>
  )
}
