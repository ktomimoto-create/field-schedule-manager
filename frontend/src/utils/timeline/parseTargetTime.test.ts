import { describe, expect, it } from 'vitest'
import { parseTimeSlot, targetTimeBadge } from './parseTargetTime'

describe('parseTimeSlot', () => {
  it('時刻はその時刻から 60 分', () => {
    expect(parseTimeSlot('10:00')).toEqual({ from: 600, to: 660, kind: 'at', label: '10:00' })
    expect(parseTimeSlot('１０：００')).toEqual({ from: 600, to: 660, kind: 'at', label: '10:00' })
    expect(parseTimeSlot('10時')).toEqual({ from: 600, to: 660, kind: 'at', label: '10:00' })
  })

  it('AM / PM は時間帯', () => {
    expect(parseTimeSlot('AM')).toEqual({ from: 540, to: 720, kind: 'band', label: 'AM' })
    expect(parseTimeSlot('午後')).toEqual({ from: 780, to: 1020, kind: 'band', label: 'PM' })
  })

  it('「〜迄」は締切の 60 分前から締切まで', () => {
    expect(parseTimeSlot('11:30迄')).toEqual({ from: 630, to: 690, kind: 'until', label: '11:30迄' })
  })

  it('「14:00~14:30」は範囲（後ろの文字は無視）', () => {
    expect(parseTimeSlot('14:00~14:30入り')).toEqual({ from: 840, to: 870, kind: 'range', label: '14:00〜14:30' })
  })

  it('時刻の無いものは null', () => {
    expect(parseTimeSlot('必ず')).toBeNull()
    expect(parseTimeSlot('')).toBeNull()
    expect(parseTimeSlot(null)).toBeNull()
  })
})

describe('targetTimeBadge', () => {
  it('指定があれば短い文字を返す', () => {
    expect(targetTimeBadge('必ず')).toBe('必ず')
    expect(targetTimeBadge('10:00')).toBe('10:00')
    expect(targetTimeBadge('pm')).toBe('PM')
    expect(targetTimeBadge('14:00~14:30')).toBe('14:00〜14:30')
  })

  it('読めない自由文は 6 文字までに縮める', () => {
    expect(targetTimeBadge('終日指定なしです')).toBe('終日指定なし')
  })

  it('指定が無ければ null', () => {
    expect(targetTimeBadge('')).toBeNull()
    expect(targetTimeBadge(null)).toBeNull()
  })
})
