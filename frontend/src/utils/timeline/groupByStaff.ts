import type { Schedule, Staff } from '../../types'
import { compareSchedules, findScheduleStaff } from '../../types'

export interface StaffDay {
  key: string
  staffId: number | null
  name: string
  member?: Staff
  items: Schedule[]
}

/** スタッフのコース番号（数字でなければ Infinity＝後ろ） */
export const courseOf = (member?: Staff): number => {
  const raw = String(member?.default_course ?? '').trim()
  const n = Number(raw)
  return raw !== '' && Number.isFinite(n) ? n : Infinity
}

const sortKey = (s: Schedule): number => (typeof s.sort_order === 'number' ? s.sort_order : Number.MAX_SAFE_INTEGER)

/** 1 人の 1 日の並び: 当日行動予定表で並べ替えた順（sort_order）→ 予定表と同じ並び（compareSchedules） */
export const orderInDay = (a: Schedule, b: Schedule): number => sortKey(a) - sortKey(b) || compareSchedules(a, b)

/** matchByName: 担当の ID が無い（名簿に無い）予定も、対応者の名前が名簿の人に当たればその人に入れる（予定表の時間軸と同じ） */
export const groupByStaff = (schedules: Schedule[], staff: Staff[], opts: { matchByName?: boolean } = {}): StaffDay[] => {
  const map = new Map<string, StaffDay>()
  for (const s of schedules) {
    const byId = s.staff_id !== null ? staff.find(st => st.id === s.staff_id) : undefined
    // 名前で探すときも、委託の行は委託先の人なので名前が完全に一致する人だけ（findScheduleStaff）
    const member = byId ?? (opts.matchByName ? findScheduleStaff(staff, s) : undefined)
    const key = member ? `id-${member.id}` : 'unassigned'
    let day = map.get(key)
    if (!day) {
      day = { key, staffId: member?.id ?? null, name: member?.name ?? '未割当', member, items: [] }
      map.set(key, day)
    }
    day.items.push(s)
  }
  const days = [...map.values()]
  for (const d of days) d.items.sort(orderInDay)
  const lastIfUnassigned = (d: StaffDay) => (d.key === 'unassigned' ? 1 : 0)
  // Infinity - Infinity は NaN（falsy）なので、コースが無い人同士は名前で比べる
  return days.sort(
    (a, b) => lastIfUnassigned(a) - lastIfUnassigned(b) || courseOf(a.member) - courseOf(b.member) || a.name.localeCompare(b.name, 'ja'),
  )
}
