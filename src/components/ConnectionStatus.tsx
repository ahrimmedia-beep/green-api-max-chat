import type { PollingStatus } from '../api/polling'

function describe(status: PollingStatus): string {
  switch (status.state) {
    case 'connecting':
      return 'Подключение…'
    case 'listening':
      return 'Получение сообщений включено'
    case 'retrying':
      return `${status.error} Повтор через ${Math.ceil(status.retryInMs / 1000)} с.`
    case 'stopped':
      return `Получение остановлено. ${status.error}`
  }
}

export function ConnectionStatus({ status }: { status: PollingStatus }) {
  return (
    <p className={`connection connection--${status.state}`} role="status">
      <span className="connection__dot" aria-hidden="true" />
      <span>{describe(status)}</span>
    </p>
  )
}
