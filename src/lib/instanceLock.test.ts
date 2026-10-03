import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeLockManager } from '../test/fakeLockManager'
import { getLockManager, receiveLockName, runWithLock } from './instanceLock'

/** Задача, которая держит блокировку, пока не сработает signal. */
function holdUntilAborted(signal: AbortSignal) {
  return vi.fn(
    () =>
      new Promise<void>((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', () => resolve(), { once: true })
      }),
  )
}

describe('runWithLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs the task at once when the lock is free', async () => {
    const locks = new FakeLockManager()
    const controller = new AbortController()
    const task = holdUntilAborted(controller.signal)
    const onWaiting = vi.fn()

    const running = runWithLock(locks, 'q', controller.signal, onWaiting, task)
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(1))
    expect(onWaiting).not.toHaveBeenCalled()
    expect(locks.isHeld('q')).toBe(true)

    controller.abort()
    await running
    expect(locks.isHeld('q')).toBe(false)
  })

  it('waits while another tab holds the lock and takes over when it is released', async () => {
    const locks = new FakeLockManager()
    const first = new AbortController()
    const second = new AbortController()
    const firstTask = holdUntilAborted(first.signal)
    const secondTask = holdUntilAborted(second.signal)
    const onWaiting = vi.fn()

    const firstRun = runWithLock(locks, 'q', first.signal, vi.fn(), firstTask)
    await vi.waitFor(() => expect(firstTask).toHaveBeenCalled())
    const secondRun = runWithLock(locks, 'q', second.signal, onWaiting, secondTask)
    await vi.waitFor(() => expect(onWaiting).toHaveBeenCalledTimes(1))
    expect(secondTask).not.toHaveBeenCalled()

    first.abort()
    await firstRun
    await vi.waitFor(() => expect(secondTask).toHaveBeenCalledTimes(1))

    second.abort()
    await secondRun
    expect(locks.isHeld('q')).toBe(false)
  })

  it('gives up waiting without running the task when aborted', async () => {
    const locks = new FakeLockManager()
    const holder = new AbortController()
    void runWithLock(locks, 'q', holder.signal, vi.fn(), holdUntilAborted(holder.signal))
    await vi.waitFor(() => expect(locks.isHeld('q')).toBe(true))

    const waiting = new AbortController()
    const task = vi.fn(() => Promise.resolve())
    const run = runWithLock(locks, 'q', waiting.signal, vi.fn(), task)
    waiting.abort()

    await expect(run).resolves.toBeUndefined()
    expect(task).not.toHaveBeenCalled()
    holder.abort()
  })

  it('does nothing if already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const task = vi.fn(() => Promise.resolve())
    await runWithLock(new FakeLockManager(), 'q', controller.signal, vi.fn(), task)
    expect(task).not.toHaveBeenCalled()
  })
})

describe('getLockManager', () => {
  it('returns null when Web Locks is not available', () => {
    vi.stubGlobal('navigator', {})
    expect(getLockManager()).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns navigator.locks when available', () => {
    const locks = new FakeLockManager()
    vi.stubGlobal('navigator', { locks })
    expect(getLockManager()).toBe(locks)
    vi.unstubAllGlobals()
  })
})

describe('receiveLockName', () => {
  it('is unique per instance', () => {
    expect(receiveLockName('3100123456')).not.toBe(receiveLockName('3100000001'))
  })
})
