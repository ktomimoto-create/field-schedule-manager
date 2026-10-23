import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimeoutError, withTimeout } from './withTimeout'

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('時間内に終われば結果をそのまま返す', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42)
  })

  it('時間を過ぎたら TimeoutError（何の処理かを文に入れる）', async () => {
    const pending = withTimeout(new Promise<never>(() => {}), 15_000, '開始の記録')
    vi.advanceTimersByTime(15_000)
    await expect(pending).rejects.toBeInstanceOf(TimeoutError)
    await expect(pending).rejects.toThrow('開始の記録が 15 秒たっても終わりませんでした')
  })

  it('元の失敗はそのまま返す', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
  })
})
