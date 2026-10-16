import { describe, expect, it } from 'vitest'
import { layoutStaffDay } from './layoutDay'
import { makeSchedule } from '../../test/factories'

describe('layoutStaffDay', () => {
  it('時間の無い予定は 9:00 から 60 分ずつ、間に移動の目安を挟む', () => {
    const { bars, gaps } = layoutStaffDay([
      makeSchedule({ id: 1 }),
      makeSchedule({ id: 2 }),
      makeSchedule({ id: 3 }),
    ])
    expect(bars.map(b => [b.from, b.to, b.basis])).toEqual([
      [540, 600, 'estimated'],
      [615, 675, 'estimated'],
      [690, 750, 'estimated'],
    ])
    expect(gaps).toHaveLength(2)
    expect(gaps[0]).toMatchObject({ from: 600, to: 615, travel: { minutes: 15, mode: 'car' } })
  })

  it('時刻指定はその時刻に置く（fixed）', () => {
    const { bars, gaps } = layoutStaffDay([makeSchedule({ id: 1 }), makeSchedule({ id: 2, target_time: '13:00' })])
    expect(bars[1]).toMatchObject({ from: 780, to: 840, basis: 'fixed' })
    expect(gaps[0]).toMatchObject({ from: 600, to: 780 })
  })

  it('開始・完了の実績があればそれを使う（actual）', () => {
    const { bars } = layoutStaffDay([makeSchedule({ started_at: '10:05', completed_at: '10:40' })])
    expect(bars[0]).toMatchObject({ from: 605, to: 640, basis: 'actual' })
  })

  it('キャンセルと休暇は置かない', () => {
    const { bars } = layoutStaffDay([
      makeSchedule({ id: 1, status: 'cancelled' }),
      makeSchedule({ id: 2, work_type: '休暇' }),
      makeSchedule({ id: 3 }),
    ])
    expect(bars.map(b => b.schedule.id)).toEqual([3])
  })

  it('PM は 13:00 より前に置かず、「〜迄」は前に寄せず並び順どおり置いて間に合わなければ late', () => {
    expect(layoutStaffDay([makeSchedule({ target_time: 'PM' })]).bars[0].from).toBe(780)
    const { bars } = layoutStaffDay([
      makeSchedule({ id: 1 }),
      makeSchedule({ id: 2 }),
      makeSchedule({ id: 3, target_time: '11:00迄' }),
    ])
    expect(bars[2]).toMatchObject({ from: 690, basis: 'estimated', late: true })
    expect(bars[0].late).toBeUndefined()
  })

  it('「〜迄」に間に合うなら late を付けない', () => {
    const { bars } = layoutStaffDay([makeSchedule({ id: 1, target_time: '17:00迄' })])
    expect(bars[0]).toMatchObject({ from: 540, to: 600 })
    expect(bars[0].late).toBeFalsy()
  })

  it('範囲指定はその枠に置く（fixed）', () => {
    const { bars } = layoutStaffDay([makeSchedule({ target_time: '14:00~14:30' })])
    expect(bars[0]).toMatchObject({ from: 840, to: 870, basis: 'fixed' })
    expect(bars[0].late).toBeUndefined()
  })

  it('開始だけで完了が無い実績は 60 分で置く', () => {
    const { bars } = layoutStaffDay([makeSchedule({ started_at: '10:05' })])
    expect(bars[0]).toMatchObject({ from: 605, to: 665, basis: 'actual' })
  })

  it('時刻指定が時系列でない並びでも、移動は一番遅く終わる帯から引く', () => {
    const { bars, gaps } = layoutStaffDay([
      makeSchedule({ id: 1, target_time: '13:00' }),
      makeSchedule({ id: 2, target_time: '10:00' }),
      makeSchedule({ id: 3 }),
    ])
    expect(bars[2]).toMatchObject({ from: 855, to: 915 })
    expect(gaps.at(-1)).toMatchObject({ from: 840, to: 855 })
  })

  it('結果がキャンセルの予定は置かない', () => {
    const { bars } = layoutStaffDay([makeSchedule({ id: 1, result: 'キャンセル' }), makeSchedule({ id: 2 })])
    expect(bars.map(b => b.schedule.id)).toEqual([2])
  })
})
