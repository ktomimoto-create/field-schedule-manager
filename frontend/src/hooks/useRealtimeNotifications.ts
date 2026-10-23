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

  // 最新の値は ref に持ち、購読の effect は enabled だけで作り直す（拠点切替で購読が止まらないように）
  const branchRef = useRef(branch)
  const selfNameRef = useRef(selfName)
  const staffRef = useRef(staff)
  const schedulesRef = useRef(schedules)
  useEffect(() => {
    branchRef.current = branch
    selfNameRef.current = selfName
    staffRef.current = staff
  }, [branch, selfName, staff])

  // Realtime の UPDATE には変更前の値が入らないので、直前の状態を持って比べる。
  // 持ち主は Realtime 側。再取得の結果では未知の id を足すだけで、既存の行は上書きしない
  const prevRef = useRef(new Map<number, Schedule>())
  useEffect(() => {
    schedulesRef.current = schedules
    for (const s of schedules) {
      const id = Number(s.id)
      if (!prevRef.current.has(id)) prevRef.current.set(id, s)
    }
  }, [schedules])

  useEffect(() => {
    if (!enabled) return
    // 同じ名前だと leave 中の古いチャンネルが返り subscribe が空振りするので、毎回変える
    const topic = `schedules-progress-notify-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(topic)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'schedules' }, payload => {
        const id = Number((payload.new as Partial<Schedule>).id)
        const prev = prevRef.current.get(id)
        // 欠けた列があっても判定が崩れないよう、直前の状態に重ねる
        const next = { ...prev, ...(payload.new as Partial<Schedule>) } as Schedule
        const event = detectProgressEvent(prev, next)
        prevRef.current.set(id, next)
        if (!event) return
        if (resolveScheduleBranch(next) !== branchRef.current) return
        if (selfNameRef.current && next.updated_by === selfNameRef.current) return

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
        setItems(list => [notice, ...list].slice(0, MAX_ITEMS))
        setLatest(notice)
      })
      .subscribe(status => {
        // 接続できた時点の最新一覧で作り直す
        if (status === 'SUBSCRIBED') {
          prevRef.current = new Map(schedulesRef.current.map(s => [Number(s.id), s]))
        }
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled])

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

  // 画面を隠している間（モーダル表示中など）に古くなった通知が、閉じた後に出し直されないよう、
  // 受信から 60 秒たったら表示の対象から外す（一覧には残る）
  useEffect(() => {
    if (!latest) return
    const timer = setTimeout(() => setLatest(cur => (cur?.id === latest.id ? null : cur)), Math.max(0, latest.receivedAt + 60_000 - Date.now()))
    return () => clearTimeout(timer)
  }, [latest])

  return { items, latest, unread: unreadCount(items, lastReadAt), markAllRead, dismissLatest }
}
