import { describe, expect, it } from 'vitest'
import { createCredentialsStorage, STORAGE_KEY } from './credentialsStorage'

const credentials = { idInstance: '3100123456', apiTokenInstance: 'secret', apiUrl: 'https://3100.api.green-api.com' }

describe('credentialsStorage', () => {
  it('saves, loads and clears credentials', () => {
    const storage = createCredentialsStorage()
    expect(storage.load()).toBeNull()

    storage.save(credentials)
    expect(storage.load()).toEqual(credentials)

    storage.clear()
    expect(storage.load()).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('ignores broken or incomplete data', () => {
    const storage = createCredentialsStorage()
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(storage.load()).toBeNull()

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ idInstance: '1' }))
    expect(storage.load()).toBeNull()
  })

  it('does not throw when storage is unavailable', () => {
    const storage = createCredentialsStorage(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => storage.save(credentials)).not.toThrow()
    expect(storage.load()).toBeNull()
    expect(() => storage.clear()).not.toThrow()
  })
})
