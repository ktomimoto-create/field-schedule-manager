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

  it('範囲はハイフン・空白・時表記も読む', () => {
    const r = { from: 600, to: 660, kind: 'range', label: '10:00〜11:00' }
    expect(parseTimeSlot('10:00-11:00')).toEqual(r)
    expect(parseTimeSlot('10:00 ~ 11:00')).toEqual(r)
    expect(parseTimeSlot('10時~11時')).toEqual(r)
  })

  it('終わりが始まりより前の範囲は読まない', () => {
    expect(parseTimeSlot('14:00~13:00')).toBeNull()
  })

  it('「9:00~」は 9:00 から（開始だけ）', () => {
    expect(parseTimeSlot('9:00~')).toEqual({ from: 540, to: 600, kind: 'at', label: '9:00' })
  })

  it('「16:30~」「16:30-」は 16:30 から', () => {
    expect(parseTimeSlot('16:30~')).toEqual({ from: 990, to: 1050, kind: 'at', label: '16:30' })
    expect(parseTimeSlot('16:30-')).toEqual({ from: 990, to: 1050, kind: 'at', label: '16:30' })
  })

  it('「13-15時」は 13:00〜15:00 の範囲', () => {
    expect(parseTimeSlot('13-15時')).toEqual({ from: 780, to: 900, kind: 'range', label: '13:00〜15:00' })
  })

  it('「~11:30」は 11:30 迄、「1300」は 13:00', () => {
    expect(parseTimeSlot('~11:30')).toEqual({ from: 630, to: 690, kind: 'until', label: '11:30迄' })
    expect(parseTimeSlot('1300')).toEqual({ from: 780, to: 840, kind: 'at', label: '13:00' })
  })

  it('結果は 0:00〜24:00 に収める', () => {
    expect(parseTimeSlot('0:30迄')).toEqual({ from: 0, to: 30, kind: 'until', label: '0:30迄' })
    expect(parseTimeSlot('23:30')).toMatchObject({ from: 1410, to: 1440 })
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

  it('読めない自由文は 6 文字を超えたら 5 文字＋…に縮める', () => {
    expect(targetTimeBadge('終日指定なしです')).toBe('終日指定な…')
    expect(targetTimeBadge('終日指定なし')).toBe('終日指定なし')
    expect(targetTimeBadge('14:00~13:00')).toBe('14:00…')
    expect(targetTimeBadge('😀😀😀😀😀😀😀')).toBe('😀😀😀😀😀…')
  })

  it('指定が無ければ null', () => {
    expect(targetTimeBadge('')).toBeNull()
    expect(targetTimeBadge(null)).toBeNull()
  })
})
