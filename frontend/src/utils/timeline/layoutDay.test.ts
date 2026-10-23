import { describe, expect, it } from 'vitest'
import { layoutFromPlan } from './layoutDay'
import { planStaffDay } from '../dayPlan'
import { MOVE_UNKNOWN_MIN } from '../route'
import type { Schedule } from '../../types'
import { makeSchedule } from '../../test/factories'

// 位置が分からない（号機に住所が無い）ときの置き方。移動は 1 区間 MOVE_UNKNOWN_MIN（15 分＋余裕 10 分）
const plan = (items: Schedule[]) => planStaffDay({ items, posOf: () => null, base: null, mode: 'transit' })
const layout = (items: Schedule[]) => layoutFromPlan({ ...plan(items), mode: 'transit' })
const visit = (id: number, o: Partial<Schedule> = {}) => makeSchedule({ id, property_name: `物件${id}`, ...o })
const M = MOVE_UNKNOWN_MIN

describe('planStaffDay（ガントと時間軸で共通の置き方）', () => {
  it('時間の無い訪問は 9:00 の出動から移動して 60 分ずつ並べる', () => {
    const { placed } = plan([visit(1), visit(2)])
    expect(placed.map(p => [p.start, p.end, p.estimated])).toEqual([
      [540 + M, 600 + M, true],
      [600 + 2 * M, 660 + 2 * M, true],
    ])
  })

  it('時刻指定はその時刻に置き、「16:30~」も 16:30 から', () => {
    const { placed } = plan([visit(1, { target_time: '16:30~' }), visit(2, { target_time: '10:00' })])
    expect(placed.find(p => p.schedule.id === 1)).toMatchObject({ start: 990, estimated: false })
    expect(placed.find(p => p.schedule.id === 2)).toMatchObject({ start: 600, estimated: false })
  })

  it('行の順ではなく時間の指定を守る順に置く（時刻指定の枠を避ける）', () => {
    const { placed } = plan([visit(1), visit(2, { target_time: '10:00' })])
    const free = placed.find(p => p.schedule.id === 1)!
    const fixed = placed.find(p => p.schedule.id === 2)!
    expect(fixed.start).toBe(600)
    // 時間の無い訪問は、10:00 の訪問と重ならない
    expect(free.end <= fixed.start - M || free.start >= fixed.end).toBe(true)
  })

  it('PM 指定は 13:00 より前には置かない', () => {
    const { placed } = plan([visit(1, { target_time: 'PM' })])
    expect(placed[0].start).toBeGreaterThanOrEqual(780)
  })

  it('午後まで続く日は 12:00 以降に昼休憩を入れる', () => {
    const { lunch, placed } = plan([visit(1), visit(2), visit(3), visit(4)])
    expect(lunch).not.toBeNull()
    expect(lunch![0]).toBeGreaterThanOrEqual(720)
    // 昼休憩の間に訪問は置かない
    expect(placed.every(p => p.end <= lunch![0] || p.start >= lunch![1])).toBe(true)
  })

  it('「〜迄」に間に合わない見込みは late', () => {
    const { placed } = plan([visit(1, { target_time: '9:00迄' })])
    expect(placed[0].late).toBe(true)
  })

  it('同じ建物の訪問は同じ時刻に重ねる', () => {
    const { placed } = plan([visit(1, { property_name: '同じ棟' }), visit(2, { property_name: '同じ棟' })])
    expect(placed[0].start).toBe(placed[1].start)
  })
})

describe('layoutFromPlan（ガントの帯・段・移動）', () => {
  it('キャンセル・休暇は帯にしない', () => {
    const { bars } = layout([visit(1, { status: 'cancelled' }), visit(2, { work_type: '休暇' }), visit(3)])
    expect(bars.map(b => b.schedule.id)).toEqual([3])
  })

  it('時刻指定は実線（fixed）、指定なしは点線（estimated）', () => {
    const { bars } = layout([visit(1), visit(2, { target_time: '13:00' })])
    expect(bars.find(b => b.schedule.id === 2)!.basis).toBe('fixed')
    expect(bars.find(b => b.schedule.id === 1)!.basis).toBe('estimated')
  })

  it('各訪問の前に移動の見込みを置く', () => {
    const { gaps } = layout([visit(1, { target_time: '10:00' }), visit(2, { target_time: '15:00' })])
    expect(gaps).toContainEqual({ from: 900 - M, to: 900, travel: { minutes: M, mode: 'train' } })
  })

  it('重なる帯は段を分ける', () => {
    const { bars, laneCount } = layout([visit(1, { property_name: '同じ棟' }), visit(2, { property_name: '同じ棟' })])
    expect(laneCount).toBe(2)
    expect(bars.map(b => b.lane).sort()).toEqual([0, 1])
  })
})
