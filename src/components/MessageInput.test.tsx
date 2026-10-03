import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MAX_MESSAGE_LENGTH, MessageInput } from './MessageInput'

function setup() {
  const onSend = vi.fn<(text: string) => void>()
  const user = userEvent.setup()
  render(<MessageInput onSend={onSend} />)
  return {
    onSend,
    user,
    input: screen.getByLabelText('Сообщение'),
    button: screen.getByRole('button', { name: 'Отправить' }),
  }
}

describe('MessageInput', () => {
  it('disables sending for empty or whitespace-only text', async () => {
    const { user, input, button } = setup()
    expect(button).toBeDisabled()
    await user.type(input, '   ')
    expect(button).toBeDisabled()
  })

  it('sends trimmed text on Enter and clears the field', async () => {
    const { user, input, onSend } = setup()
    await user.type(input, '  Привет  {Enter}')

    expect(onSend).toHaveBeenCalledWith('Привет')
    expect(input).toHaveValue('')
  })

  it('inserts a new line on Shift+Enter', async () => {
    const { user, input, onSend } = setup()
    await user.type(input, 'строка 1{Shift>}{Enter}{/Shift}строка 2')

    expect(onSend).not.toHaveBeenCalled()
    expect(input).toHaveValue('строка 1\nстрока 2')
  })

  it('sends with the button', async () => {
    const { user, input, button, onSend } = setup()
    await user.type(input, 'Кнопкой')
    await user.click(button)

    expect(onSend).toHaveBeenCalledWith('Кнопкой')
  })

  it('limits the length to the SendMessage maximum', () => {
    const { input } = setup()
    expect(input).toHaveAttribute('maxLength', String(MAX_MESSAGE_LENGTH))
  })
})
