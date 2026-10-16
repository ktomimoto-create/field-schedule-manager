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

  const range = t.match(/^(\d{1,2}:\d{2})~(\d{1,2}:\d{2})/)
  if (range) {
    const from = hmToMin(range[1])
    const to = hmToMin(range[2])
    if (from !== null && to !== null && to > from) {
      return { from, to, kind: 'range', label: `${minToHm(from)}〜${minToHm(to)}` }
    }
  }

  if (t.endsWith('迄')) {
    const end = hmToMin(t.slice(0, -1))
    if (end === null) return null
    return { from: end - 60, to: end, kind: 'until', label: t }
  }

  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const start = hmToMin(t)
    if (start === null) return null
    return { from: start, to: start + 60, kind: 'at', label: t }
  }
  return null
}

/** カード右上の赤バッジに出す文字（指定が無ければ null）。バッジは短い語だけなので 6 文字まで */
export const targetTimeBadge = (raw: string | null | undefined): string | null => {
  const t = normalizeTargetTime(raw)
  if (!t) return null
  if (t === '必ず') return '必ず'
  const slot = parseTimeSlot(raw)
  return slot ? slot.label : t.slice(0, 6)
}
