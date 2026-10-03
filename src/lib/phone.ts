/**
 * Номера телефонов. CheckAccount в MAX принимает только номера РФ (7, 11 цифр) и РБ (375, 12 цифр).
 * https://green-api.com/v3/docs/api/service/CheckAccount/
 */

/** Оставляет только цифры; российский номер с 8 в начале переводит в формат 7XXXXXXXXXX. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

export const PHONE_HINT = 'Номер РФ (+7, 11 цифр) или Беларуси (+375, 12 цифр)'

/** Возвращает текст ошибки или null, если номер подходит. Ожидает нормализованные цифры. */
export function validatePhone(digits: string): string | null {
  if (!digits) return 'Введите номер телефона'
  if (/^7\d{10}$/.test(digits) || /^375\d{9}$/.test(digits)) return null
  return `Неверный номер. ${PHONE_HINT}`
}

/** +7 999 123-45-67 или +375 29 123-45-67; остальные номера просто с плюсом. */
export function formatPhone(digits: string): string {
  const ru = /^7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits)
  if (ru) return `+7 ${ru[1]} ${ru[2]}-${ru[3]}-${ru[4]}`
  const by = /^375(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(digits)
  if (by) return `+375 ${by[1]} ${by[2]}-${by[3]}-${by[4]}`
  return digits ? `+${digits}` : ''
}
