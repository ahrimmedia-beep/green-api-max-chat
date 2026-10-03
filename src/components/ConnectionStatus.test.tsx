import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectionStatus } from './ConnectionStatus'

describe('ConnectionStatus', () => {
  it.each([
    [{ state: 'standby' } as const, 'Сообщения получает другая вкладка'],
    [{ state: 'connecting' } as const, 'Подключение…'],
    [{ state: 'listening' } as const, 'Получение сообщений включено'],
    [
      { state: 'retrying', error: 'Нет связи с GREEN-API.', retryInMs: 4000 } as const,
      'Нет связи с GREEN-API. Повтор через 4 с.',
    ],
    [{ state: 'stopped', error: 'Неверный apiTokenInstance.' } as const, 'Получение остановлено. Неверный apiTokenInstance.'],
  ])('shows %o', (status, text) => {
    render(<ConnectionStatus status={status} />)
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })
})
