import { useState } from 'react'
import { verifyInstance } from './api/auth'
import { createGreenApiClient, type Credentials, type GreenApiClient } from './api/greenApi'
import { ChatScreen } from './components/ChatScreen'
import { LoginForm } from './components/LoginForm'
import { credentialsStorage as defaultStorage, type CredentialsStorage } from './lib/credentialsStorage'

export type ClientFactory = (credentials: Credentials) => GreenApiClient

interface AppProps {
  /** Для тестов: подмена клиента GREEN-API и хранилища. */
  createClient?: ClientFactory
  storage?: CredentialsStorage
}

interface Session {
  credentials: Credentials
  client: GreenApiClient
}

export function App({ createClient = createGreenApiClient, storage = defaultStorage }: AppProps) {
  // Сохранённые данные уже проверялись при входе; если они устарели, об этом сообщит статус получения.
  const [session, setSession] = useState<Session | null>(() => {
    const saved = storage.load()
    return saved ? { credentials: saved, client: createClient(saved) } : null
  })

  const login = async (credentials: Credentials, remember: boolean) => {
    const client = createClient(credentials)
    await verifyInstance(client)
    if (remember) storage.save(credentials)
    else storage.clear()
    setSession({ credentials, client })
  }

  const logout = () => {
    storage.clear()
    setSession(null)
  }

  if (!session) return <LoginForm onLogin={login} />
  return (
    <ChatScreen
      key={`${session.credentials.apiUrl}/${session.credentials.idInstance}`}
      credentials={session.credentials}
      client={session.client}
      onLogout={logout}
    />
  )
}
