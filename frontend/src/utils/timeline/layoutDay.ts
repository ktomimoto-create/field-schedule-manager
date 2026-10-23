import type { Schedule } from '../../types'
import { normalizeTargetTime } from '../../types'
import type { DayPlan } from '../dayPlan'
import type { LegKind, TravelMode as RouteMode } from '../route'
import type { Travel } from './estimateTravelTime'
import { progressOf } from './progress'
import { isHoliday } from './workTone'

export const DAY_START_MIN = 8 * 60
export const DAY_END_MIN = 20 * 60

/** actual=実績 / fixed=時刻指定 / estimated=指定の無い訪問を空いた所へ置いた目安（画面では点線） */
export type BarBasis = 'actual' | 'fixed' | 'estimated'

export interface GanttBar {
  schedule: Schedule
  from: number
  to: number
  basis: BarBasis
  /** 「〜迄」の締切に間に合わない並び */
  late?: boolean
  /** 重なる帯を分ける段（0 始まり） */
  lane: number
}

export interface TravelGap {
  from: number
  to: number
  travel: Travel
}

/** 待ち（前が終わってから、次の訪問へ移動を始めるまで） */
export interface WaitGap {
  from: number
  to: number
  /** 次の訪問の時間の指定（説明に出す） */
  target: string
}

export interface DayLayout {
  bars: GanttBar[]
  gaps: TravelGap[]
  /** 前の訪問（昼休憩）が終わってから移動を始めるまでの待ち。時刻指定の訪問の前などで空く */
  waits: WaitGap[]
  laneCount: number
  /** 昼休憩（その後に訪問が無ければ null） */
  lunch: [number, number] | null
}

/** 移動のアイコン: 距離からの見込みの手段。位置が分からない区間はその人の手段で出す */
const gapMode = (kind: LegKind, mode: RouteMode): Travel['mode'] =>
  kind === 'car' || kind === 'walk' ? kind : kind === 'train' ? 'train' : mode === 'car' ? 'car' : 'train'

/** 置いた訪問（utils/dayPlan の planPersonDay の結果）→ ガントの帯・段・移動。
 * 置き方は予定表の時間軸と同じ（時間の指定を守る順・距離からの移動・昼休憩）。
 * 時刻・時間帯の指定がある訪問は実線（fixed）、指定の無い訪問は点線（estimated）。キャンセル・休暇は置かない */
export const layoutFromPlan = (plan: Pick<DayPlan, 'placed' | 'lunch'> & { mode: RouteMode }): DayLayout => {
  const visits = plan.placed.filter(p => progressOf(p.schedule) !== 'cancelled' && !isHoliday(p.schedule))
  const bars: GanttBar[] = visits
    .map(p => {
      const bar: GanttBar = { schedule: p.schedule, from: p.start, to: p.end, basis: p.estimated ? 'estimated' : 'fixed', lane: 0 }
      if (p.late) bar.late = true
      return bar
    })
    .sort((a, b) => a.from - b.from)
  // 重なる帯（同じ建物でまとめて対応など）は空いている最小の段へ
  const laneEnds: number[] = []
  for (const bar of bars) {
    let lane = laneEnds.findIndex(end => end <= bar.from)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = bar.to
    bar.lane = lane
  }
  // 移動は各訪問の前（前の場所から着くまで）に置く。同じ建物は移動なし
  const gaps: TravelGap[] = visits
    .filter(p => p.move > 0 && p.legKind !== 'same')
    .map(p => ({ from: p.start - p.move, to: p.start, travel: { minutes: p.move, mode: gapMode(p.legKind, plan.mode) } }))
  // 待ち: 前が終わってから移動を始めるまで（線が途切れないよう、薄い点線でつなぐ）
  const waits: WaitGap[] = visits
    .filter(p => p.legKind !== 'same' && p.start - p.move > p.waitFrom)
    .map(p => ({ from: p.waitFrom, to: p.start - p.move, target: normalizeTargetTime(p.schedule.target_time) }))
  return { bars, gaps, waits, laneCount: Math.max(1, laneEnds.length), lunch: plan.lunch }
}
