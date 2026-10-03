import type { Credentials } from '../api/greenApi'

/**
 * Хранение учётных данных между перезагрузками, только если пользователь поставил галочку.
 * localStorage может быть недоступен (приватный режим, запрет cookies), поэтому каждое обращение в try/catch:
 * без хранилища приложение просто не запоминает вход.
 */
export interface CredentialsStorage {
  load(): Credentials | null
  save(credentials: Credentials): void
  clear(): void
}

export const STORAGE_KEY = 'max-chat.credentials.v1'

function isCredentials(value: unknown): value is Credentials {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.idInstance === 'string' &&
    typeof record.apiTokenInstance === 'string' &&
    typeof record.apiUrl === 'string' &&
    record.idInstance !== '' &&
    record.apiTokenInstance !== ''
  )
}

export function createCredentialsStorage(getStorage: () => Storage = () => window.localStorage): CredentialsStorage {
  return {
    load() {
      try {
        const raw = getStorage().getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        return isCredentials(parsed)
          ? { idInstance: parsed.idInstance, apiTokenInstance: parsed.apiTokenInstance, apiUrl: parsed.apiUrl }
          : null
      } catch {
        return null
      }
    },
    save(credentials) {
      try {
        getStorage().setItem(STORAGE_KEY, JSON.stringify(credentials))
      } catch {
        // Хранилище недоступно: вход просто не запомнится.
      }
    },
    clear() {
      try {
        getStorage().removeItem(STORAGE_KEY)
      } catch {
        // Нечего очищать.
      }
    },
  }
}

export const credentialsStorage = createCredentialsStorage()
