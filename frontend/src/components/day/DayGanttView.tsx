import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Schedule, Staff } from '../../types'
import { hmToMin, nowHmJst, todayJst } from '../../utils/timeline/dates'
import { groupByStaff } from '../../utils/timeline/groupByStaff'
import { DAY_END_MIN, DAY_START_MIN, layoutStaffDay } from '../../utils/timeline/layoutDay'
import { isHoliday } from '../../utils/timeline/workTone'
import { GanttRow, type GanttRowData } from './GanttRow'
import './DayGanttView.css'

const MIN_PX_PER_MIN = 1.6 // 狭い画面では 1 時間 = 96px
const LABEL_COL_PX = 120 // 担当名の列
const BORDER_PX = 2 // .dg-scroll の枠
const SPAN_MIN = DAY_END_MIN - DAY_START_MIN
const HOURS = Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => DAY_START_MIN / 60 + i)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const nowMinutes = () => hmToMin(nowHmJst()) ?? 0

interface Props {
  /** その日の予定（行動予定へ移したもの） */
  schedules: Schedule[]
  staff: Staff[]
  date: string
  /** ヒートマップから飛んできたときの担当（その行へスクロールして色を付ける） */
  focusStaffId: number | null
  onOpen: (s: Schedule) => void
}

export function DayGanttView({ schedules, staff, date, focusStaffId, onOpen }: Props) {
  const rows = useMemo<GanttRowData[]>(
    () =>
      groupByStaff(schedules, staff).map(day => ({
        ...day,
        layout: layoutStaffDay(day.items),
        offToday: day.items.length > 0 && day.items.every(isHoliday),
      })),
    [schedules, staff],
  )

  // 画面幅いっぱいに広げる（測れない環境では最小の縮尺）
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pxPerMin, setPxPerMin] = useState(MIN_PX_PER_MIN)
  const hasRows = rows.length > 0
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setPxPerMin(Math.max(MIN_PX_PER_MIN, (el.clientWidth - LABEL_COL_PX - BORDER_PX) / SPAN_MIN))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasRows])
  const x = useCallback((min: number) => (clamp(min, DAY_START_MIN, DAY_END_MIN) - DAY_START_MIN) * pxPerMin, [pxPerMin])

  const [now, setNow] = useState(nowMinutes)
  useEffect(() => {
    const timer = setInterval(() => setNow(nowMinutes()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const focusRef = useRef<HTMLDivElement>(null)
  const scrolledKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${date}:${focusStaffId}`
    if (focusStaffId === null || !focusRef.current || scrolledKeyRef.current === key) return
    focusRef.current.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    scrolledKeyRef.current = key
  }, [focusStaffId, date, rows])

  if (rows.length === 0) return <p className="ac-empty">この日の予定はありません</p>

  const width = x(DAY_END_MIN)
  const isToday = date === todayJst()

  return (
    <div className="dg-scroll" ref={scrollRef}>
      <div className="dg-grid" style={{ '--dg-width': `${width}px`, '--dg-hour': `${pxPerMin * 60}px` } as CSSProperties}>
        <div className="dg-corner" />
        <div className="dg-hours">
          {HOURS.map((h, i) => (
            <span
              key={h}
              className={`dg-hour tl-num ${i === 0 ? 'is-first' : ''} ${i === HOURS.length - 1 ? 'is-last' : ''}`}
              style={{ left: x(h * 60) }}
            >
              {h}:00
            </span>
          ))}
        </div>
        {rows.map(row => {
          const focused = row.staffId !== null && row.staffId === focusStaffId
          return (
            <GanttRow
              key={row.key}
              row={row}
              x={x}
              now={isToday ? now : null}
              focused={focused}
              rowRef={focused ? focusRef : undefined}
              onOpen={onOpen}
            />
          )
        })}
      </div>
      <p className="dg-legend">実線＝時刻指定・実績&emsp;点線＝並び順から置いた目安（1件60分）&emsp;赤枠＝締切に間に合わない並び&emsp;線の上＝移動の目安</p>
    </div>
  )
}
