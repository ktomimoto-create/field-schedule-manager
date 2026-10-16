import { describe, expect, it, vi } from 'vitest'
import { fetchAllRows } from './fetchAllRows'

describe('fetchAllRows', () => {
  it('1 ページが満杯の間は続けて取る', async () => {
    const all = Array.from({ length: 5 }, (_, i) => i)
    const page = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }))
    await expect(fetchAllRows(page, 2)).resolves.toEqual({ data: [0, 1, 2, 3, 4], error: null })
    expect(page).toHaveBeenCalledTimes(3)
  })

  it('途中で失敗したらそこまでと error を返す', async () => {
    const page = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null }).mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(fetchAllRows(page, 2)).resolves.toEqual({ data: [1, 2], error: { message: 'x' } })
  })
})
