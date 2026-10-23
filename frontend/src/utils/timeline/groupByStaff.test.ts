import { describe, expect, it } from 'vitest'
import { courseOf, groupByStaff } from './groupByStaff'
import { makeSchedule, makeStaff } from '../../test/factories'

describe('groupByStaff', () => {
  const staff = [
    makeStaff({ id: 1, name: '佐藤 太郎', default_course: '10' }),
    makeStaff({ id: 2, name: '築地 次郎', default_course: '2' }),
  ]

  it('コース番号の小さい順（数値で比べる）、担当なしは最後', () => {
    const days = groupByStaff(
      [makeSchedule({ id: 1, staff_id: 1 }), makeSchedule({ id: 2, staff_id: null }), makeSchedule({ id: 3, staff_id: 2 })],
      staff,
    )
    expect(days.map(d => d.name)).toEqual(['築地 次郎', '佐藤 太郎', '未割当'])
    expect(days[2].staffId).toBeNull()
  })

  it('1 人の中は当日行動予定表で並べ替えた順（sort_order）', () => {
    const days = groupByStaff(
      [makeSchedule({ id: 3, staff_id: 2, sort_order: 1 }), makeSchedule({ id: 4, staff_id: 2, sort_order: 0 })],
      staff,
    )
    expect(days[0].items.map(s => s.id)).toEqual([4, 3])
  })

  it('courseOf は数字でなければ Infinity', () => {
    expect(courseOf(makeStaff({ default_course: '3' }))).toBe(3)
    expect(courseOf(makeStaff({ default_course: '' }))).toBe(Infinity)
    expect(courseOf(undefined)).toBe(Infinity)
  })
})
