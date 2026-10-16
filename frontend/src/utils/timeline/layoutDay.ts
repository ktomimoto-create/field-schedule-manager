import type { Schedule } from '../../types'
import { hmToMin } from './dates'
import { parseTimeSlot } from './parseTargetTime'
import { estimateTravel, type Travel } from './estimateTravelTime'
import { isHoliday } from './workTone'

export const DAY_START_MIN = 8 * 60
export const DAY_END_MIN = 20 * 60
export const FIRST_JOB_MIN = 9 * 60
export const DEFAULT_WORK_MIN = 60

/** actual=実績 / fixed=時刻指定 / estimated=並び順から置いた目安（画面では点線） */
export type BarBasis = 'actual' | 'fixed' | 'estimated'

export interface GanttBar {
  schedule: Schedule
  from: number
  to: number
  basis: BarBasis
}

export interface TravelGap {
  from: number
  to: number
  travel: Travel
}

export interface DayLayout {
  bars: GanttBar[]
  gaps: TravelGap[]
}

/**
 * 1 人の 1 日の予定を時間軸に並べる。予定表には終了時刻が無いので:
 * - 開始・完了の実績があればそれを使う（actual）
 * - 時刻指定（10:00 / 14:00〜14:30）はその時刻に置く（fixed）
 * - それ以外は、前の作業の終わり＋移動の目安から順に置く（estimated）。
 *   AM/PM は帯の始まりより前には置かない。「〜迄」は締切に間に合う位置まで前に寄せる。
 * 作業時間は 1 件 60 分とみなす。items は orderInDay で並べてから渡す。
 */
export const layoutStaffDay = (items: Schedule[]): DayLayout => {
  const bars: GanttBar[] = []
  const gaps: TravelGap[] = []
  let cursor = FIRST_JOB_MIN
  let prev: GanttBar | null = null

  for (const s of items) {
    if (s.status === 'cancelled' || isHoliday(s)) continue
    const travel = prev ? estimateTravel(prev.schedule, s) : null
    const earliest = cursor + (travel ? travel.minutes : 0)
    const started = hmToMin(s.started_at)
    const completed = hmToMin(s.completed_at)
    const slot = parseTimeSlot(s.target_time)

    let from: number
    let to: number
    let basis: BarBasis
    if (started !== null) {
      from = started
      to = completed !== null && completed > started ? completed : started + DEFAULT_WORK_MIN
      basis = 'actual'
    } else if (slot && (slot.kind === 'at' || slot.kind === 'range')) {
      from = slot.from
      to = slot.kind === 'range' ? slot.to : slot.from + DEFAULT_WORK_MIN
      basis = 'fixed'
    } else if (slot && slot.kind === 'until') {
      from = Math.min(earliest, slot.to - DEFAULT_WORK_MIN)
      to = from + DEFAULT_WORK_MIN
      basis = 'estimated'
    } else if (slot && slot.kind === 'band') {
      from = Math.max(earliest, slot.from)
      to = from + DEFAULT_WORK_MIN
      basis = 'estimated'
    } else {
      from = earliest
      to = from + DEFAULT_WORK_MIN
      basis = 'estimated'
    }

    if (prev && travel && from > prev.to) gaps.push({ from: prev.to, to: from, travel })
    const bar: GanttBar = { schedule: s, from, to, basis }
    bars.push(bar)
    cursor = Math.max(cursor, to)
    prev = bar
  }
  return { bars, gaps }
}
