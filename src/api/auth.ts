import { describeError, describeInstanceState } from './errors'
import type { GreenApiClient } from './greenApi'

/**
 * Проверяет учётные данные дешёвым запросом GetStateInstance.
 * Бросает Error с понятным текстом, если данные неверны или инстанс не готов к работе.
 */
export async function verifyInstance(client: Pick<GreenApiClient, 'getStateInstance'>): Promise<void> {
  let state: string
  try {
    state = (await client.getStateInstance()).stateInstance
  } catch (error) {
    throw new Error(describeError(error), { cause: error })
  }
  const problem = describeInstanceState(state)
  if (problem) throw new Error(problem)
}
