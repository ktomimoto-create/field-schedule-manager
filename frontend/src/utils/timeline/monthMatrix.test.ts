import { describe, expect, it } from 'vitest'
import { cellKey, heatLevel, indexByCell, monthRows } from './monthMatrix'
import { makeSchedule, makeStaff } from '../../test/factories'

describe('monthRows', () => {
  const days = ['2026-10-01', '2026-10-02']

  it('在籍中の人と、その月に予定がある人をコース順に。担当なしの予定があれば最後に未割当', () => {
    const staff = [
      makeStaff({ id: 1, name: '佐藤 太郎', default_course: '3' }),
      makeStaff({ id: 2, name: '築地 次郎', default_course: '1' }),
      makeStaff({ id: 3, name: '退職 三郎', is_active: 0 }),
      makeStaff({ id: 4, name: '応援 四郎', default_course: '2', is_active: 0 }),
    ]
    const schedules = [makeSchedule({ staff_id: 4, date: '2026-10-02' }), makeSchedule({ staff_id: null, date: '2026-10-01' })]
    expect(monthRows(schedules, staff, days).map(r => r.name)).toEqual(['築地 次郎', '応援 四郎', '佐藤 太郎', '未割当'])
  })
})

describe('indexByCell', () => {
  it('担当×日で引ける', () => {
    const map = indexByCell([makeSchedule({ id: 1, staff_id: 1 }), makeSchedule({ id: 2, staff_id: null })])
    expect(map.get(cellKey(1, '2026-10-16'))?.map(s => s.id)).toEqual([1])
    expect(map.get(cellKey(null, '2026-10-16'))?.map(s => s.id)).toEqual([2])
  })
})

describe('heatLevel', () => {
  it('0 / 1 / 2 / 3-4 / 5+ の 5 段階', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(heatLevel)).toEqual([0, 1, 2, 3, 3, 4, 4])
  })
})
