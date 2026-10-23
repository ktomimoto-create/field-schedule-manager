import { normalizeTargetTime } from '../../types'
import { hmToMin, minToHm } from './dates'

// 指定時間（target_time）→ 時間軸に置く枠（分: 0:00 からの経過分）。
// 予定表には終了時刻が無いので、時刻指定は 60 分、「〜迄」は締切の 60 分前から、AM 9-12 / PM 13-17 で置く。
export type SlotKind = 'at' | 'until' | 'band' | 'range'

export interface TimeSlot {
  from: number
  to: number
  kind: SlotKind
  label: string
}

export const parseTimeSlot = (raw: string | null | undefined): TimeSlot | null => {
  const t = normalizeTargetTime(raw)
  if (!t) return null
  if (t === 'AM') return { from: 9 * 60, to: 12 * 60, kind: 'band', label: 'AM' }
  if (t === 'PM') return { from: 13 * 60, to: 17 * 60, kind: 'band', label: 'PM' }

  // 範囲: 10:00~11:00 / 10:00-11:00 / 10:00 ~ 11:00 / 10時~11時（後ろの文字は無視）
  const range = t.match(/^(\d{1,2})(?::(\d{2})|時)\s*[~-]\s*(\d{1,2})(?::(\d{2})|時)/)
  if (range) {
    const from = hmToMin(`${range[1]}:${range[2] ?? '00'}`)
    const to = hmToMin(`${range[3]}:${range[4] ?? '00'}`)
    if (from !== null && to !== null && to > from) {
      return { from, to, kind: 'range', label: `${minToHm(from)}〜${minToHm(to)}` }
    }
    return null
  }

  // 範囲（時だけ）: 13-15時 / 13~15時
  const hourRange = t.match(/^(\d{1,2})\s*[~-]\s*(\d{1,2})時/)
  if (hourRange) {
    const from = hmToMin(`${hourRange[1]}:00`)
    const to = hmToMin(`${hourRange[2]}:00`)
    if (from !== null && to !== null && to > from) {
      return { from, to, kind: 'range', label: `${minToHm(from)}〜${minToHm(to)}` }
    }
    return null
  }

  // 開始だけ: 9:00~ / 9時~ は 9:00 から
  const open = t.match(/^(\d{1,2})(?::(\d{2})|時)\s*[~-]\s*$/)
  if (open) {
    const start = hmToMin(`${open[1]}:${open[2] ?? '00'}`)
    if (start === null) return null
    return { from: start, to: Math.min(24 * 60, start + 60), kind: 'at', label: minToHm(start) }
  }

  if (t.endsWith('迄')) {
    const end = hmToMin(t.slice(0, -1))
    if (end === null) return null
    return { from: Math.max(0, end - 60), to: end, kind: 'until', label: t }
  }

  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const start = hmToMin(t)
    if (start === null) return null
    return { from: start, to: Math.min(24 * 60, start + 60), kind: 'at', label: t }
  }
  return null
}

/** カード右上の赤バッジに出す文字（指定が無ければ null）。バッジは短い語だけなので 6 文字まで */
export const targetTimeBadge = (raw: string | null | undefined): string | null => {
  const t = normalizeTargetTime(raw)
  if (!t) return null
  if (t === '必ず') return '必ず'
  const slot = parseTimeSlot(raw)
  if (slot) return slot.label
  const chars = Array.from(t)
  return chars.length > 6 ? `${chars.slice(0, 5).join('')}…` : t
}
