import { useId, useState, type FormEvent } from 'react'
import { isValidApiUrl, normalizeApiUrl, suggestApiUrl, type Credentials } from '../api/greenApi'

interface LoginFormProps {
  /** Проверяет данные и выполняет вход; при ошибке отклоняется с Error, текст которого показывается пользователю. */
  onLogin: (credentials: Credentials, remember: boolean) => Promise<void>
  /** Запуск демо-режима без аккаунта. Кнопка показывается, только если передан обработчик. */
  onDemo?: () => Promise<void>
}

type FieldErrors = Partial<Record<keyof Credentials, string>>

function validate(values: Credentials): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.idInstance) errors.idInstance = 'Введите idInstance'
  else if (!/^\d+$/.test(values.idInstance)) errors.idInstance = 'idInstance состоит только из цифр'
  if (!values.apiTokenInstance) errors.apiTokenInstance = 'Введите apiTokenInstance'
  if (!values.apiUrl) errors.apiUrl = 'Введите API URL'
  else if (!isValidApiUrl(values.apiUrl)) errors.apiUrl = 'Адрес должен начинаться с https://'
  return errors
}

export function LoginForm({ onLogin, onDemo }: LoginFormProps) {
  const id = useId()
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setApiTokenInstance] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  // Пока пользователь сам не правил API URL, подставляем его по idInstance.
  const [apiUrlEdited, setApiUrlEdited] = useState(false)
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleIdChange = (value: string) => {
    setIdInstance(value)
    if (!apiUrlEdited) setApiUrl(suggestApiUrl(value) ?? '')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values: Credentials = {
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
      apiUrl: normalizeApiUrl(apiUrl),
    }
    const fieldErrors = validate(values)
    setErrors(fieldErrors)
    setSubmitError(null)
    if (Object.keys(fieldErrors).length > 0) return

    setBusy(true)
    try {
      await onLogin(values, remember)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось войти')
      setBusy(false)
    }
  }

  const handleDemo = async () => {
    if (!onDemo) return
    setSubmitError(null)
    setBusy(true)
    try {
      await onDemo()
    } catch {
      setSubmitError('Не удалось запустить демо-режим. Обновите страницу и попробуйте снова.')
      setBusy(false)
    }
  }

  const fieldProps = (name: keyof Credentials, noteId?: string) => ({
    id: `${id}-${name}`,
    name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${id}-${name}-error` : noteId,
  })

  const fieldError = (name: keyof Credentials) =>
    errors[name] ? (
      <span className="field__error" id={`${id}-${name}-error`}>
        {errors[name]}
      </span>
    ) : null

  return (
    <main className="login">
      <form className="login__card" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
        <div className="login__brand" aria-hidden="true">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="48" height="48" />
        </div>
        <h1 className="login__title" id={`${id}-title`}>
          Вход в MAX через GREEN-API
        </h1>
        <p className="login__hint">
          Данные инстанса есть в{' '}
          <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">
            личном кабинете GREEN-API
          </a>
          .
        </p>

        <div className="field">
          <label className="field__label" htmlFor={`${id}-idInstance`}>
            idInstance
          </label>
          <input
            {...fieldProps('idInstance')}
            className="field__input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="310012345678"
            value={idInstance}
            onChange={(e) => handleIdChange(e.target.value)}
            disabled={busy}
          />
          {fieldError('idInstance')}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${id}-apiTokenInstance`}>
            apiTokenInstance
          </label>
          <input
            {...fieldProps('apiTokenInstance')}
            className="field__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiTokenInstance}
            onChange={(e) => setApiTokenInstance(e.target.value)}
            disabled={busy}
          />
          {fieldError('apiTokenInstance')}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${id}-apiUrl`}>
            API URL
          </label>
          <input
            {...fieldProps('apiUrl', `${id}-apiUrl-note`)}
            className="field__input"
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://3100.api.green-api.com"
            value={apiUrl}
            onChange={(e) => {
              setApiUrl(e.target.value)
              setApiUrlEdited(true)
            }}
            disabled={busy}
          />
          {fieldError('apiUrl') ?? (
            <span className="field__note" id={`${id}-apiUrl-note`}>
              Подставляется по idInstance. Если в кабинете указан другой apiUrl, вставьте его.
            </span>
          )}
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={busy} />
          <span>Запомнить на этом устройстве</span>
        </label>

        {submitError && (
          <p className="login__error" role="alert">
            {submitError}
          </p>
        )}

        <button className="button button--primary login__submit" type="submit" disabled={busy}>
          {busy ? 'Проверяем…' : 'Войти'}
        </button>

        {onDemo && (
          <div className="login__demo">
            <span className="login__divider">или</span>
            <button className="button button--secondary" type="button" onClick={handleDemo} disabled={busy}>
              Попробовать без аккаунта
            </button>
            <p className="login__demo-note">
              Демо-режим: собеседник и ответы имитируются в браузере, запросов к GREEN-API нет.
            </p>
          </div>
        )}
      </form>
    </main>
  )
}
