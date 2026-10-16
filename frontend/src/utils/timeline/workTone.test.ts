import { describe, expect, it } from 'vitest'
import { isFieldJob, isHoliday, workTone } from './workTone'
import { makeSchedule } from '../../test/factories'

describe('workTone', () => {
  it('設計書の 4 色（定期=青・障害=赤・工事=橙・保守=緑）に振り分ける', () => {
    expect(workTone('定期')).toBe('teiki')
    expect(workTone('障害')).toBe('shogai')
    expect(workTone('2次')).toBe('shogai')
    expect(workTone('工事')).toBe('koji')
    expect(workTone('設置')).toBe('koji')
    expect(workTone('保守')).toBe('hoshu')
  })

  it('社内の予定は灰、それ以外は other', () => {
    expect(workTone('休暇')).toBe('internal')
    expect(workTone('ミーティング')).toBe('internal')
    expect(workTone('依頼者承認済')).toBe('other')
    expect(workTone(null)).toBe('other')
  })
})

describe('isHoliday / isFieldJob', () => {
  it('休暇は休み', () => {
    expect(isHoliday(makeSchedule({ work_type: '休暇' }))).toBe(true)
    expect(isHoliday(makeSchedule({ work_type: '障害' }))).toBe(false)
  })

  it('キャンセルと社内の予定は現地作業に数えない', () => {
    expect(isFieldJob(makeSchedule({ work_type: '障害' }))).toBe(true)
    expect(isFieldJob(makeSchedule({ work_type: '障害', status: 'cancelled' }))).toBe(false)
    expect(isFieldJob(makeSchedule({ work_type: '研修' }))).toBe(false)
  })
})
