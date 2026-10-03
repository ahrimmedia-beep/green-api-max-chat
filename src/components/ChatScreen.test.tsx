import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GreenApiError } from '../api/greenApi'
import { FakeGreenApi } from '../test/fakeGreenApi'
import { incomingText, outgoingStatus, stateInstanceChanged } from '../test/fixtures'
import { ChatScreen } from './ChatScreen'

const credentials = { idInstance: '3100123456', apiTokenInstance: 'secret', apiUrl: 'https://3100.api.green-api.com' }

function setup(api = new FakeGreenApi()) {
  const user = userEvent.setup()
  const onLogout = vi.fn()
  render(<ChatScreen credentials={credentials} client={api} onLogout={onLogout} />)
  return { api, user, onLogout }
}

async function openChat(user: ReturnType<typeof userEvent.setup>, phone: string) {
  await user.type(screen.getByLabelText('Номер телефона получателя'), phone)
  await user.click(screen.getByRole('button', { name: 'Создать чат' }))
}

function messages() {
  return within(screen.getByRole('log', { name: 'Сообщения' }))
}

describe('ChatScreen', () => {
  it('starts with an empty chat list and listens for notifications', async () => {
    const api = new FakeGreenApi()
    api.receiveNotification.mockResolvedValueOnce(null)
    setup(api)
    expect(screen.getByText(/Чатов пока нет/)).toBeInTheDocument()
    expect(await screen.findByText('Получение сообщений включено')).toBeInTheDocument()
    expect(screen.getByText('Инстанс 3100123456')).toBeInTheDocument()
  })

  describe('new chat', () => {
    it('resolves the phone via CheckAccount and opens the chat', async () => {
      const { api, user } = setup()
      api.checkAccount.mockResolvedValueOnce({ exist: true, chatId: '10000000' })
      await openChat(user, '8 (999) 123-45-67')

      expect(api.checkAccount).toHaveBeenCalledWith('79991234567')
      expect(screen.getByRole('heading', { level: 2, name: '+7 999 123-45-67' })).toBeInTheDocument()
      expect(screen.getByLabelText('Номер телефона получателя')).toHaveValue('')
    })

    it('validates the phone before calling the API', async () => {
      const { api, user } = setup()
      await openChat(user, '12345')

      expect(screen.getByRole('alert')).toHaveTextContent('Неверный номер')
      expect(api.checkAccount).not.toHaveBeenCalled()
    })

    it('reports a number without a MAX account', async () => {
      const { api, user } = setup()
      api.checkAccount.mockResolvedValueOnce({ exist: false, chatId: '' })
      await openChat(user, '+79991234567')

      expect(await screen.findByRole('alert')).toHaveTextContent('На этом номере нет аккаунта MAX')
      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    })

    it('reports API errors', async () => {
      const { api, user } = setup()
      api.checkAccount.mockRejectedValueOnce(new GreenApiError('network', 0, 'Failed to fetch'))
      await openChat(user, '+79991234567')

      expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с GREEN-API')
    })

    it('reuses an existing chat for the same phone without a second check', async () => {
      const { api, user } = setup()
      await openChat(user, '+79991234567')
      await openChat(user, '89991234567')

      expect(api.checkAccount).toHaveBeenCalledTimes(1)
      expect(screen.getAllByRole('button', { name: /\+7 999 123-45-67/ })).toHaveLength(1)
    })
  })

  describe('sending', () => {
    it('shows the message as pending, then sent, and calls SendMessage with the chatId', async () => {
      const { api, user } = setup()
      api.checkAccount.mockResolvedValueOnce({ exist: true, chatId: '10000000' })
      let finishSend: (value: { idMessage: string }) => void = () => {}
      api.sendMessage.mockImplementationOnce(() => new Promise((resolve) => (finishSend = resolve)))
      await openChat(user, '+79991234567')

      await user.type(screen.getByLabelText('Сообщение'), 'Здравствуйте!{Enter}')

      expect(api.sendMessage).toHaveBeenCalledWith('10000000', 'Здравствуйте!')
      expect(messages().getByText('Здравствуйте!')).toBeInTheDocument()
      expect(messages().getByText('Отправляется')).toBeInTheDocument()

      finishSend({ idMessage: 'srv-1' })
      expect(await messages().findByText('Отправлено')).toBeInTheDocument()
      expect(screen.getByText('Вы: Здравствуйте!')).toBeInTheDocument()
    })

    it('marks the message as failed when SendMessage fails', async () => {
      const { api, user } = setup()
      api.sendMessage.mockRejectedValueOnce(new GreenApiError('http', 400, 'Validation failed'))
      await openChat(user, '+79991234567')

      await user.type(screen.getByLabelText('Сообщение'), 'Не дойдёт{Enter}')

      expect(await messages().findByText('Ошибка GREEN-API (400): Validation failed')).toBeInTheDocument()
      expect(messages().getByText('Не отправлено')).toBeInTheDocument()
    })

    it('updates the status from outgoingMessageStatus notifications', async () => {
      const { api, user } = setup()
      api.checkAccount.mockResolvedValueOnce({ exist: true, chatId: '10000000' })
      api.sendMessage.mockResolvedValueOnce({ idMessage: 'srv-42' })
      await openChat(user, '+79991234567')
      await user.type(screen.getByLabelText('Сообщение'), 'Прочитай{Enter}')
      await messages().findByText('Отправлено')

      api.push(outgoingStatus('read', 'srv-42'))

      expect(await messages().findByText('Прочитано')).toBeInTheDocument()
    })
  })

  describe('receiving', () => {
    it('appends an incoming reply to the open chat and deletes every notification', async () => {
      const { api, user } = setup()
      api.checkAccount.mockResolvedValueOnce({ exist: true, chatId: '10000000' })
      await openChat(user, '+79876543210')

      const ignored = api.push(stateInstanceChanged)
      const reply = api.push(incomingText('Ответ из MAX'))

      expect(await messages().findByText('Ответ из MAX')).toBeInTheDocument()
      await waitFor(() => expect(api.queue).toHaveLength(0))
      expect(api.deleteNotification.mock.calls.map(([id]) => id)).toEqual([ignored, reply])
      // Имя контакта из уведомления заменяет номер в заголовке.
      expect(screen.getByRole('heading', { level: 2, name: 'Ходабрыш Пробешёлов' })).toBeInTheDocument()
    })

    it('creates a chat for a new sender with an unread badge', async () => {
      const { api, user } = setup()
      api.push(incomingText('Привет, это новый чат'))

      const item = await screen.findByRole('button', { name: /Ходабрыш Пробешёлов/ })
      expect(within(item).getByText('Привет, это новый чат')).toBeInTheDocument()
      expect(within(item).getByLabelText('Непрочитанных: 1')).toBeInTheDocument()

      await user.click(item)
      expect(messages().getByText('Привет, это новый чат')).toBeInTheDocument()
      expect(within(item).queryByLabelText(/Непрочитанных/)).not.toBeInTheDocument()
    })

    it('shows that receiving stopped on an auth error', async () => {
      const api = new FakeGreenApi()
      api.receiveErrors.push(new GreenApiError('http', 401, ''))
      setup(api)

      expect(await screen.findByText(/Получение остановлено/)).toHaveTextContent('Неверный apiTokenInstance.')
    })
  })

  it('logs out', async () => {
    const { user, onLogout } = setup()
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(onLogout).toHaveBeenCalled()
  })
})
