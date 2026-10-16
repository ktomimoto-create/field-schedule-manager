import type { Schedule, Staff } from '../../types'
import { courseOf, orderInDay } from './groupByStaff'

export interface MonthRow {
  key: string
  staffId: number | null
  name: string
}

export const cellKey = (staffId: number | null, date: string): string => `${staffId ?? 'none'}|${date}`

/** 月間の行: 在籍中のスタッフ（is_active≠0）＋その月に予定がある人。コース順。担当の無い予定があれば最後に「未割当」 */
export const monthRows = (schedules: Schedule[], staff: Staff[], days: string[]): MonthRow[] => {
  const inMonth = new Set(days)
  const staffIdsWithItems = new Set(schedules.filter(s => inMonth.has(s.date)).map(s => s.staff_id))
  const rows: MonthRow[] = staff
    .filter(st => st.is_active !== 0 || staffIdsWithItems.has(st.id))
    .sort((a, b) => courseOf(a) - courseOf(b) || a.name.localeCompare(b.name, 'ja'))
    .map(st => ({ key: `id-${st.id}`, staffId: st.id, name: st.name }))
  if (staffIdsWithItems.has(null)) rows.push({ key: 'unassigned', staffId: null, name: '未割当' })
  return rows
}

/** 担当×日 → その日の予定（1 日の並び順） */
export const indexByCell = (schedules: Schedule[]): Map<string, Schedule[]> => {
  const map = new Map<string, Schedule[]>()
  for (const s of schedules) {
    const key = cellKey(s.staff_id, s.date)
    const list = map.get(key)
    if (list) list.push(s)
    else map.set(key, [s])
  }
  for (const list of map.values()) list.sort(orderInDay)
  return map
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4

/** ヒートマップの濃さ（空き → 薄青 → 中青 → 濃紺） */
export const heatLevel = (count: number): HeatLevel => {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}
