import { describe, expect, it } from 'vitest'
import { avatarColor, formatListTime, formatTime, initials } from './format'

describe('formatTime', () => {
  it('formats hours and minutes with leading zeros', () => {
    expect(formatTime(new Date(2026, 9, 3, 9, 5).getTime())).toBe('09:05')
  })
})

describe('formatListTime', () => {
  const now = new Date(2026, 9, 3, 18, 0).getTime()

  it('shows the time for today', () => {
    expect(formatListTime(new Date(2026, 9, 3, 7, 30).getTime(), now)).toBe('07:30')
  })

  it('shows the date for earlier days', () => {
    expect(formatListTime(new Date(2026, 9, 1, 7, 30).getTime(), now)).toBe('01.10')
  })
})

describe('initials', () => {
  it.each([
    ['Анна Петрова', 'АП'],
    ['анна', 'А'],
    ['Иван Иванович Иванов', 'ИИ'],
    ['+7 999 123-45-67', '67'],
    ['', '?'],
  ])('%s -> %s', (title, expected) => {
    expect(initials(title)).toBe(expected)
  })
})

describe('avatarColor', () => {
  it('is stable for the same id', () => {
    expect(avatarColor('10000000')).toBe(avatarColor('10000000'))
    expect(avatarColor('10000000')).toMatch(/^#[0-9a-f]{6}$/)
  })
})
