import { useId, useState, type FormEvent } from 'react'
import { normalizePhone, PHONE_HINT, validatePhone } from '../lib/phone'
import { PlusIcon } from './icons'

interface NewChatFormProps {
  /** Получает номер цифрами (79991234567). При ошибке отклоняется с Error для показа пользователю. */
  onCreate: (phone: string) => Promise<void>
}

export function NewChatForm({ onCreate }: NewChatFormProps) {
  const id = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const phone = normalizePhone(value)
    const problem = validatePhone(phone)
    setError(problem)
    if (problem) return

    setBusy(true)
    try {
      await onCreate(phone)
      setValue('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать чат')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="new-chat" onSubmit={handleSubmit} noValidate>
      <label className="visually-hidden" htmlFor={`${id}-phone`}>
        Номер телефона получателя
      </label>
      <div className="new-chat__row">
        <input
          id={`${id}-phone`}
          className="new-chat__input"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="Номер для нового чата"
          title={PHONE_HINT}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={busy}
        />
        <button className="icon-button icon-button--accent" type="submit" disabled={busy} aria-label="Создать чат" title="Создать чат">
          <PlusIcon />
        </button>
      </div>
      {error && (
        <p className="new-chat__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {busy && <p className="new-chat__status">Проверяем номер в MAX…</p>}
    </form>
  )
}
