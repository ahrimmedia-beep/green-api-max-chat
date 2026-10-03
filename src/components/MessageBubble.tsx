import { formatTime } from '../lib/format'
import type { ChatMessage, MessageStatus } from '../state/types'
import { AlertIcon, CheckIcon, ClockIcon, DoubleCheckIcon } from './icons'

const STATUS_LABEL: Record<MessageStatus, string> = {
  pending: 'Отправляется',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не отправлено',
}

function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'pending':
      return <ClockIcon width={14} height={14} />
    case 'sent':
      return <CheckIcon width={16} height={16} />
    case 'delivered':
    case 'read':
      return <DoubleCheckIcon width={18} height={16} />
    case 'failed':
      return <AlertIcon width={14} height={14} />
  }
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const outgoing = message.direction === 'outgoing'
  const status = message.status

  return (
    <li className={`message message--${message.direction}${status === 'failed' ? ' message--failed' : ''}`}>
      <div className="message__bubble">
        <p className="message__text">{message.text}</p>
        <span className="message__meta">
          <time dateTime={new Date(message.timestamp).toISOString()}>{formatTime(message.timestamp)}</time>
          {outgoing && status && (
            <span className={`message__status message__status--${status}`} title={STATUS_LABEL[status]}>
              <StatusIcon status={status} />
              <span className="visually-hidden">{STATUS_LABEL[status]}</span>
            </span>
          )}
        </span>
      </div>
      {status === 'failed' && <p className="message__error">{message.error ?? STATUS_LABEL.failed}</p>}
    </li>
  )
}
