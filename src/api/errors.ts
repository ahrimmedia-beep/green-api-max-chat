import { GreenApiError } from './greenApi'

const NOT_AUTHORIZED = 'Инстанс не авторизован в MAX. Отсканируйте QR-код в консоли GREEN-API.'

/** Человекочитаемое описание ошибки для интерфейса. */
export function describeError(error: unknown): string {
  if (!(error instanceof GreenApiError)) {
    return 'Неизвестная ошибка. Попробуйте ещё раз.'
  }
  const details = error.details.toLowerCase()

  switch (error.kind) {
    case 'network':
      return 'Нет связи с GREEN-API. Проверьте интернет и API URL.'
    case 'timeout':
      return 'GREEN-API не ответил вовремя. Попробуйте ещё раз.'
    case 'response':
      if (details.includes('not authorized') || details.includes('starting')) return NOT_AUTHORIZED
      if (details.includes('limit')) return 'Превышен лимит проверок номеров. Попробуйте позже.'
      return `Неожиданный ответ GREEN-API: ${error.details}`
    case 'http':
      break
  }

  if (error.status === 401) return 'Неверный apiTokenInstance.'
  if (error.status === 403) return 'Доступ запрещён. Проверьте idInstance и API URL.'
  if (error.status === 429) return 'Слишком много запросов. Подождите немного.'
  if (details.includes('webhook url')) {
    return 'В настройках инстанса задан webhookUrl. Очистите его в консоли GREEN-API, иначе сообщения не придут.'
  }
  if (details.includes('not authorized') || details.includes('starting')) return NOT_AUTHORIZED
  if (details.includes('suspended')) return 'На аккаунте MAX временные ограничения на отправку.'

  // Тело ошибки бывает HTML-страницей nginx: показываем только код.
  const text = error.details.trim()
  const readable = text && !text.startsWith('<') ? `: ${text.slice(0, 200)}` : ''
  return `Ошибка GREEN-API (${error.status})${readable}`
}

/** Описание состояния инстанса, при котором работать нельзя. null для authorized. */
export function describeInstanceState(state: string): string | null {
  switch (state) {
    case 'authorized':
      return null
    case 'notAuthorized':
      return NOT_AUTHORIZED
    case 'starting':
      return 'Инстанс запускается. Подождите пару минут и войдите снова.'
    case 'blocked':
      return 'Аккаунт MAX заблокирован.'
    case 'suspended':
      return 'На аккаунте MAX временные ограничения на отправку сообщений.'
    case 'pendingPassword':
      return 'Инстанс ждёт пароль двухфакторной аутентификации. Завершите авторизацию в консоли GREEN-API.'
    default:
      return `Инстанс в состоянии «${state}», работа с ним недоступна.`
  }
}
