import { describe, expect, it } from 'vitest'
import type { Schedule } from '../types'
import { buildDayState, type FeEvent, type FeEventKind } from './feEvents'

const visit = (id: number, over: Partial<Schedule> = {}): Schedule =>
  ({ id, date: '2026-10-23', staff_id: 1, property_name: 'パークハウス', unit_number: '12345', work_type: '障害', status: 'free', result: null, is_transferred: 1, ...over }) as Schedule

let n = 0
const ev = (kind: FeEventKind, scheduleId: number | null = null): FeEvent =>
  ({ id: ++n, staff_id: 1, work_date: '2026-10-23', kind, schedule_id: scheduleId, occurred_at: `2026-10-23T0${n}:00:00Z` }) as FeEvent

describe('buildDayState', () => {
  it('現場の訪問は 出発 → 到着 → 作業完了 の順', () => {
    const v = visit(1)
    expect(buildDayState([v], [ev('shift_start')]).next?.kind).toBe('depart')
    expect(buildDayState([v], [ev('shift_start'), ev('depart', 1)]).next?.kind).toBe('arrive')
    expect(buildDayState([v], [ev('shift_start'), ev('depart', 1), ev('arrive', 1)]).next?.kind).toBe('finish')
  })

  it('研修など社内の予定は出発を飛ばし、開始（到着の記録）→ 完了', () => {
    const v = visit(2, { property_name: '', unit_number: null, work_type: '研修' })
    const first = buildDayState([v], [ev('shift_start')])
    expect(first.visits[0].inOffice).toBe(true)
    expect(first.next?.kind).toBe('arrive')
    const started = buildDayState([v], [ev('shift_start'), ev('arrive', 2)])
    expect(started.visits[0].stage).toBe('working')
    expect(started.next?.kind).toBe('finish')
  })

  it('物件名のある会議（種別が社内系）も社内の予定として扱う', () => {
    const v = visit(3, { work_type: 'ミーティング' })
    expect(buildDayState([v], [ev('shift_start')]).next?.kind).toBe('arrive')
  })
})
