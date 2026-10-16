import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRealtimeNotifications } from './useRealtimeNotifications'
import { makeSchedule, makeStaff } from '../test/factories'
import { noticeText } from '../utils/timeline/notification'

type Handler = (payload: { new: Record<string, unknown> }) => void
const realtime = vi.hoisted(() => ({ handlers: [] as Handler[] }))

vi.mock('../supabaseClient', () => {
  const channel: Record<string, unknown> = {}
  channel.on = vi.fn((_type: string, _filter: unknown, cb: Handler) => {
    realtime.handlers.push(cb)
    return channel
  })
  channel.subscribe = vi.fn(() => channel)
  return { supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() } }
})

const sched = makeSchedule({ id: 5, staff_id: 1, property_name: 'B物件', work_type: '障害' })
const options = { enabled: true, branch: 'tokyo' as const, schedules: [sched], staff: [makeStaff()], selfName: '上田 啓' }
const emit = (o: Record<string, unknown>) => act(() => realtime.handlers.at(-1)!({ new: { ...sched, ...o } }))

describe('useRealtimeNotifications', () => {
  beforeEach(() => {
    realtime.handlers.length = 0
    localStorage.clear()
  })

  it('他の人が開始を押したら通知が 1 件届き、未読になる', () => {
    const { result } = renderHook(() => useRealtimeNotifications(options))
    emit({ result: '作業中', started_at: '10:15', updated_by: '佐藤 太郎' })
    expect(result.current.items).toHaveLength(1)
    expect(noticeText(result.current.latest!)).toBe('佐藤さんが B物件（障害）を開始 10:15')
    expect(result.current.unread).toBe(1)
    act(() => result.current.markAllRead())
    expect(result.current.unread).toBe(0)
  })

  it('自分が押したもの・別の拠点のもの・同じ変化の 2 回目は出さない', () => {
    const { result } = renderHook(() => useRealtimeNotifications(options))
    emit({ result: '作業中', started_at: '10:15', updated_by: '上田 啓' })
    emit({ result: '完了', completed_at: '11:00', updated_by: '佐藤 太郎', notes: '[__branch:osaka__]' })
    emit({ result: '完了', completed_at: '11:00', updated_by: '佐藤 太郎' })
    expect(result.current.items).toHaveLength(0)
  })

  it('enabled が false なら購読しない', () => {
    renderHook(() => useRealtimeNotifications({ ...options, enabled: false }))
    expect(realtime.handlers).toHaveLength(0)
  })
})
