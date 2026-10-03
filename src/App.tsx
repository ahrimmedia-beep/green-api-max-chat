import { useState } from 'react'
import { verifyInstance } from './api/auth'
import { createGreenApiClient, type Credentials, type GreenApiClient } from './api/greenApi'
import { ChatScreen } from './components/ChatScreen'
import { LoginForm } from './components/LoginForm'
import { credentialsStorage as defaultStorage, type CredentialsStorage } from './lib/credentialsStorage'

export type ClientFactory = (credentials: Credentials) => GreenApiClient

interface DemoSession {
  credentials: Credentials
  client: GreenApiClient
}

/** Демо-модуль грузится отдельным чанком только по кнопке, в обычной работе его кода в браузере нет. */
const loadDemoSession = async (): Promise<DemoSession> => (await import('./demo/demoServer')).createDemoSession()

interface AppProps {
  /** Для тестов: подмена клиента GREEN-API, хранилища и демо-сессии. */
  createClient?: ClientFactory
  storage?: CredentialsStorage
  createDemoSession?: () => Promise<DemoSession>
}

interface Session {
  credentials: Credentials
  client: GreenApiClient
  demo: boolean
}

export function App({
  createClient = createGreenApiClient,
  storage = defaultStorage,
  createDemoSession = loadDemoSession,
}: AppProps) {
  // Сохранённые данные уже проверялись при входе; если они устарели, об этом сообщит статус получения.
  const [session, setSession] = useState<Session | null>(() => {
    const saved = storage.load()
    return saved ? { credentials: saved, client: createClient(saved), demo: false } : null
  })

  const login = async (credentials: Credentials, remember: boolean) => {
    const client = createClient(credentials)
    await verifyInstance(client)
    if (remember) storage.save(credentials)
    else storage.clear()
    setSession({ credentials, client, demo: false })
  }

  const startDemo = async () => {
    const demo = await createDemoSession()
    setSession({ ...demo, demo: true })
  }

  const logout = () => {
    if (!session?.demo) storage.clear()
    setSession(null)
  }

  if (!session) return <LoginForm onLogin={login} onDemo={startDemo} />
  return (
    <ChatScreen
      key={`${session.credentials.apiUrl}/${session.credentials.idInstance}`}
      credentials={session.credentials}
      client={session.client}
      demo={session.demo}
      onLogout={logout}
    />
  )
}
