import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Credentials } from '../api/greenApi'
import { LoginForm } from './LoginForm'

type OnLogin = (credentials: Credentials, remember: boolean) => Promise<void>

function setup(onLogin = vi.fn<OnLogin>(() => Promise.resolve())) {
  const user = userEvent.setup()
  render(<LoginForm onLogin={onLogin} />)
  return {
    user,
    onLogin,
    id: screen.getByLabelText('idInstance'),
    token: screen.getByLabelText('apiTokenInstance'),
    apiUrl: screen.getByLabelText('API URL'),
    remember: screen.getByLabelText('Запомнить на этом устройстве'),
    submit: screen.getByRole('button', { name: 'Войти' }),
  }
}

describe('LoginForm', () => {
  it('requires all fields', async () => {
    const { user, submit, onLogin } = setup()
    await user.click(submit)

    expect(screen.getByText('Введите idInstance')).toBeInTheDocument()
    expect(screen.getByText('Введите apiTokenInstance')).toBeInTheDocument()
    expect(screen.getByText('Введите API URL')).toBeInTheDocument()
    expect(screen.getByLabelText('idInstance')).toHaveAttribute('aria-invalid', 'true')
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric idInstance and a malformed API URL', async () => {
    const { user, id, token, apiUrl, submit, onLogin } = setup()
    await user.type(id, 'abc')
    await user.type(token, 'token')
    await user.type(apiUrl, 'api.green-api.com')
    await user.click(submit)

    expect(screen.getByText('idInstance состоит только из цифр')).toBeInTheDocument()
    expect(screen.getByText('Адрес должен начинаться с https://')).toBeInTheDocument()
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('fills API URL from idInstance until the user edits it', async () => {
    const { user, id, apiUrl } = setup()
    await user.type(id, '3100123456')
    expect(apiUrl).toHaveValue('https://3100.api.green-api.com')

    await user.clear(apiUrl)
    await user.type(apiUrl, 'https://custom.example.com')
    await user.clear(id)
    await user.type(id, '7105000001')
    expect(apiUrl).toHaveValue('https://custom.example.com')
  })

  it('submits trimmed credentials and the remember flag', async () => {
    const { user, id, token, apiUrl, remember, submit, onLogin } = setup()
    await user.type(id, ' 3100123456 ')
    await user.type(token, '  secret  ')
    await user.clear(apiUrl)
    await user.type(apiUrl, 'https://3100.api.green-api.com/')
    await user.click(remember)
    await user.click(submit)

    expect(onLogin).toHaveBeenCalledWith(
      { idInstance: '3100123456', apiTokenInstance: 'secret', apiUrl: 'https://3100.api.green-api.com' },
      true,
    )
  })

  it('shows the error from onLogin and lets the user try again', async () => {
    const onLogin = vi.fn<OnLogin>().mockRejectedValueOnce(new Error('Неверный apiTokenInstance.'))
    const { user, id, token, submit } = setup(onLogin)
    await user.type(id, '3100123456')
    await user.type(token, 'wrong')
    await user.click(submit)

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный apiTokenInstance.')
    expect(submit).toBeEnabled()
    expect(submit).toHaveTextContent('Войти')
  })

  it('disables the form while checking', async () => {
    let resolve: () => void = () => {}
    const onLogin = vi.fn<OnLogin>(() => new Promise<void>((r) => (resolve = r)))
    const { user, id, token, submit } = setup(onLogin)
    await user.type(id, '3100123456')
    await user.type(token, 'secret')
    await user.click(submit)

    expect(screen.getByRole('button', { name: 'Проверяем…' })).toBeDisabled()
    expect(id).toBeDisabled()
    resolve()
  })
})
