const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' })

/** 09:05 */
export function formatTime(timestamp: number): string {
  return timeFormat.format(timestamp)
}

/** Для списка чатов: время, если сегодня, иначе дата 03.10. */
export function formatListTime(timestamp: number, now: number = Date.now()): string {
  const date = new Date(timestamp)
  const today = new Date(now)
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  return sameDay ? formatTime(timestamp) : dateFormat.format(timestamp)
}

/** Одна-две буквы для аватара: «Анна Петрова» → «АП», номер → последние две цифры. */
export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (/^\+?[\d\s()-]+$/.test(title)) return title.replace(/\D/g, '').slice(-2) || '?'
  const letters = words.slice(0, 2).map((word) => word[0]!.toUpperCase())
  return letters.join('')
}

const AVATAR_COLORS = ['#ff8a65', '#ffb74d', '#81c784', '#4db6ac', '#64b5f6', '#7986cb', '#ba68c8', '#f06292']

/** Стабильный цвет аватара по chatId. */
export function avatarColor(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!
}
