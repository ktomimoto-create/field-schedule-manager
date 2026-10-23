import { describe, expect, it } from 'vitest'
import { addDays, addMonths, hmToMin, minToHm, monthDays, nowHmJst, todayJst, weekdayJa, weekdayOf } from './dates'

describe('dates', () => {
  it('todayJst は日本時間の日付を返す（UTC 20 時＝日本の翌朝 5 時）', () => {
    expect(todayJst(new Date('2026-10-15T20:00:00Z'))).toBe('2026-10-16')
  })

  it('nowHmJst は 24 時間制の HH:MM（既存の started_at と同じ形）', () => {
    expect(nowHmJst(new Date('2026-10-16T00:05:00Z'))).toBe('09:05')
    expect(nowHmJst(new Date('2026-10-16T15:30:00Z'))).toBe('00:30')
  })

  it('日本時間の 0 時をまたぐ境界（UTC 15:00）', () => {
    const d = new Date('2026-10-15T15:00:00Z')
    expect(todayJst(d)).toBe('2026-10-16')
    expect(nowHmJst(d)).toBe('00:00')
  })

  it('hmToMin は範囲外の時刻を null にする', () => {
    expect(hmToMin('24:00')).toBeNull()
    expect(hmToMin('10:60')).toBeNull()
    expect(hmToMin('23:59')).toBe(1439)
  })

  it('うるう年の 2 月は 29 日', () => {
    expect(monthDays('2028-02')).toHaveLength(29)
  })

  it('addDays は月・年をまたぐ', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('weekdayOf / weekdayJa', () => {
    expect(weekdayOf('2026-10-16')).toBe(5)
    expect(weekdayJa('2026-10-18')).toBe('日')
  })

  it('monthDays はその月の全日付', () => {
    expect(monthDays('2026-02')).toHaveLength(28)
    expect(monthDays('2026-10')[30]).toBe('2026-10-31')
  })

  it('addMonths は年をまたぐ', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('hmToMin / minToHm', () => {
    expect(hmToMin('9:30')).toBe(570)
    expect(hmToMin('11:30迄')).toBe(690)
    expect(hmToMin('必ず')).toBeNull()
    expect(hmToMin(null)).toBeNull()
    expect(minToHm(570)).toBe('9:30')
  })
})
