import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useViewport } from './useViewport'

describe('useViewport', () => {
  const listeners = new Set<() => void>()
  let matches = false

  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches
    },
    media: query,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
  }))

  afterEach(() => {
    matches = false
  })

  it('画面幅が 767px 以下になったら isMobile が true になる', () => {
    const { result } = renderHook(() => useViewport())
    expect(result.current.isMobile).toBe(false)
    act(() => {
      matches = true
      listeners.forEach(cb => cb())
    })
    expect(result.current.isMobile).toBe(true)
  })
})
