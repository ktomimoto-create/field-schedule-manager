import type { Schedule } from '../../types'
import { hmToMin } from './dates'
import { parseTimeSlot } from './parseTargetTime'
import { estimateTravel, type Travel } from './estimateTravelTime'
import { progressOf } from './progress'
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
  /** 「〜迄」の締切に間に合わない並び */
  late?: boolean
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
 * 1. 先に「動かせない帯」を置く: 開始・完了の実績（actual）と時刻指定（10:00 / 14:00〜14:30 = fixed）。
 * 2. 残り（時間なし・AM/PM・「〜迄」= estimated）を並び順に置く。開始は
 *    「並び順で 1 つ前の帯の終わり＋移動の目安」「9:00」「AM/PM の帯の始まり」の最大値。
 *    そこが置き済みの帯と重なるなら、その帯の終わり＋移動の目安まで後ろへずらす。
 *    「〜迄」は前に寄せず、終わりが締切を過ぎたら late を付ける。
 * 3. 開始順に返し、隣り合う帯に隙間があれば移動の目安（gap）を付ける。
 * 作業時間は 1 件 60 分とみなす。時刻指定どうしの重なりはデータのとおり残す。
 * items は orderInDay で並べてから渡す。
 */
export const layoutStaffDay = (items: Schedule[]): DayLayout => {
  const targets = items.filter(s => progressOf(s) !== 'cancelled' && !isHoliday(s))
  const placed = new Map<Schedule, GanttBar>()

  // 1. 実績・時刻指定の帯を、その時刻に置く
  for (const s of targets) {
    const started = hmToMin(s.started_at)
    const completed = hmToMin(s.completed_at)
    const slot = parseTimeSlot(s.target_time)
    if (started !== null) {
      const to = completed !== null && completed > started ? completed : started + DEFAULT_WORK_MIN
      placed.set(s, { schedule: s, from: started, to, basis: 'actual' })
    } else if (slot && (slot.kind === 'at' || slot.kind === 'range')) {
      const to = slot.kind === 'range' ? slot.to : slot.from + DEFAULT_WORK_MIN
      placed.set(s, { schedule: s, from: slot.from, to, basis: 'fixed' })
    }
  }

  // 2. 目安の帯を並び順に置く（置き済みの帯とは重ねない）
  let prev: GanttBar | null = null
  for (const s of targets) {
    if (!placed.has(s)) {
      const slot = parseTimeSlot(s.target_time)
      let from = FIRST_JOB_MIN
      if (prev) from = Math.max(from, prev.to + estimateTravel(prev.schedule, s).minutes)
      if (slot && slot.kind === 'band') from = Math.max(from, slot.from)
      for (;;) {
        const end = from + DEFAULT_WORK_MIN
        const hit = [...placed.values()].find(b => b.from < end && b.to > from)
        if (!hit) break
        from = hit.to + estimateTravel(hit.schedule, s).minutes
      }
      const to = from + DEFAULT_WORK_MIN
      const late = slot !== null && slot.kind === 'until' && to > slot.to
      placed.set(s, late ? { schedule: s, from, to, basis: 'estimated', late } : { schedule: s, from, to, basis: 'estimated' })
    }
    prev = placed.get(s) ?? null
  }

  // 3. 開始順に並べ、隙間に移動の目安を付ける
  const bars = [...placed.values()].sort((a, b) => a.from - b.from)
  const gaps: TravelGap[] = []
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1]
    const b = bars[i]
    if (b.from > a.to) gaps.push({ from: a.to, to: b.from, travel: estimateTravel(a.schedule, b.schedule) })
  }
  return { bars, gaps }
}
