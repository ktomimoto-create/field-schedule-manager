import { describe, expect, it } from 'vitest'
import { layoutStaffDay, type GanttBar } from './layoutDay'
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

  it('時刻指定が時系列でない並びでも、目安の帯は 1 つ前の帯の終わり＋移動から置く', () => {
    const { bars, gaps } = layoutStaffDay([
      makeSchedule({ id: 1, target_time: '13:00' }),
      makeSchedule({ id: 2, target_time: '10:00' }),
      makeSchedule({ id: 3 }),
    ])
    // 10:00 の帯（〜11:00）の後ろ＋移動 15 分。13:00 の帯とは重ならない
    expect(bars.map(b => [b.schedule.id, b.from, b.to])).toEqual([
      [2, 600, 660],
      [3, 675, 735],
      [1, 780, 840],
    ])
    expect(gaps.at(-1)).toMatchObject({ from: 735, to: 780 })
  })

  it('結果がキャンセルの予定は置かない', () => {
    const { bars } = layoutStaffDay([makeSchedule({ id: 1, result: 'キャンセル' }), makeSchedule({ id: 2 })])
    expect(bars.map(b => b.schedule.id)).toEqual([2])
  })
})

const overlaps = (a: GanttBar, b: GanttBar) => a.from < b.to && b.from < a.to
const isAnchor = (b: GanttBar) => b.basis !== 'estimated'
const expectNoOverlap = (bars: GanttBar[]) => {
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      if (isAnchor(bars[i]) && isAnchor(bars[j])) continue
      expect(overlaps(bars[i], bars[j]), `${bars[i].schedule.id} と ${bars[j].schedule.id}`).toBe(false)
    }
  }
}

describe('layoutStaffDay 重なり回避', () => {
  it('時間なし・「必ず」の後に 10:00 指定があっても重ならない', () => {
    const { bars } = layoutStaffDay([
      makeSchedule({ id: 1 }),
      makeSchedule({ id: 2, target_time: '必ず' }),
      makeSchedule({ id: 3, target_time: '10:00' }),
    ])
    expectNoOverlap(bars)
    expect(bars.map(b => [b.schedule.id, b.from, b.to])).toEqual([
      [1, 540, 600],
      [3, 600, 660],
      [2, 675, 735],
    ])
  })

  it('「〜迄」が遅れて置かれても 15:00 指定と重ならない', () => {
    const { bars } = layoutStaffDay([
      makeSchedule({ id: 1 }),
      makeSchedule({ id: 2 }),
      makeSchedule({ id: 3 }),
      makeSchedule({ id: 4 }),
      makeSchedule({ id: 5 }),
      makeSchedule({ id: 6, target_time: '11:30迄' }),
      makeSchedule({ id: 7, target_time: '15:00' }),
    ])
    expectNoOverlap(bars)
    expect(bars.find(b => b.schedule.id === 6)).toMatchObject({ basis: 'estimated', late: true })
  })

  it('時刻指定どうしが同時刻ならデータのまま重ねる', () => {
    const { bars } = layoutStaffDay([
      makeSchedule({ id: 1, target_time: '10:00' }),
      makeSchedule({ id: 2, target_time: '10:00' }),
    ])
    expect(bars.map(b => b.from)).toEqual([600, 600])
  })

  it('重なる帯は段（lane）を分ける', () => {
    const { bars, laneCount } = layoutStaffDay([
      makeSchedule({ id: 1, target_time: '10:00' }),
      makeSchedule({ id: 2, target_time: '10:00' }),
    ])
    expect(bars.map(b => b.lane)).toEqual([0, 1])
    expect(laneCount).toBe(2)
  })

  it('重ならなければ全部 lane 0', () => {
    const { bars, laneCount } = layoutStaffDay([makeSchedule({ id: 1 }), makeSchedule({ id: 2 })])
    expect(bars.map(b => b.lane)).toEqual([0, 0])
    expect(laneCount).toBe(1)
  })
})
