import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { supabase } from '../supabaseClient'
import { useRealtimeNotifications } from './useRealtimeNotifications'
import { makeSchedule, makeStaff } from '../test/factories'
import { noticeText } from '../utils/timeline/notification'

type Handler = (payload: { new: Record<string, unknown> }) => void
const realtime = vi.hoisted(() => ({ handlers: [] as Handler[], statusCbs: [] as ((status: string) => void)[] }))

vi.mock('../supabaseClient', () => {
  const channel: Record<string, unknown> = {}
  channel.on = vi.fn((_type: string, _filter: unknown, cb: Handler) => {
    realtime.handlers.push(cb)
    return channel
  })
  channel.subscribe = vi.fn((cb?: (status: string) => void) => {
    if (cb) realtime.statusCbs.push(cb)
    return channel
  })
  return { supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() } }
})

const sched = makeSchedule({ id: 5, staff_id: 1, property_name: 'B物件', work_type: '障害' })
const options: Parameters<typeof useRealtimeNotifications>[0] = { enabled: true, branch: 'tokyo', schedules: [sched], staff: [makeStaff()], selfName: '上田 啓' }
const emit = (o: Record<string, unknown>) => act(() => realtime.handlers.at(-1)!({ new: { ...sched, ...o } }))

describe('useRealtimeNotifications', () => {
  beforeEach(() => {
    realtime.handlers.length = 0
    realtime.statusCbs.length = 0
    vi.mocked(supabase.channel).mockClear()
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

  it('拠点を切り替えても購読は作り直さず、新しい拠点の通知が届く', () => {
    const { result, rerender } = renderHook(p => useRealtimeNotifications(p), { initialProps: options })
    const handler = realtime.handlers.at(-1)
    rerender({ ...options, branch: 'osaka' })
    expect(supabase.channel).toHaveBeenCalledTimes(1)
    expect(realtime.handlers).toHaveLength(1)
    expect(realtime.handlers.at(-1)).toBe(handler)
    act(() => handler!({ new: { ...sched, result: '作業中', started_at: '10:15', updated_by: '佐藤 太郎', notes: '[__branch:osaka__]' } }))
    expect(result.current.items).toHaveLength(1)
  })

  it('購読ごとに別のチャンネル名を使う', () => {
    const { rerender } = renderHook(p => useRealtimeNotifications(p), { initialProps: options })
    rerender({ ...options, enabled: false })
    rerender(options)
    const names = vi.mocked(supabase.channel).mock.calls.map(c => c[0])
    expect(names).toHaveLength(2)
    expect(names[0]).not.toBe(names[1])
  })

  it('古い schedules が後から来ても、開始の通知を重複させない', () => {
    const { result, rerender } = renderHook(p => useRealtimeNotifications(p), { initialProps: options })
    emit({ result: '作業中', started_at: '10:15', updated_by: '佐藤 太郎' })
    expect(result.current.items).toHaveLength(1)
    rerender({ ...options, schedules: [{ ...sched }] })
    emit({ result: '作業中', started_at: '10:15', updated_by: '佐藤 太郎', notes: 'メモ' })
    expect(result.current.items).toHaveLength(1)
  })

  it('schedules に新しく現れた id は追跡し、その開始を通知する', () => {
    const { result, rerender } = renderHook(p => useRealtimeNotifications(p), { initialProps: options })
    const added = makeSchedule({ id: 9, staff_id: 1, property_name: 'C物件', work_type: '障害' })
    rerender({ ...options, schedules: [sched, added] })
    act(() => realtime.handlers.at(-1)!({ new: { ...added, result: '作業中', started_at: '09:00', updated_by: '佐藤 太郎' } }))
    expect(result.current.items).toHaveLength(1)
  })

  it('SUBSCRIBED になったら最新の schedules で状態を作り直す', () => {
    const { result, rerender } = renderHook(p => useRealtimeNotifications(p), { initialProps: options })
    rerender({ ...options, schedules: [{ ...sched, result: '作業中', started_at: '10:15' }] })
    act(() => realtime.statusCbs.at(-1)!('SUBSCRIBED'))
    emit({ result: '作業中', started_at: '10:15', updated_by: '佐藤 太郎' })
    expect(result.current.items).toHaveLength(0)
  })
})
