import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { GreenApiError, type Credentials } from './api/greenApi'
import { createDemoSession } from './demo/demoServer'
import { createCredentialsStorage } from './lib/credentialsStorage'
import { FakeGreenApi } from './test/fakeGreenApi'

const credentials: Credentials = {
  idInstance: '3100123456',
  apiTokenInstance: 'secret',
  apiUrl: 'https://3100.api.green-api.com',
}

function setup({ api = new FakeGreenApi(), storage = createCredentialsStorage() } = {}) {
  const createClient = vi.fn<(credentials: Credentials) => FakeGreenApi>(() => api)
  const user = userEvent.setup()
  render(<App createClient={createClient} storage={storage} />)
  return { api, storage, createClient, user }
}

async function login(user: ReturnType<typeof userEvent.setup>, { remember = false } = {}) {
  await user.type(screen.getByLabelText('idInstance'), credentials.idInstance)
  await user.type(screen.getByLabelText('apiTokenInstance'), credentials.apiTokenInstance)
  if (remember) await user.click(screen.getByLabelText('Запомнить на этом устройстве'))
  await user.click(screen.getByRole('button', { name: 'Войти' }))
}

describe('App', () => {
  it('validates credentials with GetStateInstance and opens the chat screen', async () => {
    const { api, createClient, user, storage } = setup()
    await login(user)

    expect(createClient).toHaveBeenCalledWith(credentials)
    expect(api.getStateInstance).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Чаты' })).toBeInTheDocument()
    expect(storage.load()).toBeNull()
  })

  it('shows a clear error for a wrong token', async () => {
    const api = new FakeGreenApi()
    api.getStateInstance.mockRejectedValueOnce(new GreenApiError('http', 401, ''))
    const { user } = setup({ api })
    await login(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный apiTokenInstance.')
    expect(screen.queryByRole('heading', { name: 'Чаты' })).not.toBeInTheDocument()
  })

  it('does not let in an instance that is not authorized in MAX', async () => {
    const api = new FakeGreenApi()
    api.getStateInstance.mockResolvedValueOnce({ stateInstance: 'notAuthorized' })
    const { user } = setup({ api })
    await login(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Инстанс не авторизован в MAX')
  })

  it('remembers credentials only when asked and forgets them on logout', async () => {
    const { user, storage } = setup()
    await login(user, { remember: true })
    await screen.findByRole('heading', { name: 'Чаты' })
    expect(storage.load()).toEqual(credentials)

    await user.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument()
    expect(storage.load()).toBeNull()
  })

  it('opens the chat screen straight away with saved credentials', () => {
    const storage = createCredentialsStorage()
    storage.save(credentials)
    const { createClient } = setup({ storage })

    expect(screen.getByRole('heading', { name: 'Чаты' })).toBeInTheDocument()
    expect(createClient).toHaveBeenCalledWith(credentials)
  })

  describe('demo mode', () => {
    function setupDemo(storage = createCredentialsStorage()) {
      const user = userEvent.setup()
      const createClient = vi.fn<(credentials: Credentials) => FakeGreenApi>(() => new FakeGreenApi())
      render(
        <App
          createClient={createClient}
          storage={storage}
          createDemoSession={async () =>
            createDemoSession({ replyDelayMs: () => 50, deliveredDelayMs: 10, maxWaitMs: 100 })
          }
        />,
      )
      return { user, createClient }
    }

    it('runs the whole flow without an account: chat, send, statuses, reply', async () => {
      const { user, createClient } = setupDemo()
      await user.click(screen.getByRole('button', { name: 'Попробовать без аккаунта' }))

      expect(await screen.findByText('Демо-режим')).toBeInTheDocument()
      expect(createClient).not.toHaveBeenCalled()

      await user.type(screen.getByLabelText('Номер телефона получателя'), '+7 999 123-45-67')
      await user.click(screen.getByRole('button', { name: 'Создать чат' }))
      await user.type(await screen.findByLabelText('Сообщение'), 'Привет из демо{Enter}')

      const log = screen.getByRole('log', { name: 'Сообщения' })
      expect(within(log).getByText('Привет из демо')).toBeInTheDocument()
      await waitFor(() => expect(within(log).getAllByRole('listitem')).toHaveLength(2), { timeout: 3000 })
      expect(within(log).getByText('Прочитано')).toBeInTheDocument()
    })

    it('does not touch remembered credentials on logout', async () => {
      const storage = createCredentialsStorage()
      const { user } = setupDemo(storage)
      await user.click(screen.getByRole('button', { name: 'Попробовать без аккаунта' }))
      await screen.findByText('Демо-режим')
      storage.save(credentials)

      await user.click(screen.getByRole('button', { name: 'Выйти' }))

      expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument()
      expect(storage.load()).toEqual(credentials)
    })

    it('shows an error if the demo module fails to load', async () => {
      const user = userEvent.setup()
      render(<App createDemoSession={() => Promise.reject(new Error('chunk failed'))} />)
      await user.click(screen.getByRole('button', { name: 'Попробовать без аккаунта' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось запустить демо-режим')
      expect(screen.getByRole('button', { name: 'Попробовать без аккаунта' })).toBeEnabled()
    })
  })

  it('does not show the demo badge for a real account', async () => {
    const { user } = setup()
    await login(user)
    await screen.findByRole('heading', { name: 'Чаты' })
    expect(screen.queryByText('Демо-режим')).not.toBeInTheDocument()
  })

  it('stops polling after logout', async () => {
    const { api, user } = setup()
    await login(user)
    await waitFor(() => expect(api.receiveNotification).toHaveBeenCalled())
    const signal = api.receiveNotification.mock.lastCall?.[1]

    await user.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(signal?.aborted).toBe(true)
  })
})
