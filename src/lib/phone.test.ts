import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone, validatePhone } from './phone'

describe('normalizePhone', () => {
  it.each([
    ['+7 (999) 123-45-67', '79991234567'],
    ['8 999 123 45 67', '79991234567'],
    ['79991234567', '79991234567'],
    ['+375 29 123-45-67', '375291234567'],
    ['  ', ''],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })
})

describe('validatePhone', () => {
  it('accepts Russian and Belarusian numbers', () => {
    expect(validatePhone('79991234567')).toBeNull()
    expect(validatePhone('375291234567')).toBeNull()
  })

  it('rejects empty, short and unsupported numbers', () => {
    expect(validatePhone('')).toBe('Введите номер телефона')
    expect(validatePhone('7999123')).toMatch(/Неверный номер/)
    expect(validatePhone('380501234567')).toMatch(/Неверный номер/)
  })
})

describe('formatPhone', () => {
  it('formats known countries and falls back to +digits', () => {
    expect(formatPhone('79991234567')).toBe('+7 999 123-45-67')
    expect(formatPhone('375291234567')).toBe('+375 29 123-45-67')
    expect(formatPhone('12345')).toBe('+12345')
    expect(formatPhone('')).toBe('')
  })
})
