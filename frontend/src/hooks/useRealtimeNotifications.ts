import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { Branch, Schedule, Staff } from '../types'
import { resolveScheduleBranch } from '../types'
import { detectProgressEvent } from '../utils/timeline/progress'
import { unreadCount, type ProgressNotice } from '../utils/timeline/notification'

const LAST_READ_KEY = 'field_app_last_read_notification_at'
const MAX_ITEMS = 50

const readLastRead = (): number => {
  try {
    return Number(localStorage.getItem(LAST_READ_KEY)) || 0
  } catch {
    return 0
  }
}

interface Options {
  /** 管理側・本番モード・ログイン中のときだけ true */
  enabled: boolean
  branch: Branch
  schedules: Schedule[]
  staff: Staff[]
  /** 自分の名前（updated_by に入る名前）。自分が押したものは通知しない */
  selfName: string
}

export const useRealtimeNotifications = ({ enabled, branch, schedules, staff, selfName }: Options) => {
  const [items, setItems] = useState<ProgressNotice[]>([])
  const [latest, setLatest] = useState<ProgressNotice | null>(null)
  const [lastReadAt, setLastReadAt] = useState<number>(readLastRead)

  // Realtime の UPDATE には変更前の値が入らないので、手元の一覧（直前の状態）と比べる
  const prevRef = useRef(new Map<number, Schedule>())
  useEffect(() => {
    prevRef.current = new Map(schedules.map(s => [Number(s.id), s]))
  }, [schedules])

  const staffRef = useRef(staff)
  useEffect(() => {
    staffRef.current = staff
  }, [staff])

  useEffect(() => {
    if (!enabled) return
    const channel = supabase
      .channel('schedules-progress-notify')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'schedules' }, payload => {
        const next = { ...(payload.new as Partial<Schedule>) } as Schedule
        const id = Number(next.id)
        const event = detectProgressEvent(prevRef.current.get(id), next)
        prevRef.current.set(id, next)
        if (!event) return
        if (resolveScheduleBranch(next) !== branch) return
        if (selfName && next.updated_by === selfName) return

        const member = staffRef.current.find(st => st.id === Number(next.staff_id))
        const notice: ProgressNotice = {
          id: `${id}-${event.kind}-${Date.now()}`,
          scheduleId: id,
          kind: event.kind,
          staffName: member?.name ?? '担当者',
          propertyName: next.property_name,
          workType: next.work_type,
          at: event.at,
          receivedAt: Date.now(),
        }
        setItems(prev => [notice, ...prev].slice(0, MAX_ITEMS))
        setLatest(notice)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, branch, selfName])

  const markAllRead = useCallback(() => {
    const now = Date.now()
    setLastReadAt(now)
    try {
      localStorage.setItem(LAST_READ_KEY, String(now))
    } catch {
      // 保存できなくても画面は動かす（このタブの中では既読になる）
    }
  }, [])

  const dismissLatest = useCallback(() => setLatest(null), [])

  return { items, latest, unread: unreadCount(items, lastReadAt), markAllRead, dismissLatest }
}
